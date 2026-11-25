import { NextRequest, NextResponse } from "next/server";
import { COOKIE, readToken } from "@/lib/session";
import {MODE_COOKIE,resolveWorkspaceMode} from '@/lib/workspace-mode-core';
export async function middleware(req: NextRequest) {
  if (req.nextUrl.pathname === "/login" || req.nextUrl.pathname === "/api/media-review" || req.nextUrl.pathname === "/api/promy-bot" || req.nextUrl.pathname === "/api/creator-review/cloud-tick") return NextResponse.next(); // Integration routes enforce their own credential; cloud-tick uses its dedicated scoped HMAC.
  const name = await readToken(req.cookies.get(COOKIE)?.value);
  if (!name) return NextResponse.redirect(new URL("/login", req.url));
  const mode=resolveWorkspaceMode(req.nextUrl.pathname,req.nextUrl.searchParams.get('source'),req.cookies.get(MODE_COOKIE)?.value,req.nextUrl.searchParams.has('c')||req.nextUrl.searchParams.has('f'));
  const requestHeaders=new Headers(req.headers);requestHeaders.set('x-promy-workspace-mode',mode);
  const response=NextResponse.next({request:{headers:requestHeaders}});
  if(!req.nextUrl.pathname.startsWith('/api/')&&req.cookies.get(MODE_COOKIE)?.value!==mode)response.cookies.set(MODE_COOKIE,mode,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:365*86400});
  return response;
}
export const config = { matcher: ["/((?!_next/|favicon|icon\\.png|icon-192|icon-512|apple-icon|manifest|promy-logo|api/webhooks/|api/cron|api/health).*)"] };

