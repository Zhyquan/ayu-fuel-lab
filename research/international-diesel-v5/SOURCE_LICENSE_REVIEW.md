# V5 source-use review

This research code inherits the repository's MIT license. Source data has its own terms; the code license does not replace them.

| Source | Evidence / terms | V5 use |
| --- | --- | --- |
| CFTC Disaggregated Futures Only, market 022651 | [CFTC web policy](https://www.cftc.gov/WebPolicy/index.htm), public US government data with acknowledgement; private contributed material excluded | Anonymous selected public position records and source metadata retained. No private contribution, seal or logo reused. |
| EIA original weekly petroleum reports | [EIA copyright guidance](https://www.eia.gov/about/copyrights_reuse.php); frozen V4 source audit and dated archive bytes | Read-only inheritance; first observation column, source dates and units retained. |
| EU Weekly Oil Bulletin and ALFRED price inputs | Frozen V4 source/definition audit, original attribution and hashes in `data/LEADING_SIGNAL_DATA_AUDIT.json` | No new acquisition or licensing claim; inherited research inputs and limitations retained. |
| Japan national weekly retail price survey | [Agency for Natural Resources and Energy use policy](https://www.enecho.meti.go.jp/about/linksto_thissite/index.html) / [PDL1.0](https://www.digital.go.jp/resources/open_data/public_data_license_v1.0); source attribution and processing disclosure required; third-party exceptions apply | Original official weekly workbook and processed B/C national diesel series, external diagnostics after model freeze. No distinct third-party restriction identified in inspected diesel sheet. Source and derived-data disclosure in ASIA_PRODUCT_VALIDATION_V5.md. |
| Ship & Bunker Singapore MGO | [Terms](https://shipandbunker.com/terms), updated 2026-08-27; restrict ML/AI training/commercial-product related use without written agreement, plus historical downloads require login/subscription | REJECTED. No price series acquired, copied into this repository, trained on or used for product validation. No paid request or registration. |

Japan's ordinary anonymous HTTP request returned 403. A normal browser click on the official weekly download produced a valid XLSX of 2,648,192 bytes, SHA256 `b6e2a35b69253e4a89a083631c106212d12ccc42e2df7927baa722b895b4c1bd`. No CAPTCHA/security warning/authentication bypass. Access metadata and the unsuccessful request hash are retained separately from statistical inputs.

No purchased data, API subscription, key, paid model or server/database resource was used.
