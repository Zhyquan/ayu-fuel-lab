# V5 leading signal data audit

V5_DATA_GATE = PASS

M1/M2 machine-readable audit precedes development. Exact raw bytes, request URL, HTTP200 and SHA256 are retained. V4 Target / threshold integrity is PASS; its selection was frozen 2026-09-28T07:57:19.481971+00:00, before test freeze 2026-09-28T08:01:34.507782+00:00. Theta stays 0.0075 log return; no threshold search occurs in V5.

## CFTC

[CFTC PRE Disaggregated Futures Only](https://publicreporting.cftc.gov/Commitments-of-Traders/Disaggregated-Futures-Only/72hh-3qpy): anonymous selected-field query for market 022651 / NYME / FutOnly returned 925 rows. Audit raw history 2009-01-06–2026-09-22; primary 2013-06-04–2026-09-22, 695 records, 34 quarantined report dates. Old Heating Oil rows remain audit-only.

[Official release schedule](https://www.cftc.gov/MarketReports/CommitmentsofTraders/ReleaseSchedule/index.htm): Tuesday observation normally released Friday15:30ET; holidays delay. Regular history uses next-week Friday16:00ET, deliberately one cutoff later. Shutdown / ION exceptions are explicitly quarantined or assigned the documented actual issue date plus next midnight. See CFTC_ULSD_CONTINUITY_AUDIT and V5_INFORMATION_CUTOFF_SPEC.

**The current PRE historical snapshot is not a full initial-vintage archive.** CFTC can correct data and reclassify traders. No ULSD correction was identified in the reviewed official special notices; this does not prove none ever happened. Conservative timestamps control known release delays, not unknown historical corrections. Inherited EU revision / exceptional delay risk also remains.

[Government data copyright policy](https://www.cftc.gov/WebPolicy/index.htm): CFTC government information is public domain with acknowledgement requested; no seal or private licensed material reused. No key, paid feed, purchase or new resource.

## EIA

[Original WPSR dated archives](https://www.eia.gov/petroleum/supply/weekly/archive/): inherited raw archive ZIP hash verified; first observation column of each original release only. 768 report weeks, 2011-12-26–2026-09-14. Stocks million barrels; production/inputs thousand barrels/day; utilization percent. Exact dated release + next New York midnight. This preserves release records and holiday dates; not a claim original archives can never be corrected.

Inventory seasonal baseline: preceding five calendar years, within +/-3 ISO weeks, only earlier years and already released reports. Every record's reference years are saved; no current/future-year five-year average. Calendar gaps are not transformed into one-week changes. Dataset imputation is fit on Train only; it never invents an underlying inventory quote.

## Admission and coverage

694 weekly snapshots; 577 label/core-feature eligible. Valid recent source coverage: CFTC 660/694; EIA 694/694. A report can supply an available level while its change feature remains unavailable. Missing/stale sources are explicit NaN, with older actual source IDs retained only up to 21 days.

| Data check | Pass |
| --- | --- |
| targetFreeze | True |
| postULSDYears | True |
| postULSDRows | True |
| cftcCoverage | True |
| eiaCoverage | True |
| noFutureFeature | True |
| candidateFeaturesWithinLimit | True |


Data PASS is research admission under disclosed residual vintage risks. It neither certifies every archived number equals its first publication nor grants probability/product deployment.
