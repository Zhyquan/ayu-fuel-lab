# Registered final holdout

V5_MODEL_GATE = FAIL

Plan SHA256: 4f8fe861888fa0d720bcf03ce55943dc180c671686e5edc259ac5c509acfe6e2. One formal evaluation; fixed Train<=2020 / Calibration2021; no holdout refit. Full target weeks in2022–2025 only. No rerun, threshold change, model change or deletion of bad years after final scores.2026 excluded.

| Model / baseline | n | Multiclass Brier | Log Loss | ECE | Accuracy |
| --- | --- | --- | --- | --- | --- |
| V5 | 187 | 0.7370 | 1.2266 | 0.1611 | 33.16% |
| frequency | 187 | 0.6767 | 1.1138 | 0.1030 | 25.67% |
| dominant | 187 | 1.3998 | 2.9183 | 0.7033 | 25.67% |
| continuation | 187 | 0.6658 | 1.0969 | 0.0516 | 39.04% |
| mean_reversion | 187 | 0.6667 | 1.0986 | 0.0517 | 38.50% |
| v4_best | 187 | 0.7650 | 1.2918 | 0.1714 | 32.62% |
| matched_direct_three_class | 187 | 0.7946 | 1.3742 | 0.2427 | 33.69% |
| us_only | 187 | 0.8270 | 1.3866 | 0.2910 | 32.09% |
| eu_only | 187 | 0.8410 | 1.5877 | 0.3029 | 34.22% |


Best simple Brier comparator: continuation; LL comparator: continuation. Relative gains -10.70% / -11.82%; positive means better.

| Preregistered Gate | Pass |
| --- | --- |
| data | True |
| brierTwoPercent | False |
| logLossTwoPercent | False |
| yearNotJointDegraded3of4 | False |
| yearsBothImprove2of4 | False |
| stageABothProper | True |
| stageBBothProperAndAccuracy | False |
| multiclassECE | False |
| adequateReliabilityBins | False |
| beatsV4BothProperScores | True |
| beatsMatchedDirectThreeClassBothProperScores | True |


StageA binary Brier/LL/AUC: 0.1974/0.5846/0.4607; frequency 0.2014/0.5938.
StageB binary Brier/LL/Accuracy/AUC: 0.3223/0.8637/44.60%/0.5104; same-holdout momentum 0.2399/0.6729/60.43%. Historical MOVE scoring subset only; future inference predicts every row.

## Limits

The2022–2025 history was previously examined inV4. V5 locks configuration before new final scores, but cannot restore historical blindness. EU/CFTC/EIA archival revision assumptions are disclosed in data audit. StageB and mixture performance cannot be presented as MGO, Chinese retail adjustment, causal inventory effects or transaction returns.
