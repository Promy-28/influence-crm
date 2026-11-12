import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { COOKIE, readToken } from "./session";
const client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
  global: {
    // Writes must never fail silently: a failed save surfaces on the error page instead of looking done.
    fetch: async (u, o) => {
      const res = await fetch(u, { ...o, cache: "no-store" });
      if (!res.ok && res.status !== 406) throw new Error(`Supabase ${res.status}: ${(await res.clone().text()).slice(0, 300)}`);
      return res;
    },
  },
});
// postgrest swallows a throwing fetch into { error }, so writes opt in to throwing, or failed saves would look done.
const WRITES = new Set(["insert", "update", "upsert", "delete"]);
export const db = new Proxy(client, { get(target, key, recv) {
  if (key !== "from") return Reflect.get(target, key, recv);
  return (table: string) => new Proxy(target.from(table), { get(b, m) {
    const v = Reflect.get(b, m); if (typeof v !== "function") return v;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (...args: unknown[]) => { const out = v.apply(b, args); return WRITES.has(String(m)) ? (out as any).throwOnError() : out; };
  } });
} }) as unknown as LooseDb;
// Untyped rows on purpose: no generated schema types, and PostgREST's select-string parser blows up the compiler on long selects.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseDb = Omit<SupabaseClient, "from"> & { from: (table: string) => any };
export async function actor() { try { return (await readToken((await cookies()).get(COOKIE)?.value)) ?? "Система"; } catch { return "Система"; } }
export async function requireSession() { const a = await readToken((await cookies()).get(COOKIE)?.value); if (!a) throw new Error("Нужно войти"); return a; }
export async function log(action: string, summary: string, creatorId?: string | null, data?: unknown, who?: string) {
  await db.from("activity_log").insert({ actor: who ?? (await actor()), action, summary, creator_id: creatorId ?? null, data: data ?? null });
}
// Reads every row of a query in pages of 1000 (PostgREST caps a single response).
export async function all<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) { const { data } = await build(from, from + 999); out.push(...(data ?? [])); if ((data ?? []).length < 1000) break; }
  return out;
}
