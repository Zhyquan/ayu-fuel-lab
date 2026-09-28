# Ayu International Diesel V5

V5_DATA_GATE = PASS

V5_MODEL_GATE = FAIL

V5_PRODUCT_GATE = FAIL

The frozen 2022–2025 evaluation contains 187 independent target weeks. V5 Brier 0.737007 / Log Loss 1.226603 versus the best simple continuation baseline 0.665773 / 1.096918. Formal evaluation count: one. No current probability JSON or fitted model artifact is released.

## Read the results

- [22 required answers and final conclusion](AYU_INTERNATIONAL_DIESEL_V5_RESULT.md)
- [CFTC ULSD continuity](CFTC_ULSD_CONTINUITY_AUDIT.md)
- [Leading signal data audit](V5_LEADING_SIGNAL_DATA_AUDIT.md)
- [Information cutoff](V5_INFORMATION_CUTOFF_SPEC.md)
- [Dataset and splits](V5_DATASET_REPORT.md)
- [Feature lists](V5_FEATURES.md)
- [Development ablation](V5_ABLATION_REPORT.md)
- [Development architecture selection](V5_DEVELOPMENT_REPORT.md)
- [Immutable preregistration](V5_PREREGISTERED_PLAN.json) and [SHA256](V5_PREREGISTERED_PLAN.sha256)
- [MOVE calibration](MOVE_CALIBRATION_REPORT.md)
- [Conditional direction calibration](DIRECTION_CALIBRATION_REPORT.md)
- [Final holdout](V5_FINAL_HOLDOUT_REPORT.md)
- [Reliability bins](V5_RELIABILITY_REPORT.md)
- [Each complete final year](V5_YEAR_BY_YEAR.md)
- [Calendar block bootstrap](V5_BLOCK_BOOTSTRAP.md)
- [Development feature contribution](V5_FEATURE_CONTRIBUTION.md)
- [Asian external validation](ASIA_PRODUCT_VALIDATION_V5.md)
- [Current descriptive state](CURRENT_AIDI_STATE.json)
- [Reproduction instructions](REPRODUCE.md)

## Evidence and candidate

`data/raw/` contains the anonymously acquired CFTC response and dataset metadata. EIA, EU and price raw bytes are inherited from frozen V4; no new copy of the production price chain is modified. `data/dataset.csv`, `data/provenance.json`, dataset freezes and raw hashes support the availability audit. `results/` contains development and final predictions, first formal unlock marker, model freeze, tests, milestones and isolated reproduction evidence.

The post-model Japan diagnostics use the official nationwide workbook under `data/asia-evidence/`, with source attribution and processing disclosure. `ASIA_VALIDATION_PLAN.json` and the initial reader are preserved. The first reader stopped before scores because of two pre-2013 duplicate survey weeks. `ASIA_VALIDATION_PLAN_R1.json`, `asia_validate_r1.py` and `results/EXTERNAL_READER_REPAIR.json` record the repair, unchanged model identity and externally fixed comparisons. Japan evidence is LIMITED; MGO is unavailable because the reviewed candidate restricts the intended uses.

`ui/` is a local research candidate: reference price from a copied public snapshot, descriptive international state, and “未来7天趋势 / 模型验证中”. No current forecast percentages. It is separate from `dist/` and public Pages/Sites.

## Interpretation limits

The 2022–2025 history was already viewed in V4. V5 locks it against V5 selection; it cannot become historically unseen data. Source revision and exceptional publication risks remain. Regional probability averaging is an empirical approximation to AIDI classes. Stage A improves proper scores slightly but has AUC below 0.5; it does not establish useful discrimination. All four final years lose to simple baselines. Asia and model gates remain separate.

Research branch only. Stop for manual review after delivery.
