# Asian external product validation

ASIA_VALIDATION_STATUS = LIMITED

Japan = AVAILABLE_EXTERNAL_ONLY. Singapore/APAC MGO = UNAVAILABLE.

Source: [METI national weekly retail price survey](https://www.enecho.meti.go.jp/statistics/petroleum_and_lpgas/pl007/results.html), original workbook `data/asia-evidence/japan-national-weekly.xlsx`, sheet 軽油, B dates / C national diesel, JPY/litre. Source observations: 1834 from 1990-08-27 to 2026-09-14. Processed by Ayu Fuel Lab; these diagnostics are not produced or endorsed by METI. [Public data use policy](https://www.enecho.meti.go.jp/about/linksto_thissite/index.html), PDL1.0 with attribution and processing disclosure. No separate third-party restriction was identified in the inspected diesel sheet.

## Method frozen before external scores

`ASIA_VALIDATION_PLAN_R1.json` hash 9cd82dd406ca5263632aa02179965eab87437b626bf16f0db9c06fdc9c0e2265. Model freeze hash 98f45cf2777efbc91fda5a8693650c1a7d76816113f91231b860a7163889eb09. This analysis loads frozen predictions and never fits a model. Raw workbook byte hash is recorded. Japan change for target week W is log(survey price in W+1 / price in W), on adjacent calendar survey weeks; actual survey dates and elapsed days remain in aligned diagnostics. Missing weeks are not interpolated. This is a point-survey external proxy, while AIDI is a weekly-average Target. All -1/0/+1 lags were predeclared and retained. Positive lag means Japan's change one calendar week later than the AIDI target.

| Japan lag | Paired weeks | Return correlation | Exact sign agreement including zero | 3-class agreement using inherited theta |
| --- | --- | --- | --- | --- |
| -1 | 178 | 0.1395 | 51.12% | 29.21% |
| +0 | 177 | 0.2560 | 50.28% | 29.94% |
| +1 | 175 | 0.1907 | 53.14% | 30.29% |

## Fixed probability transfer diagnostic, same-week alignment

Paired n=177. Labels use inherited theta ±0.0075 as an explicitly external diagnostic. No threshold tuning. Frozen V5 Brier 0.763085, Log Loss 1.198474, accuracy 9.60%. Japan pre-2022 frequency baseline Brier 0.287461, Log Loss 0.563476, accuracy 84.18%. Baseline counts/probabilities and all row-level joins are in `results/ASIA_VALIDATION_RESULT.json` / `results/asia-aligned-diagnostics.json`. This does not validate calibration for Japan, MGO or Chinese fishermen.

## MGO rejection

[Ship & Bunker Singapore](https://shipandbunker.com/prices/apac/sea/sg-sin-singapore) has a limited recent public table and subscriber historical downloads. Its [terms](https://shipandbunker.com/terms), reviewed 2026-09-28, restrict ML/AI training/commercial-product related uses without written agreement. No MGO price series was acquired or used. No subscription, API key or paid resource was created. MGO statistics remain null, n=0.

V5_PRODUCT_GATE = FAIL. The independently failed Model Gate blocks product percentages. Japan access improves external evidence availability; it does not change the frozen model or establish marine/Asian product validity.
