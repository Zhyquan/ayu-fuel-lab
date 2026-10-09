# RC2 accepted Bridge semantic candidate

Base: `59c30087207954db347ee1a05e2f5a2d0b380643`. This is an isolated feature candidate, not an upstream main or website release.

The admitted related-evidence collection is independent of Forecast reasons. A fresh relevant LOW article or analyst signal can be display eligible while `RECOMPUTE_ELIGIBILITY_V2` returns `LOW_MATERIALITY`; Bridge then returns `ACCEPTED_NO_RECOMPUTE` and performs zero model requests. Material new input continues through the existing event-safe model, reason, probability and hash gates.

Two modules are copied byte for byte from mature source `00b560e293fdfec73c11d9810d50fca84293d1fe`:

- `dist/data/accepted-evidence-contract.js`: SHA-256 `4ec6427cdb502ec7430d411ecaf56d9314a8aed2c3c47ea80a55b9eba3901f80`.
- `scripts/intelligence-v2/accepted-evidence.mjs`: SHA-256 `a5cc639c505d9204b535881d6fd3f950b7611781a2fbb3fcb6e869f26c2de4bf`.

The hook runs after input validation, trusted source admission, deduplication and the merged Core Evidence gate. REFRESH calls `onAcceptedEvidence` with the validated collection before any model attempt. Successful model output produces a second collection and callback linking adopted reasons to the exact Forecast hash. VERIFY returns the collection without invoking the delivery callback. Existing related rows must come from authenticated publisher storage through `acceptedEvidence`; request/model data cannot supply that trusted accumulation.

CLI output is staged at `.work/manual-bridge/accepted-evidence.json`. There is no new automatic delivery, schedule, release writer or publisher. The existing operator must explicitly select and deliver that artifact. The Git-bound news publisher still expects `data/accepted-evidence.json` in an explicitly selected exact artifact; this candidate does not change its fixed path, the Current commit allowlist, workflow publication or Official Daily writer.

Source adapters, deduplication and cached-document behavior remain at the base. In particular, previously accepted Current evidence and auto-collection overlap retain their existing duplicate rejection. Core source gates, event-safe prompts, provider, schema and Forecast hashes are not changed. `LOW` with `TRIGGER_PREASSESSMENT_ONLY` is an admission classification, not measured model sensitivity.

New local tests cover LOW display without inference, material UP/DOWN admission and callback order, failed-model retention, delivery failure, deduplication, expiry, irrelevance, invalid Core and malformed accumulation. Existing synthetic model-path fixtures use material inventory wording; the fixed-seed external replay explicitly expects LOW to skip inference. Injected transports and local checks do not establish real source freshness, deployment, authenticated delivery, device acceptance or final RC2 acceptance.
