# AYU_FUEL_PROBABILITY_MODEL_V1_001

## PROBABILITY_MODEL_GATE = FAIL

本轮完成独立统计研究与Candidate UI。未合并main、未部署公开Pages、未修改原有价格/Intelligence代码及证据链。未调用付费数据、LLM或任何新闻概率生成。

## 八个核心回答

1. **Ground Truth是什么？** PRIMARY B为Brent美元现货×USD/CNY的7自然日回报，±2.0%以内FLAT，低于−2% DOWN，高于+2% UP。初次发布版本标记真实可用时间。SECONDARY A是官方实际柴油每吨调价，独立保存和比较。
2. **能否称未来7天趋势？** 时间终点严格t+7自然日，可解释成“未来7天原油人民币成本压力”。不能解释为国内柴油最终涨跌概率或实际成交价预测。
3. **七天有没有统计价值？** 本轮未证明候选具备稳定增量价值。日快照、周一非重叠样本和T-1/3/5/7分层均已给出；不能拿临近窗口成绩冒充七天能力。
4. **提升多少？** 相比历史频率，Brier改善=-0.044163（相对-6.62%），LogLoss改善=-0.102132（相对-9.29%）。负数就是退步。只有0/7个完整测试年份同时改善。
5. **是否校准过？** 是，每fold用过去一年进行多分类Logistic校准，并比较Isotonic；测试集不参与拟合。校准过不等于通过校准验收。
6. **输出60%时是否约60%兑现？** 不能作这种可靠性承诺；55%—65%预测带的实际兑现见下表，完整十分位桶见校准报告。稀疏/空桶不能声称有效。
7. **三类分别如何？** 下方列出实际支持、召回率和预测占比；没有用FLAT总体命中率代替三类质量。
8. **能给真实用户展示百分比吗？** **不能。** 当前合同status=UNAVAILABLE、probabilities=null；不导出可部署模型、不生成当前三类概率，UI只显示不可用状态。

| 模型 | N | Brier↓ | Log loss↓ | 平均classwise ECE↓ | Accuracy | Macro F1 |
|---|---|---|---|---|---|---|
| frequency | 2768 | 0.667229 | 1.099396 | 0.026697 | 0.321893 | 0.208124 |
| momentum7d | 2768 | 0.667987 | 1.100919 | 0.040721 | 0.356936 | 0.353343 |
| logistic_raw | 2768 | 0.677303 | 1.175191 | 0.053978 | 0.369581 | 0.357091 |
| logistic_calibrated | 2768 | 0.711392 | 1.201528 | 0.097476 | 0.294436 | 0.289719 |
| isotonic_diagnostic | 2768 | 0.696004 | 1.387322 | 0.079549 | 0.309249 | 0.299284 |

| 约60%类别 | N | 平均预测 | 实际兑现 |
|---|---|---|---|
| DOWN | 11 | 58.57% | 27.27% |
| FLAT | 36 | 58.73% | 41.67% |
| UP | 35 | 59.74% | 25.71% |

| 类别 | 实际样本 | Recall | 预测占比 |
|---|---|---|---|
| DOWN | 811 | 22.81% | 29.12% |
| FLAT | 928 | 38.69% | 40.32% |
| UP | 1029 | 26.34% | 30.56% |

## Gate逐项

| 条件 | 结果 |
|---|---|
| A_asOfAvailabilityAndCyclePurging | PASS |
| B_bothProperScoresBeatFrequencyWithPositive95CI | FAIL |
| C_calibration | FAIL |
| D_fixedSevenDaySkill | FAIL |
| E_allClassesPredicted | PASS |
| F_notFlatOnly | PASS |
| G_yearStability | FAIL |
| H_domesticTargetAssociationMeasured | PASS |

未通过项：B_bothProperScoresBeatFrequencyWithPositive95CI, C_calibration, D_fixedSevenDaySkill, G_yearStability。

## 数据边界与主要风险

4460个完整快照，308个周期；OOS 2768个快照、191周期。完整特征从2014年开始，2013汇率初始版本缺失。官方公告有一段29日缺口，整体排除；没有伪造零调价。免费公开数据发布时间有周级滞后，成本代理未覆盖炼化、税收及政策干预。最大产品风险是把成本代理的概率误当成国内柴油最终价格概率。

## 交付与复跑

- [目标定义](TARGET_DEFINITION.md)、[FLAT决策](FLAT_LABEL_DECISION.md)、[数据报告](DATASET_REPORT.md)、[特征](FEATURES_V1.md)
- [Walk-forward](WALK_FORWARD_BACKTEST.md)、[校准](CALIBRATION_REPORT.md)、[基线比较](BASELINE_COMPARISON.md)
- 候选页：`research/ui/index.html`；原始/标准化/快照/OOS/manifest在`data/research/`。
- Python 3.12环境安装 `research/requirements-lock.txt` 后执行：`python research/run_probability_v1.py --download`。已保存数据默认缓存复用，逐文件hash校验；无需API Key。详见 `research/README.md`。
- 完整测试及remote-backed SHA见本任务外层 `DELIVERY.md` 与 `TEST_RESULTS.md`，避免自引用提交hash。

停止于研究候选，等待人工决定下一步。本轮FAIL不代表所有未来方法都无效，但不能继续以当前测试集择优后称为独立验证。
