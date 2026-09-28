# V4 数据源审计（训练前）

范围：独立研究目录；匿名公开数据；不接入现有价格服务。本报告先于 threshold/model evaluation 建立。完整原始哈希见 `data/DATA_AUDIT.json`；定义及容量限制见 `spec.json` / `SPEC_FREEZE.json`。

## 美国

- [NYH DDFUELNYH](https://fred.stlouisfed.org/series/DDFUELNYH)、[USGC DDFUELUSGULF](https://fred.stlouisfed.org/series/DDFUELUSGULF)：EIA 日度 ULSD 现货，USD/US gallon。两条当前公开series的首个有效观测均为2006-06-14（当前CSV仅作起点/最新日期审计，未作模型特征）；可审计的 ALFRED initial-release 实验窗口从2011-04-06开始。不能把系列的更早观测起点当作可审计 vintage 起点。
- 复用原有研究下载的原始 ALFRED ZIP，重新核对 ZIP/CSV 哈希并重新构建周序列；未继承旧 Target/threshold。`period_start_date` 是观测日，`realtime_start_date` 是首次公开 vintage 日期；按 Chicago 次日00:00保守认定可得。
- 正常发布时间在下一周：例如2026-09-16至09-22报价在09-23发布。不能把周五观察当作当天已可得。首次值中的缺失、USGC 2022-02-22零值、release早于observation异常隔离，绝不用当前修订值补成“首次值”。
- 最新官方读取：两条系列观测截止2026-09-22，09-23更新。预测特征只使用已完成且已发布周。
- [FRED 系列的 Public Domain: Citation Requested 标签](https://fred.stlouisfed.org/series/DDFUELNYH)、[EIA reuse policy](https://www.eia.gov/about/copyrights_reuse.php)。EIA价格上游包含Refinitiv；未访问或购买其商业feed，保留第三方权利例外，不将整个WPSR第三方内容视为无条件开放。

## 欧洲

- [EC Weekly Oil Bulletin](https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en)：2005-01-03至2026-09-21，柴油未含税国家周表，EUR/1000L；这里只提取 `*_price_wo_tax_diesel`，换成EUR/L。源产品是汽车柴油消费参考价，不是ICE柴油期货或MGO。
- 国别survey Monday、Wednesday上报、Thursday bulletin。历史全表并没有每一个观测对应的实际发布时刻。代码明确采用“survey后11天、下周Friday00:00 Brussels”的保守schedule，不把它冒充原始可得时间。极端迟报仍是残余风险。
- 固定 EU27 采样框架；排除UK、EU/EUR消费加权聚合列。消费权重会变动；本轮不继承官方加权聚合的历史重算。采用匹配国家周log return中位数，最低20个匹配国家。缺失周不补价、不生成伪造零收益。

### 修订实证：并非“没有vintage就判泄漏”

- 实际下载4份历史无税公告（2014-03-24、07-28、11-17、2015-01-26），只保存官方consumer table文字及原始文件哈希；含Platts图表的整份PDF不进入公开候选。
- 实际下载2份原始国家周XLS（2015-01-12、01-19）。这些国家值与当前全历史表逐格比较，总计162个EU27柴油单元格。两份XLS的差异仅为换汇结果的小数舍入。
- 存在一处超出舍入的修订：爱沙尼亚2014-07-28，从631.25变为652.08 EUR/1000L，+20.83。禁止宣称“不回改”。`data/eu-revision-comparison.json`保留全部值。
- 在这6个存档周中，未发现消费权重重构造成国家序列大面积回填；国家正式值与旧公告基本相同。**这只是有限抽样证据，不能证明所有年份都没有修订。** 中位数区域法对实测孤立修订的相邻周影响由准备程序计算；另设一周延迟的敏感性检查。研究 DATA admission 可以通过；生产概率并未获准。
- 许可：[EC legal notice](https://commission.europa.eu/legal-notice_en)，EC所属内容通常CC BY 4.0，第三方内容例外。本轮只保存国家数字和官方表，注明加工；不复用Platts图表、商用报价或未经授权品牌。

## 美国行业周报、原油、汇率

- [WPSR archive](https://www.eia.gov/petroleum/supply/weekly/archive/)：从实际链接获取2012年至2026的发布日期Table9 CSV，串行、至少1.25秒间隔，遇403/429停止。只读库存、馏分油生产、炼厂投入和利用率四项，使用当次报告第一周列，保留原始报告与实际release日期；不使用今天的重写历史或“去年同周”列冒充首次值。
- Brent / WTI 使用ALFRED初始发布日度数据，同样重新周聚合。WTI负值属于真实市场事件；只有周均值非正才不能计算log return，不能删除负日价来美化结果。
- 汇率只用于USD-converted**描述性Target敏感性**，不是Primary特征。FRED DEXUSEU为USD/1EUR，当前vintage的敏感性不声称PIT模型回测。ECB匿名公开API亦测试，TLS验证失败时未关闭验证。

## 日本 / MGO

- [METI官方调查结果](https://www.enecho.meti.go.jp/statistics/petroleum_and_lpgas/pl007/results.html)实际浏览器读取：周历史文件1990-08-27起，2026-09-16版，Monday survey / Wednesday14:00 JST publication，节假日可Thursday。2004-04起含消费税。
- 文件下载失败应保留错误。北海道开放档案实际为当地每月第一个Monday价格摘录；**不能代替日本全国周度序列**。不将其扩成周样本。
- [METI PDL1.0](https://www.enecho.meti.go.jp/en/outline/terms_of_use/)：出处、加工标注、第三方权利例外。日本数据完全隔离，不参与任何选择。外部相关性分析只能在模型冻结后执行。
- 本轮没有取得可合法公开保存的亚洲MGO验证序列：`ASIA_MGO_VALIDATION_STATUS = UNAVAILABLE`。零售轻油不能宣传成船燃。

## Gate 含义

至少8年共同区域覆盖、周度可对齐、美国首次vintage、欧洲国家正式series + 实证修订影响可控、匿名且无付费依赖。自动结果由 `data/DATA_AUDIT.json` 给出。欧洲DATA PASS为**有明确剩余风险的研究准入**，不是“已证明每个历史值完全等同首次发布”的声明。MODEL仍须独立接受校准、时间、增量和亚洲验证门槛。
