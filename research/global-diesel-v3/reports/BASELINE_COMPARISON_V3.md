# V3 路线及基线

**全部 NOT_RUN_DATA_GATE_FAILED；不是统计上跑输基线。**

| 路线 | 候选 | 本轮训练 / OOS |
|---|---|---|
| A | Multinomial Logistic；轻量 HistGradientBoosting classifier | 未运行 / 无 |
| B（优先） | Ridge / ElasticNet；GradientBoosting regressor；quantile regression；历史残差 bootstrap → 3类分布 | 未运行 / 无 |
| C（可选） | 简单高/低波动 regime；只有稳定增量才保留 | 未运行 / 未增加 HMM 或 clustering 依赖 |

| 基线 | Brier | Log Loss | Accuracy / Macro F1 / 类别 Recall / Confusion |
|---|---|---|---|
| Unconditional frequencies | N/A | N/A | N/A |
| Random walk / FLAT prior | N/A | N/A | N/A |
| 7-day momentum | N/A | N/A | N/A |
| Mean reversion | N/A | N/A | N/A |
| Single NYH feature model | N/A | N/A | N/A |
| V3 Composite model | N/A | N/A | N/A |

同一比较必须使用相同 V3 Composite Target、时间块及概率评分定义。single-NYH baseline 只限制输入为 NYH，仍预测相同 Composite 标签；不能拿 V2 的 NYH Target 分数与 V3 Composite Target 分数相减。V2 分数没有搬入本报告。

本轮相对单 NYH 增量、相对最强 baseline 增量、日度/非重叠评分均 N/A。同期相关性或方向一致率不是以上基线的未来预测成绩。没有选择最佳候选、最强 baseline 或生成模型制品。
