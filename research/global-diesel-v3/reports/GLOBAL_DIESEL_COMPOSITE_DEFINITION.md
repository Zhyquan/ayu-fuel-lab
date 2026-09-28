# Global Diesel Composite：定义与准入

**本轮状态：NOT_ADMITTED。未建立正式 GLOBAL_DIESEL_COMPOSITE_INDEX。**

价格覆盖不等于可用于历史预测的数据覆盖。已取得 NYH、USGC 和 Singapore-linked NZ importer-cost proxy；后者的过去发布版本不足，不能与两条美国腿形成满足本轮无泄漏要求的训练目标。

## 未执行的候选定义

| 成分 | 角色 | 本轮状态 |
|---|---|---|
| EIA NYH ULSD | 美国柴油 spot | 初次发布历史核验通过 |
| EIA USGC ULSD | 美国柴油 spot | 初次发布历史核验通过 |
| MBIE 柴油进口成本 USD/L | 新加坡 gasoil 输入的进口成本 proxy | 回顾性分析可用；PIT 未准入 |
| ICE LS Gasoil | 欧洲 gasoil futures | PAID_OR_LICENSE_BLOCKED |
| 亚洲直接 MGO spot | 船用油外部验证及亚洲直接成分 | PAID_OR_LICENSE_BLOCKED |

不把两个美国地区计为两个全球区域。MBIE 的输入含新加坡 gasoil，但输出含新西兰进口成本，并不是 Singapore MGO、APAC MGO 或欧洲 gasoil 的替代报价。

若未来取得合格历史，比较等腿权重（各 1/3）与等区域权重（US 1/2、SG-linked import proxy 1/2；NYH / USGC 各 1/4）。这是简单权重候选，不由本轮完整历史的相关系数或任何 Test 分数优化；尚未选中或发布。加入欧洲腿后须另行冻结区域定义与权重。

各腿采用 `log(P_end / P_start)`，随后加权收益。禁止直接加总 USD/gal、USD/ton、USD/L 价格水平。指数水平只允许在有效连续收益上从基准 100 链接；没有有效收益不能制造水平或插值。

## 时间及缺失约束

| 字段 / 规则 | 候选合同 |
|---|---|
| 时间 | UTC 决策时刻；各地原始 observation date、release date、availableAt 分开 |
| US availableAt | ALFRED release date 的下一日 00:00 America/Chicago，保守处理日期精度，保留 DST |
| MBIE 本快照 | 日期级发布证据 2026-09-23；保守快照时间 2026-09-24 00:00 Pacific/Auckland，当日为 UTC+12 |
| MBIE 过去 availableAt | `null`，不可用“每周三通常发布”补出已回修的历史版本 |
| MAX_STALE_DAYS | 日度腿 4 自然日；周度腿 10 自然日；超过则退出，年龄按 observation date 计算 |
| 输出 | activeLegs / missingLegs / coverageRatio，coverageRatio 按原定权重计算 |
| 最低地域 | 必须含 US 与非 US；只有 US 时状态 UNAVAILABLE |
| 休市 vs 缺失 | 原始缺失、休市、尚未发布分别记录；不统一解释为 0 收益 |
| 收益窗口 | 不穿越无效缺口拼接；两端有效成分集合一致，标签缺腿则 unavailable，不临时改权重 |

本轮回顾性诊断完全不 forward-fill。周度数据没有真实 1d / 3d 波动；没有用重复周价制造日度样本。`retrospective-weekly-*` 是同步关系检查，不是正式 Composite 或新 Target。

## 命名与产品限制

当前还不能合理声称“全球柴油/船用燃油市场”已被一个可用指数表示。只有美国 + 间接 Singapore-linked proxy 的历史共同波动证据，欧洲和直接亚洲 MGO 均缺失。本轮当前国际市场状态为 UNAVAILABLE，不用 NYH 状态代替。参见[共同波动核验](GLOBAL_DIESEL_COMPOSITE_VALIDATION.md)和[来源报告](GLOBAL_DIESEL_V3_DATA_SOURCE_REPORT.md)。
