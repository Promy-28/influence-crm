# Promy Creator Hub

Internal influencer operations hub: source-separated creators, review, email history, AI draft proposals and owner-approved outreach. Next.js on Vercel, server-side Supabase access, Instantly and Telegram; existing private cloud Site runs background work.

## Start here

- [Architecture and project map](docs/ARCHITECTURE.md)
- [Environment variables and credential storage](docs/CONFIGURATION.md)
- [Development, release, rollback and incidents](docs/OPERATIONS.md)
- [Project handoff and outstanding hardening work](docs/PROJECT_HANDOFF.md)
- [Contributor/agent working agreement](AGENTS.md)

## Local checks

Use Node 24 and the committed lockfile. Run `npm ci`, `npm test`, and `npm run typecheck`. For local app development, copy `.env.example` to an ignored `.env.local` and supply separate development credentials, then run `npm run dev`. Never commit real values or use production integration writes to test a page.

## Product rules

Every Creator Hub email reply requires explicit owner approval of its exact version. Regeneration takes an instruction and previous draft, saves a new UNSENT version and preserves history; Reply name/signature/banner remain server-controlled. Main-topic question coverage is checked, but it is not a guarantee of semantic accuracy. Missing business terms require a specific owner decision.

Form quotes are not agreed prices. Profile-text scores are not video/audio reviews. Cloud jobs can be deferred by access or free-provider limits; unavailable media must remain unverified. Instantly campaign import has separate approval and duplicate/suppression checks.

Legacy Apify sourcing/tick/autopilot modules also exist. Their settings and permissions must be verified before enabling or changing them; this README does not declare them audited or disabled. See the operational runbook.

## Reddit FARM integration

See [Reddit Posting / FARM](docs/REDDIT_FARM.md). Server adapter and owner-confirmed posting/proposal controls are implemented. Production requires the four FARM server variables; local credentials do not configure the hosted app. Reddit delivery still depends on FARM phone readiness.
