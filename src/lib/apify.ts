import "server-only";
import { createHmac } from "node:crypto";
import { getSetting } from "./settings";

export const runToken = (runId: string) => createHmac("sha256", process.env.SESSION_SECRET!).update(`apify:${runId}`).digest("hex").slice(0, 40);

export function baseUrl() {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  return process.env.APP_URL?.replace(/\/$/, "") || (host ? `https://${host}` : "http://localhost:3000");
}

async function key() { const k = await getSetting("apify_key"); if (!k) throw new Error("Нет ключа Apify (Настройки)"); return k; }

// Starts an actor run that calls us back when it ends, with a spend cap so one run can't eat the budget.
export async function startActor(actor: string, input: unknown, runId: string, maxUsd: number, maxItems?: number) {
  const hook = [{ eventTypes: ["ACTOR.RUN.SUCCEEDED", "ACTOR.RUN.FAILED", "ACTOR.RUN.ABORTED", "ACTOR.RUN.TIMED_OUT"], requestUrl: `${baseUrl()}/api/webhooks/apify?run=${runId}&token=${runToken(runId)}` }];
  const q = new URLSearchParams({ webhooks: Buffer.from(JSON.stringify(hook)).toString("base64"), maxTotalChargeUsd: String(Math.max(0.5, maxUsd)) });
  if (maxItems) q.set("maxItems", String(maxItems));
  const r = await fetch(`${process.env.APIFY_API_URL ?? "https://api.apify.com"}/v2/acts/${actor}/runs?${q}`, { method: "POST", headers: { Authorization: `Bearer ${await key()}`, "Content-Type": "application/json" }, body: JSON.stringify(input), cache: "no-store", signal: AbortSignal.timeout(20000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Apify ${r.status}: ${JSON.stringify(j).slice(0, 250)}`);
  return j.data as { id: string; defaultDatasetId: string };
}

export async function datasetItems<T = Record<string, unknown>>(datasetId: string): Promise<T[]> {
  const r = await fetch(`${process.env.APIFY_API_URL ?? "https://api.apify.com"}/v2/datasets/${datasetId}/items?clean=true&format=json&limit=5000`, { headers: { Authorization: `Bearer ${await key()}` }, cache: "no-store", signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`Apify dataset ${r.status}`);
  return r.json();
}

export async function getRun(apifyRunId: string) {
  const r = await fetch(`${process.env.APIFY_API_URL ?? "https://api.apify.com"}/v2/actor-runs/${apifyRunId}`, { headers: { Authorization: `Bearer ${await key()}` }, cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`Apify run ${r.status}`);
  return (await r.json()).data as { id: string; status: string; defaultDatasetId: string; usageTotalUsd?: number };
}

export async function apifyUser() {
  const r = await fetch(`${process.env.APIFY_API_URL ?? "https://api.apify.com"}/v2/users/me`, { headers: { Authorization: `Bearer ${await key()}` }, cache: "no-store" });
  if (!r.ok) throw new Error(`Apify ${r.status}`);
  return (await r.json()).data as { username: string; plan?: { id?: string } };
}
