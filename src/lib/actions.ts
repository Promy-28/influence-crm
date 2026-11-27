"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, log, requireSession } from "./db";
import { COOKIE, makeToken } from "./session";
import { DEFAULTS, getSettings, setSetting, type Key } from "./settings";
import { baseUrl } from "./apify";
import { learnTags, startDiscovery, startProfiles } from "./sourcing";
import { activeArms, pushLeads, ensureCampaign, hookToken, listAccounts, registerWebhook, removeLead, replyByEmail, setupMailboxes, snapshotExisting, inst } from "./instantly";
import { draftFor, handleReply, LABELS, sendDraft } from "./replies";
import { importExisting, importPromyCsv, promyEvent } from "./promy";
import { tick, tickToken } from "./tick";
import { aiJson, noDashes } from "./ai";
import { handleKey, profileUrl, guessFirstName } from "./text";
import { STARTER, HYPOTHESES, applyChange, unknownVars, type Step } from "./templates";
import { probBest } from "./stats";

const S = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back = (f: FormData, fallback: string) => redirect(S(f, "back") || fallback);

export async function login(f: FormData) {
  const expected = process.env.APP_PASSWORD;
  if (!expected || !process.env.SESSION_SECRET) redirect("/login?error=env");
  if (S(f, "password") !== expected) redirect("/login?error=1");
  (await cookies()).set(COOKIE, await makeToken(S(f, "name") || "Без имени"), { httpOnly: true, secure: true, sameSite: "lax", maxAge: 30 * 864e2, path: "/" });
  redirect("/");
}
export async function logout() { (await cookies()).delete(COOKIE); redirect("/login"); }

// ---- Review ----
export async function decide(id: string, decision: "approved" | "rejected" | "pending", reason?: string) {
  const who = await requireSession();
  const { data: c } = await db.from("creators").select("platform,handle,recent_posts,queued_at").eq("id", id).single();
  if (!c) return { ok: false };
  if (c.queued_at && decision !== "approved") return { ok: false, error: "Уже отправлен в Instantly" };
  await db.from("creators").update({ review_status: decision, reject_reason: decision === "rejected" ? reason || "Без причины" : null, reviewed_by: decision === "pending" ? null : who, reviewed_at: decision === "pending" ? null : new Date().toISOString() }).eq("id", id);
  if (decision !== "pending") await db.from("events").upsert({ creator_id: id, type: decision === "approved" ? "approved" : "rejected", step: 0 }, { onConflict: "creator_id,type,step", ignoreDuplicates: true });
  else await db.from("events").delete().eq("creator_id", id).in("type", ["approved", "rejected"]);
  if (decision === "approved") await learnTags(c.platform, ((c.recent_posts as { caption?: string }[]) ?? []).map((p) => p.caption ?? "").join(" ")).catch(() => undefined);
  return { ok: true };
}
export async function bulkDecide(f: FormData) {
  const ids = f.getAll("id").map(String); const d = S(f, "decision") as "approved" | "rejected";
  for (const id of ids) await decide(id, d, S(f, "reason") || undefined);
  back(f, "/review");
}
// Approves the whole queue in one go. Not marked as a person's decision, so it doesn't skew what the AI learns from.
export async function approveAll(f: FormData) {
  const who = await requireSession(); const min = Number(S(f, "min")) || 0;
  const { data } = await db.from("creators").select("id").eq("review_status", "pending").not("email", "is", null).not("ai_at", "is", null).gte("ai_score", min).limit(5000);
  const ids = (data ?? []).map((r) => r.id);
  for (let i = 0; i < ids.length; i += 200) await db.from("creators").update({ review_status: "approved", reviewed_at: new Date().toISOString() }).in("id", ids.slice(i, i + 200));
  await log("approve_all", `Одобрены все в очереди с оценкой от ${min}: ${ids.length}`, null, null, who);
  redirect(`/review?msg=${encodeURIComponent(`Одобрено: ${ids.length}. Уйдут в Instantly с ближайшими запусками автоматики, до дневной нормы.`)}`);
}
export async function decideForm(f: FormData) { await decide(S(f, "id"), S(f, "decision") as "approved" | "rejected" | "pending", S(f, "reason") || undefined); back(f, "/review"); }

