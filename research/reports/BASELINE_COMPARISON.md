# Baseline comparison

| 模型 | N | Brier↓ | Log loss↓ | 平均classwise ECE↓ | Accuracy | Macro F1 |
|---|---|---|---|---|---|---|
| frequency | 2768 | 0.667229 | 1.099396 | 0.026697 | 0.321893 | 0.208124 |
| momentum7d | 2768 | 0.667987 | 1.100919 | 0.040721 | 0.356936 | 0.353343 |
| logistic_raw | 2768 | 0.677303 | 1.175191 | 0.053978 | 0.369581 | 0.357091 |
| logistic_calibrated | 2768 | 0.711392 | 1.201528 | 0.097476 | 0.294436 | 0.289719 |
| isotonic_diagnostic | 2768 | 0.696004 | 1.387322 | 0.079549 | 0.309249 | 0.299284 |

Brier采用三类平方误差**求和**再取均值，范围0—2；LogLoss为自然对数。所有评估与bootstrap统一将概率裁剪到[1e-9,1]再归一化，避免零概率导致无穷损失；这是计分约定，不是校准或提升。统一DOWN/FLAT/UP顺序。频率基线只用训练样本，Laplace+1平滑；7日动量基线按冻结deadband分组，使用训练集条件频率；raw Logistic是第三基线。候选预指定logistic_calibrated，未按测试成绩改选Isotonic。

| 指标 | baseline − candidate 改善 | 周期bootstrap95% | 相对改善 |
|---|---|---|---|
| brier | -0.044163 | [-0.063460, -0.026921] | -6.62% |
| logLoss | -0.102132 | [-0.159923, -0.053633] | -9.29% |

负改善表示比最简单基线更差。本轮不继续搜索复杂模型、特征或阈值来追逐这一批测试集。没有Gradient Boosting/XGBoost、ensemble或LLM概率。
