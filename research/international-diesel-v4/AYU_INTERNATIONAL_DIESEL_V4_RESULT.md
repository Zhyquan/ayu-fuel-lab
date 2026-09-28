# AYU_INTERNATIONAL_DIESEL_FORECAST_V4_001

INTERNATIONAL_DIESEL_DATA_GATE_V4 = PASS

INTERNATIONAL_DIESEL_MODEL_GATE_V4 = FAIL

DATA PASS为有剩余修订风险的研究准入，见source audit。与生产资格不同。模型、threshold、primary币种均未用Test改选；日本未用于任何训练/选择。

## 19项回答

1. 美国：EIA/FRED/ALFRED NYH DDFUELNYH + USGC DDFUELUSGULF；初始vintage日价→真实完整周。
2. 欧洲：EC Weekly Oil Bulletin EU27柴油WITHOUT TAX国家series，匹配国家log return中位数。
3. 共同历史15.45年，807calendar周；建模653个独立周，Test387周。
4. 美国首次vintage可审计；欧洲162单元格/6周抽样发现1处实质修订，最大EU单周median影响0.1105%，AIDI影响0.0552%；无全历史vintage等值保证。保守发布lag与另加1周敏感性控制时间风险，剩余迟报/修订风险必须保留。
5. AIDI log return = 0.5×US(两市场均值log return)+0.5×EU(国家log return中位数)，level从100链式累积。
6. International指美国+欧洲两独立区域；不是全球消费加权或亚洲/MGO船燃指数。
7. 日本同期/±1周相关性均N/A，n=0，官方文件403/下载失败；没有制造相关数。
8. 没有得到满足全部Gate的稳定未来一周预测增量：总体proper-score gain和逐年证据见下表。只有2/8完整年同时不退化。
9. 相对US-only：Brier相对改善-3.85%，LL相对改善-3.52%。负值即更差。
10. 相对EU-only：Brier相对改善-3.49%，LL相对改善-3.07%。
11. 相对最佳简单baseline：Brier改善-3.82%，LL改善-3.64%；区间见baseline报告。
12. Brier=0.6993，Log Loss=1.1493（Brier是三class误差平方之和，未除3）。
13. ECE=0.1114，class ECE=[0.07435374792121194, 0.07100432696908739, 0.11191237618292448]，预设calibration条件=False；不代表60%覆盖或MODEL合格。
14. 55–65%兑现见下表；样本不足时结论为未验证。
15. FLAT是主要难点之一，但不是唯一原因。FLAT recall=21.74%，DOWN/UP recall=37.80%/40.69%；二分类用不同条件样本，不能仅凭它变好就断言FLAT是唯一难点。
16. 明显涨跌Binary n=272，Brier=0.4592、LL=0.6506；分别较频率改善9.34% / 7.02%。只作诊断，无法成为上线资格。
17. 亚洲产品价值未验证，不是已证实完全脱节；日本与MGO缺少可分析数据。
18. 没有资格向真实用户展示未来趋势百分比。候选只显示模型验证中；研究回测概率不能当当前预测。
19. MODEL FAIL：CURRENT_AIDI_FORECAST与model artifact不生成。描述性CURRENT_AIDI_STATE单独保存；不是预测。

|方案|n|Brier|Log Loss|ECE|Accuracy|Macro F1|DOWN/FLAT/UP recall|
|---|---|---|---|---|---|---|---|
|composite|387|0.6993|1.1493|0.1114|34.11%|0.3318|37.80%/21.74%/40.69%|
|baseline/frequency|387|0.6735|1.1090|0.0648|29.72%|0.1527|0.00%/100.00%/0.00%|
|baseline/dominant|387|1.3237|2.7617|0.6628|29.72%|0.1527|0.00%/100.00%/0.00%|
|baseline/always_flat|387|1.3237|2.7617|0.6628|29.72%|0.1527|0.00%/100.00%/0.00%|
|baseline/continuation|387|1.0468|2.1915|0.5156|44.44%|0.4372|46.46%/33.04%/51.72%|
|baseline/reversal|387|1.3918|2.9017|0.6990|26.10%|0.2650|23.62%/33.04%/22.76%|
|us|387|0.6733|1.1102|0.0546|40.05%|0.3913|53.54%/26.96%/38.62%|
|eu|387|0.6757|1.1151|0.0587|41.60%|0.4142|51.18%/37.39%/36.55%|

|class|55–65% n|平均预测|实际兑现|Wilson95%CI|
|---|---|---|---|---|
|DOWN|3|59.70%|0.00%|0.00%–56.15%|
|FLAT|22|60.49%|27.27%|13.15%–48.15%|
|UP|11|58.02%|18.18%|5.14%–47.70%|

## Gate逐项

|Gate检查|通过|
|---|---|
|data|True|
|weeklyAvailabilityChecks|True|
|definitionFrozen|True|
|thresholdFrozenBeforeTest|True|
|brierBeatsBestSimple|False|
|logLossBeatsBestSimple|False|
|calibration|False|
|majorityFullYears|False|
|noClassCollapse|True|
|sixtyBuckets|False|
|compositeIncrement|False|
|asiaIndependentEvidence|False|

## 描述状态与敏感性

最新可发布完整观测周2026-09-14–2026-09-20，当前STRONG，可得时间2026-09-24T22:00:00+00:00。1/4/13w={'1w': 0.041331095668863074, '4w': 0.10860398137440383, '13w': 0.3522096686614523}；历史percentile={'1w': 0.9557046979865772, '4w': 0.9454297407912687, '13w': 0.9738651994497937}。源日期不等于页面计算日，不能称今天即时市场状态。

USD转换敏感性：n=746，与Primary收益相关=0.9843，三分类agreement=88.07%；是current FX描述分析，不训练、不重选Primary。

额外1周输入发布延迟（沿用冻结模型）：Brier=0.6953，LL=1.1484；未重新选择threshold/route/calibration。

## 交付与边界

本目录含全部14份要求报告/状态、原始ZIP/XLS/CSV与哈希、Validation冻结、逐周预测、binary、校准/年份表、代码和测试。`REPRODUCE.md`提供离线命令。Candidate位于ui/，读取复制的公开参考价格快照，绝不改动价格服务或公开Sites。

没有merge main、Pages部署、关联生产项目读写或连接、受限生产服务操作、付费资源。research branch可远程核对的SHA由目录外REMOTE_IDENTITY.json / DELIVERY.md记录。完成后停止，等待人工确认。
