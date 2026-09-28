# V3 年份与 Regime

**NOT_RUN_DATA_GATE_FAILED；完整模型测试年份 = 0。**

| 切片 | Brier | Log Loss | ECE / Accuracy | 相对基线增量 |
|---|---|---|---|---|
| 按年度 OOS | N/A | N/A | N/A | N/A |
| 高波动 | N/A | N/A | N/A | N/A |
| 低波动 | N/A | N/A | N/A | N/A |
| 重大能源冲击 | N/A | N/A | N/A | N/A |
| Non-overlapping weekly | N/A | N/A | N/A | N/A |

没有宣称多数完整测试年份改善，也没有计算零分母的“正增量年份比例”。本轮没有足够数据定义正式 V3 测试集。进入训练后需要事先冻结年份与 regime 定义，高/低波动阈值必须从过去样本确定，能源冲击切片只用于独立检验，不能成为新闻训练特征。

本轮 52 周滚动相关性图是当前修订历史的同期关系检查，并非按年度的概率模型回测，也无法说明供应冲击中的预测是否稳定。见[共同波动核验](GLOBAL_DIESEL_COMPOSITE_VALIDATION.md)。
