# Reddit Posting / FARM

Owner workspace: `/social/reddit`. Separate from Reddit/form creators and email campaigns. No new provider, subscription, scheduler, or model is added.

## UI

- Posting: one account/community/title/body, exact-text confirmation, then submission to the FARM human approval queue. This is not approval to publish. External IDs deduplicate the exact same request.
- Warmup: actual account state, device/profile, start date, shared program, current ranges and calibrated actions. The editor proposes on/off changes only; it preserves all existing ranges and omits Threads entirely. A human must activate the proposal in FARM.
- Comments: capability explanation. The API does not expose individual comment text submission, thread reading, or a comment inbox. FARM's director selects comments on-device. Do not invent these capabilities.

## Server contract

User-supplied partner OpenAPI/guide received 2026-11-20. Fixed base `https://farm.promy.io/api/v1/partner`; Cloudflare service-token pair plus separate Bearer partner token. Credentials remain server-only. Reads: accounts, last 50 cross-platform post records (UI filters Reddit), programs and program details. The queue is explicitly a recent subset, not a total history count.

Normal owner session is required for both API methods; mutations additionally require same Origin and an explicit confirmation. Request timeout 15 seconds; redirects are never followed; credential headers and upstream bodies are not logged or returned. Errors distinguish access, token, conflict, validation, and 429. No automatic write retries. Cached reads use 600-second revalidation; there is no continuous polling. Partner global limit is 60 requests/minute; 429 asks the user to respect Retry-After.

Post payload is persisted in existing encrypted `promy_bot_records` under `farm:post:<external_id>` before mutation. Same ID + same body may be retried using provider-supported idempotency; changed body is refused. A warmup proposal is locked under `farm:proposal:<request_id>` before mutation, never retried automatically, because proposal creation has no documented idempotency guarantee. Ambiguous results must be reconciled in FARM. Concurrent record writes use the existing CAS mechanism. No schema migration.

No program assignment, subreddit-list mutation, cancellation, image upload, automatic engagement schedule, API approval, or direct publish endpoint is exposed in this release. Other-platform settings are not changed. Adding credentials does not start any action.

## Runtime configuration and acceptance

Use the four FARM variables in CONFIGURATION.md in this Vercel project's Production environment. Local `.env.local` does not configure Vercel. Preview must use isolated credentials. Missing production values show an explicit configuration error rather than fake account data.

Read-only provider checks succeeded 2026-11-20: 25 total accounts, 5 Reddit (4 warming, 1 needs_human), 9 programs, no posts. No real post or warmup proposal was submitted by development tests. A safe real write acceptance test still needs an owner-chosen account and exact post/proposal approval.

Provider docs state Reddit delivery still depends on phone composer rehearsal. Only `delivered` is publication; approval/queued/uncertain are separate states. Confirm actual phone capability with FARM maintainer before expecting live posting.

Rollback: redeploy the previous CRM release. Code rollback does not retract an accepted FARM request or disable existing farm programs. Reconcile and cancel on FARM if required.
