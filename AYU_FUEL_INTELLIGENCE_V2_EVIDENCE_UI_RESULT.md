# AYU_FUEL_INTELLIGENCE_V2_EVIDENCE_UI_001

## 结果

2026-09-28 21:05 北京时间，对现有冻结输入进行只读复核：

| Gate | 结果 |
| --- | --- |
| INTELLIGENCE_V2_DATA_GATE | PASS |
| INTELLIGENCE_V2_FORECAST_GATE | PASS |
| INTELLIGENCE_V2_UI_GATE | PASS |
| PUBLIC_EVIDENCE_UI_GATE | PASS |

候选基线：`97d186ee9af1be3b6edeeb643715f5e923528953`。
新候选分支：`feature/intelligence-v2-evidence-ui`。
本地预览：[打开候选页面](http://127.0.0.1:4412/)。

Gate 为本次验收时的结果；页面继续按现有合同检查过期。
本轮没有重新采集新闻、调用数据接口或生成新的预测。
四张卡的来源点击测试仅验证既有原链接和返回行为，没有保存媒体正文。

## 用户看到的结构

1. 地区选择、吨价主显示和升价辅助显示。
2. 未来 7 天方向、AI 综合估计、下跌 / 基本不变 / 上涨百分比。
3. “为什么这么判断？”以及原始来源可核验提示。
4. 默认两张主要上行因素；“查看全部依据（4）”展开其余主方向与反向因素。
5. 原有数据时间、来源和参考说明。

本次仍为偏涨，DOWN 35% / FLAT 25% / UP 40%。卡片主体不跳转；来源链接单独打开新浏览上下文，保留原 URL，使用 `noopener noreferrer`。

## 实际预测引用与卡片

| 角色 | evidenceId | 自有短标题 | 标签 / 来源 | 日期 |
| --- | --- | --- | --- | --- |
| 默认主因素 1 | eia-stocks | 美国馏分油库存减少 | 利涨 / EIA | 9月23日发布；摘要注明统计周截至9月18日 |
| 默认主因素 2 | market-brent | Brent日度报价上涨 | 利涨 / EIA | 9月25日发布；摘要注明9月24日报价 |
| 展开主因素 3 | news-hormuz-40441609 | 霍尔木兹供应仍有不确定风险 | 上涨风险 / Reuters | 今天发布 |
| 展开反向因素 | market-diesel | 纽约港低硫柴油报价回落 | 利跌 / EIA | 9月25日发布；摘要注明9月24日报价 |

卡片 ID 全部来自 `mainReasons` / `counterReasons`，理由文本仍与 `displayText` 精确匹配。
没有额外展示 WTI、馏分油产量或炼厂加工量，也没有使用未被本次预测引用的事件。
报价来源前台简写 EIA，含义为 EIA 页面发布的 Refinitiv 现货观测；Reuters 链接为 Business Recorder 上的 Reuters 转载页。

时间栏选择发布日并明确写“发布”，摘要保留统计周或报价日，避免把观测日期当成当天行情。
`DATE_ONLY` 只显示日期，不展示其存储用时间锚点。霍尔木兹只描述报道中的风险，不改写成已发生的关闭。

## 主要组件与改动原因

| 文件 | 本轮职责 |
| --- | --- |
| [dist/data/public-evidence.js](dist/data/public-evidence.js) | `buildPublicEvidenceCards`、Public Evidence Gate、自有短摘要、日期格式和事件去重 |
| [dist/data/public-evidence-view.js](dist/data/public-evidence-view.js) | 两张默认卡、展开依据、明确方向标题、独立来源链接及不可用状态 |
| [dist/data/intelligence-v2-view.js](dist/data/intelligence-v2-view.js) | 移除原有理由列表，让新的证据区承担理由展示；方向和百分比计算保持不变 |
| [dist/app.js](dist/app.js) | 接入证据渲染；异常被限制在证据区，保留展开状态 |
| [dist/index.html](dist/index.html) / [dist/styles.css](dist/styles.css) | 增加极简文字卡片区和手机布局 |
| [tests/public-evidence.test.mjs](tests/public-evidence.test.mjs) | 18 项证据投影与异常测试 |
| [scripts/public-evidence-ui-gate.mjs](scripts/public-evidence-ui-gate.mjs) | 只读复核冻结输入和验收证明，输出四个 Gate |

页面只消费投影后的卡片字段。短标题不超过 24 个字符，摘要不超过 60 个字符；不截取媒体原文，不接受任意 `publicSummary` 直接进入页面。

## Gate 与异常处理

沿用现有 Forecast Gate，校验理由引用、HTTPS 来源、合法 impact、日期和新鲜度。
原有 `readForecast` 保持 SHA-256 校验；同步投影层不新增另一套 hash 或时间合同。
独立复核脚本同时计算规范化 Evidence hash 并对比候选与实际页面缓存。

Public Gate 再限定：只从理由引用生成、只使用经核验的短摘要映射、可追溯日期和来源、最多 5 张。
同一 `eventKey + impact` 只展示一张；同一报价快照内的 Brent 上涨和柴油回落方向相反，保留这条真实反向依据。

出现缺失引用、非法链接、无来源、日期不可解析、非法 impact、过期或无法生成安全摘要时，证据区不展示卡片。
现有 Forecast Gate 拒绝的预测也不会展示百分比；仅投影失败时，仍有效的趋势保持显示。价格与地区选择使用原有独立链路。

## 验证

- `npm test`：141 / 141 通过，其中新增 18 项。
- 引用不存在、理由新增包外事实、非法来源、缺失来源、日期错误、impact 非法、证据过期但仍标 LIVE、预测满 24 小时、未知摘要类型、长正文不进入页面、风险变事实、超量理由、嵌入包被替换、hash 篡改均验证拒绝。
- 验证少量依据不补卡、DOWN 标题、同一周报去重、相反报价保留、输入与概率不被修改、来源链接属性和失败时价格功能。
- 浏览器实际操作 320×740 与 390×844：无横向溢出；价格、方向、三个百分比和“为什么这么判断？”在首屏；默认两张、展开四张均正常。
- 实际点击四张卡的来源链接，确认进入原始 HTTPS 地址的新浏览上下文，返回后趋势和地区状态正常。
- 实际点击福建、浙江、山东、广东、辽宁、海南、江苏、河北、天津、上海、广西；只改变价格，趋势和国际依据完全相同。

| 手机尺寸 | 页面宽度 | 上涨百分比底部 | 为什么标题底部 |
| --- | --- | --- | --- |
| 320×740 | 320 | 570.5px | 691.9px |
| 390×844 | 390 | 576.2px | 676.8px |

证据文件：

- [四 Gate 结果](outputs/evidence-ui/PUBLIC_EVIDENCE_UI_GATE_RESULT.json)
- [公开卡片投影](outputs/evidence-ui/public-evidence-cards.json)
- [浏览器实际验收记录](outputs/evidence-ui/BROWSER_ACCEPTANCE.json)
- [冻结输入字节校验](outputs/evidence-ui/FROZEN_INPUT_READBACK.json)
- [390 手机首屏](outputs/evidence-ui/mobile-390-default.png)
- [390 展开全部](outputs/evidence-ui/mobile-390-expanded.png)
- [390 风险与反向因素](outputs/evidence-ui/mobile-390-counter.png)
- [320 手机首屏](outputs/evidence-ui/mobile-320-default.png)
- [320 展开全部](outputs/evidence-ui/mobile-320-expanded.png)

图片按实际手机视窗分别记录首屏、展开和反向因素；[截图尺寸记录](outputs/evidence-ui/SCREENSHOT_CAPTURE.json)保留各视窗尺寸。

## 保留边界与后续限制

Evidence、Forecast candidate、实际 forecast cache、价格 cache 均与基线逐字节一致。规范化 Evidence hash 仍为 `66453209e4ab96362b77d9846d91b7cf9dd287adf3a63ef7d7af4013d904e135`。
31 省价格数据层、11 地区选择、0.84 kg/L 吨价换算、预测历史、采集系统和现有时间合同没有改动。

当前自有摘要映射覆盖这四种已验收依据。以后出现新的理由类型或不兼容事实，需要审核对应的短文案映射；此前证据区显示不可用，不自动编造摘要。
此限制只影响解释卡片，不改变有效预测或价格。

本次预测有效期截至 2026-09-29 19:17:34 北京时间；Evidence 自身满 24 小时或其他既有新鲜度条件不再满足时，会更早停止展示。本轮未刷新其时间。
本轮为独立候选 UI：没有合并 main、没有正式部署、没有更改已发布 Sites。
完成后等待产品 UI 验收。
