# V3 二分类方向诊断

**NOT_RUN_DATA_GATE_FAILED。**

本轮阻断发生在数据准入；没有有效 V3 Composite、未来7日 Target 或 FLAT 阈值。UP vs DOWN 排除 FLAT 的二分类因此没有合法标签可用，不能通过改用 V2 / NYH 标签补出结果。

| 项目 | 本轮结果 |
|---|---|
| Eligible non-FLAT samples | 未定义，不伪造为有效的 0 样本数据集 |
| Binary estimator / calibration | NOT_RUN |
| Binary accuracy / Brier / Log Loss | N/A |
| 相对 binary baseline 增量 | N/A |
| 是否方向可预测 | UNKNOWN |
| FLAT 是否主要失败来源 | UNKNOWN |

原要求“概率失败以后继续二分类诊断”适用于存在合法 Target 的模型失败。这里没有开始概率训练；强行运行二分类会复用旧 Target 或违反可得时间约束。仍完成合法跨地区同期关系诊断，并把本报告作为明确的执行状态交付。

数据准入后，二分类才能在同样的 purged expanding walk-forward / ≥7日 embargo / past-only calibration 约束下测试，排除已冻结 FLAT 区间；它仅诊断方向信息，不替代最终三分类产品。
