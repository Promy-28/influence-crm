import "server-only";
import { createHmac } from "node:crypto";
import { db, log } from "./db";
import { guessFirstName, handleKey, parseCsv } from "./text";

export const promyToken = () => createHmac("sha256", process.env.SESSION_SECRET!).update("promy-hook").digest("hex").slice(0, 32);

export const STEPS = { registered: "registered_at", profile_completed: "profile_done_at", video: "first_video_at" } as const;
type Ev = { event: string; email?: string; ref?: string; user_id?: string; at?: string; videos?: number };

// A signup, a finished profile or a video on promy.io, matched by the ref code first, then by email.
export async function promyEvent(e: Ev, who = "Promy") {
  const ev = e.event === "video_submitted" || e.event === "video_approved" ? "video" : e.event === "profile_done" ? "profile_completed" : e.event;
  if (!(ev in STEPS)) return { skipped: `неизвестное событие ${e.event}` };
  let c: { id: string; arm_id: string | null; registered_at: string | null; profile_done_at: string | null; first_video_at: string | null; videos: number } | null = null;
  const cols = "id,arm_id,registered_at,profile_done_at,first_video_at,videos";
  if (e.ref) c = (await db.from("creators").select(cols).eq("ref_code", e.ref.trim().toLowerCase()).maybeSingle()).data;
  if (!c && e.email) c = (await db.from("creators").select(cols).ilike("email", e.email.trim()).maybeSingle()).data;
  if (!c) return { skipped: "креатор не из рассылки" };
  const at = e.at ? new Date(e.at).toISOString() : new Date().toISOString();
  const patch: Record<string, unknown> = {};
  if (e.user_id) patch.promy_user_id = e.user_id;
  // Each later step implies the earlier ones, so the funnel never shows a profile without a signup.
  if (!c.registered_at) patch.registered_at = at;
  if (ev !== "registered" && !c.profile_done_at) patch.profile_done_at = at;
  if (ev === "video") { patch.first_video_at = c.first_video_at ?? at; patch.videos = Math.max(c.videos + 1, Number(e.videos ?? 0)); }
  if (Object.keys(patch).length) await db.from("creators").update(patch).eq("id", c.id);
  const add = async (type: string, step = 0) => db.from("events").upsert({ creator_id: c!.id, type, step, arm_id: c!.arm_id, at }, { onConflict: "creator_id,type,step", ignoreDuplicates: true });
  if (patch.registered_at) await add("registered");
  if (patch.profile_done_at) await add("profile_done");
  if (ev === "video") await add("video", patch.videos as number);
  await log(`promy_${ev}`, `promy.io: ${ev === "registered" ? "регистрация" : ev === "video" ? "видео" : "профиль заполнен"}`, c.id, e, who);
  return { ok: c.id };
}

// Export from Promy (CSV): email, registered, profile filled, videos. Column names are matched loosely.
export async function importPromyCsv(text: string, who: string) {
  const rows = parseCsv(text); if (rows.length < 2) return { matched: 0, total: 0 };
  const h = rows[0].map((x) => x.trim().toLowerCase());
  const col = (...re: RegExp[]) => h.findIndex((x) => re.some((r) => r.test(x)));
  const iEmail = col(/e-?mail/), iRef = col(/^ref/, /referr?al/, /utm/), iReg = col(/regist/, /created/, /sign.?up/, /joined/), iProf = col(/profile/, /complete/, /onboard/), iVid = col(/video/, /submission/);
  let matched = 0;
  for (const r of rows.slice(1)) {
    const email = iEmail >= 0 ? r[iEmail]?.trim() : undefined; const ref = iRef >= 0 ? r[iRef]?.trim() : undefined;
    if (!email && !ref) continue;
    const date = (v?: string) => (v && !/^(no|false|0|)$/i.test(v.trim()) && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : undefined);
    const yes = (v?: string) => !!v && !/^(no|false|0|нет|)$/i.test(v.trim());
    const reg = await promyEvent({ event: "registered", email, ref, at: date(r[iReg]) }, who);
    if (!("ok" in reg)) continue; matched++;
    if (iProf >= 0 && yes(r[iProf])) await promyEvent({ event: "profile_completed", email, ref, at: date(r[iProf]) }, who);
    const vids = iVid >= 0 ? Number(r[iVid]) || 0 : 0;
    if (vids > 0) await promyEvent({ event: "video", email, ref, videos: vids }, who);
  }
  return { matched, total: rows.length - 1 };
}

// Creators already in the old sheets (Reddit outreach, the form): saved so the tool never emails them again.
export async function importExisting(text: string, label: string, who: string) {
  const rows = parseCsv(text.replace(/^## Sheet name:.*\n/gm, "\n"));
  let added = 0, known = 0, skipped = 0;
  let header: string[] | null = null;
  for (const r of rows) {
    const low = r.map((x) => x.trim().toLowerCase());
    if (low.some((x) => /^e-?mail$/.test(x))) { header = low; continue; }
    if (!header) continue;
    const get = (re: RegExp) => { const i = header!.findIndex((x) => re.test(x)); return i >= 0 ? (r[i] ?? "").trim() : ""; };
    const email = get(/^e-?mail$/).toLowerCase().replace(/\.con$/, ".com");
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(email)) { skipped++; continue; }
    const link = r.find((x) => /tiktok\.com|instagram\.com/i.test(x)) ?? "";
    const platform = /instagram/i.test(link) ? "instagram" : "tiktok";
    const handle = link ? handleKey(link.split(/[\s,]/).find((x) => /tiktok|instagram/i.test(x)) ?? link) : `email:${email}`;
    const name = get(/first name|handle|name|reddit/);
    const { data: had } = await db.from("creators").select("id,review_status").ilike("email", email).maybeSingle();
    if (had) { known++; continue; }
    const { error } = await db.from("creators").upsert({ platform, handle: handle || `email:${email}`, name: name || null, first_name: guessFirstName(name), email, email_source: "import", source: `import:${label}`, review_status: "existing", do_not_contact: true, region: get(/country|location/) || null, notes: `Из таблицы «${label}»` }, { onConflict: "platform,handle", ignoreDuplicates: true });
    if (!error) added++;
  }
  await log("import_existing", `Импорт «${label}»: новых ${added}, уже были ${known}, без почты ${skipped}`, null, null, who);
  return { added, known, skipped };
}
