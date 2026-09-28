# stageA calibration

Selected isotonic in Development only. Fits use chronological prior-year Calibration; evaluation uses the subsequent held-out Development year. StageB fits only historical MOVE labels and predicts **all future rows** before any scoring subset.

| Method | n | Binary Brier | Log Loss | AUC | ECE |
| --- | --- | --- | --- | --- | --- |
| platt | 162 | 0.2509 | 0.6981 | 0.4795 | 0.1252 |
| isotonic | 162 | 0.2434 | 0.6805 | 0.5252 | 0.0302 |


Binary Brier is mean(p-y)^2, not the two-column sum; final multiclass Brier is the sum across three classes. For Regional Expert, calibrated regional hurdles are mixed50/50 and StageA/B diagnostics score reconstructed AIDI-facing MOVE and conditional direction probabilities. This distinction is explicit.

Final calibration evidence will be appended after registered unlock. No confidence sharpening, temperature scaling or manual probability stretching.

## Frozen final evidence

| System | n | Binary Brier | Log Loss | AUC | Accuracy | ECE |
| --- | --- | --- | --- | --- | --- | --- |
| V5 | 187 | 0.1974 | 0.5846 | 0.4607 | 73.80% | 0.0553 |
| baseline | 187 | 0.2014 | 0.5938 | 0.5000 | 74.33% | 0.1030 |
