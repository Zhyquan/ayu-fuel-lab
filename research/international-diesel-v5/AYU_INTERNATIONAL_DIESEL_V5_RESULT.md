# AYU_INTERNATIONAL_DIESEL_FORECAST_V5_LEADING_SIGNALS_001

V5_DATA_GATE = PASS

V5_MODEL_GATE = FAIL

V5_PRODUCT_GATE = FAIL

Frozen selection: {'group': 'CFTC', 'architecture': 'REGIONAL_EXPERT', 'family': 'logistic', 'calA': 'isotonic', 'calB': 'platt'}; theta0.0075; formal final evaluation count1. Preregister hash 4f8fe861888fa0d720bcf03ce55943dc180c671686e5edc259ac5c509acfe6e2. Model/configuration/threshold not changed after final scores.

## 22 required answers

| # | Question | Answer |
| --- | --- | --- |
| 1 | CFTC starts | 2013-06-04 report; pre-ULSD positions and all lag references excluded |
| 2 | 2013 contract transition | Physical sulfur change May delivery; June title administrative; PRIMARY post-transition only |
| 3 | CFTC availableAt | Normal report delayed one extra Friday cutoff; known ION actual issue next midnight; unproven catch-up intervals quarantined |
| 4 | EIA leakage | Actual original release+next midnight; seasonal reference past years only; negative injection tests enforce timestamps; archive revision risk remains |
| 5 | Retained signals | CFTC; {'us': ['us_return_1w', 'us_return_4w', 'us_volatility_13w', 'brent_return_1w', 'season_sin', 'season_cos', 'wti_return_1w', 'nyh_usgc_divergence', 'managedMoneyNetShare', 'managedMoneyNetShareChange1w', 'managedMoneyNetShareChange4w', 'producerMerchantNetShare', 'producerMerchantNetShareChange1w', 'swapDealerNetShare', 'openInterestChange1w', 'managedMoneyGrossShare'], 'eu': ['eu_return_1w', 'eu_return_4w', 'eu_volatility_13w', 'brent_return_1w', 'season_sin', 'season_cos', 'us_eu_divergence']} |
| 6 | Deleted signals | EIA inventory/refinery excluded if no matched Development gain; raw audit retained |
| 7 | StageA predictable | Proper scores improve slightly: Brier 0.1974 vs 0.2014; LL 0.5846 vs 0.5938; gate True. AUC 0.4607, so useful rank discrimination is not established |
| 8 | StageB beats momentum | n=139; accuracy 44.60% vs 60.43%; Brier 0.3223 vs 0.2399; LL 0.8637 vs 0.6729. Gate False |
| 9 | Hurdle vs V4 | V5 0.7370/1.2266; V4 0.7650/1.2918; matched direct 0.7946/1.3742 |
| 10 | Regional vs AIDI single | Development best admitted Regional 0.6635 / 1.0830 vs AIDI 0.6683 / 1.1031; Regional selected before final. Alternative not evaluated/re-selected after final; no claim of holdout superiority |
| 11 | Final Brier | 0.737007 |
| 12 | Final LL | 1.226603 |
| 13 | Gain vs best simple | -10.70% / -11.82% |
| 14 | Each2022–2025 year | All four retained; see year table below |
| 15 | Calibration | ECE 0.1611; ECE gate False; bucket gate False |
| 16 | 55–65% realized | DOWN n=0, mean=N/A, realized=N/A; FLAT n=1, mean=61.76%, realized=0.00%; UP n=22, mean=58.39%, realized=45.45% |
| 17 | Block stability | Brier NEGATIVE / LL NEGATIVE |
| 18 | CFTC increment | Matched Development 2.41% / 2.63%; not a claimed final causal contribution |
| 19 | EIA increment | Matched Development -5.51% / -6.63%; not retained |
| 20 | Asia | LIMITED; Japan nationwide workbook obtained; n=177 same-week pairs, return correlation 0.2560, exact sign agreement 50.28%; MGO UNAVAILABLE (license restriction). Japan diagnostic Brier 0.7631 vs Japanese frequency 0.2875; LL 1.1985 vs 0.5635 |
| 21 | Real user percentage qualification | NO |
| 22 | Current probability | Not generated: MODEL FAIL |


## 2022–2025

 Joint clear degradation means both proper losses >2% worse. Require >=3/4 not jointly degraded and >=2/4 improve both.

| Year | n | Brier | LL | ECE | Accuracy | Brier gain | LL gain |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2022 | 42 | 0.7524 | 1.2884 | 0.1897 | 40.48% | -12.49% | -17.00% |
| 2023 | 51 | 0.7024 | 1.1698 | 0.1082 | 37.25% | -9.82% | -10.35% |
| 2024 | 43 | 0.7553 | 1.2319 | 0.2643 | 23.26% | -15.04% | -13.65% |
| 2025 | 51 | 0.7435 | 1.2281 | 0.1758 | 31.37% | -6.65% | -7.62% |


## Current description and delivery

Current descriptive state STRONG, complete observation week ending 2026-09-20; not a prediction. No probability artifact or fitted model when Model FAIL. Candidate reads a copied public reference-price snapshot only; no price service mutation or public deployment.

Required leak/integrity/state tests, full test results, reproduction commands, raw source bytes, source hashes, exact feature lists, phase milestones and frozen predictions accompany this directory. Actual test totals and remote-backed identity are in the delivery files outside Git. No main merge, public Pages/Sites change, production-project access, paid data/API/resource or key.

Residual risks: previous V4 exposure to the final history; European historical revisions/rare late releases; CFTC corrected historical snapshots and incomplete actual release archives; no Asian representative validation. Data availability does not grant statistical or product qualification. Completed and stopped for manual review.

## Post-freeze external amendment

Japan statistics were computed only after MODEL_FREEZE under a separate external plan, not used for selection or any model change. The first external reader stopped at a pre-2013 duplicate-week check before scores; the original reader/plan and repair reason are retained. See ASIA_PRODUCT_VALIDATION_V5.md and results/EXTERNAL_READER_REPAIR.json. V5 formal evaluation count remains one; the original plan, final result and prediction hashes remain unchanged.

The model assigned UP as the most likely class in 180/187 weeks. Final recalls are DOWN 1.32%, FLAT 0.00%, UP 96.83%; this one-sided failure is visible in the frozen results. The calibrated Stage A slightly better proper scores do not overcome this conditional-direction failure.
