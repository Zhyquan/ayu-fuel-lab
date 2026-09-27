# Probability Model V1 — isolated R&D

Scope: structured statistical research and a local candidate page. All writes stay under `research/` and `data/research/`. Existing `dist/`, Intelligence, workflows and public deployment are not part of this pipeline.

## Reproduce

Python 3.12; create an isolated environment and install `research/requirements-lock.txt`. Then one command runs anonymous downloads (using saved cache), cleaning, target freeze check, feature snapshots, walk-forward fitting, calibration, evaluation and reports:

```sh
python research/run_probability_v1.py --download
```

Without `--download`, the command is fully offline. Inputs are committed and SHA256-pinned in `data/research/input-manifest.json`; a mismatch aborts. It never silently substitutes newer downloads. The manifest pins source HTML and ZIP too, so a later upstream page change requires a new versioned dataset rather than being silently accepted. Seed: 20260927. Model runtime dependencies are pinned including transitive packages. Numerical warnings are errors. The initial NumPy 2.2.6 environment produced platform BLAS floating-point warnings; final runs use 2.3.3 and complete without suppressing those warnings. This runtime fix does not change target, features or hyperparameters.

Successful execution is a completed research run; it does not imply model Gate PASS. This frozen V1 dataset yields FAIL; no deployable model or live probability is exported. The UI status fails closed while a run is in progress or aborted.

```sh
python -B -m unittest discover -s research/tests -v
npm test
npm run scan
python -m http.server 4400 --bind 127.0.0.1
```

Open `/research/ui/`. For the existing reference-price card, a local copy of the previously accepted `dist/data/normalized-live-cache.json` is needed. It is gitignored and is not downloaded or refreshed by the research command. Missing price cache shows unavailable and does not affect probability research.

## Files

- `download_data.py`: three ALFRED initial-release series, official NDRC archive pages and article cache. Serial requests, small delay, at most three retries, no credentials.
- `prepare.py`: dates, quarantine, official parsing, frozen labels, feature provenance, cycle IDs.
- `backtest.py`: three baselines, logistic candidate, past-only calibration, proper scores, class calibration, cycle bootstrap and lead-time strata.
- `report.py`: auditable Markdown reports and calibration plot from computed results.
- `ui/`: candidate only, local cache reader, strict probability contract, integer-percent rounding, unavailable state.
- `tests/`: source parsing, availability, group purge, negative WTI, frozen target and calibration-score evidence.

ALFRED’s current public vintage selector for DEXCHUS starts in March 2014. The study does not invent 2013 initial releases. Old official archive has a 29-day gap around December 2015; these snapshots are excluded. See DATASET_REPORT.md for all counts.

Data sources are attributed in the dataset report and each raw response metadata record. Numeric EIA/Federal Reserve data and government announcements are used as public research evidence; ALFRED ZIP README terms are retained. This task copies no third-party model implementation. Dependencies retain their upstream BSD/MIT/PSF-style licenses in their installed packages; no paid service is involved.
