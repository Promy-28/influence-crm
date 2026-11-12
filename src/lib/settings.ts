import "server-only";
import { db } from "./db";
// Every setting has a default, so the tool works before anyone opens the settings page.
export const DEFAULTS = {
  apify_key: "", openai_key: "", instantly_key: "",
  model_fast: "gpt-4o-mini", model_write: "gpt-4o",
  // Sourcing
  tiktok_actor: "clockworks~tiktok-scraper", ig_discover_actor: "apify~instagram-hashtag-scraper", ig_profile_actor: "apify~instagram-profile-scraper",
  platforms: ["tiktok", "instagram"] as string[],
  results_per_query: 60, queries_per_run: 4, profile_batch: 60,
  apify_month_budget: 250,
  require_ugc_in_bio: true, fresh_days: 7, max_followers: 100000, min_followers: 0,
  us_only: true, english_only: true,
  auto_approve: false, auto_approve_score: 85, auto_reject_score: 25,
  review_buffer_days: 3,
  // Sending
  senders: [] as string[], mailbox_daily: 30, emails_per_lead: 2.6, daily_new_override: 0,
  send_start: "", schedule_tz: "America/Chicago", schedule_from: "09:00", schedule_to: "17:00", send_weekends: false,
  open_tracking: true, persona_first: "Mark", persona_last: "",
  signup_url: "https://promy.io/influencers?ref={code}",
  min_arm_share: 0.2,
  bounce_pause_pct: 5,
  // Replies
  autopilot: false, autopilot_labels: ["interested", "question", "registered"] as string[], autopilot_min_conf: 0.8, autopilot_delay_min: 20,
  call_link: "",
  kb: `Promy (promy.io) is a platform where US app brands order on-camera UGC videos from creators.
How it works for a creator:
- Sign up free on promy.io and fill in the creator profile (portfolio, niches, price). Takes a few minutes.
- Brands browse creators and send briefs. The brand sets the price per video.
- Flow: brand approves you, you film 1 test video, the brand approves it and it is paid. Then usually a batch of about 10 videos, then re-orders after results.
- Payout is instant when the brand approves a video. No cap on how many videos you make.
- Face on camera is required. Videos are posted by Promy on branded accounts, your own socials are not used.
- If a video needs changes the brand asks for a revision, it is not rejected.
- The brand pays for organic use. Paid-ad rights are bought separately.
- Income depends on brand orders. Say "from", never promise an amount or a cap.
Rules: never promise a specific income. Never invent brands, numbers or open briefs. Keep emails short, plain, friendly, no em dashes. Always include the creator's signup link when they show interest.`,
  // System
  cron_url: "", last_tick_at: "", last_analytics_at: "", subject_ideas: [] as string[], webhook_url: "",
  instantly_snapshot: null as null | { at: string; campaigns: { id: string; name: string; status: number; steps: { subject: string; body: string }[]; sent: number; opened: number; replied: number; leads: number; bounced: number }[] },
};
export type Settings = typeof DEFAULTS;
export type Key = keyof Settings;
export const SECRET: Key[] = ["apify_key", "openai_key", "instantly_key"];
export async function getSettings(): Promise<Settings> {
  const { data } = await db.from("settings").select("key,value");
  const out = { ...DEFAULTS } as Record<string, unknown>;
  for (const r of data ?? []) if (r.key in DEFAULTS) out[r.key] = r.value;
  return out as Settings;
}
export async function getSetting<K extends Key>(k: K): Promise<Settings[K]> {
  const { data } = await db.from("settings").select("value").eq("key", k).maybeSingle();
  return (data?.value ?? DEFAULTS[k]) as Settings[K];
}
export async function setSetting<K extends Key>(k: K, v: Settings[K]) {
  await db.from("settings").upsert({ key: k, value: v as unknown as object, updated_at: new Date().toISOString() });
}
// How many new creators a day the mailboxes can carry, counting follow-ups.
export const dailyNew = (s: Settings) => s.daily_new_override > 0 ? s.daily_new_override : Math.floor((Math.max(1, s.senders.length) * s.mailbox_daily) / Math.max(1, s.emails_per_lead));
