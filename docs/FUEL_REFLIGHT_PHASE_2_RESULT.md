# Fuel Reflight Phase 2 — 2026-10-11

## Decision

**FUEL_REFLIGHT_BLOCKED_V2.** The local domestic contract and compatible Consumer/publisher callback are frozen. Real Qwen semantic acceptance and automatic private Test delivery have not passed. This is not an integration-ready domestic Forecast release.

Exactly three substantive blockers remain:

1. **Real domestic-output admission:** all three authorized controlled calls returned HTTP200 but failed `DOMESTIC_PRIMARY_EVIDENCE_INVALID`. The selected IDs/count and original response were not retained; the precise subtype and expected UP/DOWN/HOLD judgement cannot be established. No retry or failed-output publication was performed.
2. **Current domestic input/caller:** the new explicit domestic branch exists, but no current-window verified domestic pricing input and accepted domestic artifact have been built or wired into the existing Official/Current callers. The latest production artifact remains the legacy international target. Missing unpublished official basket details are not, by themselves, proof that an honestly labelled pricing proxy cannot support a subjective estimate.
3. **Installed Core → Test connection:** an authenticated automatic caller is absent/unproven, and the installed Test API48 does not admit the new domestic target/HOLD/unit-sum contract. Local callback and protected-read fixtures do not install that connection. Current Test still selects 9 October; the protected real-account read and same Client E2E remain unperformed.

Phase 1 remains accepted and unchanged in meaning. No Stable Integration merge, shared Test write/deploy, Production action or paid-order operation was performed.

## 1. Frozen identities

| Item | Exact identity |
| --- | --- |
| Accepted Phase 1 Core | `b7f63f6e17c9062ce54d75f68c7754601558a39c` |
| Accepted Phase 1 Consumer | `6b7176bcb56128d452379a3dbb695fa7a43399ab` |
| Latest fetched origin/main | `395cb24b6345eb70741e299699fa78d3f9baa640` |
| Phase 2 Core functional freeze | `f927153dc163949485a2b4f95af040aaffde3b40` |
| Phase 2 Consumer implementation | `020132d72f072e9c1d807dd46fc49161d6e9aeeb` |
| Phase 2 Consumer final receipt | `1d9857b3a9c590db50c4c91b038c82c7a0fbb1dc` |
| Code used for the three real semantic calls | `b85e990c62a74231320b3382482a5537a9375018` |

Branches remain `feature/fuel-reflight-core-20261011` and `feature/fuel-reflight-consumer-20261011`, in their existing isolated worktrees. The final Core handoff HEAD additionally contains this report and safe records; its exact receipt SHA is returned separately. The functional freeze above is the parent of that documentation-only receipt.

The 11 automatically generated files from the 11 October Official were retained through a local, non-conflicting merge. Their bytes match `origin/main`; previous history was not rewritten. Neither candidate branch was pushed.

## 2. Domestic target contract

`DOMESTIC_FUEL_FORECAST_CONTRACT_V1` is a separate, explicit contract:

- `target = CHINA_DOMESTIC_REFINED_OIL_ADJUSTMENT`, `horizon = NEXT_7_DAYS`.
- Public/private normalized probabilities are `UP`, `DOWN`, `HOLD_OR_NO_ADJUSTMENT`, each 0..1 in integer-percentage precision, summing to1. The provider returns 0..100 integers; trusted normalization divides by100 without redistributing values.
- HOLD can be the largest-probability direction. An UP/DOWN tied maximum without HOLD is rejected as ambiguous. No old international Forecast is relabelled or converted.
- `direction`, `confidence`, `reason`, primary/accepted evidence, immutable identity/revision and original generation/expiry are preserved. `publishedAt:null` means unpublished; a trusted Test receipt supplies the protected publication time without changing source generation or Forecast hash.
- Domestic policy, adjustment window and window-bound domestic pricing evidence support the conclusion. International crude/diesel, FX, inventory, refinery and geopolitical inputs remain inputs. Ordinary news with no semantic assessment is explicitly UNASSESSED, never automatically LOW or NEUTRAL.
- Schema, source receipts, timestamps, evidence identity, probability bounds, sums and hash bindings remain strict. Synthetic semantic inputs cannot pass published-data admission.

