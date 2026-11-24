# Configuration and credentials

## Where values belong

Production runtime: **Vercel → Promy team → influence-crm → Settings → Environment Variables**. Use Config for non-secret configuration and Secret for credentials. Changes require a new deployment to take effect. Do not paste values in chat, GitHub issues, README, code, screenshots, or logs.

Local development: `.env.local`, excluded from Git. `.env.example` is the tracked list of names with empty values. Preview and Development need separate test credentials; do not automatically copy production credentials into untrusted preview deployments. Never prefix a secret with `NEXT_PUBLIC_`.

Keep the recoverable master copies and account recovery information in the organization's access-controlled password manager. Vercel is runtime delivery, not the handoff inventory. Inventory entries record owner, environment, purpose, scopes, expiry and rotation procedure, **not values**.

## FARM integration contract

| Name | Meaning | Vercel type | Consumer |
| --- | --- | --- | --- |
| `FARM_PARTNER_BASE_URL` | HTTPS base address of the partner API, not an API key | Config | Server-side FARM adapter |
| `FARM_CF_ACCESS_CLIENT_ID` | Cloudflare Access service-token identifier | Secret, kept with its credential pair | Same server adapter |
| `FARM_CF_ACCESS_CLIENT_SECRET` | Cloudflare Access service-token secret | Secret | Same server adapter |
| `FARM_PARTNER_TOKEN` | Separate partner API credential | Secret | Same server adapter |

These variables belong to **influence-crm only**, Production. The adapter reads them lazily; no values reach the browser. Local .env.local is not uploaded or committed. Transfer values through approved secret provisioning or enter them directly in Vercel; never print them for tool transport.

Fixed base: https://farm.promy.io/api/v1/partner. Headers: CF-Access-Client-Id, CF-Access-Client-Secret and Authorization: Bearer (partner token). Redirects are refused. See [FARM runbook](REDDIT_FARM.md) for supported actions, idempotency and runtime acceptance. Credential installation does not start posting or warmup.

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

## TwelveLabs free evaluation
TWELVELABS_API_KEY is a Production-only Secret in influence-crm, never a public/browser variable. TWELVELABS_FREE_PLAN_CONFIRMED must be true after visually confirming Free plan and no payment method. Key Promy Creator Review expires 2027-02-24. No payment upgrade or overage was enabled. Owner authorized public creator samples, not email content. Current adapter is a single fixed Mary sample diagnostic, not a proven replacement for vocal delivery scoring. It persists async task ID to avoid resubmission. Pegasus receives transcription; do not assume waveform-based prosody analysis without proof. Free plan allowances can stop processing.
Gemini diagnostic control compares the same cached real video with minimal request on free models 3.5 Flash-Lite / 3.8 Flash. Provider HTTP/RPC and bounded redacted errors are visible to owner only; no credentials or provider file references returned. Timeout is recorded separately from HTTP503. Existing whole-queue sender/import approvals remain unchanged.

Jockey Free original-audio control passed on Mary. Automatic media-review fallback activates only while TWELVELABS_FREE_PLAN_CONFIRMED=true AND saved original-audio control is completed. Uses existing dedicated knowledge store with per-item source selection and no web tools. All API credits stay subject to provider Free allowance; no overage or payment method. Long inference uses existing Vercel server runtime; this is not a promise of unlimited free compute.