// ---- Settings ----
const NUM: Key[] = ["search_weekday", "results_per_query", "queries_per_run", "profile_batch", "apify_month_budget", "fresh_days", "max_followers", "min_followers", "auto_approve_score", "auto_reject_score", "review_buffer_days", "mailbox_daily", "emails_per_lead", "daily_new_override", "min_arm_share", "bounce_pause_pct", "autopilot_min_conf", "autopilot_delay_min"];
const BOOL: Key[] = ["require_ugc_in_bio", "us_only", "english_only", "auto_approve", "open_tracking", "send_weekends", "autopilot"];
const LIST: Key[] = ["platforms", "senders", "autopilot_labels"];
export async function saveSettings(f: FormData) {
  await requireSession();
  const keys = f.getAll("_keys").map(String) as Key[];
  for (const k of keys) {
    if (!(k in DEFAULTS)) continue;
    if (BOOL.includes(k)) await setSetting(k, (f.get(k) === "on") as never);
    else if (LIST.includes(k)) await setSetting(k, f.getAll(k).map(String).filter(Boolean) as never);
    else if (NUM.includes(k)) { const v = Number(S(f, k).replace(",", ".")); if (!Number.isNaN(v)) await setSetting(k, v as never); }
    else { const v = S(f, k); if (["apify_key", "openai_key", "instantly_key"].includes(k) && !v) continue; await setSetting(k, v as never); }
  }
  await log("settings", `Настройки: ${keys.filter((k) => !["apify_key", "openai_key", "instantly_key"].includes(k)).join(", ") || "ключи"}`);
  // Edits to schedule or mailboxes reach every live campaign.
  if (keys.some((k) => ["senders", "mailbox_daily", "schedule_tz", "schedule_from", "schedule_to", "send_weekends", "open_tracking"].includes(k))) {
    const { data: arms } = await db.from("arms").select("id").not("inst_campaign_id", "is", null).eq("status", "active");
    for (const a of arms ?? []) await ensureCampaign(a.id).catch(() => undefined);
  }
  back(f, "/settings");
}
export async function senderName(f: FormData) { await requireSession(); await db.from("settings").upsert({ key: `sender_name:${S(f, "email")}`, value: S(f, "name") }); back(f, "/settings"); }

export async function connectAll(f: FormData) {
  await requireSession();
  const out: string[] = [];
  await setSetting("cron_url", `${baseUrl()}/api/cron?token=${tickToken()}`);
  out.push("Автозапуск каждые 5 минут: адрес записан");
  const s = await getSettings();
  if (s.instantly_key) {
    try {
      const boxes = await listAccounts();
      if (!s.senders.length) { const pick = boxes.filter((b) => /trypromy/i.test(b.email)).map((b) => b.email); if (pick.length) { await setSetting("senders", pick); out.push(`Ящики: ${pick.join(", ")}`); } }
      out.push(`Instantly: ящиков ${boxes.length}`);
      out.push(...(await setupMailboxes()));
      out.push(`Вебхук Instantly: ${await registerWebhook(`${baseUrl()}/api/webhooks/instantly?token=${hookToken()}`)}`);
      const snap = await snapshotExisting(); out.push(`Старые кампании прочитаны: ${snap.length}`);
    } catch (e) { out.push(`Instantly: ${String(e).slice(0, 200)}`); }
  }
  await log("connect", out.join(" · "));
  redirect(`/settings?msg=${encodeURIComponent(out.join("\n"))}`);
}
export async function runTick() { await requireSession(); const r = await tick(); await log("tick_manual", `Запуск вручную: ${JSON.stringify(r).slice(0, 300)}`); redirect(`/settings?msg=${encodeURIComponent(JSON.stringify(r, null, 1).slice(0, 1500))}`); }
export async function refreshSnapshot() { await requireSession(); await snapshotExisting(); redirect("/tests"); }

