# Promy Creators CRM

Internal tool for the influence team. It finds UGC creators on TikTok and Instagram via Apify, filters them, emails them through Instantly, drafts replies with AI and tracks who registered on promy.io.
Same stack and design as `sales-crm`: Next.js (App Router) on Vercel, Supabase Postgres, all DB access server-side with the service role (RLS on, no policies).

## How it works

```
Apify search (hashtags, phrases)  →  profile check (only bios with UGC + email/link)  →  hard rules
   →  AI score, taught by your approvals/rejections  →  Review (keyboard)  →  Instantly (one campaign per A/B arm)
   →  webhooks: sent / opened / replied / bounced  →  AI label + draft  →  manager fixes and sends (or autopilot)
   →  promy.io webhook / CSV: registered → profile filled → videos
```

A tick runs every 5 minutes (`/api/cron`, called by pg_cron) and does one bounded step of each stage:
finish lost Apify runs, start a search when approved creators cover fewer than N days of sending, check queued profiles,
read emails from bio links (Linktree, Beacons, Canva sites), score new creators, push today's share into Instantly,
send due autopilot replies, and once an hour pull Instantly stats and pause mailboxes with too many bounces.

## Setup

1. Supabase: new project, run `supabase/migrations/0001_init.sql`, then `0002_cron.sql` (needs pg_cron and pg_net; enable them in Database → Extensions if the migration complains).
2. Vercel: import this repo, region lhr1, env vars:
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   - `APP_PASSWORD` (login), `SESSION_SECRET` (any long random string; webhook tokens derive from it, so changing it means pressing "Подключить всё" again)
3. Open the app → Settings → enter the Apify, OpenAI and Instantly keys → press **«Подключить всё»**.
   This writes the cron URL into settings, finds the trypromy.co mailboxes, sets their daily limit, registers the Instantly webhook and reads the old campaigns.
4. Settings → Отправка: check the mailboxes and set **Старт отправки**. Nothing is sent before that date.
5. Import → upload the old Reddit/form sheets so those creators are never emailed again.
6. Send Dmytro the Promy webhook spec from the Import page (signup, profile filled, videos; matched by `?ref=` code, then email).

Diagnostics: `/api/health`.

## Data rules
- One creator = one row; an email never appears twice (unique index on `lower(email)`), and creators from the old sheets are `existing` + `do_not_contact`.
- Leads go to Instantly with `skip_if_in_workspace`, so anyone already in Instantly is skipped and marked "не писать".
- Each A/B arm is its own Instantly campaign with the same mailboxes, so every creator's variant is exact. New leads are split by Thompson sampling with a floor share per arm; until 10 signups exist, replies stand in for registrations.
- `events` has one row per creator + type + step; it feeds the daily charts. Funnel rates use creator columns, by the date of the first email.
- AI drafts never send without a person unless autopilot is on for that label and confidence; autopilot waits N minutes and cancels itself if a new message arrives.

## Development
`npm test` runs the pure logic tests (email parsing, filters, A/B math). `npm run typecheck`, `npm run build`.
`INSTANTLY_API_URL`, `OPENAI_API_URL`, `APIFY_API_URL`, `APP_URL` override API hosts for local mocks.
