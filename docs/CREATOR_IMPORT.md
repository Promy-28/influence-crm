# Reddit creator campaign import

The owner approves an exact displayed batch (up to 20), bound to recipient, campaign, current source/assessment fingerprint and a recent signed token. Green/yellow routes to the existing Green / Yellow campaign; red routes separately. Video/audio evidence or an explicit owner rating is still required. Review itself never grants email-send permission.

## Credentials and the November 24 incident

The bot's `instantly` record contains the intentionally scoped Replies key (read permissions plus emails:create, no leads:create). Campaign import must use the existing CRM `settings.instantly_key`, via creatorImportProvider; it never copies or expands the Replies key. No new key, subscription or paid verification is introduced.

## Delivery and reconciliation

Before each write: validate approval, check suppression and existing conversations/membership, verify target campaign, then atomically claim the contact. Bulk add keeps workspace/campaign deduplication enabled and paid email verification disabled. A successful request is only accepted; imported means an exact email and campaign match was read back from Instantly. A client rejection is distinct from a network/unknown outcome. Error text/credentials are not stored in user-visible statuses.

An unknown response is never blindly re-submitted. Read-only reconciliation runs after a batch, when opening the approval page and during the hourly directory-work request. It can also reconcile owner-approved imports completed through Instantly's UI. Only explicit provider rejections can be offered again with a new displayed approval; accepted, importing, uncertain and imported remain protected.

The approval page allows 300 seconds for a batch of up to 20 rather than the old 60 seconds. Existing campaign scheduling/sending settings and Reply signatures/banners are not changed by this path.

## Verification

Fixture tests cover successful membership readback, explicit 403, lost responses with successful writes, cross-campaign mismatches, readback failure and no automatic re-upload. Production acceptance must check real provider membership; unit tests never send mail or add real contacts. Reconcile the seven November 24 owner-approved contacts without another write before testing a newly approved batch.
