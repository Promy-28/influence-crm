# Creator review controls and browser fallback

The form import reads new/changed rows only. It is distinct from queueing the remaining creators, which includes failed/unverified and historical rows; completed audio/video checks are retained. Queue size and hourly throughput (up to twenty) are different. Legacy contacts are materialized into the directory only when explicitly queued or reviewed; no campaign import occurs.

The Creators controls use authenticated same-origin JSON actions and fifteen-second status polling instead of router.refresh/full-page navigation. Import/queue requests show elapsed status and bounded timeout. Errors are explicit; no success on failed database insert/update.

`/creators/browser-review` is an OWNER browser review desk, not an unattended browser automation or a Gemini call. Open social/portfolio links in existing logged-in browser, watch and listen, provide the sample URL and observation, then save a color and advance. Inaccessible samples remain unverified. Owner identity, source fingerprint and prior browser version are recorded; compare-and-swap prevents overwriting concurrent updates. Browser assessment is separate from Gemini evidence and survives cloud directory merges. Source changes invalidate old browser checks. No secrets, new subscriptions, email sends or Instantly imports.

Remaining limits: cloud media acquisition still cannot access all social/portfolio videos; browser fallback requires real viewing. This release does not claim to extract audio from the owner's browser automatically. Browser-decision colors teach through existing owner feedback.