The existing eight evidence roles and existing news/source validators are reused. Optional unverified market signals are dropped before request construction, while their original verification status is never upgraded. Required core signals retain the old mandatory validity gate. Unknown extra input/policy/window fields and invalid related-news receipts are rejected before any request.

Material comparison ignores checkedAt-only refreshes and LOW-card-only changes. It includes domestic policy/window and relevant market/FX changes. These local invariants do not prove that the real model's probabilities responded correctly: the real outputs failed admission.

## 3. Actual source checks and evidence limits

The [NDRC mechanism](https://www.ndrc.gov.cn/xxgk/zcfb/tz/201601/W020190905506573420251.pdf) and [NDRC explanation](https://www.ndrc.gov.cn/xwdt/xwfb/202203/t20220317_1319446.html) support working-day windows, a minimum adjustment threshold and policy controls. The mechanism uses a window comparison; a single daily Brent movement is insufficient to establish the domestic direction.

| Actual public read | What was obtained | Limit |
| --- | --- | --- |
| [NDRC 24 September announcement](https://www.ndrc.gov.cn/xwdt/xwfb/202609/t20260924_1407824.html) | Temporary controls affected the announced adjustment | Absence of a newer item in a listing is not proof that no later policy exists |
| [Sinopec calendar](https://cx.sinopecsales.com/yjkqiantai/core/toCalendar) | October image lists15 and29; next window is within the current seven-day horizon | Asset Last-Modified is not an invented article publication time; calendar alone gives no adjustment magnitude |
| [SAFE RMB table](https://www.safe.gov.cn/AppStructured/hlw/RMBQuery.do) | 9 October: 100USD =673.3CNY | A verified FX observation alone is not a domestic direction signal |

Calendar HTML hash: `9fe0ce3fbb056eba25f9c63111f5f540471a0602f5e15f7de5b1e3a3df9b585d`. SAFE response hash: `25bfb41e91e1deeba128006aa02d46caaaa0c67ed9c9610fe01a912b2c6b489b`.

No daily provincial retail-price source hunt, new collector platform or false present-day price date was added. Current official basket/window means were not read. A real, clearly identified estimate/proxy and current policy receipt would require their own input validation; the controlled synthetic figures cannot supply that gap.

## 4. Controlled local and real model tests

Local production dispatch/validation tests cover UP, DOWN, HOLD and international-only inputs. The synthetic UP case opposes the international direction; DOWN does likewise; HOLD uses a below-threshold domestic signal. International-only fails before inference rather than manufacturing HOLD.

The real calls were made only after contract/fixture/prompt/schema/normalization, full local regression and a CLEAN source freeze. Their proof is **REAL_QWEN_SYNTHETIC_INPUT_NOT_CURRENT_FORECAST**. Model/endpoint and production transport were reused, with one request per case, zero transport retries and a no-repeat ledger. These are authorized controlled Test calls, not a second Official Daily opportunity.

| Case | HTTP / attempts | Input/output tokens | Latency | Admission |
| --- | --- | --- | --- | --- |
| CASE_UP_DOMESTIC | 200 /1 | 3012 /184 | 5.065s | FAIL — DOMESTIC_PRIMARY_EVIDENCE_INVALID |
| CASE_DOWN_DOMESTIC | 200 /1 | 3023 /201 | 4.155s | FAIL — DOMESTIC_PRIMARY_EVIDENCE_INVALID |
| CASE_HOLD | 200 /1 | 3031 /169 | 3.468s | FAIL — DOMESTIC_PRIMARY_EVIDENCE_INVALID |
| CASE_INTERNATIONAL_ONLY | No request | 0 /0 | Preflight | Guard PASS; insufficient domestic input rejected |

Total real Test requests3; tokens9066 input/554 output; actual currency charge UNKNOWN. ProviderQWEN/modelqwen3.8-flash, prompt `qwen-domestic-fuel-v1-integer-1pct`. See [unaltered safe call ledger](reflight-records/phase2-domestic-semantic-qwen.safe.json).

The failure branch covers a non-array, empty array, more than3 IDs, repeated IDs or a value outside the allowed domestic primary set. Safe audit cannot distinguish these. Reaching it proves prior response JSON, exact output keys, target/horizon and integer probability sum100 checks passed; it does not prove expected direction, reason quality or probability responsiveness. Downstream direction support, confidence/reason and number grounding were not completed. No original output or selected ID is reconstructed from a hash.

**Probability responsiveness = NOT_PROVEN.** The harness's aggregate responsiveness field says FAIL because no case was admitted; that is not evidence that the actual numeric outputs failed to respond. No extra call was made to investigate or retest. A later local optional-source-admission correction changes the final Core freeze; no real semantic pass is claimed for either version.

## 5. First bad delivery layer and current real identities

The existing authenticated local publisher uses a Git checkout/ref plus trusted operator and database access. The existing Core workflows publish Git/Pages; no installed authenticated Core acceptance → Test publisher invocation was found. Actual API48 has no standalone Fuel publisher action. A new callback method is not an automatic deployment.

| Layer | Actual observed identity/status |
| --- | --- |
| Latest Core Official | 11 October, `2026-10-11T01:55:26.439Z`; `a65a6321c851694eb9b0fece3194b4773e77629a5912b2a3c8de0ab3b1715db7` |
| Core target | Legacy international; DOWN25/FLAT15/UP60, not domestic |
| Natural Official run | `38103404963`, SUCCESS; existing daily reservation retained |
| Publisher trigger | Not installed/proven; FIRST_BAD_LAYER |
| Test Forecast at final read | 9 October, `2026-10-09T02:59:23.116Z`; `0f378ceb9dafa8ba59b1467bf35cb1b7903fcd26aa006aac42a73bf75a12615a` |
| Test receipt | Original `2026-10-09T11:47:57.621Z`, not restamped |
| Test news | 9 October, `2026-10-09T12:05:36.457Z`, one accepted item |
| Real entitled protected read → Client | NOT_RUN |

Final read time `2026-10-11T03:01:04.436Z`. Both Test row hashes were identical to the earlier read. Only the two Fuel documents were queried; this administrative read is not an authenticated customer API response. [Safe Test readback](reflight-records/phase2-test-readback.safe.json).

T0 actual new legacy Core acceptance is observable. Real T1 automatic publisher trigger, T2 new Test write, T3 entitled read and T4 same Client delivery did not occur in this task. **Core→Test latency is NOT_MEASURED**, and Test has not caught up. The installed reader rejects the new domestic target/HOLD/decimal shape; writing the JSON into its existing pointer would not close the consumer chain.

## 6. Minimal Consumer/publisher changes

The public contract mirror retains exact Core source bytes/provenance and uses the existing canonical SHA256 helper in CJS instead of Web Crypto. Source SHA256 `e0e358b427c84e5feb10b91719c8285af269f1a76b1872c7cf4ff13134006a5e` is identical at tested b85 and final functional f927.

Fuel-only changes: domestic contract/projection, `fuel-forecast.js`, `fuel-projections.js`, `fuel-publisher.js`, and existing Fuel Page/cache files. Payment entry/runtime, Client shell and Release were not changed.

`createFuelPublisher(existingTrustedConfig).syncAccepted(request)` reuses existing publishers. It accepts exact selected Git identities and fixed-path artifact byte hashes, validates all requested artifacts before writes, and compares Forecast and news content independently:

- Same Forecast, different news-only source commit: Forecast transaction is skipped and original receipt/content retained.
- New valid Forecast: existing Forecast transaction replaces the pointer atomically; the Client retains scoped LKG during its refresh and swaps the validated response.
- LOW news changes independently; unchanged probabilities need not generate a new Forecast.
- Forecast and news have separate existing transactions; partial storage failure requires an idempotent callback replay, not a cross-document transaction claim.
- Public preview and protected full projection remain separate; synthetic or unpublished candidates, forged audit/source, invalid probabilities and unauthenticated operator requests are rejected.

The method is implemented locally but has no installed automatic caller. No new endpoint, queue, timer, secret or infrastructure was created. Compatible reader/Client admission into the shared Test lane would require the existing coordinated path; this task does not borrow a Stable identity or ask CTO to merge it.

## 7. Regression, Bridge and LKG evidence

| Verification | Result and evidence level |
| --- | --- |
| Core full suite | 586/586 PASS, original568 retained |
| Domestic focused tests | 18/18 PASS; injected HTTP, not real semantic pass |
| Final public scan including this report/records | 1382 files, zero findings |
| Consumer applicable Fuel suites | 136/136 PASS, original124 retained |
| Domestic publisher/protected projection/Page/cold-cache | LOCAL PASS for UP/DOWN/HOLD; synthetic receipts and entitlement |
| Forecast/news idempotency and original receipts | LOCAL PASS |
| Cross-repository old Official/Current/Bridge delivery replay | PASS, production code with injected HTTP/in-memory database |
| LOW followup → independent card on same Client | LOCAL PASS, zero extra model request |
| Locked/revoked scope and protected cache isolation | LOCAL PASS |
| LIVE/STALE/UPDATING_WITH_LKG/UNAVAILABLE | LOCAL PASS; Phase1 behavior preserved |
| Real Bridge → protected Test card | NOT_RUN |
| Actual installed Node16.13 domestic path | NOT_RUN |

The removed-API CJS test passed without global crypto, structuredClone or AbortSignal.timeout. The executing local binary was Node25.9.0, not the cloud Node16.13 runtime. The old-target joint replay is explicitly [ISOLATED_IN_MEMORY_REPLAY_NOT_TEST_OR_PRODUCTION](reflight-records/phase2-legacy-delivery-replay.safe.json); it is not domestic semantic or real Test proof.

Independent GPT-6.1 Sol/max review reproduced and closed probability coercion, unvalidated news/extra-field input and optional-unverified-signal promotion gaps. Final independent verdict: local code admission PASS, complete candidate BLOCKED. Core focused18/18 and Consumer136/136 were independently rerun. Real model failure and absent installed delivery remain blockers.

## 8. Changed paths and stop boundary

Core functional scope is six paths:

- `dist/data/domestic-fuel-contract.js`
- `scripts/intelligence-v2/domestic-fuel.mjs`
- `scripts/intelligence-v2/prompts/qwen-domestic-fuel-v1.mjs`
- `scripts/intelligence-v2/qwen-provider.mjs`
- `tests/fixtures/domestic-fuel-fixtures.mjs`
- `tests/domestic-fuel-contract.test.mjs`

Consumer source, interface and exact file hashes are in its Phase2 HANDOFF and source proof. This main report plus three necessary safe records and the [freeze receipt](reflight-records/phase2-freeze.safe.json) add no runtime behavior. The Phase1 report is unchanged.

| Final Gate | Status |
| --- | --- |
| DOMESTIC_CONTRACT_LOCAL_GATE | PASS |
| INTERNATIONAL_ONLY_GUARD | PASS, zero model calls |
| QWEN_CONTROLLED_DOMESTIC_SEMANTIC_GATE | FAIL |
| PROBABILITY_RESPONSIVENESS | NOT_PROVEN |
| DOMESTIC_CURRENT_FORECAST | NOT_CREATED |
| AUTOMATIC_CORE_TEST_DELIVERY | FAIL |
| REAL_BRIDGE_CARD_TEST_E2E | NOT_RUN |
| LKG_LOCAL_CONTINUITY | PASS |
| LEGACY_HISTORY_AND_RESERVATION_PRESERVED | PASS |
| FULL_REGRESSION | PASS |
| FUEL_REFLIGHT_CANDIDATE_V2_READY | NO |
| FUEL_REFLIGHT_BLOCKED_V2 | YES |

Real Qwen Test requests3, retries0, manual Official dispatches0, real orders/payments0, shared Test writes0, deployments0, Stable Integration merges0, Production writes0, feature pushes0. Qwen secret was used from the existing local environment in memory only; it was not printed or stored. No API Key, full failed response or full news body is included in these safe records.

Both worktrees are CLEAN at the final handoff. STOP for MASTER; no further model call, integration or deployment is started from this report.
