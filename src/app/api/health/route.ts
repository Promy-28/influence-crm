import { NextResponse } from "next/server";
// Setup diagnostics. Reports shape only, never secret values.
export const dynamic = "force-dynamic";
export async function GET() {
  const url = process.env.SUPABASE_URL ?? "", key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  let role: unknown = null; try { role = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString()).role; } catch { role = "не читается"; }
  let db: string;
  try { const r = await fetch(`${url.trim()}/rest/v1/settings?select=key&limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" }); db = r.ok ? "ok" : `HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`; }
  catch (e) { db = `ошибка запроса: ${(e as Error).name}`; }
  return NextResponse.json({ url_host: url.replace(/^https?:\/\//, "").trim(), key_role: role, password_set: !!process.env.APP_PASSWORD, secret_set: !!process.env.SESSION_SECRET, db });
}
