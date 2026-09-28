# stageB calibration

Selected platt in Development only. Fits use chronological prior-year Calibration; evaluation uses the subsequent held-out Development year. StageB fits only historical MOVE labels and predicts **all future rows** before any scoring subset.

| Method | n | Binary Brier | Log Loss | AUC | ECE |
| --- | --- | --- | --- | --- | --- |
| platt | 100 | 0.2314 | 0.6520 | 0.6495 | 0.0575 |
| isotonic | 100 | 0.2436 | 0.6821 | 0.6673 | 0.1302 |


Binary Brier is mean(p-y)^2, not the two-column sum; final multiclass Brier is the sum across three classes. For Regional Expert, calibrated regional hurdles are mixed50/50 and StageA/B diagnostics score reconstructed AIDI-facing MOVE and conditional direction probabilities. This distinction is explicit.

Final calibration evidence will be appended after registered unlock. No confidence sharpening, temperature scaling or manual probability stretching.

## Frozen final evidence

| System | n | Binary Brier | Log Loss | AUC | Accuracy | ECE |
| --- | --- | --- | --- | --- | --- | --- |
| V5 | 139 | 0.3223 | 0.8637 | 0.5104 | 44.60% | 0.2659 |
| baseline | 139 | 0.2399 | 0.6729 | 0.6056 | 60.43% | 0.0284 |
