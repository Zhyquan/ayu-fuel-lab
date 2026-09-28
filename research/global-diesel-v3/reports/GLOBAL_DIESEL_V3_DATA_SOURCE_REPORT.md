# V3 全球柴油数据源侦察

研究日：2026-09-28。先核对访问与许可，再获取被允许的价格历史；没有训练后回填来源调查。

**SOURCE_COVERAGE_GATE = PASS；GLOBAL_DIESEL_DATA_GATE_V3 = FAIL。**

最低“US + 非US 柴油 proxy”的长期价格覆盖已找到：EIA NYH / USGC 与 MBIE Singapore-linked 柴油进口成本。失败点是非美国成分没有 ≥5 年可核验的历史发布版本，无法满足用户要求的 publication / availableAt 无泄漏规则。“可下载22年历史”和“22年当时可用的历史”是两个结论。没有把许可不明、终端零售或受政策影响的牌价换名来通过 Gate。

不是断言世界上不存在合法免费非美国数据，也不是因为只有美国价格。以下是本轮实际访问与许可核验的范围；未知字段明确写 UNKNOWN。元数据中的文件/公告日期不冒充已核实的最新报价日。

## 来源概览

| 来源 | 地区 | 频率 | 准入状态 |
| --- | --- | --- | --- |
| EIA New York Harbor ULSD | US | daily | PIT_HISTORY_VERIFIED |
| EIA US Gulf Coast ULSD | US | daily | PIT_HISTORY_VERIFIED |
| ICE Low Sulphur Gasoil | Europe / ARA | daily | PAID_OR_LICENSE_BLOCKED |
| Ship & Bunker Singapore MGO | Asia / Singapore | daily | PAID_OR_LICENSE_BLOCKED |
| Ship & Bunker Hong Kong MGO | Asia / Hong Kong | daily | PAID_OR_LICENSE_BLOCKED |
| Ship & Bunker Kaohsiung MGO | Asia / Taiwan | daily | PAID_OR_LICENSE_BLOCKED |
| Ship & Bunker APAC MGO average | Asia Pacific | daily | PAID_OR_LICENSE_BLOCKED |
| Ship & Bunker Rotterdam MGO | Europe / Netherlands | daily | PAID_OR_LICENSE_BLOCKED |
| Singapore Gasoil spot assessments | Asia / Singapore | daily | PAID_OR_LICENSE_BLOCKED |
| CME Singapore Gasoil (Platts) Futures | Asia / Singapore | daily | PAID_OR_LICENSE_BLOCKED |
| Argus Zhoushan Bunker Index marine diesel leg | Asia / China Zhoushan | daily | PAID_OR_LICENSE_BLOCKED |
| Taiwan CPC domestic sea-route light diesel posted prices | Asia / Taiwan | weekly adjustment events | POSTED_PROXY_NOT_ADMITTED |
| MBIE diesel importer-cost proxy (via Figure.NZ original file) | Singapore-linked / New Zealand import parity | weekly | RETROSPECTIVE_ONLY_PIT_UNVERIFIED |
| Australian Institute of Petroleum diesel terminal-gate prices | Asia Pacific / Australia | daily | LICENSE_UNCLEAR_NOT_ADMITTED |
| European Commission Weekly Oil Bulletin | Europe / EU27 | weekly | RETAIL_PROXY_NOT_ADMITTED |
| France DGEC international refined-product quotations | Europe / Rotterdam | weekly | LICENSE_AND_HISTORY_UNCLEARED |
| ÅSUB Rotterdam LSMGO monthly statistics | Europe / Rotterdam | monthly | FREQUENCY_AND_LICENSE_NOT_ADMITTED |
| Singapore MPA bunker sales by fuel | Asia / Singapore | monthly | NOT_PRICE_SERIES |
| Hong Kong official motor-diesel import/retail comparison | Asia / Hong Kong | monthly | PRODUCT_AND_FREQUENCY_NOT_ADMITTED |

## EIA New York Harbor ULSD

