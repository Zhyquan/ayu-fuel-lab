# GLOBAL_DIESEL_FORECAST_V2_RESULT

**GLOBAL_DIESEL_DATA_GATE = PASS**
**GLOBAL_DIESEL_MODEL_GATE = FAIL**

研究线：research/global-diesel-forecast-v2；基线44ad784b34996067e13059c1f15582d7d0272526。数据/目标/验证选择在正式测试前提交aa518a87ff6f7bc6c1402b6326d7d41221fae02b；最终remote-backed身份见交付清单。

## 十个结论

1. **Benchmark**：EIA New York Harbor Ultra-Low-Sulfur No.2 Diesel Spot (DDFUELNYH)，USD/US gallon。ICE历史许可/费用不满足本轮条件。
2. **国际代表性**：它是实际柴油成品价格，比原油成本更贴近研究目标；但只直接观察美国纽约港，尚不能证明它代表全球柴油整体。候选页面明确标注地区。
3. **亚洲MGO关系**：EXTERNAL_VALIDATION_LIMITED；合法可用历史未取得，所有相关性/方向/外域分数为null。没有把公路柴油与MGO视为同一商品。
4. **历史跨度**：可用初次发布记录2011-04-06—2026-09-22，约15.5年、3,881个柴油观察；建模Dataset 2975行，正式OOS 1321行（2020—2026），非重叠237。
5. **基线增量**：不能稳定打败。冻结候选vol_historical_platt Brier 0.698150 对 0.671297（恶化4.00%）；log loss 1.151943 对 1.105511（恶化4.20%）。仅1/6完整年满足增量条件。
6. **校准**：确实实施了过去数据校准，但效果不合格。候选ECE 0.107973，频率0.077265。
7. **约60%兑现**：见下表，非重叠样本不足，不能宣称可靠。
8. **三类表现**：见召回表，FLAT严重偏弱。
9. **真实百分比展示资格**：没有。测试后的raw路线分数较好不能替代预先冻结的校准候选，未调松Gate。
10. **当前未来7天预测**：不输出；未生成CURRENT_GLOBAL_DIESEL_FORECAST.json或model artifact。Candidate显示“模型验证中”。

## 冻结候选三类表现

| 类别 | 支持N | 预测N | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|
| DOWN | 487 | 470 | 29.15% | 28.13% | 28.63% |
| FLAT | 300 | 88 | 23.86% | 7.00% | 10.82% |
| UP | 534 | 763 | 36.57% | 52.25% | 43.02% |

混淆矩阵（行真实/列预测，DOWN/FLAT/UP）：`[[137, 38, 312], [107, 21, 172], [226, 29, 279]]`。

| 类别 | 55—65%桶N | 平均预测 | 实际发生 | 非重叠N/发生率 |
|---|---:|---:|---:|---|
| DOWN | 24 | 56.64% | 45.83% | 5 / 40.00% |
| FLAT | 5 | 55.90% | 0.00% | 1 / 0.00% |
| UP | 153 | 58.42% | 43.14% | 27 / 51.85% |

## 当前状态（观察，不是预测）

最近已发布纽约港柴油 5.007 USD/US gallon，观察2026-09-22、发布09-23；冻结研究日距观察6天。1日+0.60%、7日-6.20%、20日+7.31%。20观察分位65%，预定规则状态 **NEUTRAL / 正常**，不能把最近7日回落自动叫未来偏跌。非盘中实时，也非全球平均。

## Gate逐项证据

| 检查 | 结果 |
|---|---|
| reliableLegalFiveYearData | PASS |
| targetAndThresholdAndCandidateFrozen | PASS |
| timeAvailabilityAndPurging | PASS |
| brierBeatsAllSimpleBaselinesBy2Pct | FAIL |
| logLossBeatsAllSimpleBaselinesBy2Pct | FAIL |
| calibrationImprovesFrequencyAndIsSmall | FAIL |
| majorityCompleteYearsStableIncrement | FAIL |
| majorityCompleteYearsNoMaterialRetreat | FAIL |
| threeClassesDoNotCollapse | FAIL |
| sixtyBandEvidenceAllClasses | FAIL |
| nonoverlappingProperScoreGains | FAIL |
| blockBootstrapPositiveLowerBound | FAIL |
| currentWeeklyDataFresh | PASS |
| MGO外域条件 | NOT_EVALUATED / EXTERNAL_VALIDATION_LIMITED（条件不适用，不是代表性通过） |

## 交付与限制

- 所有改动在research/global-diesel-v2内；保留main、公开页面、价格生产链、Intelligence与原V1文件。没有付费、Key、订阅或部署。
- 最新观察只是周度发布节奏下可接受，不能宣传实时；初值发布日期仅到日粒度；原始源缺值及WTI异常窗口导致覆盖缩小；MGO代表性未证。
- 重跑、依赖、完整测试、浏览器证据见README.md与TEST_RESULTS.md；文件校验见reproducibility.json。
- 已停止建模/调参。等待人工确认；不合并、不发布。
