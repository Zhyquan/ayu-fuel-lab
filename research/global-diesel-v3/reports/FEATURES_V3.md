# Features V3：候选与阻断

**NOT_RUN_DATA_GATE_FAILED。没有生产特征、训练矩阵或新闻输入。**

| 组 | 待准入后研究 | 本轮 |
|---|---|---|
| Composite | 1/3/5/7/10/20d returns；5/20d vol；趋势、MA距离、短长动量 | Composite 未准入；周度 proxy 不生成虚构日收益 |
| 区域分歧 | 各区域收益差、cross-market dispersion | 只计算同期共同波动，不当预测特征 |
| Crude | Brent / WTI 1/3/7/20d returns、vol | 未下载新特征，不复用旧目标假设 |
| Crack | NYH / USGC USD/US gal × 42 − Brent 或 WTI USD/bbl | 仅记录公式，未构造训练特征 |
| European crack | USD/ton gasoil 与 USD/bbl crude 比较 | 没有明确密度 / 同规格转换及许可，不计算 |
| Inventory | EIA distillate stocks；周变、4周变、季节偏离 | 需 first-release / availableAt；未纳入 |
| Refinery | utilization、inputs、distillate production | 可得时间核验后才准入；未纳入 |
| Curve | 同品种 front / second month contango、backwardation | 没有授权价格及 roll 合同，不强求 |
| News / war / OPEC | 后续 Intelligence overlay | 本轮不进入统计模型；未改 Intelligence |

单位明确：US gallon 为 3.785411784 L，US barrel 为 42 US gallons。MBIE finished diesel importer cost 的 USD/L 转换为 `NZD c/L × USD/NZD / 100`；这是其公开输出的单位转换，不是还原底层 Argus 报价。若将 USD/L 转为 USD/bbl，应乘 158.987294928；进口运费及质量调整仍在其中，不能误称纯 refining crack。

每项滚动特征必须只使用 decisionAt 之前已公布的版本。按观察日合并最新修订历史后再回测不符合要求。缺价格、缺发布信息、超龄不得通过填 0 或长期 forward-fill 混入。

本轮没有为了通过模型 Gate 而引入原油旧标签、退回单美国目标或绕开非美国数据缺口。
