import "./globals.css";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { Nav } from "@/components/Nav";
import { COOKIE, readToken } from "@/lib/session";
import { db } from "@/lib/db";
import { logout } from "@/lib/actions";
async function NavCounts() {
  const c = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;
  const { data: ap } = await db.from("settings").select("value").eq("key", "autopilot").maybeSingle();
  const [review, inbox] = await Promise.all([
    c(db.from("creators").select("id", { count: "exact", head: true }).eq("review_status", "pending").not("email", "is", null).not("ai_at", "is", null)),
    c(db.from("creators").select("id", { count: "exact", head: true }).eq(ap?.value === true ? "needs_human" : "needs_reply", true)),
  ]);
  return <Nav counts={{ "/review": review, "/inbox": inbox }} />;
}
export const metadata = { title: "Promy Creators", description: "Influence CRM", appleWebApp: { capable: true, title: "Creators", statusBarStyle: "black-translucent" as const } };
export const viewport = { themeColor: "#0f0f14", viewportFit: "cover" as const };
export const dynamic = "force-dynamic";
export default async function Layout({ children }: { children: React.ReactNode }) {
  const name = await readToken((await cookies()).get(COOKIE)?.value);
  if (!name) return <html lang="ru"><body>{children}</body></html>;
  return <html lang="ru"><body><div className="shell">
    <aside className="side">
      <a href="/" className="brand"><img src="/promy-logo-on-dark.svg" alt="Promy" width="84" height="37" /><small>creators</small></a>
      <Suspense fallback={<Nav counts={{}} />}><NavCounts /></Suspense>
      <form action={logout} className="side-foot"><span>{name}</span><a href="/settings" className="side-gear" aria-label="Настройки" title="Настройки"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.8 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg></a><button>Выйти</button></form>
    </aside>
    <main className="main">{children}</main>
  </div></body></html>;
}
