# Fuel Overnight Reflight — 2026-10-11

## Decision

**FUEL_REFLIGHT_BLOCKED for the complete domestic-adjustment product.** The isolated repair candidates and their local delivery replay are frozen and reviewable. Neither stable Integration nor shared Test was changed.

Two unresolved first bad layers remain:

1. **Forecast target:** the production prompt forecasts NY Harbor low-sulfur diesel spot direction. It does not forecast the next domestic regulated price adjustment. This candidate preserves that model contract and does not relabel its probabilities. Domestic adjustment has a working-day cycle, a minimum adjustment threshold and possible policy intervention; these are not represented by the current target/input contract. See the [NDRC mechanism](https://zfxxgk.ndrc.gov.cn/web/iteminfo.jsp?id=19805). A domestic forecast cannot be established by changing the page heading.
2. **Core → private Test delivery:** the actual Test pointer still selects the record generated on 9 October, while Core has a newer 10 October Official. Candidate publisher adapters work in isolated replay, but an automatic protected Test delivery caller is not installed/proven. Installing it would affect the stable integration and was excluded tonight.

Physical-phone acceptance and controlled real-model sensitivity remain unverified. They are not replaced by mock results.

## 1. Exact isolated identities and ownership

| Component | Branch / identity |
| --- | --- |
| Core base and re-fetched `origin/main` | `a2c46dd3104bd263d606d37b4245c0394b78f64e` |
| Core functional candidate | `feature/fuel-reflight-core-20261011` / `fc1331cb1b9e0c3a296077685a8bccd66f96992f` |
| Consumer base: stable Client snapshot | `ac31a3ce103f977d811106c0d7a410dd5decbada` |
| Retained actual Test Fuel runtime source | API48 / `380378195ab993f3b35591abcc94f3dcebb5c5ff` |
| Fuel-only runtime alignment | `4f52211140dd76fcd47bb2ab6a79cbf88f8904b8` |
| Client persistent LKG patch | `fece0eb6088d64cc855e9add297d59c91d995fcb` |
| Private receipt metadata and proof | `65feaf5cfd6b5fb72b48853b09b0ade9c39fec7f` |
| Consumer final historical-clock parity patch | `6b7176bcb56128d452379a3dbb695fa7a43399ab` |

Core managed worktree: `fuel-reflight-core-20261011/ayu-fuel-lab`.

Consumer managed worktree: `fuel-reflight-consumer-20261011`, branch `feature/fuel-reflight-consumer-20261011`.

The alignment commit mirrors already-deployed Fuel-specific sources; it is not a new Test deployment and must not overwrite shared Payment sources during admission. The replay/report are a separate Core descendant commit; its exact SHA is returned with this report. All candidates remain unpushed.

## 2. Confirmed causes and minimal changes

### A. Cold Client loses Last Known Good

Before: a page reopening without a server result had no persisted, account-scoped valid Forecast to render. Refresh could show LOADING even though the server's retained Forecast was usable. Ten targeted cold-cache/invalid-response/rollback cases failed before the patch.

After: the Fuel page loads a previously validated same-account/environment LKG before background work. A 10-second request timeout, rejection or invalid response settles to STALE when LKG exists, otherwise UNAVAILABLE. Locked/revoked/identity-error responses clear paid cached content. A legitimate lock remains a terminal state governed by the unchanged entitlement contract.

### B. Historical validation clock differs across layers

The reviewer reproduced a valid historical Forecast whose input pack aged past 24 hours roughly 146 seconds before the Forecast's own expiry. The old private consumer returned UNAVAILABLE in that interval, then recovered STALE at Forecast expiry. A second case kept probabilities but lost primary cards when an external input crossed its admission age during the Forecast's valid lifetime.

The candidate validates a frozen Forecast and its selected evidence at its original `generatedAt`; trusted current time still decides LIVE versus STALE. Future/invalid generation times, malformed identities, hashes, direction and probability contracts remain rejected. New input/news freshness is not extended. These are content-validation clock fixes, not rewritten source timestamps.

### C. News display was coupled to model selection / recompute

The old evidence-only workflow saved an artifact but did not write a durable independent accepted-news collection. Bridge could accept useful LOW material yet leave no dynamically publishable card when no reforecast occurred. Previously displayed evidence could also be mistaken for already consumed model evidence.

The candidate reuses `FUEL_ACCEPTED_EVIDENCE_V2` and the existing event identities. It builds and persists a fixed `data/accepted-evidence.json` collection independently of model success. Forecast novelty is compared with the current Forecast's actual input. LOW/NEUTRAL cards remain `RELATED_ONLY`, without claiming that they influenced probabilities. Only actual selected reasons bound to the exact Forecast hash become `FORECAST_REASON`.

## 3. Trigger before / after

| Path | Before | Isolated candidate |
| --- | --- | --- |
| Evidence-only collection | Collected diagnostic artifact; no independent card publication | Fixed-path accepted collection, exact-path controlled writer, hash-bound material decision |
| Automatic material evidence | Mainly periodic Official / price workflow triggers | Existing Official workflow also admits successful scheduled evidence-only runs with validated material decision |
| Bridge LOW / NEUTRAL | No model; could omit an independent card deliverable | Accepted collection callback and card output; model count stays zero |
| Bridge material | Existing Current one-shot / gates | Same protected route; independent card output and comparison against consumed input |
| Same-day Official reservation | At most one official model opportunity per date | Unchanged; a later event cannot bypass reservation or create another Official |

The existing morning admission window, activation guard and reservations remain intact. This is not an unlimited real-time inference service. Candidate workflows are local code; none was activated or dispatched tonight.

## 4–6. Controlled differential delivery replay

The command calls production Bridge, provider validation, Forecast builder, news/Forecast publishers, protected reader and actual Fuel Client logic. HTTP/model output and the database are injected; entitlement is synthetic in memory. No cloud order, real entitlement or real Qwen request is created.

| Case | Accepted influence | DOWN / FLAT / UP | Model transport | Forecast identity | Card |
| --- | --- | --- | --- | --- | --- |
| CASE_UP | HIGH / UP | 21 / 16 / 63 | One injected response | New hash | Visible |
| CASE_DOWN | HIGH / DOWN | 61 / 18 / 21 | One injected response | Different new hash | Visible |
| CASE_NEUTRAL | LOW / NEUTRAL | 35 / 25 / 40 | Zero | Original fixture hash retained | Visible |

These values are deliberate synthetic outputs to prove wiring and acceptance, **not evidence that the real model reacted to a controlled input**. They were not published as real forecasts. There is no probability rounding, jitter, automatic redistribution or forced numeric change.

See [delivery proof](reflight-records/fuel-reflight-delivery.safe.json) for input/output hashes and full identity trace. Each case also submits a later LOW item to the already running Client: news revision changes, new card renders, Forecast hash/probabilities remain unchanged, and model count stays zero.

## 7. Real Forecast recomputation already exists

Existing natural production runs, read only tonight:

| Date | Official run | GeneratedAt UTC | DOWN / FLAT / UP | Forecast hash prefix | Coverage |
| --- | --- | --- | --- | --- | --- |
| 8 Oct | `37719294092` | 02:44:37.477 | 30 / 25 / 45 | `474a128530f2` | NORMAL |
| 9 Oct | `37877106430` | 02:59:23.116 | 25 / 15 / 60 | `0f378ceb9daf` | NORMAL |
| 10 Oct | `38016659301` | 02:22:18.148 | 25 / 10 / 65 | `82514d565a3a` | LIMITED |

Their frozen input and Forecast hashes differ. The latest audit records QWEN / qwen3.8-flash, HTTP200, one actual request, input5238/output672 tokens. This is an existing run, not a call made tonight. Evidence input was NORMAL with four verified documents; two news enrichments failed number-grounding and an unassessed reason check, so final Forecast coverage was LIMITED. Core still published safely.

This proves genuine production recomputation and differing results. It does not prove calibration, semantic correctness, or a controlled causal sensitivity experiment. Historical failed-run selected IDs remain UNKNOWN where their original output was not retained.

## 8. Version, cache and account contract

- Cache key: `ayu-fuel-lkg-v1:<environment>:<native account/container context>`; uses existing account scope, not a second identity system.
- Stored fields are allowlisted private Fuel projection fields. Original generation, expiry, hashes and integer probabilities are retained.
- Protected receipt `publishedAt` is the server row `syncedAt`; `newsGeneratedAt` is the collection's original generation; `newsPublishedAt` is its server receipt. These are optional for compatibility with API48.
- New Forecast generation/hash replaces the prior snapshot atomically. An older Forecast or altered protected contents under the same Forecast hash is rejected.
- Under the same Forecast, newer news revisions are accepted; old responses cannot roll them back. A legitimately newer empty news collection clears expired cards.
- Local checksum detects corruption, not authentication. Entitlement expiry, clock rollback, owner/environment switch and a locked response invalidate or clear protected cache.
- Related cards retain the existing 72-hour expiry; expired Forecast reasons can remain historical reasons in LKG. No source date or Forecast validity is renewed.

## 9. Automatic news and real source availability

The official 10 Oct collection at `02:21:48.706Z` made 18 fetches: 15 successful and three failed; six market signals and four verified news documents passed. At `11:19:32Z`, the separate evidence-only run `38047995077` made 17 fetches: 13 successful/four failed and three verified documents. They are different runs, not reconstructed versions of one input.

Two local public reads tonight are separate again:

| Check UTC | Elapsed | Successful / failed | Fresh news body | Retained verified news |
| --- | --- | --- | --- | --- |
| 19:14:36.869 | 22.676s | 10 / 6 | 0 | 0 |
| 19:25:54.916 | 26.177s | 10 / 6 | 0 | 4 |

Six configured source families were checked. OPEC returned403; GDELT timed out then returned429; four Business Recorder article fetches returned403. No access restriction was bypassed. Eight EIA/FRED requests plus discovery reads succeeded.

The later read retained the four documents from their original verified receipts at `02:21:48.706Z`; it did not read four new article bodies. Original publication dates, fetched times and content hashes were preserved. Duplicate discoveries were30 (23.08% of the recorded discovery denominator), rejected news4; the oldest retained publication was about25.77 hours old. No material novelty against the current input was found.

The final all-retained policy was verified offline with that exact pack and marks LIMITED. Its replay time is not a third real source check. Source failures do not invalidate the valid six core signals or suppress LKG. See [source evidence](reflight-records/fuel-reflight-source-read.safe.json).

## 10–11. Bridge → Evidence → card

The isolated replay traverses normalization/relevance/dedupe, acceptance, collection hashing, news publish, Forecast publish when material, protected entitled read and actual Client projection. It confirms:

- Independent accepted cards reach the same Client without rebuilding it.
- LOW followup remains display-eligible and does not trigger a model request.
- A card not selected as a Forecast reason remains related material; it is not labelled as the reason for the probabilities.
- Locked users receive no full probabilities, accepted-news collection or paid evidence.
- An invalid core input can still produce a valid independently accepted card artifact without a model call; it cannot produce a bad Forecast.

The publisher is the real Fuel-only publisher implementation with an injected in-memory database. This is not a shared Test write or a phone test.

## 12. Measured latency and first bad delivery layer

Three existing natural Official runs: Evidence Gate → Core commit =25/24/30s (p50 25s, max30s). Gate → Pages deploy =170/166/161s (p50 166s, max170s). All three Pages jobs, daily-delivery/build/deploy, succeeded for each run. Pages latency is not private Test latency.

The actual read-only Test pointer at `2026-10-10T19:17:43.400Z` is still the 9 Oct hash `0f378…`, generated `02:59:23.116Z`, synced `11:47:57.621Z`: **8h48m34.505s** generation → private receipt. The newer 10 Oct Core hash `82514…` had not reached Test about16h55m after generation. The first bad delivery layer is the absent/unproven installed Core→Test caller, not unchanged Core probabilities.

The final local replay records submission separately, then T0 Bridge accepted and T1 Evidence accepted at the first accepted-collection callback, T2 projection, T3 in-memory publish, T4 protected read, T5 Client-renderable. T0/T1 are adjacent validation milestones in the same callback, not independently measured network hops. For these three samples, accepted→card p50 is 7.91ms and max is 17.25ms; per-case values are in the proof. This millisecond-scale local metric excludes network/cloud/real-model time and is not a live SLA. Original source availability → detection was not observable.

## 13–14. LKG and terminal states

| Situation | Candidate behavior |
| --- | --- |
| Valid newest Forecast | LIVE with probabilities/reasons/cards |
| Valid cached LKG before refresh resolves | UPDATING_WITH_LKG, existing contents retained |
| Forecast expired or refresh failed with usable LKG | STALE, full old judgement plus lightweight update status |
| Timeout / rejection / malformed response without any usable LKG | UNAVAILABLE; refresh allowed |
| Locked / revoked / changed account | Existing paid gating; protected cached content cleared |

Actual Test rows plus actual API48 bytes were replayed offline under a synthetic active entitlement: STALE, two main/two counter reasons, four primary cards and one accepted LOW card. Cold reopening settles to full STALE offline. The locked projection does not leak content. [Test row identity](reflight-records/fuel-reflight-test-readback.safe.json) and [API48 protected-read replay](reflight-records/fuel-reflight-api48-projection.safe.json) preserve the distinction between actual row observations and synthetic entitlement.

The reviewer-added expiry cases prove the early UNAVAILABLE window and external-primary-card loss are eliminated without extending Forecast lifetime. A valid Forecast with no generated cards can still display its protected reason text; no source or reason is invented.

## 15. Region removal

The stable Client base already had no Fuel province selector, price display, region-specific loading or price-service call. A search of all candidate `miniprogram/pages/fuel` files found no province/region/diesel-price/ton/litre selector or request remnants. Internal metadata outside that page was not removed. No redundant Client redesign or price change was made.

## 16. Tests and replay

| Gate | Result / evidence level |
| --- | --- |
| Core full suite | 568/568 PASS; independently rerun |
| Core production-shape replay | PASS |
| Core contract fuzz | 192 legal +25 illegal PASS |
| External/Bridge combinations | 128 PASS; 43 LOW accepted-no-recompute |
| Consumer seven applicable Fuel suites | 124/124 PASS |
| Same production code cross-repository delivery replay | Three cases PASS; real Qwen/cloud writes/orders0 |
| Public scan | PASS; 1371 public files, zero findings |
| Protected data/history/current artifacts diff | Empty versus Core base |
| Workflow syntax / exact writer scope / diff check | PASS |
| Real shared Test update / phone / new Client upload | NOT_RUN |
| Real-model controlled differential sensitivity | NOT_RUN |

Reproduce the joint delivery replay from this Core checkout:

```sh
node scripts/intelligence-v2/reflight-e2e.mjs --consumer-root /absolute/path/to/the/frozen/consumer --output /tmp/fuel-reflight.safe.json
```

It requires an explicit consumer checkout. There is no automatic discovery of a shared cloud environment and no credential input.

## 17. Independent reviewer

Separate GPT‑6.1 Sol / max reviewer attacked real recomputation/fake jitter, cache rollback, Bridge reachability, failed sources, LKG, zero-news, region remnants, cross-domain scope and unnecessary infrastructure. It independently ran the full Core suite/scan and cross-repository replay, reproduced the two historical-clock gaps and required their targeted correction.

Final isolated-code verdict: **PASS (both reproduced clock gaps closed)**. Complete domestic product readiness remains BLOCKED; true private Test delivery and phone acceptance are not claimed. Same-day material events remain constrained by the preserved Official budget/reservation policy.

## 18–21. Safety and final handoff

Changes outside Fuel =0; stable Integration merge =0; shared Test writes/deploys =0; Production writes/deploys =0; real Qwen calls this task =0; real payments/orders =0; unified Client uploads =0; feature pushes =0. Existing historical deployments and model calls are observations only.

All original Core history/current/cache/production data files are unchanged. Payment contract, Release, Recognition, Storage, Camera, Delete and shared Client shell were not edited. Candidate changes under `paymentDomain` are exclusively Fuel modules/contracts and do not alter Payment behavior.

Worktrees: **CLEAN at final frozen handoff**. No merge into either authoritative main or stable Integration is performed. MASTER may admit the isolated patches after resolving the target/delivery boundaries. No real run, shared Test deployment or accuracy/payment work is started from this report.