// ---- Launch / pause ----
// One button: checks what's missing, sets today's start, sends the first batch to Instantly and makes sure a search is running.
export async function startOutreach() {
  const who = await requireSession();
  const s = await getSettings();
  const missing = [!s.instantly_key && "ключ Instantly", !s.apify_key && "ключ Apify", !s.openai_key && "ключ OpenAI", !s.senders.length && "ящики (Настройки → Отправка)"].filter(Boolean);
  if (missing.length) redirect(`/?msg=${encodeURIComponent(`Не хватает: ${missing.join(", ")}`)}`);
  if (!s.cron_url) await setSetting("cron_url", `${baseUrl()}/api/cron?token=${tickToken()}`);
  await setSetting("send_start", new Date().toISOString().slice(0, 10));
  const out: string[] = [];
  try {
    const arms = await activeArms();
    for (const a of arms) { const id = a.inst_campaign_id ?? (await ensureCampaign(a.id)); await inst(`/api/v2/campaigns/${id}/activate`, { method: "POST", body: "{}" }).catch(() => undefined); }
    const r = await pushLeads();
    out.push("added" in r ? `Отправлено в Instantly: ${r.added}${r.skipped ? `, пропущено ${r.skipped} (уже были в Instantly)` : ""}` : `Пока никого не отправили: ${r.skipped}`);
  } catch (e) { out.push(`Instantly: ${String(e).slice(0, 200)}`); }
  const { count: running } = await db.from("runs").select("id", { count: "exact", head: true }).eq("status", "running");
  if (!running) for (const p of s.platforms as ("tiktok" | "instagram")[]) { const r = await startDiscovery(p, s).catch((e) => ({ skipped: String(e).slice(0, 120) })); out.push(`Поиск ${p}: ${"started" in r ? "запущен" : r.skipped}`); }
  await log("outreach_on", `Аутрич запущен. ${out.join(" · ")}`, null, null, who);
  redirect(`/?msg=${encodeURIComponent(`Аутрич запущен. ${out.join(". ")}. Дальше всё идёт само каждые 5 минут: поиск, отправка новой порции, ответы.`)}`);
}
export async function pauseOutreach() {
  const who = await requireSession();
  await setSetting("send_start", "");
  const { data: arms } = await db.from("arms").select("inst_campaign_id").not("inst_campaign_id", "is", null);
  for (const a of arms ?? []) await inst(`/api/v2/campaigns/${a.inst_campaign_id}/pause`, { method: "POST", body: "{}" }).catch(() => undefined);
  await log("outreach_off", "Аутрич на паузе: кампании в Instantly остановлены, новые креаторы не отправляются", null, null, who);
  redirect(`/?msg=${encodeURIComponent("Аутрич на паузе. Письма в Instantly остановлены, поиск и проверка продолжают работать. Ответы на уже пришедшие письма можно отправлять.")}`);
}

