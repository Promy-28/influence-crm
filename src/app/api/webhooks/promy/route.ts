import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { promyEvent, promyToken } from "@/lib/promy";
export const maxDuration = 60;
// promy.io calls this on signup, finished profile and each video. Body: one event or an array.
// { "event": "registered" | "profile_completed" | "video_submitted", "email": "...", "ref": "code from ?ref=", "user_id": "...", "at": "ISO date" }
export async function POST(req: NextRequest) {
  const t = req.nextUrl.searchParams.get("token") ?? req.headers.get("x-promy-token") ?? ""; const want = promyToken();
  if (t.length !== want.length || !timingSafeEqual(Buffer.from(t), Buffer.from(want))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const list = (Array.isArray(body) ? body : [body]).filter(Boolean).slice(0, 500);
  const out: unknown[] = []; for (const e of list) out.push(await promyEvent(e));
  return NextResponse.json({ results: out });
}
