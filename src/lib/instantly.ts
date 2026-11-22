import {assertNewOutreach} from './outreach-protection';
import {localOutreachProtection} from './outreach-protection-server';
import {withCampaignBanner} from './email-branding';
import {composeReplyMacro} from "./promy-bot/reply-macro";
import "server-only";
import { createHmac } from "node:crypto";
import { db, log } from "./db";
import { dailyNew, getSettings, setSetting, type Settings } from "./settings";
import { allocate, type Arm } from "./stats";
import { STARTER, type Step } from "./templates";
import { refCode, toHtml } from "./text";

export const hookToken = () => createHmac("sha256", process.env.SESSION_SECRET!).update("instantly-hook").digest("hex").slice(0, 32);

export async function inst<T = unknown>(path: string, init: RequestInit = {}, keyArg?: string): Promise<T> {
  const key = keyArg ?? (await getSettings()).instantly_key;
  if (!key) throw new Error("Нет ключа Instantly (Настройки)");
  const r = await fetch(`${process.env.INSTANTLY_API_URL ?? "https://api.instantly.ai"}${path}`, { ...init, headers: { Authorization: `Bearer ${key}`, ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers ?? {}) }, cache: "no-store", signal: AbortSignal.timeout(20000) });
  const text = await r.text();
  if (!r.ok) throw new Error(`Instantly ${r.status}: ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

export type Mailbox = { email: string; first_name?: string; last_name?: string; status?: number; warmup_status?: number; daily_limit?: number; stat_warmup_score?: number; setup_pending?: boolean };
export async function listAccounts(): Promise<Mailbox[]> {
  const out: Mailbox[] = []; let after = "";
  for (let i = 0; i < 10; i++) {
    const j = await inst<{ items: Mailbox[]; next_starting_after?: string }>(`/api/v2/accounts?limit=100${after ? `&starting_after=${encodeURIComponent(after)}` : ""}`);
    out.push(...(j.items ?? [])); if (!j.next_starting_after) break; after = j.next_starting_after;
  }
  return out;
}

// Reads the campaigns that existed before the tool: their texts and numbers become the baseline on the Tests page.
export async function snapshotExisting() {
  const { items } = await inst<{ items: { id: string; name: string; status: number; sequences?: { steps: { variants: { subject: string; body: string }[] }[] }[] }[] }>("/api/v2/campaigns?limit=100");
  const ids = (items ?? []).map((c) => c.id);
  type St = Record<string, number | string>;
  const stats = ids.length ? await inst<St[]>(`/api/v2/campaigns/analytics?${ids.map((i) => `ids=${i}`).join("&")}`).catch(() => [] as St[]) : [];
  const strip = (h: string) => h.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(div|p)>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  const n = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
  // Rates are per lead actually contacted. open_count/reply_count count every open and reply, so the unique ones are used,
  // and replies exclude out-of-office auto-replies.
  const campaigns = (items ?? []).map((c) => { const st = stats.find((x) => x.campaign_id === c.id);
    const contacted = n(st?.contacted_count) || n(st?.leads_count);
    return { id: c.id, name: c.name, status: c.status, steps: (c.sequences?.[0]?.steps ?? []).map((s) => ({ subject: s.variants?.[0]?.subject ?? "", body: strip(s.variants?.[0]?.body ?? "") })),
      sent: n(st?.emails_sent_count), leads: contacted, opened: Math.min(contacted, n(st?.open_count_unique ?? st?.open_count)), replied: Math.min(contacted, n(st?.reply_count_unique ?? st?.reply_count)), bounced: n(st?.bounced_count) }; });
  await setSetting("instantly_snapshot", { at: new Date().toISOString(), campaigns });
  return campaigns;
}

function schedule(s: Settings) {
  const days = { "0": s.send_weekends, "1": true, "2": true, "3": true, "4": true, "5": true, "6": s.send_weekends };
  return { schedules: [{ name: "US day", timing: { from: s.schedule_from, to: s.schedule_to }, days, timezone: s.schedule_tz }] };
}
// Instantly's delay sits on the step before: "wait N days, then send the next one".
export function sequence(steps: Step[]) {
  return [{ steps: steps.map((st, i) => ({ type: "email", delay: steps[i + 1]?.delay_days ?? 0, delay_unit: "days", variants: [{ subject: st.subject, body: withCampaignBanner(toHtml(st.body)) }] })) }];
}

// One Instantly campaign per arm, created paused; texts are pushed again whenever the arm is edited.
export async function ensureCampaign(armId: string, s?: Settings) {
  s = s ?? (await getSettings());
  const { data: arm } = await db.from("arms").select("*").eq("id", armId).single();
  if (!arm) throw new Error("Нет варианта");
  if (!s.senders.length) throw new Error("Не выбраны ящики для отправки (Настройки)");
  const body = { name: `Creators · ${arm.label} · ${arm.name}`.slice(0, 120), email_list: s.senders, daily_limit: s.senders.length * s.mailbox_daily, stop_on_reply: true, stop_on_auto_reply: false, link_tracking: false, open_tracking: s.open_tracking, text_only: false, campaign_schedule: schedule(s), sequences: sequence(arm.steps as Step[]) };
  if (arm.inst_campaign_id) { await inst(`/api/v2/campaigns/${arm.inst_campaign_id}`, { method: "PATCH", body: JSON.stringify(body) }); await db.from("arms").update({ synced_steps: arm.steps }).eq("id", armId); return arm.inst_campaign_id as string; }
  const c = await inst<{ id: string }>("/api/v2/campaigns", { method: "POST", body: JSON.stringify(body) });
  await db.from("arms").update({ inst_campaign_id: c.id, synced_steps: arm.steps }).eq("id", armId);
  await inst(`/api/v2/campaigns/${c.id}`, { method: "PATCH", body: JSON.stringify({ insert_unsubscribe_header: true }) }).catch(() => undefined);
  return c.id;
}

export async function setupMailboxes(s?: Settings) {
  s = s ?? (await getSettings()); const out: string[] = [];
  for (const e of s.senders) { await inst(`/api/v2/accounts/${encodeURIComponent(e)}`, { method: "PATCH", body: JSON.stringify({ daily_limit: s.mailbox_daily }) }).then(() => out.push(`${e}: ${s!.mailbox_daily}/день`)).catch((x) => out.push(`${e}: ${String(x).slice(0, 120)}`)); }
  return out;
}

export async function registerWebhook(url: string) {
  const list = await inst<{ items?: { id: string; target_hook_url: string }[] }>("/api/v2/webhooks?limit=100").catch(() => ({ items: [] as { id: string; target_hook_url: string }[] }));
  if ((list.items ?? []).some((w) => w.target_hook_url === url)) return "уже подключён";
  await inst("/api/v2/webhooks", { method: "POST", body: JSON.stringify({ name: "Promy Influence CRM", target_hook_url: url, event_type: "all_events" }) });
  return "подключён";
}

// The running test, created with the two starter arms the first time it is needed.
export async function activeArms(): Promise<{ id: string; label: string; inst_campaign_id: string | null; experiment_id: string | null }[]> {
  const { data: exp } = await db.from("experiments").select("id").eq("status", "running").order("started_at", { ascending: false }).limit(1).maybeSingle();
  let expId = exp?.id as string | undefined;
  if (!expId) {
    const { data: champs } = await db.from("arms").select("id,label,inst_campaign_id,experiment_id").eq("status", "active");
    if (champs?.length) return champs;
    const { data: e } = await db.from("experiments").insert({ name: "Ссылка в первом письме или просьба ответить", hypothesis: "Без ссылки письмо реже попадает в спам и чаще получает ответ, но ссылка даёт регистрации сразу", metric: "registered" }).select("id").single();
    expId = e!.id;
    for (const a of STARTER) await db.from("arms").insert({ experiment_id: expId, label: a.label, name: a.name, steps: a.steps });
  }
  const { data } = await db.from("arms").select("id,label,inst_campaign_id,experiment_id").eq("experiment_id", expId).eq("status", "active").order("label");
  return data ?? [];
}

const METRIC_COL: Record<string, string> = { open: "opened_at", reply: "replied_at", positive: "positive_at", registered: "registered_at", profile: "profile_done_at" };
// Per-arm numbers for the bandit. Until a few signups exist, replies stand in for registrations.
export async function armCounts(armIds: string[], metric: string): Promise<Arm[]> {
  const col = METRIC_COL[metric] ?? "replied_at";
  const out: Arm[] = [];
  for (const id of armIds) {
    const { data } = await db.from("creators").select(`id,${col}`).eq("arm_id", id).not("first_sent_at", "is", null).limit(20000);
    const rows = (data ?? []) as Record<string, unknown>[];
    out.push({ id, n: rows.length, k: rows.filter((r) => r[col]).length });
  }
  if (["registered", "profile"].includes(metric) && out.reduce((a, x) => a + x.k, 0) < 10) return armCounts(armIds, "reply");
  return out;
}

// Puts today's share of approved creators into the arms' campaigns.
export async function pushLeads(limit?: number) {
  const s = await getSettings();
  if (!s.instantly_key) return { skipped: "нет ключа Instantly" };
  if (!s.senders.length) return { skipped: "не выбраны ящики" };
  const todayUtc = new Date().toISOString().slice(0, 10);
  if (!s.send_start || todayUtc < s.send_start) return { skipped: s.send_start ? `отправка начнётся ${s.send_start}` : "дата старта отправки не задана (Настройки)" };
  const { count: today } = await db.from("events").select("id", { count: "exact", head: true }).eq("type", "queued").gte("at", `${todayUtc}T00:00:00Z`);
  const room = Math.min(limit ?? 1e9, dailyNew(s) - (today ?? 0));
  if (room <= 0) return { skipped: "дневная норма уже в Instantly", today };
  const { data: ready } = await db.from("creators").select("id,email,first_name,handle,platform,ai_line,ref_code").eq("review_status", "approved").is("queued_at", null).eq("do_not_contact", false).not("email", "is", null).order("ai_score", { ascending: false, nullsFirst: false }).order("created_at").limit(Math.min(room, 80));
  if (!ready?.length) return { skipped: "нет одобренных креаторов" };
  const arms = await activeArms();
  for (const a of arms) if (!a.inst_campaign_id) a.inst_campaign_id = await ensureCampaign(a.id, s);
  const { data: exp } = arms[0]?.experiment_id ? await db.from("experiments").select("metric").eq("id", arms[0].experiment_id).single() : { data: null };
  const split = allocate(await armCounts(arms.map((a) => a.id), exp?.metric ?? "reply"), ready.length, s.min_arm_share);
  const order = arms.flatMap((a) => Array(split[a.id]).fill(a)).sort(() => Math.random() - 0.5);
  const started = Date.now(); let added = 0, skipped = 0;
  for (const [i, c] of ready.entries()) {
    if (Date.now() - started > 40000) break;
    try{await assertNewOutreach(c.email,(path,body)=>inst('/api/v2'+path,body?{method:'POST',body:JSON.stringify(body)}:{}),()=>localOutreachProtection(c.email));}catch{skipped++;continue;}
    const arm = order[i] ?? arms[0];
    const code = c.ref_code ?? refCode();
    const ref_link = s.signup_url.replace("{code}", code);
    await db.from("creators").update({ ref_code: code, queued_at: new Date().toISOString(), arm_id: arm.id, inst_campaign_id: arm.inst_campaign_id }).eq("id", c.id);
    const lead = await inst<{ id?: string }>("/api/v2/leads", { method: "POST", body: JSON.stringify({ campaign: arm.inst_campaign_id, email: c.email, first_name: c.first_name ?? "there", custom_variables: { line: c.ai_line ?? "", ref_link, handle: c.handle, platform: c.platform }, skip_if_in_workspace: true }) }).catch((e) => ({ error: String(e) } as { id?: string; error?: string }));
    if (!lead.id) {
      // Already in Instantly (the old Reddit outreach, or another campaign): never email twice.
      await db.from("creators").update({ do_not_contact: true, notes: `Не отправлено: ${String((lead as { error?: string }).error ?? "уже есть в Instantly").slice(0, 200)}` }).eq("id", c.id); skipped++; continue;
    }
    await db.from("creators").update({ inst_lead_id: lead.id }).eq("id", c.id);
    await db.from("events").upsert({ creator_id: c.id, type: "queued", arm_id: arm.id }, { onConflict: "creator_id,type,step", ignoreDuplicates: true });
    added++;
  }
  for (const a of arms) await inst(`/api/v2/campaigns/${a.inst_campaign_id}/activate`, { method: "POST", body: "{}" }).catch(() => undefined);
  if (added || skipped) await log("leads_pushed", `В Instantly: ${added} новых, пропущено ${skipped} (уже были в Instantly)`, null, split, "Отправка");
  return { added, skipped, split };
}

// Arms edited in the tool (or in the database) get their texts pushed to Instantly on the next tick.
export async function syncArms() {
  const { data } = await db.from("arms").select("id,steps,synced_steps").not("inst_campaign_id", "is", null).neq("status", "archived");
  let n = 0;
  for (const a of data ?? []) if (JSON.stringify(a.steps) !== JSON.stringify(a.synced_steps)) { await ensureCampaign(a.id); n++; }
  return { synced: n };
}

// ---- Events from Instantly ----
type Hook = Record<string, unknown>;
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
export async function onEvent(b: Hook) {
  const type = str(b.event_type); const email = str(b.lead_email ?? b.email).toLowerCase();
  if (!email) return { skipped: "нет почты" };
  // The webhook gets every campaign in the workspace (sales, the old creator campaigns): only our arms count.
  const camp = str(b.campaign_id);
  if (camp) { const { data: arm } = await db.from("arms").select("id").eq("inst_campaign_id", camp).maybeSingle(); if (!arm) return { skipped: "чужая кампания" }; }
  const { data: c } = await db.from("creators").select("id,arm_id,first_sent_at,opened_at,clicked_at,replied_at,steps_sent,opens,queued_at").ilike("email", email).maybeSingle();
  if (!c) return { skipped: "не наш креатор" };
  if (!c.queued_at) return { skipped: "не отправлялся тулой" };
  const at = str(b.timestamp) || new Date().toISOString();
  const step = Number(b.step ?? 0) || 0; const eaccount = str(b.email_account ?? b.eaccount) || null;
  const ev = async (t: string, st = step, data?: unknown) => db.from("events").upsert({ creator_id: c.id, type: t, step: st, arm_id: c.arm_id, eaccount, at, data: data ?? null }, { onConflict: "creator_id,type,step", ignoreDuplicates: true });
  switch (type) {
    case "email_sent":
      await ev("sent");
      await db.from("creators").update({ first_sent_at: c.first_sent_at ?? at, last_sent_at: at, steps_sent: Math.max(c.steps_sent, step || c.steps_sent + 1), eaccount }).eq("id", c.id);
      break;
    case "email_opened":
      await ev("opened");
      await db.from("creators").update({ opened_at: c.opened_at ?? at, opens: c.opens + 1 }).eq("id", c.id);
      break;
    case "email_link_clicked": case "link_clicked":
      await ev("clicked"); await db.from("creators").update({ clicked_at: c.clicked_at ?? at }).eq("id", c.id); break;
    case "email_bounced":
      await ev("bounced"); await db.from("creators").update({ bounced_at: at, do_not_contact: true }).eq("id", c.id); break;
    case "lead_unsubscribed":
      await ev("unsubscribed"); await db.from("creators").update({ unsubscribed_at: at, do_not_contact: true }).eq("id", c.id); break;
    case "reply_received": case "auto_reply_received": {
      const text = str(b.reply_text ?? b.reply_text_snippet ?? b.reply_html).replace(/<[^>]+>/g, " ").replace(/\r/g, "").split(/\n(On .{5,120} wrote:|>)/)[0].trim().slice(0, 4000);
      const auto = type === "auto_reply_received";
      const { data: m } = await db.from("messages").insert({ creator_id: c.id, direction: "in", subject: str(b.reply_subject) || null, body: text || "(пустое письмо)", eaccount, inst_email_id: str(b.email_id) || null, step, at }).select("id").single();
      if (!auto) { await ev("replied", 0); await db.from("creators").update({ replied_at: c.replied_at ?? at, last_reply_at: at, needs_reply: true }).eq("id", c.id); }
      else await db.from("creators").update({ reply_label: "ooo" }).eq("id", c.id);
      await findThread(c.id, email);
      return { reply: c.id, message: m?.id, auto };
    }
    default: return { ignored: type };
  }
  return { ok: type };
}

// Which email to answer: the newest one from this creator, so the reply lands in the same thread from the same mailbox.
export async function findThread(creatorId: string, email: string) {
  const list = await inst<{ items?: { id: string; eaccount: string; subject: string; from_address_email?: string; ue_type?: number; timestamp_email?: string }[] }>(`/api/v2/emails?lead=${encodeURIComponent(email)}&limit=10`).catch(() => ({ items: [] }));
  const got = (list.items ?? []).find((m) => m.ue_type === 2 || m.from_address_email?.toLowerCase() === email);
  if (got) await db.from("creators").update({ inst_reply_uuid: got.id, eaccount: got.eaccount, inst_subject: got.subject }).eq("id", creatorId);
  return got ?? null;
}

// Legacy callers have no exact-thread approval snapshot. Never bypass the current workspace.
export async function replyByEmail(_creatorId: string, _raw: string) {
  throw new Error("Устаревший путь отправки отключён. Открой актуальный черновик в хабе и подтверди его после проверки свежей переписки.");
}

export async function removeLead(creatorId: string) {
  const { data: c } = await db.from("creators").select("inst_lead_id").eq("id", creatorId).single();
  if (c?.inst_lead_id) await inst(`/api/v2/leads/${c.inst_lead_id}`, { method: "DELETE" }).catch(() => undefined);
}

// Hourly: Instantly's own totals per arm, and a per-lead backfill for anything a lost webhook missed.
export async function syncAnalytics() {
  const { data: arms } = await db.from("arms").select("id,inst_campaign_id").not("inst_campaign_id", "is", null).neq("status", "archived");
  let fixed = 0;
  for (const a of arms ?? []) {
    const st = await inst<Record<string, number>[]>(`/api/v2/campaigns/analytics?id=${a.inst_campaign_id}`).catch(() => null);
    if (st?.[0]) await db.from("arms").update({ inst_stats: st[0], stats_at: new Date().toISOString() }).eq("id", a.id);
    let after = "";
    for (let page = 0; page < 20; page++) {
      const j = await inst<{ items?: { email: string; email_open_count?: number; email_reply_count?: number; email_click_count?: number; status?: number; timestamp_last_open?: string; timestamp_last_reply?: string; timestamp_last_contact?: string }[]; next_starting_after?: string }>("/api/v2/leads/list", { method: "POST", body: JSON.stringify({ campaign: a.inst_campaign_id, limit: 100, ...(after ? { starting_after: after } : {}) }) }).catch(() => null);
      for (const l of j?.items ?? []) {
        const { data: c } = await db.from("creators").select("id,first_sent_at,opened_at,replied_at,bounced_at,arm_id,queued_at").ilike("email", l.email).maybeSingle(); if (!c || !c.queued_at) continue;
        const patch: Record<string, unknown> = {};
        if (!c.first_sent_at && l.timestamp_last_contact) { patch.first_sent_at = l.timestamp_last_contact; await db.from("events").upsert({ creator_id: c.id, type: "sent", step: 1, arm_id: c.arm_id, at: l.timestamp_last_contact, data: { backfill: true } }, { onConflict: "creator_id,type,step", ignoreDuplicates: true }); }
        if (!c.opened_at && (l.email_open_count ?? 0) > 0) { patch.opened_at = l.timestamp_last_open ?? new Date().toISOString(); await db.from("events").upsert({ creator_id: c.id, type: "opened", step: 1, arm_id: c.arm_id, at: patch.opened_at as string, data: { backfill: true } }, { onConflict: "creator_id,type,step", ignoreDuplicates: true }); }
        if (!c.replied_at && (l.email_reply_count ?? 0) > 0) { patch.replied_at = l.timestamp_last_reply ?? new Date().toISOString(); patch.needs_reply = true; }
        if (!c.bounced_at && l.status === -1) { patch.bounced_at = new Date().toISOString(); patch.do_not_contact = true; }
        if (Object.keys(patch).length) { await db.from("creators").update(patch).eq("id", c.id); fixed++; }
      }
      if (!j?.next_starting_after) break; after = j.next_starting_after;
    }
  }
  await setSetting("last_analytics_at", new Date().toISOString());
  return { arms: arms?.length ?? 0, fixed };
}

// A mailbox with too many bounces is paused before it burns the domain.
export async function mailboxHealth(apply = false) {
  const s = await getSettings();
  const since = new Date(Date.now() - 14 * 864e5).toISOString();
  const { data } = await db.from("events").select("type,eaccount").in("type", ["sent", "bounced", "opened"]).gte("at", since).not("eaccount", "is", null).limit(20000);
  const by: Record<string, { sent: number; bounced: number; opened: number }> = {};
  for (const e of data ?? []) { const m = (by[e.eaccount!] ??= { sent: 0, bounced: 0, opened: 0 }); if (e.type === "sent") m.sent++; else if (e.type === "bounced") m.bounced++; else m.opened++; }
  const paused: string[] = [];
  if (apply) for (const [e, m] of Object.entries(by)) if (m.sent >= 40 && (m.bounced / m.sent) * 100 > s.bounce_pause_pct) {
    await inst(`/api/v2/accounts/${encodeURIComponent(e)}/pause`, { method: "POST", body: "{}" }).then(() => paused.push(e)).catch(() => undefined);
  }
  if (paused.length) { await log("mailbox_paused", `Поставлены на паузу из-за баунсов: ${paused.join(", ")}`, null, by, "Ящики"); const { pingEvent } = await import("./notify"); await pingEvent("Ящики на паузе из-за баунсов", paused.join(", ")); }
  return { by, paused };
}

