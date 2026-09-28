# Development-only contribution

The selected architecture/family/calibration is kept fixed; entire groups are removed and re-fit on the same chronological development folds. Positive gain means the full selected model has lower loss than the model without that group. This is predictive ablation evidence, not causal attribution. No impurity importance or holdout feature pruning.

| Removed group | Used in winner | Brier gain of retaining group | LL gain of retaining group |
| --- | --- | --- | --- |
| CFTC | True | 2.41% | 2.63% |
| INVENTORY | False | Not retained | Not retained |
| REFINERY | False | Not retained | Not retained |
| REGIONAL | True | 2.76% | 2.31% |
| PRICE_MOMENTUM | True | 2.19% | 2.82% |

CFTC's increment must be reported at Development evidence level. Inventory/refinery availability was verified; absence of admitted increment leads to exclusion. Price and regional groups retain information, but small matched differences cannot identify a universal dominant economic mechanism. Final results cannot be used to change these inputs.
