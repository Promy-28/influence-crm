import { timingSafeEqual } from "node:crypto";
import { after, NextRequest, NextResponse } from "next/server";
import { hookToken, onEvent } from "@/lib/instantly";
import { handleReply } from "@/lib/replies";
import { db } from "@/lib/db";
export const maxDuration = 60;
export async function POST(req: NextRequest) {
  const t = req.nextUrl.searchParams.get("token") ?? ""; const want = hookToken();
  if (t.length !== want.length || !timingSafeEqual(Buffer.from(t), Buffer.from(want))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const r = await onEvent(body);
    // The AI draft runs after the answer, so Instantly never waits on OpenAI.
    if ("reply" in r && r.reply && !r.auto) after(() => handleReply(r.reply as string, r.message as string | undefined).catch((e) => db.from("activity_log").insert({ actor: "AI", action: "draft_failed", summary: String(e).slice(0, 250), creator_id: r.reply as string })));
    return NextResponse.json(r);
  } catch (e) { await db.from("activity_log").insert({ actor: "Instantly", action: "hook_failed", summary: `${String(body.event_type)}: ${String(e).slice(0, 250)}` }); return NextResponse.json({ error: String(e).slice(0, 200) }); }
}
