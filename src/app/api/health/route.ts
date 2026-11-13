import { NextResponse } from "next/server";
// Setup diagnostics. Reports shape and timings only, never secret values.
export const dynamic = "force-dynamic";
export async function GET() {
  const raw = (process.env.SUPABASE_URL ?? "").trim(); const url = raw.replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, ""); const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  let role: unknown = null; try { role = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString()).role; } catch { role = "не читается"; }
  let db = "ok"; const ms: number[] = [];
  // Five small queries one after another: the per-query delay a page pays for each round trip.
  for (let i = 0; i < 5; i++) {
    const t = Date.now();
    try { const r = await fetch(`${url}/rest/v1/settings?select=key&limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" }); if (!r.ok) { db = `HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`; break; } await r.text(); }
    catch (e) { db = `ошибка запроса: ${(e as Error).name}`; break; }
    ms.push(Date.now() - t);
  }
  return NextResponse.json({ url_host: url.replace(/^https?:\/\//, ""), url_fixed: raw !== url, key_role: role, password_set: !!process.env.APP_PASSWORD, secret_set: !!process.env.SESSION_SECRET, db,
    vercel_region: process.env.VERCEL_REGION ?? null, db_ms: ms, db_ms_avg: ms.length ? Math.round(ms.reduce((a, b) => a + b, 0) / ms.length) : null });
}
