# AYU_GLOBAL_DIESEL_FORECAST_V3_COMPOSITE_001

**GLOBAL_DIESEL_DATA_GATE_V3 = FAIL**

**GLOBAL_DIESEL_MODEL_GATE_V3 = FAIL**

执行状态：**NOT_RUN_DATA_GATE_FAILED**。这是数据可得时间不足造成的模型未准入，不是模型训练后评分失败，更不是已经证明方向不可预测。

## 本轮完成的研究

- 新研究分支 `research/global-diesel-forecast-v3-composite`，基于冻结 V2 SHA `0e2f9e3c89c0877a0990175148a90242d6a1249b`；只新增 `research/global-diesel-v3/`。
- 侦察19项来源，覆盖 Europe、US、Asia、Asia Pacific、公开消费者价/统计替代源，逐项记录商品、频率、覆盖、访问、许可与产品限制。
- 两条美国初次发布历史分别重新下载，15.463 年，有效初值 3881 / 3879；异常隔离，缺失不填最新修订数值。
- 合法开放取得 MBIE 1170 个周度柴油进口成本，22.404 年；这是非美国 proxy，证明不是只能获取美国价格。新加坡相关成本与 NYH / USGC 同期周收益 r=0.762651 / 0.752060；不作为未来预测结果。
- 原始响应、下载 metadata、SHA256、单位转换、同期相关/方向/滚动诊断、Gate、状态、失败候选和测试均独立保存。

## 为什么严格 Data Gate 仍失败

`SOURCE_COVERAGE_GATE = PASS`（长期价格覆盖）不等于 `GLOBAL_DIESEL_DATA_GATE_V3 = PASS`（可用于本轮无泄漏研究的长期历史）。MBIE 最新历史含暂停后回填及事后回修；原站 ordinary access 为403、授权开放镜像提供最新版本，但本轮未取得 ≥5 年的初始/历史发布 vintage。没有按“通常下周三发布”伪造历史 availableAt。

用户要求的最低历史标准没有降为少于5年，也没有删掉非美国实际贡献或 publication leakage 约束。已验证 PIT region 仅 US；非美国已准入 PIT history 为0年。因而不建立正式全球 Target，不训练 Routes A/B/C，也不生成概率、模型制品或当前方向。

ICE、Ship & Bunker、CME/Argus 的相关权限不足；没有购买、申请付费试用或绕过授权。没有拿 EU consumer diesel、台湾国内牌价、月度 bunker volume 或 residual VLSFO 换名填充 Benchmark。

## 最终13项回答

| 问题 | 结果 |
| --- | --- |
| 1. Composite 由哪些市场组成？ | 正式指数未建立。候选为 NYH + USGC + Singapore-linked NZ importer-cost proxy；Europe 未获授权。 |
| 2. 亚洲市场有没有真正进入？ | 新加坡 gasoil 输入的进口成本 proxy 进入了同期诊断；没有直接亚洲 MGO，也没有进入正式预测 Target。 |
| 3. 能否合理代表国际柴油方向？ | 同期共动有支持，但全球/船用油产品代表性未验证，当前不能使用正式全球强弱标签。 |
| 4. 7日方向有预测价值吗？ | UNKNOWN；无合格 Target，未训练。不能把同期相关性当预测价值。 |
| 5. 相对单 NYH 提升？ | N/A，未形成同一 V3 Target 的样本外比较。 |
| 6. 相对最强 baseline 提升？ | N/A；基线和模型均未评分。 |
| 7. Brier / Log Loss？ | N/A，没有 V3 样本外概率；未搬入 V2 分数。 |
| 8. 校准合格？ | 未验证，Platt / isotonic / multinomial 未运行。 |
| 9. 60%预测实际兑现率？ | N/A，没有预测；DOWN / FLAT / UP 的55–65%桶均无模型样本。 |
| 10. FLAT 是主要失败来源吗？ | UNKNOWN；本轮是数据准入阻断，阈值未选、三分类未运行。 |
| 11. 明显涨跌二分类可预测吗？ | UNKNOWN；NOT_RUN_DATA_GATE_FAILED，不能改用旧目标制造诊断。 |
| 12. 对亚洲 MGO 的代表性？ | 尚未证明；MGO_EXTERNAL_VALIDATION_LIMITED。进口成本不是港口 MGO 报价。 |
| 13. 有资格向用户显示百分比？ | 没有；当前国际市场 UNAVAILABLE，未来7天“模型验证中”。 |

## 交付与边界

14项指定文件都在本报告同目录；[来源报告](GLOBAL_DIESEL_V3_DATA_SOURCE_REPORT.md)、[同期诊断](GLOBAL_DIESEL_COMPOSITE_VALIDATION.md)、[二分类执行状态](BINARY_DIAGNOSTIC_REPORT.md)、[当前状态](CURRENT_GLOBAL_DIESEL_STATE.json)。其余模型阶段报告明确 NOT_RUN / N/A，不能误读为已完成回测。

失败候选仅在本地预览，沿海价格使用9月26日来源快照；国际当前状态 unavailable，未来7天“模型验证中”，无预测方向或百分比。生产文件、价格链、main、公开页面和其它项目不在本轮改动范围；未合并、未部署。

复现、测试与实际点击证据见[README](../README.md)、[测试记录](TEST_RESULTS.md)、[浏览器记录](BROWSER_VERIFICATION.md)。本轮结束，后续数据版本取得、许可证处理或模型研究须另开授权阶段。
