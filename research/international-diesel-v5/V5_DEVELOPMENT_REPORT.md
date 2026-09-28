# Development winner

64 preset candidates =4 groups x2 architectures x2 model families x2 StageA calibration methods x2 StageB methods. Each family has one configuration; StageA/B share the family to keep search small. No final labels/scores enter pruning, threshold, calibration or architecture selection.

| Architecture | Best admitted configuration | Brier | Log Loss |
| --- | --- | --- | --- |
| AIDI_HURDLE | {'group': 'BOTH', 'architecture': 'AIDI_HURDLE', 'family': 'shallow_boost', 'calA': 'isotonic', 'calB': 'platt'} | 0.6683 | 1.1031 |
| REGIONAL_EXPERT | {'group': 'CFTC', 'architecture': 'REGIONAL_EXPERT', 'family': 'logistic', 'calA': 'isotonic', 'calB': 'platt'} | 0.6635 | 1.0830 |


Frozen winner: {'group': 'CFTC', 'architecture': 'REGIONAL_EXPERT', 'family': 'logistic', 'calA': 'isotonic', 'calB': 'platt'}. Mean per-year normalized proper-score objective 0.9749; 162 independent validation targets. AUC, accuracy and ECE are reported, not substituted after selection.

V4 best single-stage reference, same V5 development weeks: Brier 0.6930, LL 1.1282. Matched-feature direct three-class reference: 0.7066/1.1534. Neither reference is an architecture candidate or licenses dropping failing holdout years.

Regional experts train regional US/EU labels at the fixed0.0075 band; calibrate each region only on its pre-validation year; average probabilities50/50. This mixture is a transparent predictive approximation, not a mathematical identity for the class probability of an average return. All final scores and StageA/B diagnostics use the unchanged **AIDI** target. Own-region probabilities must demonstrate usefulness on that target.

Final fitting remains fixed Train through2020 -> Calibration2021 ->2022–2025. No final-year refitting or recalibration. Full settings and hashes are preregistered before unlock.
