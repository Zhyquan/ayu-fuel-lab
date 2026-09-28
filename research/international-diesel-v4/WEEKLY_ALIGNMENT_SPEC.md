# 周度对齐（训练前冻结）

WEEK_ID = 观测周Monday日期，Monday00:00至Sunday23:59:59 UTC。每周恰好一个decision：Sunday23:59:59 UTC。未来7天的主Target是下一观测周的AIDI log return，而非每天重复T→T+7。

|来源|观测含义|可得时间|处理|
|---|---|---|---|
|NYH / USGC / Brent / WTI|Mon–Fri日价算术均值|该周所有采用日价的ALFRED实际首次日期最大值，Chicago次日00:00|仅已完成周；真实观测至少2日；未发布日不可当作当日特征|
|EU27 ex-tax|该周Monday survey|保守schedule：survey后11天Friday00:00 Brussels|明确是假设上界，不是可审计的逐周发布时间；极端迟报风险保留|
|EIA Table9|Friday结束的行业统计周|实际archive release date后一天00:00 New York|直接读当次报告第一观测列，假期按真实release日期|
|日本全国轻油|Monday survey，假日可Tuesday|通常Wednesday14:00 JST，假日可能Thursday|只外部验证；未获得下载时不生成序列|

Primary特征统一滞后一个**观测周**：预测T+1时用T−1，另逐行检查 `featureAvailableAt <= decisionAt`。本周EU虽可能已发布，本轮仍使用统一lag；不存在把美国尚未发布周价塞入本周特征。价格index的分母可以是预测时尚未完整发布的T周平均价，属于随后兑现的标签组成，**不是**输入。它不是“从当前已知成交价到七天后成交价”的预测。

labelKnownAt = Target两个端点所需公开日期的最大值。训练标签必须严格早于calibration第一decision；校准标签必须严格早于Test第一decision。标签结束日期和发布时刻都不能越过边界；本轮不靠随意删除最后一行代替发布时间purge。

缺失规则：完整calendar weekly grid；不得ffill价格/插值/用零收益补缺失。EU比较相邻calendar周共同可用的国家，至少20/27；不足则Target无效。index可跨缺失观测累积真实多周变化，记录空周；这种变化**不能**变成一个单周标签。美国节假日仅聚合实际观测；末尾尚不完整的报告周剔除。特征缺失在Train内拟合median imputer，未伪造基础报价。

时区使用IANA Chicago / New_York / Brussels / Tokyo，保留夏令时。发布时间只有日期精度的来源一律取次日午夜。EIA与US实际vintage时间独立，不用EU schedule替代。

revision：美国首次vintage锁定；EU正式国家series当前快照，历史对照/修订影响另列，不声称精确复原所有周首次发布。日本最新周可能被纠正；外部描述若仅current snapshot会明确这一证据级别。汇率USD sensitivity为current-vintage描述分析，不训练。