| 字段 | 核验结果 |
| --- | --- |
| 地区 | US |
| 商品定义及柴油/MGO/gasoil 匹配 | Ultra-low-sulfur No. 2 diesel |
| 单位 | USD/US gal |
| spot / futures / proxy | spot |
| 频率 | daily |
| 历史起点 | 2006-06-14 |
| 最新日期/元数据日期 | 2026-09-22 |
| 免费与否 | True |
| 是否登录 | False |
| 是否 Key | False |
| 程序化访问 | Anonymous FRED CSV and ALFRED initial-release form; official EIA XLS also available. Requests were sequential. |
| 研究许可 | ALLOWED_PUBLIC_DOMAIN_ATTRIBUTION |
| 公开衍生结果许可 | ALLOWED_PUBLIC_DOMAIN_ATTRIBUTION |
| 历史发布版本已验证 | True |
| 适合训练 | PIT initial values 2011-04-06 onward verified this run; missing releases stay missing. |
| 适合实时生产 | Published daily observations arrive in a weekly release; not intraday. |
| 本轮状态 | PIT_HISTORY_VERIFIED |
| 事实与限制 | Current-vintage CSV is for retrospective comparison only. Initial-release CSV is a separate fresh V3 download. Both markets belong to one region. |

出处：[来源 1](https://fred.stlouisfed.org/series/DDFUELNYH)、[来源 2](https://alfred.stlouisfed.org/series/downloaddata?seid=DDFUELNYH)、[来源 3](https://www.eia.gov/about/copyrights_reuse.php)。

## EIA US Gulf Coast ULSD

| 字段 | 核验结果 |
| --- | --- |
| 地区 | US |
| 商品定义及柴油/MGO/gasoil 匹配 | Ultra-low-sulfur No. 2 diesel |
| 单位 | USD/US gal |
| spot / futures / proxy | spot |
| 频率 | daily |
| 历史起点 | 2006-06-14 |
| 最新日期/元数据日期 | 2026-09-22 |
| 免费与否 | True |
| 是否登录 | False |
| 是否 Key | False |
| 程序化访问 | Anonymous FRED CSV and ALFRED initial-release form; official EIA XLS also available. Requests were sequential. |
| 研究许可 | ALLOWED_PUBLIC_DOMAIN_ATTRIBUTION |
| 公开衍生结果许可 | ALLOWED_PUBLIC_DOMAIN_ATTRIBUTION |
| 历史发布版本已验证 | True |
| 适合训练 | PIT initial values 2011-04-06 onward verified this run; missing releases stay missing. |
| 适合实时生产 | Published daily observations arrive in a weekly release; not intraday. |
| 本轮状态 | PIT_HISTORY_VERIFIED |
| 事实与限制 | Current-vintage CSV is for retrospective comparison only. Initial-release CSV is a separate fresh V3 download. Both markets belong to one region. |

出处：[来源 1](https://fred.stlouisfed.org/series/DDFUELUSGULF)、[来源 2](https://alfred.stlouisfed.org/series/downloaddata?seid=DDFUELUSGULF)、[来源 3](https://www.eia.gov/about/copyrights_reuse.php)。

## ICE Low Sulphur Gasoil

| 字段 | 核验结果 |
| --- | --- |
| 地区 | Europe / ARA |
| 商品定义及柴油/MGO/gasoil 匹配 | 10 ppm gasoil futures |
| 单位 | USD/metric ton |
| spot / futures / proxy | futures |
| 频率 | daily |
| 历史起点 | 2015 (low-sulfur specification transition; predecessor is different) |
| 最新日期/元数据日期 | UNKNOWN_NOT_OBTAINED |
| 免费与否 | False |
| 是否登录 | True |
| 是否 Key | License-dependent |
| 程序化访问 | Historical EOD ordering/subscription; no authorized free long history obtained. |
| 研究许可 | LICENSE_REQUIRED |
| 公开衍生结果许可 | CASE_BY_CASE_DERIVED_LICENSE |
| 历史发布版本已验证 | False |
| 适合训练 | Commodity suitable; unavailable within this free-license scope. |
| 适合实时生产 | Requires entitled market data feed and display/derived permissions. |
| 本轮状态 | PAID_OR_LICENSE_BLOCKED |
| 事实与限制 | No price history downloaded. Exact first/latest accessible observations remain unknown. Public delayed display does not grant derived-index rights. |

出处：[来源 1](https://www.ice.com/products/34361119/Low-Sulphur-Gasoil-Futures)、[来源 2](https://www.ice.com/report-center/data-subscription)、[来源 3](https://www.ice.com/fixed-income-data-services/data-and-analytics/proprietary-data)、[来源 4](https://ir.theice.com/press/news-details/2015/ICE-Futures-Europe-Completes-Successful-Transition-to-Low-Sulphur-Gasoil-Contract/default.aspx)。

## Ship & Bunker Singapore MGO

| 字段 | 核验结果 |
| --- | --- |
| 地区 | Asia / Singapore |
| 商品定义及柴油/MGO/gasoil 匹配 | Marine gasoil indication |
| 单位 | USD/metric ton (catalog; payload not ingested) |
| spot / futures / proxy | spot indication |
| 频率 | daily |
| 历史起点 | UNKNOWN_NOT_OBTAINED |
| 最新日期/元数据日期 | UNKNOWN_NOT_OBTAINED |
| 免费与否 | Public display; licensed history |
| 是否登录 | Subscription-dependent |
| 是否 Key | Feed-dependent |
| 程序化访问 | No price scraping performed; terms reviewed. |
| 研究许可 | WRITTEN_AGREEMENT_REQUIRED_FOR_ML |
| 公开衍生结果许可 | WRITTEN_AGREEMENT_REQUIRED |
| 历史发布版本已验证 | False |
| 适合训练 | Not admitted without express agreement. |
| 适合实时生产 | Not authorized for this product. |
| 本轮状态 | PAID_OR_LICENSE_BLOCKED |
| 事实与限制 | Terms updated 2026-08-27 prohibit direct or indirect ML / AI training / commercial product development without written agreement. History length and latest quotation are not assumed. |

出处：[来源 1](https://shipandbunker.com/terms)、[来源 2](https://shipandbunker.com/about/about-sb-prices)。

## Ship & Bunker Hong Kong MGO

| 字段 | 核验结果 |
| --- | --- |
| 地区 | Asia / Hong Kong |
| 商品定义及柴油/MGO/gasoil 匹配 | Marine gasoil indication |
| 单位 | USD/metric ton (catalog; payload not ingested) |
| spot / futures / proxy | spot indication |
| 频率 | daily |
| 历史起点 | UNKNOWN_NOT_OBTAINED |
| 最新日期/元数据日期 | UNKNOWN_NOT_OBTAINED |
| 免费与否 | Public display; licensed history |
| 是否登录 | Subscription-dependent |
| 是否 Key | Feed-dependent |
| 程序化访问 | No price scraping performed; terms reviewed. |
| 研究许可 | WRITTEN_AGREEMENT_REQUIRED_FOR_ML |
| 公开衍生结果许可 | WRITTEN_AGREEMENT_REQUIRED |
| 历史发布版本已验证 | False |
| 适合训练 | Not admitted without express agreement. |
| 适合实时生产 | Not authorized for this product. |
| 本轮状态 | PAID_OR_LICENSE_BLOCKED |
| 事实与限制 | Terms updated 2026-08-27 prohibit direct or indirect ML / AI training / commercial product development without written agreement. History length and latest quotation are not assumed. |

出处：[来源 1](https://shipandbunker.com/terms)、[来源 2](https://shipandbunker.com/about/about-sb-prices)。

## Ship & Bunker Kaohsiung MGO

| 字段 | 核验结果 |
| --- | --- |
| 地区 | Asia / Taiwan |
| 商品定义及柴油/MGO/gasoil 匹配 | Marine gasoil indication |
| 单位 | USD/metric ton (catalog; payload not ingested) |
| spot / futures / proxy | spot indication |
| 频率 | daily |
| 历史起点 | UNKNOWN_NOT_OBTAINED |
| 最新日期/元数据日期 | UNKNOWN_NOT_OBTAINED |
| 免费与否 | Public display; licensed history |
| 是否登录 | Subscription-dependent |
| 是否 Key | Feed-dependent |
| 程序化访问 | No price scraping performed; terms reviewed. |
| 研究许可 | WRITTEN_AGREEMENT_REQUIRED_FOR_ML |
| 公开衍生结果许可 | WRITTEN_AGREEMENT_REQUIRED |
| 历史发布版本已验证 | False |
| 适合训练 | Not admitted without express agreement. |
| 适合实时生产 | Not authorized for this product. |
| 本轮状态 | PAID_OR_LICENSE_BLOCKED |
| 事实与限制 | Terms updated 2026-08-27 prohibit direct or indirect ML / AI training / commercial product development without written agreement. History length and latest quotation are not assumed. |

出处：[来源 1](https://shipandbunker.com/terms)、[来源 2](https://shipandbunker.com/about/about-sb-prices)。

## Ship & Bunker APAC MGO average

| 字段 | 核验结果 |
| --- | --- |
| 地区 | Asia Pacific |
| 商品定义及柴油/MGO/gasoil 匹配 | Marine gasoil indication |
| 单位 | USD/metric ton (catalog; payload not ingested) |
| spot / futures / proxy | spot indication |
| 频率 | daily |
| 历史起点 | UNKNOWN_NOT_OBTAINED |
| 最新日期/元数据日期 | UNKNOWN_NOT_OBTAINED |
| 免费与否 | Public display; licensed history |
| 是否登录 | Subscription-dependent |
| 是否 Key | Feed-dependent |
| 程序化访问 | No price scraping performed; terms reviewed. |
| 研究许可 | WRITTEN_AGREEMENT_REQUIRED_FOR_ML |
| 公开衍生结果许可 | WRITTEN_AGREEMENT_REQUIRED |
| 历史发布版本已验证 | False |
| 适合训练 | Not admitted without express agreement. |
| 适合实时生产 | Not authorized for this product. |
| 本轮状态 | PAID_OR_LICENSE_BLOCKED |
| 事实与限制 | Terms updated 2026-08-27 prohibit direct or indirect ML / AI training / commercial product development without written agreement. History length and latest quotation are not assumed. |

出处：[来源 1](https://shipandbunker.com/terms)、[来源 2](https://shipandbunker.com/about/about-sb-prices)。

## Ship & Bunker Rotterdam MGO

| 字段 | 核验结果 |
| --- | --- |
| 地区 | Europe / Netherlands |
| 商品定义及柴油/MGO/gasoil 匹配 | Marine gasoil indication |
| 单位 | USD/metric ton (catalog; payload not ingested) |
| spot / futures / proxy | spot indication |
| 频率 | daily |
| 历史起点 | UNKNOWN_NOT_OBTAINED |
| 最新日期/元数据日期 | UNKNOWN_NOT_OBTAINED |
| 免费与否 | Public display; licensed history |
| 是否登录 | Subscription-dependent |
| 是否 Key | Feed-dependent |
| 程序化访问 | No price scraping performed; terms reviewed. |
| 研究许可 | WRITTEN_AGREEMENT_REQUIRED_FOR_ML |
| 公开衍生结果许可 | WRITTEN_AGREEMENT_REQUIRED |
| 历史发布版本已验证 | False |
| 适合训练 | Not admitted without express agreement. |
| 适合实时生产 | Not authorized for this product. |
| 本轮状态 | PAID_OR_LICENSE_BLOCKED |
| 事实与限制 | Terms updated 2026-08-27 prohibit direct or indirect ML / AI training / commercial product development without written agreement. History length and latest quotation are not assumed. |

出处：[来源 1](https://shipandbunker.com/terms)、[来源 2](https://shipandbunker.com/about/about-sb-prices)。

## Singapore Gasoil spot assessments

| 字段 | 核验结果 |
| --- | --- |
| 地区 | Asia / Singapore |
| 商品定义及柴油/MGO/gasoil 匹配 | 10 ppm / 50 ppm gasoil; specifications must not be spliced |
| 单位 | USD/bbl (assessment convention; no payload obtained) |
| spot / futures / proxy | spot assessment |
| 频率 | daily |
| 历史起点 | UNKNOWN_NOT_OBTAINED |
| 最新日期/元数据日期 | UNKNOWN_NOT_OBTAINED |
| 免费与否 | False |
| 是否登录 | True |
| 是否 Key | Feed-dependent |
| 程序化访问 | Argus / Platts licensed feeds; no unauthorized mirrors used. |
| 研究许可 | LICENSE_REQUIRED |
| 公开衍生结果许可 | LICENSE_REQUIRED |
| 历史发布版本已验证 | False |
| 适合训练 | No permitted raw assessment history obtained. |
| 适合实时生产 | Requires data entitlement; not a free production endpoint. |
| 本轮状态 | PAID_OR_LICENSE_BLOCKED |
| 事实与限制 | MBIE methodology confirms Singapore 50 ppm high-pour gasoil input. Its openly licensed finished importer-cost output is evaluated separately; the underlying Argus feed is not acquired or reconstructed. |

出处：[来源 1](https://aip.com.au/resources/facts-about-diesel-prices-and-the-australian-fuel-market/)、[来源 2](https://www.mbie.govt.nz/dmsdocument/30707-weekly-fuel-price-monitoring-methodology)、[来源 3](https://www.argusmedia.com/en/solutions/products/argus-oil-products)。

## CME Singapore Gasoil (Platts) Futures

| 字段 | 核验结果 |
| --- | --- |
| 地区 | Asia / Singapore |
| 商品定义及柴油/MGO/gasoil 匹配 | Singapore gasoil futures |
| 单位 | USD/bbl |
| spot / futures / proxy | futures |
| 频率 | daily |
| 历史起点 | UNKNOWN_NOT_OBTAINED |
| 最新日期/元数据日期 | UNKNOWN_NOT_OBTAINED |
| 免费与否 | False |
| 是否登录 | True |
| 是否 Key | Entitled feed |
| 程序化访问 | DataMine history requires account, order and license. |
| 研究许可 | LICENSE_REQUIRED |
| 公开衍生结果许可 | LICENSE_REQUIRED |
| 历史发布版本已验证 | False |
| 适合训练 | No licensed continuous contract or roll history obtained. |
| 适合实时生产 | Entitled data required. |
| 本轮状态 | PAID_OR_LICENSE_BLOCKED |
| 事实与限制 | Contract availability is not permission to train on exchange history. No account created, order or download made. |

出处：[来源 1](https://www.cmegroup.com/markets/energy/refined-products/singapore-gasoil-swap-futures.html)、[来源 2](https://www.cmegroup.com/datamine.html)。

## Argus Zhoushan Bunker Index marine diesel leg

| 字段 | 核验结果 |
| --- | --- |
| 地区 | Asia / China Zhoushan |
| 商品定义及柴油/MGO/gasoil 匹配 | 0.1% marine diesel / distillate, distinct from 0.5% residual VLSFO |
| 单位 | USD/metric ton (catalog; payload not verified) |
| spot / futures / proxy | spot assessment |
| 频率 | daily |
| 历史起点 | 2019-06-03 (index launch) |
| 最新日期/元数据日期 | UNKNOWN_NOT_OBTAINED |
| 免费与否 | False |
| 是否登录 | True |
| 是否 Key | Feed-dependent |
| 程序化访问 | Published in Argus Marine Fuels; no permitted free long history obtained. |
| 研究许可 | LICENSE_REQUIRED |
| 公开衍生结果许可 | LICENSE_REQUIRED |
| 历史发布版本已验证 | False |
| 适合训练 | Licensed history absent. |
| 适合实时生产 | Licensed feed required. |
| 本轮状态 | PAID_OR_LICENSE_BLOCKED |
| 事实与限制 | Official city report explicitly includes marine diesel. Do not substitute the commonly reported residual-fuel Zhoushan index or claim that all Zhoushan indices omit distillate. |

出处：[来源 1](https://www.zhoushan.gov.cn/art/2019/7/25/art_1229031580_23815.html)、[来源 2](https://www.argusmedia.com/en/solutions/products/argus-marine-fuels)。

## Taiwan CPC domestic sea-route light diesel posted prices

| 字段 | 核验结果 |
| --- | --- |
| 地区 | Asia / Taiwan |
| 商品定义及柴油/MGO/gasoil 匹配 | Marine light diesel posted price; not verified Kaohsiung MGO spot |
| 单位 | NTD/kilolitre |
| spot / futures / proxy | posted / policy-mediated |
| 频率 | weekly adjustment events |
| 历史起点 | UNKNOWN_NOT_OBTAINED |
| 最新日期/元数据日期 | 2026-09-21 (page) |
| 免费与否 | True |
| 是否登录 | False |
| 是否 Key | False |
| 程序化访问 | Public history selector; full history and specific redistribution permission not established. |
| 研究许可 | UNVERIFIED |
| 公开衍生结果许可 | UNVERIFIED |
| 历史发布版本已验证 | False |
| 适合训练 | Not admitted: definition, license, complete long history and publication timing unresolved. |
| 适合实时生产 | Posted local product, not global marine spot benchmark. |
| 本轮状态 | POSTED_PROXY_NOT_ADMITTED |
| 事实与限制 | Domestic marine posted prices are different from Argus/Ship & Bunker Kaohsiung delivered MGO assessments. No numeric history copied into training. |

出处：[来源 1](https://vipmbr.cpc.com.tw/mbwebs/showhistoryprice_d2.aspx)、[来源 2](https://vipmbr.cpc.com.tw/mbwebs/showhistoryprice_oil.aspx)、[来源 3](https://www.cpc.com.tw/cp.aspx?n=1340)。

## MBIE diesel importer-cost proxy (via Figure.NZ original file)

| 字段 | 核验结果 |
| --- | --- |
| 地区 | Singapore-linked / New Zealand import parity |
| 商品定义及柴油/MGO/gasoil 匹配 | Diesel importer cost: Singapore gasoil input plus quality, freight, insurance, wharfage and market adjustments |
| 单位 | NZD c/L; FX USD/NZD; derived USD/L |
| spot / futures / proxy | derived import-cost proxy, not MGO spot |
| 频率 | weekly |
| 历史起点 | 2004-04-23 |
| 最新日期/元数据日期 | 2026-09-18 |
| 免费与否 | True |
| 是否登录 | False |
| 是否 Key | False |
| 程序化访问 | MBIE direct page and CSV returned HTTP 403 here. Legitimate Figure.NZ open original-source download succeeded without login/key. |
| 研究许可 | ALLOWED_CC_BY_4_0_MBIE |
| 公开衍生结果许可 | ALLOWED_CC_BY_ATTRIBUTION_MBIE_FIGURE_NZ |
| 历史发布版本已验证 | False |
| 适合训练 | 1170 observations usable for retrospective analysis; no verified 5-year publication-vintage history for forecast training. |
| 适合实时生产 | Weekly lag and provisional/revised values require separate stale and revision handling. |
| 本轮状态 | RETROSPECTIVE_ONLY_PIT_UNVERIFIED |
| 事实与限制 | Actual downloaded source file has 35100 records. Figure.NZ table uses CC BY 3.0 NZ; MBIE original work uses CC BY 4.0. This is a lawful redistributed open dataset, not a workaround for a paid feed. September 23 revised costs from February 27, including dates marked Final; publication paused March 18-July 1. Latest-vintage Final does not mean known at observation time. |

出处：[来源 1](https://www.mbie.govt.nz/building-and-energy/energy-and-natural-resources/energy-statistics-and-modelling/energy-statistics/weekly-fuel-price-monitoring)、[来源 2](https://www.mbie.govt.nz/dmsdocument/30707-weekly-fuel-price-monitoring-methodology)、[来源 3](https://www.mbie.govt.nz/dmsdocument/139-weekely-fuel-price-monitoring-data-dictionary-pdf)、[来源 4](https://www.mbie.govt.nz/building-and-energy/energy-and-natural-resources/energy-statistics-and-modelling/energy-statistics/weekly-fuel-price-monitoring/impacts-of-the-2026-middle-east-conflict-on-weekly-fuel-monitoring)、[来源 5](https://figure.nz/table/sSjWVpSTr3cfhCMY)、[来源 6](https://figure.nz/table/sSjWVpSTr3cfhCMY/download-source-dataset)、[来源 7](https://figure.nz/get-involved/our-terms)。

## Australian Institute of Petroleum diesel terminal-gate prices

| 字段 | 核验结果 |
| --- | --- |
| 地区 | Asia Pacific / Australia |
| 商品定义及柴油/MGO/gasoil 匹配 | Daily wholesale diesel terminal-gate posted price, with local taxes and costs |
| 单位 | AUD cents/L including GST (page definition) |
| spot / futures / proxy | wholesale posted |
| 频率 | daily |
| 历史起点 | UNKNOWN_NOT_OBTAINED |
| 最新日期/元数据日期 | 2026-09-25 (file catalog) |
| 免费与否 | True |
| 是否登录 | False |
| 是否 Key | False |
| 程序化访问 | Public XLSX download offered; no explicit open license for bulk redistribution/derived ML product established. |
| 研究许可 | GENERAL_USE_NOTICE_NOT_SPECIFIC_ML_PERMISSION |
| 公开衍生结果许可 | UNVERIFIED |
| 历史发布版本已验证 | False |
| 适合训练 | Promising wholesale proxy; data license, older specification and PIT archive not cleared. |
| 适合实时生产 | No permission/reliability gate established. |
| 本轮状态 | LICENSE_UNCLEAR_NOT_ADMITTED |
| 事实与限制 | Not recorded as expressly forbidden or necessarily paid. Footer reserves rights, legal page offers general-use information but no explicit open dataset license. No price XLSX ingested. Singapore-linked wholesale transmission can lag by 1-2 weeks; it is not an independent MGO quote. |

出处：[来源 1](https://aip.com.au/pricing/terminal-gate-prices/)、[来源 2](https://aip.com.au/resources/historical-ulp-and-diesel-tgp-data/)、[来源 3](https://aip.com.au/about-aip/legal/)。

## European Commission Weekly Oil Bulletin

| 字段 | 核验结果 |
| --- | --- |
| 地区 | Europe / EU27 |
| 商品定义及柴油/MGO/gasoil 匹配 | Consumer automotive diesel prices with/without tax; distribution margins remain |
| 单位 | EUR/1000 L |
| spot / futures / proxy | retail / consumer |
| 频率 | weekly |
| 历史起点 | 2005 (download catalog) |
| 最新日期/元数据日期 | 2026-09-24 (bulletin) |
| 免费与否 | True |
| 是否登录 | False |
| 是否 Key | False |
| 程序化访问 | Official current/history XLSX offered; ordinary downloads. |
| 研究许可 | ALLOWED_CC_BY_4_0_EU_OWNED_CONTENT |
| 公开衍生结果许可 | ALLOWED_WITH_ATTRIBUTION_AND_THIRD_PARTY_EXCEPTIONS |
| 历史发布版本已验证 | False |
| 适合训练 | Not admitted as an international spot/gasoil/MGO leg under the frozen market definition. |
| 适合实时生产 | Weekly consumer reference, not market feed. |
| 本轮状态 | RETAIL_PROXY_NOT_ADMITTED |
| 事实与限制 | Removing tax does not remove distribution/retail effects. Country methodologies vary. Not rejected solely because it is weekly; no retail price relabeled as international marine benchmark. |

出处：[来源 1](https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en)、[来源 2](https://commission.europa.eu/legal-notice_en)。

## France DGEC international refined-product quotations

| 字段 | 核验结果 |
| --- | --- |
| 地区 | Europe / Rotterdam |
| 商品定义及柴油/MGO/gasoil 匹配 | Weekly gasoil quotation in government petroleum report |
| 单位 | USD/metric ton |
| spot / futures / proxy | spot quotation |
| 频率 | weekly |
| 历史起点 | UNKNOWN_NOT_OBTAINED |
| 最新日期/元数据日期 | 2026-09-18 (report) |
| 免费与否 | True |
| 是否登录 | False |
| 是否 Key | False |
| 程序化访问 | Public weekly PDF; no complete authorized machine-readable 5-year quotation history found. |
| 研究许可 | THIRD_PARTY_REUTERS_RIGHTS_UNCLEARED |
| 公开衍生结果许可 | THIRD_PARTY_RIGHTS_UNCLEARED |
| 历史发布版本已验证 | False |
| 适合训练 | Numeric charts/short tables cannot supply a verified long PIT training series. |
| 适合实时生产 | Not established. |
| 本轮状态 | LICENSE_AND_HISTORY_UNCLEARED |
| 事实与限制 | Quotation source is DGEC-REUTERS. Government retail database from 1985 is a different series. The petroleum PDF is examined as source metadata, not transcribed into training. |

出处：[来源 1](https://www.ecologie.gouv.fr/politiques-publiques/prix-produits-petroliers)、[来源 2](https://www.ecologie.gouv.fr/sites/default/files/documents/NPG-2026.09.18.pdf)。

## ÅSUB Rotterdam LSMGO monthly statistics

| 字段 | 核验结果 |
| --- | --- |
| 地区 | Europe / Rotterdam |
| 商品定义及柴油/MGO/gasoil 匹配 | Low-sulfur marine gasoil |
| 单位 | USD/ton |
| spot / futures / proxy | aggregated spot indication |
| 频率 | monthly |
| 历史起点 | 2014 (table title) |
| 最新日期/元数据日期 | 2025 (table title) |
| 免费与否 | True |
| 是否登录 | False |
| 是否 Key | False |
| 程序化访问 | Public PxWeb table; complete payload and underlying source rights not obtained. |
| 研究许可 | UNVERIFIED |
| 公开衍生结果许可 | UNVERIFIED |
| 历史发布版本已验证 | False |
| 适合训练 | Monthly sampling cannot resolve 7-calendar-day direction labels. |
| 适合实时生产 | Not 7-day frequency. |
| 本轮状态 | FREQUENCY_AND_LICENSE_NOT_ADMITTED |
| 事实与限制 | Metadata only; do not manufacture daily/weekly values by interpolation or long forward-fill. |

出处：[来源 1](https://pxweb.asub.ax/PXWeb/pxweb/en/Statistik/Statistik__TUTRSJ__SJ__Konjunkturstatistik%20f%C3%B6r%20sj%C3%B6farten/SJ101.px/)。

## Singapore MPA bunker sales by fuel

| 字段 | 核验结果 |
| --- | --- |
| 地区 | Asia / Singapore |
| 商品定义及柴油/MGO/gasoil 匹配 | Marine gasoil / marine diesel fuel sales volume |
| 单位 | Thousand tonnes, not price |
| spot / futures / proxy | volume statistics |
| 频率 | monthly |
| 历史起点 | 1995-01 |
| 最新日期/元数据日期 | UNKNOWN_NOT_OBTAINED |
| 免费与否 | True |
| 是否登录 | False |
| 是否 Key | False |
| 程序化访问 | Open data.gov.sg catalog. |
| 研究许可 | OPEN_DATA_LICENSE_SUBJECT_TO_DATASET |
| 公开衍生结果许可 | OPEN_DATA_LICENSE_SUBJECT_TO_DATASET |
| 历史发布版本已验证 | False |
| 适合训练 | Not a price benchmark. |
| 适合实时生产 | Volume context only. |
| 本轮状态 | NOT_PRICE_SERIES |
| 事实与限制 | Monthly bunker sales do not supply a diesel/MGO price target. No values ingested. |

出处：[来源 1](https://data.gov.sg/datasets/d_4f5abbf4486bf8e52bbed3be56dde562/view)。

## Hong Kong official motor-diesel import/retail comparison

| 字段 | 核验结果 |
| --- | --- |
| 地区 | Asia / Hong Kong |
| 商品定义及柴油/MGO/gasoil 匹配 | Motor-diesel import unit value and retail price; not delivered marine gasoil |
| 单位 | UNKNOWN_NOT_OBTAINED |
| spot / futures / proxy | import unit value / retail |
| 频率 | monthly |
| 历史起点 | 2019-05 (one announcement table) |
| 最新日期/元数据日期 | 2020-04 (one announcement table) |
| 免费与否 | True |
| 是否登录 | False |
| 是否 Key | False |
| 程序化访问 | Public government announcement; no ongoing 5-year daily MGO dataset established. |
| 研究许可 | UNVERIFIED_FOR_FULL_DATASET |
| 公开衍生结果许可 | UNVERIFIED_FOR_FULL_DATASET |
| 历史发布版本已验证 | False |
| 适合训练 | Short monthly motor-fuel comparison unsuitable for requested target. |
| 适合实时生产 | Not current high-frequency MGO feed. |
| 本轮状态 | PRODUCT_AND_FREQUENCY_NOT_ADMITTED |
| 事实与限制 | Official discussion of MOPS input is not permission or access to the underlying Platts feed. Announcement date 2020-05-06; exact payload unit is not asserted. |

出处：[来源 1](https://www.info.gov.hk/gia/general/202005/06/P2020050600328.htm)。

## 实际取得的数据与时间证据

- 两条美国 current CSV 各 5292 个工作日行；初次发布 ZIP 是本轮重新匿名下载，不使用 V2 标签。NYH 有 3881 个有效初值，USGC 有 3879 个有效初值；都从 2011-04-06 开始。
- NYH 隔离 1 个“发布日期早于观察日”记录；USGC 隔离 2 个记录，其中 2022-02-22 的初值为 0，未以最新修订价格补回。初值缺失 129 / 130 行也没有填充。
- MBIE original-source CSV 为 35100 行、7列；柴油进口成本 1170 周，2004-04-23–2026-09-18，Final 1158 / Provisional 12。完整响应与部分超时响应分别记录；未把半个文件当成功。
- 原站普通匿名访问返回 403；Figure.NZ 对该开放数据的原始文件镜像返回完整 200 CSV。使用的是已公开授权的独立再分发，不是绕过付费或授权阻断。[Figure.NZ 表格与出处](https://figure.nz/table/sSjWVpSTr3cfhCMY)记录本版本发布于 2026-09-23；原始数据许可来自 [MBIE](https://www.mbie.govt.nz/building-and-energy/energy-and-natural-resources/energy-statistics-and-modelling/energy-statistics/weekly-fuel-price-monitoring)。
- [MBIE 修订说明](https://www.mbie.govt.nz/building-and-energy/energy-and-natural-resources/energy-statistics-and-modelling/energy-statistics/weekly-fuel-price-monitoring/impacts-of-the-2026-middle-east-conflict-on-weekly-fuel-monitoring)明确：2026-03-18 暂停、07-01 恢复；09-23 回修 02-27 起的成本，柴油平均约增加 10 NZ cents/L。因此旧行的 Final 标志也不证明其数值在过去已公开。
- 原始 URL 的 Internet Archive CDX 月度查询（含/不含 CSV MIME 过滤）返回 200，但本次限定查询均无 capture records。官方历史版本搜索也未形成可审计的 ≥5 年周度 vintage 集合。这个结果只说明本轮未取得，不证明所有历史档案不存在。

## 准入解释

5年最低历史与至少 US + 非US 的数值标准未放松。数据“可用”还必须满足原要求第8、14、16节的可得时间约束。最新回修版本不能全部按旧观察日投入预测。两条 US 腿有 15年以上初次发布历史，非US proxy 的已验证过去可得时间为零年，故严格 Gate FAIL。

没有使用“通常下周三发布”生成 fictitious availableAt；本快照统一保留保守 vintageAvailableAt，历史 availableAt 仍为 null。回顾性共同波动可研究；正式 Target、模型和用户概率不可研究性替代通过。参见[数据审计 JSON](../data/source-audit.json)、[访问审计](../data/access-audit.json)及[数据许可出处](../data/README.md)。
