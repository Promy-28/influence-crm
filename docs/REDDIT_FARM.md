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

## Batch posting and finite daily schedules

The posting composer supports selecting all eligible Reddit accounts or individual accounts; blocked accounts remain visible and link to FARM's human-task queue. Statuses have Russian labels. `needs_human` cannot be cleared by the partner API; investigate the actual task and resolve the underlying account restriction, not just the UI label.

Four owner-provided communities are presets: Ugc_forhire, UGCs, UGCSideHustle, techugc. This records owner approval, not a claim that we independently verified current moderator rules. BrandsCreators and UGCconnect are explicitly labelled candidates with evidence/rules links. Readable community sidebars inspected 2026-11-20: BrandsCreators bans advertising/excessive promotion; UGCconnect requires moderator preapproval before platforms recruit to their service, while own-brand paid gigs need proper flair, pay, deliverables and countries. These are not blanket-approved promotion targets. UGCcreators is excluded from standalone presets: its moderator instructions require opportunities inside the weekly thread, not standalone posts. Rule confirmation is required before batch submission; no claim of automated rule compliance.

A finite plan contains at most 30 exact posts, optionally scheduled on consecutive calendar days in the browser's displayed timezone. Each account/day has an individually editable row before save. The user can save without sending, then review every exact text/time and confirm transmission to FARM once. Server validates current account eligibility, content limits, future ISO schedule and within-plan duplicate target/time. Every item has a stable per-plan external_id. FARM still requires its own human approval; there is no partner approve/publish-now endpoint. After all future posts are accepted and approved, FARM handles the dates without this PC, new cron, subscription or model. Recurring generation/recycling is not enabled.

Plans persist encrypted through existing promy_bot_records (`farm:plan:<id>`; last-ten index `farm:plan_index`). No schema change. Save does not authorize a run. Authenticated same-origin POST with explicit confirmation starts a plan, in six-item bounded chunks, serially advanced by the review page; accepted items are skipped. Keep the page open until transfer finishes; if it closes early, resume the saved plan. Daily delivery after complete transfer uses FARM, not the browser.

CAS lease prevents concurrent submissions; the server saves before contacting FARM and after each result. On uncertain acceptance the batch stops, and a later explicit resume reads `/posts/<external_id>` before any retry, including when the scheduled date passed. Missing, expired schedules are not silently moved to now. Duplicate retries preserve exact provider payload. A partial/error plan stays visible; no automatic retry loop or new ID is used. Plans are immutable after saving; edits require a new reviewed plan. Prior accepted FARM posts must be managed in FARM, not assumed cancelled by a new plan.

Fixture tests exercise 30 items in five chunks, no duplicate accepted sends, CAS conflicts, fresh account restrictions, ambiguous acceptance reconciliation and missed schedules. Real publishing and warmup mutations are not development tests.
