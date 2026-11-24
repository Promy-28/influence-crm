# Creator review controls and browser fallback

The form import reads new/changed rows only. It is distinct from queueing the remaining creators, which includes failed/unverified and historical rows; completed audio/video checks are retained. Queue size and hourly throughput (up to twenty) are different. Legacy contacts are materialized into the directory only when explicitly queued or reviewed; no campaign import occurs.

The Creators controls use authenticated same-origin JSON actions and fifteen-second status polling instead of router.refresh/full-page navigation. Import/queue requests show elapsed status and bounded timeout. Errors are explicit; no success on failed database insert/update.

`/creators/browser-review` is an OWNER browser review desk, not an unattended browser automation or a Gemini call. Open social/portfolio links in existing logged-in browser, watch and listen, provide the sample URL and observation, then save a color and advance. Inaccessible samples remain unverified. Owner identity, source fingerprint and prior browser version are recorded; compare-and-swap prevents overwriting concurrent updates. Browser assessment is separate from Gemini evidence and survives cloud directory merges. Source changes invalidate old browser checks. No secrets, new subscriptions, email sends or Instantly imports.

Remaining limits: cloud media acquisition still cannot access all social/portfolio videos; browser fallback requires real viewing. This release does not claim to extract audio from the owner's browser automatically. Browser-decision colors teach through existing owner feedback.


## Automatic browser agent (owner correction)
The primary browser-review route now hosts agent enable/stop and run status, not owner media rating controls. Local Codex hourly automation `promy` reads the enabled state before any browsing, then uses existing Creator Hub get_creator_review_jobs, actual CUA media discovery, free review_creator_media and evidenced complete_creator_review. It requires the PC, Codex and authorized browser to be available; it consumes existing Codex allowance and no new subscription. Runtime policy/checkpoint instructions: D:/Threads-agent/docs/browser-creator-agent.md. Owner audio/video checkboxes are not part of automatic review. Existing manual evidence records are preserved, not relabeled as agent evidence.

Verified acquisition: browser play in Lisa's Canva portfolio revealed a relevant40sec MP4. The file uploaded successfully, but the current production media analysis returned MEDIA_PROVIDER_503, so no completed audio assessment or new color was claimed. Agent records deferred work and continues other creators; it never turns a503 into a quality rejection. A configured schedule is not proof that a future run completed.


## Bounded API fallback
On explicit502/503/504 received within25seconds, video analysis makes one alternative generateContent request to Gemini2.5Flash-Lite using the same real uploaded file/URL and same verified unbilled project. No429 retries, paid services or new credentials. Only schema-validated audio+visual evidence counts, actual model/transport stored. This is a model/endpoint fallback within Google, not provider independence or a stability guarantee. No local video downloads. If both fail, return precise deferred failure.

Live availability probes on2026-11-24:2.5FlashLite generateContent404,3.1FlashLite503,3.5FlashLite generateContent200 while its Interactions video calls503. Route uses the successful same-model generateContent transport when live diagnostics establish availability. Alternate models are disabled unless a successful live probe exists; no blind404 fallback. Actual video acceptance must be reported separately from text probe.

2026-11-24 root-cause control: real Mary26.583s file succeeded HTTP200 on minimal3.5generateContent in1542ms, with audible quote.3.8 same-file minimal returned503 UNAVAILABLE high demand in7958ms. Both transient Google failures and local request shape remain relevant; do not blame all prior failures on a global outage. Production now omits60-second clipping metadata for known short ACTIVE files, uses default temperature, requests JSON through rubric and keeps strict validator. Long/unknown duration remains capped60s. New regression covers short-file boundary. TwelveLabs Free key connected; diagnostic does not imply waveform support.

Full JSON-with-media production retry still503/timeout after minimal success, so not claimed fixed. New controlled path asks for short original audio/visual observation first, then formats that exact retained report in a text-only call; validator unchanged. Source video is not resent for formatting. Provider transient errors are202 deferred with exact code, not generic502. TwelveLabs Canva URL import failed video_file_broken; server-memory direct asset upload is being acceptance-tested, not a proven waveform scorer.

Jockey control uses the same uploaded sample in a dedicated knowledge store, stores setup IDs after each step, then one response with tools disabled. It explicitly asks for waveform access vs transcription limitation; no automatic color or paid upgrade. A response timeout is marked started and is not resubmitted blindly.
