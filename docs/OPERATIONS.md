# Development and operations

## Routine change

1. Identify the project and current remote branch/head; inspect existing local changes. Do not publish unrelated work.
2. Develop on a focused branch/PR where practical. Add meaningful tests for behavioral changes.
3. Run `npm test` and `npm run typecheck`. Tests use fixtures and must not contact real creators or paid services.
4. Review the diff, configuration and migration implications. PR checks are in `.github/workflows/ci.yml`; branch-protection enforcement is a separate repository setting, not configured by this file.
5. Deploy the exact reviewed source. Vercel builds alone are not acceptance: confirm READY and exercise the changed read/write path safely.
6. Record source commit, deployment, checks, limits and rollback. Do not put email bodies, credentials or database exports in the repository.

## Release verification

- UI state agrees with server state and source scope (Apify vs Reddit).
- Regeneration preserves prior text and correct recipient/account/thread, generates no send permission, and keeps Reply banner/signature.
- Revised text needs a new exact-draft approval. Stale, uncertain and already-sent requests cannot be retried blindly.
- Creator import has a separate approval, duplicate/suppression checks and persistent result.
- Cloud schedules: inspect saved timing **and actual last result**. An enabled schedule does not prove a successful run.
- Provider errors distinguish missing data/access, authentication, limits and transient service failures. Failed work stays visible and retryable; no paid fallback is enabled implicitly.

## Rollback and incidents

For a bad UI/code release, use the previous known-good Vercel deployment or revert the exact commit. Publish the corresponding Site version separately if its worker changed. Code rollback does not undo database changes or sent messages. For any ambiguous external write, reconcile the provider result before retrying.

Schema changes require a checked-in migration, backup/recovery plan, staging verification and post-migration readback. Avoid destructive migrations mixed with UI changes. Secret leaks require revocation/replacement at the issuing provider and log/history review. `APP_PASSWORD` additionally needs an encrypted-record migration; never change it as an ordinary login-only password.

Redact Authorization, Cloudflare credential headers, cookies and environment values from logs. Use record/job IDs and status codes for diagnosis. Keep human owner approval for campaign imports, email sends and future Reddit posting until an explicit operating policy changes it.

## Local development

Use Node 24 (the tested development/CI line), `npm ci`, and a local `.env.local` based on `.env.example`. Use separate non-production services when exercising integration writes. Never run “connect everything”, sourcing, email send or future posting operations just to test that a page loads. No dependency or infrastructure subscription should be added without a concrete need and the owner's budget authorization.

### Apify review covers

Apify ingestion saves covers for pending cards using the post image URLs already present in the profile results, with public post lookup as a fallback. Covers live in the private creator-tiktok-covers bucket and are keyed by post ID. Cover failures do not reject the creator. Opening an older card can still retry missing covers. The cover step does not start an Apify run.
