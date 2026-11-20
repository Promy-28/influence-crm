# Configuration and credentials

## Where values belong

Production runtime: **Vercel → Promy team → influence-crm → Settings → Environment Variables**. Use Config for non-secret configuration and Secret for credentials. Changes require a new deployment to take effect. Do not paste values in chat, GitHub issues, README, code, screenshots, or logs.

Local development: `.env.local`, excluded from Git. `.env.example` is the tracked list of names with empty values. Preview and Development need separate test credentials; do not automatically copy production credentials into untrusted preview deployments. Never prefix a secret with `NEXT_PUBLIC_`.

Keep the recoverable master copies and account recovery information in the organization's access-controlled password manager. Vercel is runtime delivery, not the handoff inventory. Inventory entries record owner, environment, purpose, scopes, expiry and rotation procedure, **not values**.

## FARM integration contract (planned, not connected yet)

| Name | Meaning | Vercel type | Consumer |
| --- | --- | --- | --- |
| `FARM_PARTNER_BASE_URL` | HTTPS base address of the partner API, not an API key | Config | Future server-side FARM adapter |
| `FARM_CF_ACCESS_CLIENT_ID` | Cloudflare Access service-token identifier | Secret, kept with its credential pair | Same server adapter |
| `FARM_CF_ACCESS_CLIENT_SECRET` | Cloudflare Access service-token secret | Secret | Same server adapter |
| `FARM_PARTNER_TOKEN` | Separate partner API credential | Secret | Same server adapter |

These variables belong to **influence-crm only**, not unrelated projects or globally shared team variables. Current UI does not expose or consume them. A URL without credentials can be provided as documentation; secret values should be entered directly into Vercel.

Cloudflare Access uses the headers `CF-Access-Client-Id` and `CF-Access-Client-Secret`. This authenticates the Access layer, not necessarily the partner API itself. The partner token's header, scopes and endpoint behavior must be confirmed from the partner's API documentation; do not assume Bearer authentication.

Before implementing Reddit posting/warming/comments, obtain an API reference or OpenAPI spec, allowed operations and rate limits, test account/environment, service-token permissions/expiry, and examples without credentials. The adapter must validate configuration lazily, make requests only to the configured HTTPS origin, redact credentials/errors, bound timeouts, handle 401/403/429 separately, and refuse cross-origin authenticated redirects. Retries of writes require provider-supported idempotency or explicit reconciliation. Adding credentials alone must not start posting.

## Existing runtime configuration

| Name / location | Responsibility | Important limit |
| --- | --- | --- |
| `SUPABASE_URL` | CRM database endpoint | Project-specific configuration |
| `SUPABASE_SERVICE_ROLE_KEY` | Server database access | Never in browser code; bypasses RLS |
| `APP_PASSWORD` | Current shared login **and encrypted record key derivation** | Do not simply rotate: existing records need a migration |
| `SESSION_SECRET` | Session and exact-draft approval signing | Changing invalidates sessions/approval tokens; verify derived uses before rotation |
| `GEMINI_API_KEY` + `GEMINI_FREE_PROJECT_CONFIRMED` | Existing free-project generation/media review | No paid fallback; confirmation is an operational assertion, not a billing cap enforced by a flag |
| Encrypted `promy_bot_records` | Instantly/Telegram runtime connection records | Do not copy encrypted payloads into Git or decrypt them in logs |
| Private Site runtime configuration | Cloud worker bridge and integrations | Managed separately from Vercel; grant only required access |

Future hardening: separate database encryption from the shared login password using a versioned encryption key and a verified migration; introduce individual users/roles before multi-user rollout. These are tracked work, not capabilities already implemented.

References: [Vercel Config and Secret](https://vercel.com/docs/environment-variables/sensitive-environment-variables), [Cloudflare service tokens](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/).
