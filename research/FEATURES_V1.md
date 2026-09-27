# Features V1 — frozen before fitting

仅使用 ALFRED 初次发布值，不读取新闻或当前 Intelligence。每日北京时间09:00预测。

| 特征 | 固定定义 |
|---|---|
| brent1d/3d/7d/14d | 最新已发布观测 / 该观测日前N自然日及以前最近已发布观测 − 1 |
| wti1d/3d/7d/14d | asinh(最新WTI/50) − asinh(旧WTI/50)，支持2020年负价格，不删除危机样本 |
| usdCny3d/7d | 同Brent百分比口径 |
| volatility | 最新已发布Brent观测日前21自然日窗口的日对数变动样本标准差，至少8个观测 |
| proxy7d | (1+brent7d)×(1+usdCny7d)−1；两项各自最新已知，可能不同日，作为滞后动量而非当前真实指数 |
| brentAge/wtiAge/usdCnyAge | 预测日距各最新已知观测的自然日数 |

ALFRED的releaseDate只有日期精度，availableAt保守设为该日结束后的美国中部时间00:00，含夏令时换算。不是假设观测当天已知，也不假设下载当天是历史发布日期。只接受 availableAt≤predictionTimestamp。首次发布时间早于观测日的异常原始记录单独隔离，不修改日期“修好”。

每个特征保留所有输入的observationDate/availableAt于 `data/research/feature-provenance.jsonl`。一行快照汇总见 snapshots.csv。初次发布后始终使用初值，是可实时执行但可能较迟钝的策略；本轮不加入当时已知修订值。

最大观测陈旧度14日；回看锚点最多向前寻找额外7日，缺失则排除。`daysToNextAdjustment`和实际下次调价日仅作事后分组/分层，绝不加入FEATURES；没有可靠历史预告日历，不能用后来知道的窗口作特征。前次调价、库存、新闻、政策和carry-over均暂不加入。

标准化仅fit训练区间。Logistic C=1，lbfgs，max_iter=3000，seed=20260927，不调参。校准候选为log-probability输入的多项Logistic(C=1)，Isotonic分别对三类拟合再归一化，仅作诊断。训练和校准分别来自过去完整周期，按labelKnownAt清除边界目标重叠。

补充冻结Gate数值（首次模型拟合前）：classwise ECE每类≤0.05；样本数≥50的概率桶绝对校准差≤0.15；三类每类argmax占比≥1%、recall≥5%；FLAT argmax<90%。按官方周期整块bootstrap 2000次，95%区间下界需支持Brier及LogLoss改善；每周一快照作为不重叠七日敏感性检查。7个完整测试年份中至少6个两项得分改善。2026不完整年不计入此分母。
