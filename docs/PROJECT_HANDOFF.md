# Project handoff

Start with [architecture](ARCHITECTURE.md), [configuration](CONFIGURATION.md), and [operations](OPERATIONS.md).

## Transfer checklist

The next maintainer receives repository access and a known-good commit, Vercel project access, scoped Supabase access, the separate private Site's ownership/source/automation details, issuing-provider access for Instantly/Telegram/Gemini/Apify, and a configuration-name inventory. Transfer secret access through the organization's password manager, not chat or a source archive. Record who owns each account, billing, recovery, scopes, expiry and offboarding. Business owners and recovery contacts still need to be assigned in the organization's inventory.

Do not assume access to GitHub also grants Vercel, Supabase, the private Site or any API. Do not make the Site public to simplify handoff. Revoke obsolete access and rotate issued tokens with continuity checks; account for the current encrypted-record password dependency.

## Current implemented foundation

- Source-separated hub, creator queue, exact-draft approval, Reply banner/signature, durable cloud bridge.
- Server-side question-coverage checks, source form facts, owner instructions and previous draft context.
- Configuration template without values; project/secret registry, release and rollback runbook.
- PR test/typecheck workflow with pinned official actions and no production credentials. It still needs a first PR run and repository branch-protection policy before being considered an enforced release gate.

## Open work; do not report as completed

- FARM: obtain API documentation/base address, scopes, test credentials, rate limits and write idempotency semantics; then implement and test the server adapter. Posting/warming/comments remain separate features.
- Individual user authentication/roles and separation of the record encryption key from shared login password.
- Comprehensive legacy autopilot/sourcing permissions audit, tested backup restore, broader observability and ownership assignment.
- Verify repository secret-scanning/push-protection availability and enable it through the authorized repository administrator. No claim that it was enabled by this change.
- Verify Preview/Staging isolation and safe external-write test accounts. Documentation is not proof of isolation.

Acceptance for future integrations: clear purpose and data flow, owner/scopes, no browser secrets, tests, real safe readback, explicit approval for writes, monitored errors, retry/idempotency policy, budget limit, and a rollback/handoff entry.