// ---- Sourcing ----
export async function addQuery(f: FormData) {
  await requireSession();
  const platform = S(f, "platform"), kind = S(f, "kind");
  for (const v of S(f, "value").split(/[\n,]+/).map((x) => (kind === "profile" ? handleKey(x) : x.trim().replace(/^#/, "").toLowerCase())).filter(Boolean))
    await db.from("queries").upsert({ platform, kind, value: v, active: true, origin: kind === "profile" ? "seed" : "manual" }, { onConflict: "platform,kind,value" });
  back(f, "/sourcing");
}
export async function toggleQuery(f: FormData) { await requireSession(); await db.from("queries").update({ active: S(f, "active") === "1" }).eq("id", S(f, "id")); back(f, "/sourcing"); }
export async function runSearch(f: FormData) {
  await requireSession(); const p = S(f, "platform") as "tiktok" | "instagram";
  const ids = f.getAll("q").map(String).filter(Boolean);
  const r = S(f, "stage") === "profile" ? await startProfiles(p) : S(f, "stage") === "seeds" ? await startProfiles(p, undefined, ((await db.from("queries").select("value").eq("platform", p).eq("kind", "profile").eq("active", true)).data ?? []).map((q) => q.value)) : await startDiscovery(p, undefined, { queryIds: ids, manual: true });
  redirect(`/sourcing?msg=${encodeURIComponent(JSON.stringify(r))}`);
}
export async function addCreator(f: FormData) {
  await requireSession();
  const url = S(f, "url"), email = S(f, "email").toLowerCase();
  const platform = /instagram/i.test(url) ? "instagram" : "tiktok"; const handle = handleKey(url);
  if (!handle || !/@/.test(email)) redirect("/import?msg=Нужны ссылка и почта");
  await db.from("creators").upsert({ platform, handle, email, email_source: "manual", profile_url: profileUrl(platform, handle), name: S(f, "name") || null, first_name: guessFirstName(S(f, "name")), source: "manual", ...(email.endsWith(".invalid") ? { do_not_contact: true } : {}), review_status: "approved", reviewed_by: await requireSession(), reviewed_at: new Date().toISOString() }, { onConflict: "platform,handle" });
  redirect("/import?msg=Добавлен и одобрен");
}

// ---- Tests ----
function stepsFrom(f: FormData): Step[] {
  const out: Step[] = [];
  for (let i = 0; i < 3; i++) { const body = String(f.get(`body${i}`) ?? "").replace(/\r/g, "").trim(); if (!body) continue; out.push({ subject: S(f, `subject${i}`), body: noDashes(body), delay_days: i === 0 ? 0 : Math.max(1, Number(S(f, `delay${i}`)) || 3) }); }
  return out;
}
export async function saveArm(f: FormData) {
  await requireSession();
  const steps = stepsFrom(f); if (!steps.length || !steps[0].subject) redirect(`/tests?msg=${encodeURIComponent("У первого письма нужна тема и текст")}`);
  const bad = steps.flatMap((s) => [...unknownVars(s.subject), ...unknownVars(s.body)]);
  if (bad.length) redirect(`/tests?msg=${encodeURIComponent(`Неизвестные переменные: ${bad.join(", ")}`)}`);
  const id = S(f, "id");
  if (id) { await db.from("arms").update({ name: S(f, "name"), steps }).eq("id", id); const { data: a } = await db.from("arms").select("inst_campaign_id").eq("id", id).single(); if (a?.inst_campaign_id) await ensureCampaign(id); }
  else {
    const { data: exp } = await db.from("experiments").select("id").eq("status", "running").limit(1).maybeSingle();
    const { data: used } = await db.from("arms").select("label").eq("experiment_id", exp?.id ?? "00000000-0000-0000-0000-000000000000");
    const label = "ABCDEFGH".split("").find((l) => !(used ?? []).some((u) => u.label === l)) ?? "X";
    await db.from("arms").insert({ experiment_id: exp?.id ?? null, label, name: S(f, "name") || `Вариант ${label}`, steps });
  }
  await log("arm_saved", `Вариант письма сохранён: ${S(f, "name")}`);
  redirect("/tests");
}
export async function setArmStatus(f: FormData) {
  await requireSession(); const id = S(f, "id"), st = S(f, "status");
  await db.from("arms").update({ status: st }).eq("id", id);
  const { data: a } = await db.from("arms").select("inst_campaign_id").eq("id", id).single();
  if (a?.inst_campaign_id) await inst(`/api/v2/campaigns/${a.inst_campaign_id}/${st === "active" ? "activate" : "pause"}`, { method: "POST", body: "{}" }).catch(() => undefined);
  redirect("/tests");
}
// Ends the test: the winner keeps running alone (in-flight leads of the others finish their sequence) and the next test starts from it.
export async function endExperiment(f: FormData) {
  const who = await requireSession(); const id = S(f, "id"), winner = S(f, "winner");
  await db.from("experiments").update({ status: "done", ended_at: new Date().toISOString(), winner_arm: winner || null, result: S(f, "result") || null }).eq("id", id);
  const { data: arms } = await db.from("arms").select("id").eq("experiment_id", id).neq("id", winner || "00000000-0000-0000-0000-000000000000");
  for (const a of arms ?? []) await db.from("arms").update({ status: "paused" }).eq("id", a.id);
  await log("experiment_done", `Тест завершён, победил вариант ${winner ? "выбран" : "не выбран"}`, null, null, who);
  redirect("/tests");
}
export async function startExperiment(f: FormData) {
  await requireSession();
  const { data: champ } = await db.from("arms").select("id,steps,name").eq("status", "active").order("created_at").limit(1).maybeSingle();
  const { data: e } = await db.from("experiments").insert({ name: S(f, "name") || "Новый тест", hypothesis: S(f, "hypothesis") || null, metric: S(f, "metric") || "reply" }).select("id").single();
  if (champ) await db.from("arms").update({ experiment_id: e!.id, label: "A" }).eq("id", champ.id);
  else for (const a of STARTER) await db.from("arms").insert({ experiment_id: e!.id, label: a.label, name: a.name, steps: a.steps });
  redirect("/tests");
}
// Subject ideas from what has worked so far; each can become a new arm in one click.
export async function suggestSubjects() {
  await requireSession();
  const { data: arms } = await db.from("arms").select("id,name,steps,inst_stats");
  const facts = (arms ?? []).map((a) => { const st = (a.inst_stats ?? {}) as Record<string, number>; return `"${(a.steps as Step[])[0]?.subject}": sent ${st.emails_sent_count ?? 0}, opened ${st.open_count_unique ?? 0}, replied ${st.reply_count_unique ?? 0}`; }).join("\n");
  const snap = (await getSettings()).instantly_snapshot;
  const old = (snap?.campaigns ?? []).map((c) => `"${c.steps[0]?.subject ?? ""}": sent ${c.sent}, opened ${c.opened}, replied ${c.replied}`).join("\n");
  const j = await aiJson<{ ideas: string[] }>("You write cold email subject lines to UGC creators (US, on-camera) inviting them to paid video work from app brands via Promy. Lowercase-friendly, 2-6 words, curiosity or money, no clickbait, no emojis, no em dashes, avoid spam words (free, guaranteed, $$$). Return JSON {ideas: [8 strings]}, each testing a different angle; say the angle in nothing but the line itself.", `Results so far:\n${facts || "none"}\n${old ? `Old campaigns:\n${old}` : ""}`, { model: "write", temperature: 0.9 });
  await setSetting("subject_ideas", (j.ideas ?? []).map(noDashes).slice(0, 8));
  redirect("/tests#ideas");
}
// Starts a test from the library: the current best email against the same email with one change.
// A running test ends first, and its most likely winner becomes the control.
async function launchTest(name: string, hypothesis: string, metric: string, hypothesisId: string | null, challengerName: string, change: (base: Step[]) => Step[]) {
  const who = await requireSession();
  const { data: running } = await db.from("experiments").select("id").eq("status", "running").limit(1).maybeSingle();
  let champId: string | null = null;
  const pool = running ? (await db.from("arms").select("id").eq("experiment_id", running.id).eq("status", "active")).data ?? [] : (await db.from("arms").select("id").eq("status", "active")).data ?? [];
  if (pool.length) {
    const counts = await Promise.all(pool.map(async (a) => { const { data } = await db.from("creators").select("replied_at").eq("arm_id", a.id).not("first_sent_at", "is", null).limit(20000); return { id: a.id, n: (data ?? []).length, k: (data ?? []).filter((r) => r.replied_at).length }; }));
    const p = probBest(counts); champId = counts.sort((x, y) => (p[y.id] ?? 0) - (p[x.id] ?? 0))[0].id;
  }
  if (running) await db.from("experiments").update({ status: "done", ended_at: new Date().toISOString(), winner_arm: champId, result: `Завершён при запуске теста «${name}»` }).eq("id", running.id);
  const { data: champ } = champId ? await db.from("arms").select("id,steps,name").eq("id", champId).single() : { data: null };
  const base = (champ?.steps as Step[]) ?? STARTER[0].steps;
  const { data: e } = await db.from("experiments").insert({ name, hypothesis, metric, hypothesis_id: hypothesisId }).select("id").single();
  // Old arms stop getting new leads; the ones already in their sequences finish it.
  await db.from("arms").update({ status: "paused" }).eq("status", "active").neq("id", champId ?? "00000000-0000-0000-0000-000000000000");
  if (champ) await db.from("arms").update({ experiment_id: e!.id, label: "A", status: "active" }).eq("id", champ.id);
  else await db.from("arms").insert({ experiment_id: e!.id, label: "A", name: STARTER[0].name, steps: base });
  await db.from("arms").insert({ experiment_id: e!.id, label: "B", name: challengerName, steps: change(base) });
  await log("experiment_started", `Новый тест: ${name}`, null, null, who);
  redirect("/tests");
}
export async function startHypothesis(f: FormData) {
  const h = HYPOTHESES.find((x) => x.id === S(f, "id")); if (!h) redirect("/tests");
  await launchTest(h!.title, h!.why, h!.metric, h!.id, h!.title, (b) => applyChange(b, h!.change));
}
export async function armFromIdea(f: FormData) {
  const subj = S(f, "subject");
  await launchTest(`Тема: ${subj}`.slice(0, 80), "Тема от AI против текущей лучшей", "open", null, `Тема: ${subj}`.slice(0, 80), (b) => applyChange(b, { kind: "subject", value: subj }));
}
export async function armFromOld(f: FormData) {
  await requireSession();
  const snap = (await getSettings()).instantly_snapshot; const c = snap?.campaigns.find((x) => x.id === S(f, "id")); if (!c) redirect("/tests");
  const steps: Step[] = c!.steps.map((s, i) => ({ subject: s.subject, body: s.body.replace(/\{\{\s*firstName\s*\}\}/gi, "{{firstName}}"), delay_days: i ? 3 : 0 }));
  const { data: exp } = await db.from("experiments").select("id").eq("status", "running").limit(1).maybeSingle();
  await db.from("arms").insert({ experiment_id: exp?.id ?? null, label: "Z", name: `Из Instantly: ${c!.name}`.slice(0, 80), steps, status: "paused" });
  redirect("/tests");
}

// ---- Inbox ----
export async function sendDraftAction(f: FormData) {
  const who = await requireSession();
  try { await sendDraft(S(f, "id"), String(f.get("body") ?? ""), who); } catch (e) { redirect(`/inbox?c=${S(f, "creator")}&err=${encodeURIComponent(String(e).slice(0, 200))}`); }
  redirect(`/inbox${S(f, "next") ? `?c=${S(f, "next")}` : ""}`);
}
export async function skipDraft(f: FormData) {
  const who = await requireSession();
  await db.from("drafts").update({ status: "skipped", decided_by: who, decided_at: new Date().toISOString() }).eq("id", S(f, "id"));
  await db.from("creators").update({ needs_reply: false, needs_human: false, human_reason: null }).eq("id", S(f, "creator"));
  redirect(`/inbox${S(f, "next") ? `?c=${S(f, "next")}` : ""}`);
}
export async function redraft(f: FormData) {
  await requireSession(); const cid = S(f, "creator");
  const d = await draftFor(cid, S(f, "instruction") || undefined);
  if (d?.reply) { await db.from("drafts").update({ status: "superseded" }).eq("creator_id", cid).in("status", ["new", "scheduled"]); await db.from("drafts").insert({ creator_id: cid, label: d.label, confidence: d.confidence, summary: d.summary, body: d.reply }); }
  redirect(`/inbox?c=${cid}`);
}
export async function relabel(f: FormData) { await requireSession(); await handleReply(S(f, "creator")); redirect(`/inbox?c=${S(f, "creator")}`); }
export async function manualReply(f: FormData) {
  await requireSession(); const cid = S(f, "creator");
  try { await replyByEmail(cid, String(f.get("body") ?? "").trim()); await db.from("drafts").update({ status: "superseded" }).eq("creator_id", cid).in("status", ["new", "scheduled"]); await db.from("creators").update({ needs_human: false, human_reason: null }).eq("id", cid); } catch (e) { redirect(`/inbox?c=${cid}&err=${encodeURIComponent(String(e).slice(0, 200))}`); }
  redirect(`/inbox?c=${cid}`);
}
export async function setLabel(f: FormData) {
  await requireSession(); const cid = S(f, "creator"), label = S(f, "label");
  const L = LABELS[label];
  await db.from("creators").update({ reply_label: label, ...(L?.stop ? { do_not_contact: true, needs_reply: false } : {}), ...(L?.positive ? { positive_at: new Date().toISOString() } : {}) }).eq("id", cid);
  if (L?.stop) await removeLead(cid);
  back(f, `/inbox?c=${cid}`);
}
export async function doneDialog(f: FormData) { await requireSession(); await db.from("creators").update({ needs_reply: false, needs_human: false, human_reason: null }).eq("id", S(f, "creator")); redirect("/inbox"); }

// ---- Telegram ----
export async function tgFind(f: FormData) {
  await requireSession(); const { findChats } = await import("./notify");
  const token = S(f, "tg_token") || (await getSettings()).tg_token;
  if (S(f, "tg_token")) await setSetting("tg_token", S(f, "tg_token"));
  try { const chats = await findChats(token); redirect(`/settings?tgchats=${encodeURIComponent(JSON.stringify(chats))}#tg`); }
  catch (e) { if (String(e).includes("NEXT_REDIRECT")) throw e; redirect(`/settings?msg=${encodeURIComponent(`Telegram: ${String(e).slice(0, 200)}. Если этот бот уже работает в сейлз-туле, впиши ID чата вручную.`)}#tg`); }
}
export async function tgTest() {
  await requireSession(); const { ping } = await import("./notify");
  const ok = await ping("✅ Promy Creators CRM подключена. Сюда будут приходить диалоги, где нужен человек, и сводка за день.");
  redirect(`/settings?msg=${encodeURIComponent(ok ? "Тестовое сообщение отправлено в Telegram" : "Не отправилось: проверь токен бота, ID чата и что бот добавлен в чат")}#tg`);
}

// ---- Creators ----
export async function markStage(f: FormData) {
  const who = await requireSession(); const id = S(f, "id"); const { data: c } = await db.from("creators").select("email,ref_code").eq("id", id).single();
  await promyEvent({ event: S(f, "stage"), email: c?.email ?? undefined, ref: c?.ref_code ?? undefined }, who);
  back(f, `/creators/${id}`);
}
export async function setDnc(f: FormData) { await requireSession(); const id = S(f, "id"); await db.from("creators").update({ do_not_contact: S(f, "on") === "1" }).eq("id", id); if (S(f, "on") === "1") await removeLead(id); back(f, `/creators/${id}`); }
export async function saveNote(f: FormData) { await requireSession(); await db.from("creators").update({ notes: S(f, "notes") || null }).eq("id", S(f, "id")); back(f, `/creators/${S(f, "id")}`); }

// ---- Import ----
// CSV as is; an Excel file is turned into CSV, every sheet in turn, so the same importer reads it.
async function fileText(f: FormData) {
  const file = f.get("file") as File | null;
  if (!file || !file.size) return String(f.get("text") ?? "");
  if (/\.(xlsx|xls|ods)$/i.test(file.name)) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: "buffer" });
    return wb.SheetNames.map((n) => `## Sheet name: ${n}\n${XLSX.utils.sheet_to_csv(wb.Sheets[n])}`).join("\n");
  }
  return file.text();
}
export async function importSheet(f: FormData) {
  const who = await requireSession(); const text = await fileText(f);
  const r = await importExisting(text, S(f, "label") || "таблица", who);
  redirect(`/import?msg=${encodeURIComponent(`Новых в базе: ${r.added}, уже были: ${r.known}, строк без почты: ${r.skipped}. Им тула писать не будет.`)}`);
}
export async function importPromy(f: FormData) {
  const who = await requireSession(); const text = await fileText(f);
  const r = await importPromyCsv(text, who);
  redirect(`/import?msg=${encodeURIComponent(`Из ${r.total} строк совпало с нашими креаторами: ${r.matched}`)}`);
}
export async function refreshPath(p: string) { revalidatePath(p); }
