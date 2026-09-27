# Dataset report

固定数据批次：2026-09-27。原始下载、URL、SHA256、POST公开表单参数保存在 `data/research/raw/` 及 input-manifest.json。原始响应保留，不能静默修补。

| 市场 | ALFRED series | 有效非空初值数 | 最早观测 | 最晚观测 | 最后首次发布日期 |
|---|---|---|---|---|---|
| brent | DCOILBRENTEU | 3522 | 2012-12-03 | 2026-09-22 | 2026-09-23 |
| wti | DCOILWTICO | 3459 | 2012-12-03 | 2026-09-22 | 2026-09-23 |
| usdCny | DEXCHUS | 3125 | 2014-03-17 | 2026-09-18 | 2026-09-21 |

## 时间范围与标签

- 官方常规决策：336轮，2013-04-10—2026-09-24，{'FLAT': 75, 'DOWN': 119, 'UP': 142}。
- 特殊VAT调整：2条，单列；政策说明不作调价标签。消费税与常规周期同期时保留最终执行值并标注taxChangeIncluded。
- 可标记Target B日期：4562，2014-03-18—2026-09-12。
- 完整可用快照：**4460**，2014-04-09—2026-09-12；**308**个官方周期。
- PRIMARY标签：DOWN=1366，FLAT=1540，UP=1554。
- OOS：**2768**个快照 / **191**周期，2018-12-29—2026-09-12。
- 快照排除：{'FEATURE_MISSING_OR_OVER_14_DAYS_OLD': 73, 'OFFICIAL_GAP_OVER_25_DAYS': 29}。

## 必须保留的缺口

ALFRED的DEXCHUS公开vintage档案从2014-03-18开始，初值观测从2014-03-17开始。没有把今天下载的2013年汇率最终值当作2013年可用值，因此完整特征范围从2014年开始；设计期名义为2013—2016，实际只有可核验的1020个标签参与阈值估计。

官方归档在2015-12-15到2016-01-13间存在29日缺口，未自行填入一条零调整：该区间29天快照整体排除。其他周期最大间隔≤25日。常规公告未解析/冲突数=0。这不等于证明官方历史档案绝对完整。

`quarantined-source-records.json`保留首次发布日期早于观测日的异常：2条。空值直接缺失；未前向填造价格、未把缺值当FLAT。负WTI保留，使用asinh特征。

## TARGET比较（不混用）

| 项目 | A：官方下一轮柴油调价 | B：固定7日成本压力 |
|---|---|---|
| 样本 | 336个独立历史决策 | 4460日快照，但仅308组，不能当独立同分布样本 |
| 标签 | {'FLAT': 75, 'DOWN': 119, 'UP': 142} | {'UP': 1554, 'FLAT': 1540, 'DOWN': 1366} |
| 解释 | 贴近国内最终每吨调价，提前量可变 | Brent×USD/CNY未来7自然日变化，±2% FLAT |
| 长期可得性 | 2013年以来有官方公告，部分历史窗口缺失 | 原油从2013前覆盖；汇率初始版本2014起 |
| 国内相关性 | Ground truth | 见下面独立关联，不能声称最终国内价格概率 |

OOS每周期取T-7一条（N=187）：代理7日回报与官方实际柴油变化Pearson相关系数=0.2624；两者三类标签一致率=36.36%。这是事后Ground Truth关联，不是模型预测准确率；相关性不等于可预测性或因果关系。

## 来源与日期语义

- [ALFRED下载说明](https://alfred.stlouisfed.org/help/downloaddata)：Initial Release Only及realtime_start_date。采用初值和整个美国中部发布日期结束后的保守availableAt。
- [Brent](https://alfred.stlouisfed.org/series?seid=DCOILBRENTEU)、[WTI](https://alfred.stlouisfed.org/series?seid=DCOILWTICO)：EIA现货，经ALFRED提供版本。
- [USD/CNY](https://fred.stlouisfed.org/series/DEXCHUS)：美联储H.10，人民币/美元，不能把汇率方向反过来。
- [发改委历史专题](https://www.ndrc.gov.cn/xwdt/ztzl/gncpyjg/)及[新闻发布](https://www.ndrc.gov.cn/xwdt/xwfb/)：每条结果附原始公告URL。
- [2013机制通知](https://www.ndrc.gov.cn/xxgk/zcfb/tz/201303/t20130326_964571_ext.html)：10工作日及50元机制门槛；本轮实际标签另识别政策干预后的执行幅度。

原始HTML/ZIP仅作为本地和仓库研究复核材料；没有公开Pages部署或API服务。
