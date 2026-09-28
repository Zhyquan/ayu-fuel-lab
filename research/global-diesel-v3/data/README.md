# 数据来源与使用范围

本目录是 V3 独立研究快照。原始文件 SHA256 固定于 `download-manifest.json`，复现时不联网、不更新价格。

| 数据 | 来源与许可 | 用途 |
|---|---|---|
| NYH / USGC current CSV | EIA，经 FRED 下载；Public Domain，注明来源与日期 | 回顾性共同波动诊断 |
| NYH / USGC initial ZIP / CSV | EIA，经 ALFRED 匿名初次发布表单下载；同上 | V3 独立可得时间审计；不复用 V2 标签 |
| MBIE original CSV | MBIE CC BY 4.0；经 Figure.NZ 合法原始文件镜像下载，表格 CC BY 3.0 NZ | 原始表与回顾性进口成本诊断，未经验证的历史禁止训练 |
| 沿海参考快照 | APIZero；只读拷贝此前已验收的独立候选快照 | 本地候选参考价；不请求 API |

数据处理和中文说明由 Ayu Fuel Lab 编写。保留原始数据，明确标注筛选、单位转换及隔离记录。EIA 标志、网站素材以及 Argus / ICE / Platts / Ship & Bunker 原始报价不包含在数据包中。

来源：[EIA 复用政策](https://www.eia.gov/about/copyrights_reuse.php)、[NYH](https://fred.stlouisfed.org/series/DDFUELNYH)、[USGC](https://fred.stlouisfed.org/series/DDFUELUSGULF)、[MBIE 许可与数据说明](https://www.mbie.govt.nz/building-and-energy/energy-and-natural-resources/energy-statistics-and-modelling/energy-statistics/weekly-fuel-price-monitoring)、[Figure.NZ 源表与出处](https://figure.nz/table/sSjWVpSTr3cfhCMY)、[Figure.NZ 条款](https://figure.nz/get-involved/our-terms)、[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)、[CC BY 3.0 NZ](https://creativecommons.org/licenses/by/3.0/nz/)。

`non-us-proxy-audit.csv` 将本次修订快照的 `vintageAvailableAt` 和未知的 `historicalAvailableAt` 分开保存。`Final` / `Provisional` 是发布方状态，不是过去可得的证明。没有重建底层 Argus Singapore gasoil 报价。

`retrospective-*` 不是正式 Composite、Target、Label 或训练集。没有生成当前预测文件或模型制品。
