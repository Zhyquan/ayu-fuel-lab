# Paired calendar block bootstrap

Moving blocks of 8 calendar weeks; preserve missing weeks; paired losses;3000 repeats, seed5001. Separate best-simple comparator for each proper loss. Positive baseline-minus-model means improvement. Calendar holes preserved; weeks are not treated as IID. CI crossing zero is EVIDENCE_WEAK, not automatically converted to a p-value Gate.

| Loss | Mean baseline-model | 95% CI | Evidence |
| --- | --- | --- | --- |
| brier | -0.071234 | [-0.12067967446981376, -0.02284080272564413] | NEGATIVE |
| logLoss | -0.129685 | [-0.21466339011270105, -0.04866102367497344] | NEGATIVE |
