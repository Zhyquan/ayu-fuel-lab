# GLOBAL_DIESEL_DATA_SOURCE_REPORT

数据 Gate 先于任何模型拟合完成。审查日：2026-09-28（北京时间）。

**GLOBAL_DIESEL_DATA_GATE = PASS**：仅表示 EIA 延迟日度柴油基准足以开展研究，不是全球船燃代表性或概率上线认证。机器证据：`../data/data-gate.json`、`../data/download-manifest.json`。

## 来源选择

| 来源 | 商品、单位、频率 | 历史与最新 | 费用、登录、Key | 程序化、研究、展示 | 本轮结论 |
|---|---|---|---|---|---|
| ICE Low Sulphur Gasoil Futures | ARA 交割低硫柴油期货；USD/公吨；日结算/盘中；合约100吨、10ppm | 合约有长期历史，但规格有演变；未下载授权历史，起止日期未验证 | 完整历史需订阅/购买；下载 Access ID 随订购提供 | 公开延迟展示需批准；派生定价也需按用途许可 | 优先审查后排除；本轮不适合免费训练或实时更新 |
| EIA NY Harbor ULSD No.2 / FRED DDFUELNYH | 美国纽约港超低硫柴油现货；USD/US gallon；市场观察日度、成批发布 | 当前版历史从2006-06-14；本轮 ALFRED 初次发布档从2011-04-06至2026-09-22；最新5.007，发布09-23 | 免费；公开下载无登录、无Key；EIA/FRED API另需Key，本轮不用 | EIA政府数据及该FRED系列标记Public Domain；注明来源日期可研究及展示；本轮匿名下载成功 | **Primary Fallback**；适合延迟更新研究，不适合盘中实时行情 |
| Singapore MGO / Ship & Bunker | 新加坡港船用轻柴油评估；USD/吨；日度报价 | 付费历史覆盖及最新价未采集，未验证 | 历史/自动feed需订阅；未登录、未购买 | 条款禁止无书面协议的机器学习、AI训练及商业产品开发；也限制再分发 | 不采集价格，不做训练或模型外部验证 |
| Rotterdam MGO / Ship & Bunker | 鹿特丹港船用轻柴油评估；USD/吨；日度 | 同上；未采集 | 同上 | 同上 | 不使用 |
| Hong Kong、Kaohsiung、APAC MGO | 港口或区域评估；供应商规格并不相同 | 本轮未取得许可明确、可重复、足够长的重叠价格历史；精确起止和最新值UNKNOWN | 未申请账户/Key/付费 | 没有可确认的免费产品使用许可；不把网页可见等同授权 | 不使用；不是断言全世界没有公开来源 |
| Bunker Index MGO / BIX World系列 | 港口评估及综合指数；USD/吨；每日 | 厂商说明MGO历史可到2008-04；准确港口起点/最新未验证 | 历史表、图、导出限订阅用户 | 本轮未取得数据授权，未下载历史；不能认定可公开再分发 | 替代商用来源记录，未作为模型数据 |
| MPA Singapore公开统计 | 月度船燃销量、质量等，**不是MGO价格序列** | 不作为价格覆盖证据 | 公开统计 | 不能拿销量替代价格 | 不适用本任务目标 |
| EIA distillate stocks WDISTUS1 | 美国馏分油库存，千桶，周度 | 当前修订历史始于1982；09-23发布最新周报 | 政府公开下载；无付费依赖 | 研究可用，但本轮未完成长期逐版初值与历史真实发布时间解析 | 不纳入本轮特征，避免用“周五+5天”猜发布日 |
| EIA WPULEUS3 refinery utilization | 美国炼厂开工率，%，周度 | 当前版1990起；同一周报体系 | 同上 | 公共逐周档案存在；不是数据不可获取，而是本轮尚未形成经过验证的PIT历史 | 依用户条件先不加入；不会用最新修订版倒灌历史 |

## 实际访问与数据质量

- 3个系列均经 ALFRED 官方下载表单，`file_type=4`（Initial release only），逐批不超过400个vintage；保留原始ZIP、表单、请求字段、取得时间及SHA256。
- 柴油初值共4,011行，其中129行首次发布为缺失；1行存在发布日早于观察日（2012-12-27 / 2012-12-26）并隔离，剩3,881个有效观察。缺值没有用后来修订值补齐。
- Brent/WTI也各隔离1个同日历异常。WTI负价格保留在原始数据；使用正价收益的21观察特征窗口遇到非正价格时整行不可用，明确报告覆盖损失。
- 两次独立匿名FRED CSV读取一致；最新柴油价格与EIA原始XLS、ALFRED初值三方一致。但EIA和FRED同源，**这不是独立市场来源验证**，两次成功也不是长期可用性SLA。
- 柴油观察→初次发布日期中位6天、95分位8天、最长36天。ALFRED可获得时间保守取发布日结束后的美国中部当地午夜（考虑夏令时）。日度观察不意味着当日可用。
- 冻结快照2026-09-28北京时间00:00；最近观察09-22，6天旧；最近发布09-23。数据Gate事先规定日历年龄≤7天适用于该周度发布节奏；超过就STALE。当前状态必须展示观察日期和发布日期。

## 使用条件和官方证据

- [ICE产品规格](https://www.ice.com/products/34361119/Low-Sulphur-Gasoil-Futures)、[ICE数据许可](https://www.ice.com/fixed-income-data-services/data-and-analytics/proprietary-data)、[ICE历史订购](https://www.ice.com/report-center/data-subscription)。本轮没有取得ICE行情，亦未寻找限制外的镜像。
- [EIA数据再利用条款](https://www.eia.gov/about/copyrights_reuse.php)：政府数据公开使用规则含第三方材料例外；此系列另有明确公共领域标记。[FRED DDFUELNYH](https://fred.stlouisfed.org/series/DDFUELNYH)、[EIA历史表](https://www.eia.gov/dnav/pet/hist/EER_EPD2DXL0_PF4_Y35NY_DPGD.htm)、[ALFRED下载说明](https://alfred.stlouisfed.org/help/downloaddata)。不复制机构标志。
- [Ship & Bunker条款](https://shipandbunker.com/terms)、[商业历史feed](https://shipandbunker.com/store)、[Bunker Index历史访问说明](https://www.bunkerindex.com/indices/world.php)、[MPA统计范围](https://www.mpa.gov.sg/port-marine-ops/marine-services/bunkering/bunkering-statistics)。
- [EIA周报档案及实际发布日期](https://www.eia.gov/petroleum/supply/weekly/archive/)、[库存历史](https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?f=W&n=PET&s=WDISTUS1)、[炼厂开工率历史](https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?f=W&n=PET&s=WPULEUS3)。

结论：合法免费路径满足柴油基准研究，访问可靠性仅获本次重复读取证据；发布延迟、初值缺失和地区代表性是主要限制。没有建立任何线上更新任务。
