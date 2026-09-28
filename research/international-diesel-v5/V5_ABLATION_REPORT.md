# Development-only ablation

Same architecture, model family and calibration settings; only signal group changes. 2017–2020 rolling Validation, no2022+ row. A standalone group needs >=0.5% gain on both proper scores versusBASE; BOTH requires incremental >=0.5% on both scores againstCFTC and againstEIA. This rule was set before development.

| Signals | Brier | Log Loss | Brier gain vsBASE | LL gain vsBASE | Admitted |
| --- | --- | --- | --- | --- | --- |
| BASE | 0.6800 | 1.1122 | 0.00% | 0.00% | True |
| CFTC | 0.6635 | 1.0830 | 2.41% | 2.63% | True |
| EIA | 0.7175 | 1.1860 | -5.51% | -6.63% | False |
| BOTH | 0.7051 | 1.1504 | -3.70% | -3.43% | False |

Selected group: CFTC. EIA groups not proving increment are excluded; availability does not force retention. These are matched development estimates, not final causal contribution or trading value.
