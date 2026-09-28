# Intelligence V2 来源与时效规格

## 最小采集范围

Node 原生 fetch，无第三方依赖、无密钥、无全文数据库。顺序执行；每个来源最多一次请求，新闻原文最多 6 次请求，每次 15 秒、响应上限 1 MB。EIA 请求使用带本项目公开联系地址的 User-Agent。保存原始响应 SHA-256、访问结果和短事实，不保存新闻全文或来源页面整页。

| 分类 | 本版入口 | 准入规则 |
| --- | --- | --- |
| INTERNATIONAL_DIESEL | [EIA Daily Prices](https://www.eia.gov/todayinenergy/prices.php) | 明确选择 NY Harbor Low-Sulfur Diesel，不能用 Heating Oil 或 CME NA 字段替代 |
| CRUDE | EIA 同一现货表；[FRED Brent](https://fred.stlouisfed.org/series/DCOILBRENTEU)、[WTI](https://fred.stlouisfed.org/series/DCOILWTICO) | Brent/WTI 最新价、日变化；近期序列单独检查、延迟时不加当前权重 |
| DISTILLATE_FUNDAMENTALS | [EIA 最新周报目录](https://www.eia.gov/petroleum/supply/weekly/)、[summary.txt](https://ir.eia.gov/wpsr/summary.txt)、psw00.json 元数据 | 周报目录最新发布日期、JSON 统计周、摘要统计周须一致；库存、产量、炼厂加工量与利用率 |
| OPEC_MAJOR_PRODUCERS | [OPEC](https://www.opec.org/press-releases.html)，新闻发现层 | 只接纳已核实产量/出口/供应政策；当前政策必须有有效期，访问失败保留 FAILED |
| SUPPLY_DISRUPTION | GDELT / 新闻 RSS → 原文 | 72 小时内真实事件或明确报道的当前持续风险；风险不能写成已发生停产 |
| SHIPPING | 同上 | 只关心关键航道/保险/油轮约束，与供应风险属于同一事件时不新增权重 |
| DEMAND_MACRO | 同上 | 只收重大需求或宏观冲击，普通股市或汇率新闻不为填分类而加入 |

每次固定产生七条 categoryChecks：VERIFIED、FAILED、NO_QUALIFIED_SIGNAL；这些状态不代表方向。三项核心分类必须有有效 FACT，市场必须同时覆盖 Brent、WTI、柴油；包须 5–12 条信号且至少两个来源机构。缺失核心或重大同口径来源冲突 → UNAVAILABLE / 待核实。

## 分级与准入边界

官方能源/政府发布为 Tier 1；Reuters/AP 等可靠原始媒体为 Tier 2；成熟市场网站 Tier 3；其他为 Tier 4。Tier 4 与社交媒体默认不准入主要信号。EIA 日度价格的发布者是官方机构，但 underlying spot 数据来自 Refinitiv，保留第三方 provenance，不把它说成政府独立调查结果。

原文采集器现阶段只自动核实 Business Recorder 的 Reuters byline、NewsArticle 发布时间与文章正文中已支持的美伊谈判/霍尔木兹风险规则。其他事件即使标题相关也记为 NEEDS_VERIFICATION / EXCLUDED，不自动编造事实。这是小规模 Phase A 适配器，不是通用新闻事实理解器；未来需根据真实候选逐步增加受检验规则。

## 免费发现层

[GDELT DOC 2.0 官方说明](https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/)：过去 72h、ArticleList、最多 15 条、英文关键词；只作发现，seendate 不是事件日期。失败/未找到可核验原文时补 [Business Recorder RSS](https://www.brecorder.com/feeds/latest-news)，合计最多 30 个候选，原文请求上限 6。候选包含不相关/未核实条目，不能宣称 30 条都是石油有效信号。可用发现层并不保证原文可访问。

## 日期与 freshness

- 市场：纽约 18:00 后按该日完整观察日计算；优先最近完整工作日，允许 EIA 发布延迟最多一个共同工作日。已知 2026 美/英休市日用于保守延迟检查；2027 未审查时失败关闭。本口径不是期货交易日历。
- 记录 quote eventDate、publishedAt、checkedAt。EIA Daily Prices 只给发布日，`publishedAtPrecision=DATE_ONLY`，00:00Z 仅是日期存储锚点，不宣称原文在午夜发布。不以抓取时间冒充行情时间。
- EIA 周报：统计周可早于 72h，但必须是官方目录最新一期；依据 [官方发布时间表](https://www.eia.gov/petroleum/supply/weekly/schedule.php) 和节假日例外计算 nextReleaseAt，新一期到期后旧一期不能再通过。精确发布日期和 10:30 ET 来自元数据/官方日程，冬夏令时转换。
- 突发：eventAt 到执行时不超过 72h；重刊不能更新事件日期。仅针对正文明确的当前持续风险采用发表时的状态日期，并注明 eventTimeBasis。
- OPEC 政策：已核实、当前有效、policyValidUntil 未到期；无有效期验证不准入。
- 未实现中国政策信号，不从旧研究/旧公告补充。
- Evidence Pack 与检查时间最大 24h；forecast validUntil 恰好 generatedAt+24h。来源失效可以更早降级。

## 去重和数据合同

每条信号：id、category、eventKey、measurementKey、headline、fact、displayText、impact、importance、kind、eventDate、publishedAt、checkedAt、sourceName、sourceOrganization、sourceUrl、sourceTier、verified、freshness；对应规则附 observation / releaseDate / nextReleaseAt / eventAt / policyValidUntil。

`eventKey + measurementKey` 相同的报道只保留一条，其他来源加入 verificationSources。多个报价/周报字段可保留原始测量，但 eventGroups 将其归于同一事件；分析协议禁止按字段计票。最终独立事件数由 eventKey 集合计算。

主要入口：`scripts/intelligence-v2/collect.mjs` → `CURRENT_EVIDENCE_V2.json` / `intelligence-v2/current-evidence.json` → `pending-intelligence-pack.json`。完整包 hash 在预测保存时绑定；浏览器再次校验。

## 复用与公开访问

[EIA reuse policy](https://www.eia.gov/about/copyrights_reuse.php) 对政府资料和第三方内容分别处理；[访问政策](https://www.eia.gov/about/privacy_security_policy.php) 不允许过量自动访问。本版仅低频读取少量报价和自行改写短事实、链接与日期，不下载 CME/ICE 历史、不保存 Reuters 全文、不承诺数据再分发许可。稳定性依赖来源 HTML/文本布局、免费端点可用性与来源发布日期准确性；本轮 PASS 不是长期可用 SLA。
