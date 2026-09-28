# Reproduce the frozen V5 experiment

## Runtime

Use Python 3.12.14 with the exact versions in `requirements-lock.txt` (core: numpy 2.3.3, pandas 2.2.3, scipy 1.15.3, scikit-learn 1.6.1). The run that produced this delivery reused the existing isolated V4 research environment. No package/resource purchase or key was required. Keep `PYTHONDONTWRITEBYTECODE=1`, `OMP_NUM_THREADS=1`, `OPENBLAS_NUM_THREADS=1`.

## Default: never reads final results

From the repository root:

```sh
PYTHONDONTWRITEBYTECODE=1 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 python research/international-diesel-v5/run.py
```

An existing preregistration is hash-verified. The command reports state and stops without opening final results, even after final evaluation. In a fresh pre-registration workspace it builds data, audits, features, Development, tests and a new immutable plan, then stops.

## One command for full offline frozen-plan reproduction

Choose a new empty destination, with the frozen V4 and V5 directories present in the checkout:

```sh
PYTHONDONTWRITEBYTECODE=1 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 python research/international-diesel-v5/run.py --reproduce-to /tmp/ayu-v5-reproduce-new --unlock-final-holdout
```

This copies research inputs into a new isolated directory, rebuilds raw audits/features/Development, verifies the original preregistration and Development hashes, and explicitly unlocks a **FROZEN_PLAN_REPRODUCTION** evaluation in that copy. It compares dataset/plan/selection/gate and Brier, Log Loss, ECE, accuracy with the original result (tolerance 1e-10). No network calls. The original formal marker/result is retained and is not rerun. See `results/REPRODUCTION_RESULT.json` for the actual verification.

Without `--unlock-final-holdout`, an isolated reproduction stops at preregistration and does not compare/read formal scores. A second formal unlock in the original directory is rejected because `FINAL_EVALUATION_STARTED.json` exists. No model/configuration/threshold/feature/calibration change is allowed after preregistration.

## Independent external diagnostics

Japan workbook extraction/diagnostics use bundled Python 3.12.14, numpy 2.3.5 and openpyxl 3.1.5, as recorded by `ASIA_VALIDATION_PLAN_R1.json`. Run against the delivered original frozen files:

```sh
PYTHONDONTWRITEBYTECODE=1 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 python research/international-diesel-v5/asia_validate_r1.py --validate-frozen-model
```

This verifies the immutable external inputs and script hash, reads the already frozen predictions, and recomputes Japan joins and diagnostics. Model fits: zero. No data acquisition or selection. The initial failed external reader and plan remain archived. The default external command also refuses to read final predictions. The official workbook may be inspected without modification; processed CSV/JSON retains dates, units and exclusions.

The protected core report generator retains its initial offline Asia placeholder. The delivered `ASIA_PRODUCT_VALIDATION_V5.md`, result answer 20 and external JSON are the post-freeze amendment. Rebuilding core reports alone will recreate the initial placeholder; use the external diagnostic command afterward and retain the amendment. This documentation limitation does not alter model results or hashes.

## Tests and local view

```sh
PYTHONDONTWRITEBYTECODE=1 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 python research/international-diesel-v5/test_v5.py
npm test
npm run scan
python -m http.server 4408 --bind 127.0.0.1
```

Local UI: `/research/international-diesel-v5/ui/`. No public deployment. No production update command is included. Test logs and browser proof are in `results/`; remote identity is in the delivery record outside the Git checkout.
