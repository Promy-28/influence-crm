# Architecture

## Project boundary

- GitHub source: `Promy-28/influence-crm`.
- Vercel project: `influence-crm`, production `https://influence-crm-ashy.vercel.app`.
- Supabase project: `ubfanvqktdwwjdsvrinz`.
- Separate owner-private cloud Site: `appgprj_6af3bd24923081919f71e9090224c51b`, source and publication managed by Sites. Its worker uses authenticated CRM bridge operations; it is not deployed by pushing this CRM repository.
- FARM Reddit partner: server-only adapter, read cache, owner-confirmed post submission and warmup proposals; see REDDIT_FARM.md for configuration and upstream limits.

## Main modules

| Area | Source | Responsibility |
| --- | --- | --- |
| UI | `src/app`, `src/components` | Source-separated creators, review, inbox, drafts, social placeholders |
| Draft operations | `src/lib/draft-workspace.ts`, `src/app/api/drafts` | Queue, edit, regenerate, explicit approval |
| Mail safety core | `src/lib/promy-bot` | Canonical recipient/thread, generation, Telegram transport, provider requests |
| Question coverage | `src/lib/reply-coverage.ts` | Main-topic omission checks and model instructions; heuristic, not proof of semantic accuracy |
| Form intake | `src/lib/reddit-form-sync.ts`, `reddit-intake.ts` | Fixed source CSV, dedupe, evidence/source versions |
| Media | `src/app/api/media-review`, `src/lib/media-review.ts` | Actual video/audio analysis using existing free Gemini configuration |
| Legacy sourcing | `src/lib/sourcing.ts`, `tick.ts` | Apify discovery/scoring and legacy configured workflows |

## Boundaries that must remain explicit

An imported form quote is not an agreed price. A self-reported account is not a verified account. Text/profile scoring is not video/audio review. A queued job is not a completed review. A saved draft is not permission to send. Instantly accepting a request is not proof of delivery.

Regeneration binds to the displayed draft, passes its previous text plus the current real conversation and owner instruction, saves a fresh UNSENT draft with a previous-version reference, and requires new approval. Reply name/signature/banner are constructed by the server, not the model.

The source Sheet is read without changing its ratings or sharing. Directory records preserve owner decisions and outreach state. The cloud review worker has a durable queue and a 20-creators-per-hour run limit. Gemini quota/provider failures do not become fabricated colors.

Creator Hub replies use owner confirmation. Separate legacy Apify tick/autopilot settings exist: their current operational values must be inspected before changing or launching that path. This architecture document is not a claim that every legacy automation has been audited or disabled.
