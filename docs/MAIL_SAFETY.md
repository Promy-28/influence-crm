# Mail context safety — 2026-11-22

New cold outreach and continuing an existing creator conversation are separate operations. Both Reddit/form imports and legacy Apify pushLeads perform a fail-closed, cross-source check before adding a recipient: existing local correspondence/engagement/suppression, provider email history across campaigns, and provider lead membership. Missing or truncated history blocks the addition. `skip_if_in_workspace` remains a second guard, not the sole guard. Replies to an existing thread are not disabled by cold-outreach suppression.

Brief evidence deduplicates whole records by actual email ID with fresh thread data winning; each date, body and source ID stay together. Latest commercial scope includes paid clips/orders, not only the old hook/body wording. A newer personalized offer governs ongoing work; the initial unpaid-test template cannot restart a creator after a submitted/approved sample. The UI shows a separate date on scope evidence and an ongoing-work banner. Offers and emoji reactions are not acceptance of commercial terms.

Gmail reaction notifications and standalone emoji reactions have state `acknowledged`. They remain in history, but do not create a reply or automatic followup task and are excluded from human-question classification.

All newly sendable creator drafts use contextVersion 3 and a SHA-256 fingerprint of the complete selected conversation plus current brief evidence. Exact-draft approval HMAC includes that fingerprint. Immediately before reply/followup sending, the server reads the live conversation and compares the fingerprint as well as recipient/account/thread and next-action state. Changes behind an unchanged incoming ID also invalidate the draft. Missing/incomplete history fails closed. Old drafts without this evidence are visibly blocked, including manually edited drafts; their text remains preserved for regeneration and fresh owner review. No old draft is silently rewritten or approved.

Copyediting checks the parent's current conversation fingerprint; stale legacy copyediting jobs produce a clarification, not a newly sendable draft. First-contact model instructions are defaults only and must not override a later personalized work order.

The private Site's creator-import provider wrapper must call the CRM `checkOutreach` operation immediately before lead addition. Its obsolete direct email-reply transport is disabled; real Telegram confirmations use the CRM webhook/safety checks. The native conversation tool already reads the CRM bridge. Both runtime copies classify reaction notifications consistently.

Regression coverage uses fixtures: old October test versus November paid multi-clip offer; Gmail reaction; changed manual outbound behind same incoming; old-context send rejection; cross-campaign prior mail, incomplete pagination and unavailable provider all block cold outreach. No live email or campaign import is a development test.

Release rollback can restore old code but must not be used to bypass draft quarantine. No schema migration or credential rotation is required. No emails were sent or contacts imported as part of verification.
