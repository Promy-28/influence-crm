import { NextRequest, NextResponse } from "next/server";
import { COOKIE, readToken } from "@/lib/session";
export async function middleware(req: NextRequest) {
  if (req.nextUrl.pathname === "/login" || req.nextUrl.pathname === "/api/media-review" || req.nextUrl.pathname === "/api/promy-bot") return NextResponse.next(); // integration endpoints enforce existing APP_PASSWORD themselves
  const name = await readToken(req.cookies.get(COOKIE)?.value);
  if (!name) return NextResponse.redirect(new URL("/login", req.url));
  return NextResponse.next();
}
export const config = { matcher: ["/((?!_next/|favicon|icon\\.png|icon-192|icon-512|apple-icon|manifest|promy-logo|api/webhooks/|api/cron|api/health).*)"] };
