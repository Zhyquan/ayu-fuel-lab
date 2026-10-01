# Intelligence V2 分析协议（Phase A）

## 输入和性质

只读取本次通过 Evidence Gate 的完整 Evidence Pack。先冻结规范化 JSON 的 SHA-256，再分析；不得浏览另一个证据包、读取旧量化研究输出或增加包外事实。

目标是未来 7 天国际柴油参考市场的方向，第一版代理指标为纽约港低硫柴油现货美元/加仑。不是中国省级零售价、船用 MGO、真实成交价或下一轮行政调价保证。

三个百分比是基于当前证据的**主观综合估计**，`probabilityType = AI_SUBJECTIVE_ESTIMATE`，不是历史频率或历史校准概率。

## 分析顺序

1. 对每条 Evidence ID 记录 `impact: UP/DOWN/NEUTRAL`、`strength: LOW/MEDIUM/HIGH`、`kind: FACT/RISK/OUTLOOK/CLAIM`。事实、潜在风险、展望和声称分别处理。结构中的 impact/kind 必须保持与已核实证据一致；分析者可以降低强度。
2. 阅读 eventGroups。同一新闻的转载、同一周报的库存/产量/加工量、同一市场快照的多个报价均属于共同事件，不能按文章或字段数量投票。没有机械累计权重。
3. 优先检查柴油自身，原油只是输入；明确最新日度变化与近期变化的区别。FRED 的 STALE/UNAVAILABLE 近期上下文不得作为当前信号加权。不得把现货与期货混成同一连续序列。
4. 主动查找反向证据。缺失分类明确保留 FAILED/NO_QUALIFIED_SIGNAL，不把它们解释成利多或利空。冲突越大，三个估计越接近；不借多个相关字段夸大倾向。
5. 形成 DOWN/FLAT/UP，每项为 0–100 的整数，精度为 1 个百分点，总和严格为 100；5 的倍数仍合法。保持 AI_SUBJECTIVE_ESTIMATE，不人为制造小数或随机个位数。质量门禁不归一化、不重新分配、不自动修复非法输出。
6. `UP > DOWN` 时主方向 UP，否则 DOWN，包括两者相等时。FLAT 只显示“基本不变”，不能作为主结论。
7. 主方向原因最多 3 条，反方向风险最多 2 条；只选证据包中的 `displayText` 原文，并引用 Evidence ID。禁止自由扩写新的事实、预计金额、准确率或校准宣传。
8. generatedAt 使用实际分析时间，validUntil 恰好 +24 小时。来源到期可以更早触发 UNAVAILABLE。禁止延长旧预测日期伪装新预测。

## 输出

标准 JSON 包含 source、status、probabilityType、forecastHorizonDays、provider、generatedAt、validUntil、evidenceHash、probabilities、primaryDirection、mainReasons、counterReasons、signalAssessments。其他分析字段被拒绝。每条理由只有 evidenceId、text；每条评估只有 evidenceId、impact、kind、strength。

Provider 默认 MANUAL，允许当前 Codex/ChatGPT 免费完成分析。OPENAI/OTHER 在 Phase A 调用前直接阻断。无需逐次 HUMAN 审批文件，Forecast Gate 通过才保存不可覆盖的历史并写候选缓存。

## 质量门禁的实际边界

精确匹配理由、引用校验、时间校验和完整包 hash 能阻止新增理由事实、包被改动和无来源输出。它们不能自动证明新闻真实性、源网站标注日期无误、displayText 的语义完全准确，或主观估计具有预测能力。自动新闻解析器只接受已支持的保守事件规则，其他候选进入排除/待核实记录。首次真实运行同时人工读回 EIA 页面及 Reuters 原文。

## Outcome

T+7 后允许独立 `.outcome.json` 侧车，原始预测文件不变。以同一纽约港低硫柴油 USD/gallon 系列的原始证据价作为基准，对照 T+7 或之后首个可取得的完整观察日价格；绝对变化小于 0.5% 记 FLAT，否则 UP/DOWN。延迟的观察日、来源、基准日期及价格、观察日期、实际记录时间均保存；这是以后校准的预定义观察口径，并非本轮回测门禁。不同柴油品种不得替代。本轮尚无到期 outcome。
