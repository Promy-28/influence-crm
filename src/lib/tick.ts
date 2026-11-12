import "server-only";
import { createHmac } from "node:crypto";
import { db, log } from "./db";
import { getSettings, setSetting } from "./settings";
import { getRun } from "./apify";
import { finishRun, pipelineState, resolveBioLinks, scoreCreators, startDiscovery, startProfiles } from "./sourcing";
import { mailboxHealth, pushLeads, syncAnalytics } from "./instantly";
import { retryUnlabeled, sendDue } from "./replies";

export const tickToken = () => createHmac("sha256", process.env.SESSION_SECRET!).update("tick").digest("hex").slice(0, 32);

// Every 5 minutes: keep the pipeline full from search to send, one bounded step at a time.
export async function tick() {
  const t0 = Date.now(); const out: Record<string, unknown> = {};
  const s = await getSettings();
  const step = async (name: string, fn: () => Promise<unknown>) => {
    if (Date.now() - t0 > 45000) { out[name] = "отложено"; return; }
    try { out[name] = await fn(); } catch (e) { out[name] = String(e).slice(0, 200); await log("tick_failed", `${name}: ${String(e).slice(0, 250)}`, null, null, "Автоматика"); }
  };

  await step("stale_runs", async () => {
    const { data } = await db.from("runs").select("id,apify_run_id,started_at").eq("status", "running").lt("started_at", new Date(Date.now() - 15 * 6e4).toISOString());
    let n = 0;
    for (const r of data ?? []) {
      if (!r.apify_run_id) { await db.from("runs").update({ status: "failed", error: "Не стартовал", finished_at: new Date().toISOString() }).eq("id", r.id); continue; }
      const a = await getRun(r.apify_run_id);
      if (!["READY", "RUNNING"].includes(a.status)) { await finishRun(r.id, a); n++; }
      else if (Date.now() - new Date(r.started_at).getTime() > 3 * 36e5) { await db.from("runs").update({ status: "failed", error: "Дольше 3 часов", finished_at: new Date().toISOString() }).eq("id", r.id); }
    }
    return n;
  });

  if (s.apify_key) {
    await step("discover", async () => {
      const st = await pipelineState(s);
      if (st.daysCovered >= s.review_buffer_days || st.inQueue > s.profile_batch * 2) return { enough: Math.round(st.daysCovered * 10) / 10 };
      const { data: running } = await db.from("runs").select("platform").eq("status", "running").eq("stage", "discover");
      const busy = new Set((running ?? []).map((r) => r.platform));
      const { data: last } = await db.from("runs").select("platform").eq("stage", "discover").order("started_at", { ascending: false }).limit(1).maybeSingle();
      const order = s.platforms.filter((p) => !busy.has(p)) as ("tiktok" | "instagram")[];
      if (order.length > 1 && order[0] === last?.platform) order.push(order.shift()!);
      return order[0] ? startDiscovery(order[0], s) : "уже идёт";
    });
    await step("profiles", async () => {
      const res: Record<string, unknown> = {};
      for (const p of s.platforms as ("tiktok" | "instagram")[]) {
        const { count: running } = await db.from("runs").select("id", { count: "exact", head: true }).eq("status", "running").eq("stage", "profile").eq("platform", p);
        if (running) continue;
        const { data: q } = await db.from("profile_queue").select("created_at").eq("platform", p).eq("status", "new").order("created_at").limit(Math.ceil(s.profile_batch / 3));
        if (!q?.length) continue;
        if (q.length < Math.ceil(s.profile_batch / 3) && Date.now() - new Date(q[0].created_at).getTime() < 30 * 6e4) continue;
        res[p] = await startProfiles(p, s);
      }
      return res;
    });
  }
  await step("bio_links", () => resolveBioLinks(8));
  if (s.openai_key) await step("score", () => scoreCreators(16));
  if (s.instantly_key) {
    await step("push", () => pushLeads());
    await step("autopilot", () => sendDue());
    await step("relabel", () => retryUnlabeled());
    if (!s.last_analytics_at || Date.now() - new Date(s.last_analytics_at).getTime() > 55 * 6e4) {
      await step("analytics", () => syncAnalytics());
      await step("mailboxes", () => mailboxHealth(true));
    }
  }
  await setSetting("last_tick_at", new Date().toISOString());
  return { ms: Date.now() - t0, ...out };
}
