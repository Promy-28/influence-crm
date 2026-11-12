import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { tick, tickToken } from "@/lib/tick";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
const ok = (t: string) => { const w = tickToken(); return t.length === w.length && timingSafeEqual(Buffer.from(t), Buffer.from(w)); };
async function run(req: NextRequest) {
  if (!ok(req.nextUrl.searchParams.get("token") ?? "")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json(await tick());
}
export const GET = run; export const POST = run;
