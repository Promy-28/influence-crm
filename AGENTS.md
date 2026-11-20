# Working agreement for this repository

- Scope changes to Promy Creator Hub / influence-crm. Do not alter other Promy projects.
- Read README.md and docs/PROJECT_HANDOFF.md first. Treat docs/CONFIGURATION.md as the credential contract.
- Never print, commit, put in browser code, or copy to issue/PR/chat any secret, environment dump, cookie, or authorization header. .env.example contains names and empty values only. No secret uses NEXT_PUBLIC_.
- Preserve owner edits and previous draft versions. Regeneration creates an UNSENT version; it never grants send approval. Preserve recipient, sender, thread, source, Reply signature and banner. Ask for missing material business decisions; never invent them.
- Tests must not email creators, add real campaign contacts, start Apify runs, post to Reddit/Threads, or invoke paid models. Use fixtures; external write tests require explicit user authorization.
- Make changes on a focused branch/PR where practical, inspect the current remote head before publication, and do not reset unrelated local work. Exact-file publication must preserve unrelated remote files.
- Run npm test and npm run typecheck for logic changes. Verify relevant UI/API behavior. Document material limits honestly; do not claim a schedule ran because it is enabled.
- Use database migrations for schema changes; document backups, rollback and data verification. Do not change APP_PASSWORD or encryption credentials without a data migration plan.
- Update relevant docs, integration inventory and operational notes when architecture, permissions, configuration or deployment behavior changes. Record no credentials in documentation.
