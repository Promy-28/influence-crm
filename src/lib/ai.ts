import "server-only";
import { getSetting } from "./settings";

// One JSON call to OpenAI. Text from creators is data, never instructions: the system prompts say so.
// Cutting a bio mid-emoji leaves half a surrogate pair, which OpenAI rejects as invalid JSON.
const clean = (t: string) => (typeof (t as { toWellFormed?: () => string }).toWellFormed === "function" ? (t as unknown as { toWellFormed: () => string }).toWellFormed() : t).replace(/\uFFFD/g, "");
export async function aiJson<T = Record<string, unknown>>(system: string, user: string, opts: { model?: "fast" | "write"; temperature?: number } = {}): Promise<T> {
  const key = await getSetting("openai_key");
  if (!key) throw new Error("Нет ключа OpenAI (Настройки)");
  const model = await getSetting(opts.model === "write" ? "model_write" : "model_fast");
  const r = await fetch(`${process.env.OPENAI_API_URL ?? "https://api.openai.com"}/v1/chat/completions`, {
    method: "POST", cache: "no-store", signal: AbortSignal.timeout(45000),
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, temperature: opts.temperature ?? 0.2, response_format: { type: "json_object" }, messages: [{ role: "system", content: clean(system) }, { role: "user", content: clean(user) }] }),
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return JSON.parse(j.choices[0].message.content) as T;
}

// Em dashes read as AI-written; Promy copy rules ban them.
export const noDashes = (t: string) => t.replace(/\s*—\s*/g, ", ").replace(/\s*–\s*/g, " - ");
