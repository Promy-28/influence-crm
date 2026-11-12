import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { runToken } from "@/lib/apify";
import { finishRun } from "@/lib/sourcing";
import { db } from "@/lib/db";
export const maxDuration = 60;
export async function POST(req: NextRequest) {
  const run = req.nextUrl.searchParams.get("run") ?? ""; const t = req.nextUrl.searchParams.get("token") ?? ""; const want = runToken(run);
  if (t.length !== want.length || !timingSafeEqual(Buffer.from(t), Buffer.from(want))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  try { return NextResponse.json(await finishRun(run, body.resource)); }
  catch (e) {
    // Apify retries failed deliveries; the run stays "running" so the tick picks it up too.
    await db.from("activity_log").insert({ actor: "Поиск", action: "apify_hook_failed", summary: String(e).slice(0, 300) });
    return NextResponse.json({ error: String(e).slice(0, 200) }, { status: 500 });
  }
}
