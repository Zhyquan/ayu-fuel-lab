# Ayu Fuel Lab · 渔船柴油参考价

独立公开测试 V0。界面提供 11 个沿海省级地区的 0# 柴油参考价，数据层保留大陆 31 个省级行政区。
无登录、无付费服务、无历史图表。V0.1 加入明确标为估算的吨价，以及可降级的真实原油趋势规则。

## 数据更新与部署

- 浏览器只读取本站静态 JSON，绝不直连数据提供方。
- GitHub Actions 使用 Node 22、免费标准 Ubuntu 运行器，匿名请求 APIZero。
- 北京时间 01:17、07:17、13:17、19:17 更新；UTC cron 为 `17 5,11,17,23 * * *`。
- 每轮 31 次串行请求，间隔至少 2 秒；每天计划 124 次，低于当前匿名 500 次/天、3 QPS 限制。手动运行也占用额度。
- 更新油价 → 更新原油数据 → TREND_DATA_GATE（可降级）→ 独立 PUBLIC_DATA_GATE → 静态 artifact → GitHub Pages。Gate 要求全部 31 省成功（包含 11 沿海地区）。任何价格失败都阻止部署，已有线上版本继续服务。趋势失败只显示暂不可用，不阻止通过价格 Gate 的版本。
- `workflow_dispatch` 默认正常更新；勾选 `simulate_failure` 会模拟 API 503，不发出真实请求，必须导致 Gate 失败和部署跳过。
- `generatedAt` 必须晚于工作流本轮开始时间；工作流在请求前删除旧缓存，缓存不提交到仓库。
- Artifact 保留 1 天，仅上传 `dist/`；原始响应留在运行器临时 `evidence/`，不发布。

## 本地运行

需要 Node 22+，无需安装第三方包。

```sh
npm test
npm run scan
export RUN_STARTED_AT="$(node -p 'new Date().toISOString()')"
npm run update
npm run gate
python3 -m http.server 4388 --bind 127.0.0.1 --directory dist
```

## 数据规则

- `scripts/apizero-adapter.mjs` 只映射省份、0# 柴油数值、元/升和来源日期。
- `scripts/public-data-gate.mjs` 使用严格字段白名单，拒绝预测、历史、调价日期和额外字段。价格防数量级错误范围为 0.1–100 元/升，不表示真实价格预测范围。
- “价格来源日期”保留来源的日期精度；“本站更新时间”展示成功生成缓存时间（北京时间）。
- 超过 24 小时未成功更新显示“数据更新可能延迟”；超过 72 小时显示“数据更新异常，请稍后查看”。来源日期较早本身不触发延迟。
- 禁止错误时填造价格；单省请求失败会保留失败原因，收集其他省份后整体停止部署。
- 页面含 `noindex,nofollow`；提供项目路径 `robots.txt`。项目 Pages 无法控制域名根目录 robots.txt，因此依靠页面 meta 阻止收录。它不是访问控制，公开链接可直接访问。

## 运行边界

GitHub 定时任务可能延迟；公开仓库长期无活动时 GitHub 可能暂停 schedule。关注 Actions 失败记录及页面更新时间。
APIZero 是第三方公开参考价，匿名配额和服务可用性可能变化。此版本没有长期可用性保证。

本页面展示省级公开参考价格，实际成交价格可能因地区、供应商及渠道不同而变化。

## 官方说明

- [APIZero 接口文档](https://apizero.cn/aidocs/oil-price/raw.md)
- [GitHub Pages 支持公开免费仓库](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- [GitHub Actions 标准公共运行器免费](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
- [GitHub Pages 自定义工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

源代码为本实验独立实现，未复制第三方开源抓取项目代码。数据归其原始提供方所有。

## V0.1 吨价与未来 7 天方向参考

- `dist/data/fuel-config.js` 集中设置参考密度 0.84 kg/L。
- `price-display.js` 使用 `round(元/升 × 1000 / 密度)`，保持原价格数据合同，显示“约”和“按参考密度估算”。例如 8.29 元/升换算为约 9,869 元/吨。
- `scripts/update-market-trend.mjs` 匿名下载 [FRED Brent + WTI CSV](https://fred.stlouisfed.org/graph/fredgraph.csv?id=DCOILBRENTEU,DCOILWTICO)，原始来源为 EIA，单位美元/桶。浏览器只读取静态 `trend-cache.json`。
- 两项原油共同最新观测日为基准，使用 1/3/7 个自然日之前最近有效观测；基准日期最多回退 4 天，绝不使用目标日之后的观测。
- 两项 7 日变化均 ≥ +2%，且两项 3 日变化均 > −1%：偏上涨。两项 7 日变化均 ≤ −2%，且两项 3 日变化均 < +1%：偏下跌。有效数据的其他组合：震荡。
- ±2% 来自一年样本绝对周变化下四分位数约 2% 的粗粒度选择；1% 反转门槛是方向门槛的一半。没有针对未来国内柴油结果拟合阈值。
- 原油观测超过 7 个自然日、缓存超过 24 小时、任一关键序列/日期/数值异常，均为 UNAVAILABLE。页面始终显示观测截至日期。
- `TREND_DATA_GATE` 重新计算百分比、标签和方向，拒绝篡改或无效值；这是观测变化百分比，不是上涨/下跌概率。
- APIZero 原始 forecast 缺少独立有效期、next_adjustment 已发现过期，因此两字段完全不进入本规则；第一版不加入汇率。
- 这是国际原油动量对国内柴油价格压力的简单参考，没有重建完整国内调价计价篮子、税费、汇率及 10 工作日窗口，不能承诺未来 7 天发生调价。
- [Brent 元数据](https://fred.stlouisfed.org/series/DCOILBRENTEU)和 [WTI 元数据](https://fred.stlouisfed.org/series/DCOILWTICO)标为 Public Domain: Citation Requested；保留 EIA/FRED 归属。数据可能修订。

```sh
npm run update:trend
npm run gate:trend
npm run sanity:trend
```

sanity 使用最近一年历史窗口排查明显方向错误，产出临时 evidence/trend-sanity.json。它不是预测回测，不输出准确率，不证明未来收益或预测能力。

工作流额外支持 `simulate_trend_failure`；此时油价仍真实请求，趋势写 UNAVAILABLE，价格 Gate 仍必须通过。feature 分支手动运行只验证，不上传 Pages artifact，也不部署。只有合并 main 才会进入原有发布链路。


## Trend freshness integration candidate

The freshness policy now requires the latest completed common EIA spot day.
`dist/data/trend-freshness.js` uses America/New_York at 18:00, weekends and a small
reviewed US/England holiday table (2025–2026). Unknown years fail closed and
require calendar review. This is a spot-observation calendar, not an exchange
futures calendar; emergency closures need review. No reporting-lag allowance
or fallback to an older direction is permitted. Browser reads revalidate dates
and refresh the optional trend cache once per minute to permit recovery.

`checkTrendFreshness()` returns LIVE / STALE / UNAVAILABLE plus both observation
dates, the expected completed date, check time and reason. Any failure creates
an UNAVAILABLE cache without direction. The mandatory price gate is unchanged.
The momentum thresholds and density remain unchanged. LIVE cache now includes
`marketData`, `method: MOMENTUM_BASELINE_V1`, and recomputed freshness evidence.

Current source research (2026-09-27): FRED and DataHub CSV observations end on
2026-09-22; EIA Daily Prices ends on 2026-09-24. Expected date: 2026-09-25.
Therefore this candidate intentionally displays unavailable trend and its
release freshness gate is FAIL. Yahoo futures were investigated but not adopted:
they differ from the EIA spot basis and reuse rights remain unconfirmed.
No fresh eligible source has been established; do not merge or deploy this
candidate as a completed freshness solution.

`node scripts/check-market-sources.mjs` is a read-only source availability audit
also run on candidate branches. It does not merge series or choose a fallback.
Raw research evidence stays outside public files. The branch workflow never
uploads a Pages artifact or deploys. DataHub dataset metadata update time must
not be confused with the CSV's last observation date.

## APIZero forecast spike (not approved)

The active page now reads only the independent forecast contract. The existing
momentum baseline and freshness code remain intact for research; no model fusion
or fallback to its old direction is performed. `activeForecastSource = NONE`.

Three anonymous calls succeeded with stable structure. However, the provider
returned Chinese `下跌` outside the requested direction allowlist, a negative
change per ton and positive change per liter, and no observation timestamps.
Close agreement with dated external quotes does not prove the provider date.
The source gate is FAIL and the page intentionally shows unavailable forecast.

- `scripts/apizero-forecast-adapter.mjs`: validate HTTP/business response, direction,
  signed values, reviewed independent date/value evidence; produce Ayu contract.
- `dist/data/forecast-contract.js`: public projection and cache validation.
- `scripts/update-apizero-forecast.mjs`: anonymous collector, immutable timestamped
  history, independent optional cache. It does not receive or send API keys.
- `scripts/forecast-data-gate.mjs`: clear unavailable/unapproved forecast safely.
- `data/forecast-history/`: raw evidence and source confidence, never Pages content.

The broad sanity limits (3000 yuan/ton, 3 yuan/liter, 1% market discrepancy) are
input-review limits, not expected moves or calibrated prediction accuracy. No
numeric confidence is generated. Provider `*_change` has undocumented units,
so normalized `changePct` stays null; reasons use controlled attribution text.
All adjustment dates currently remain null until official verification. Public
cache never includes provider analysis or confidence.

The candidate-only forecast workflow runs offline tests and safe gating. Since
the source gate failed, no live forecast updater or daily schedule is connected
to the existing Pages workflow. No merge/deployment is authorized. Do not switch
NONE to an enabled source without resolving source-date/basis and amount-sign
contracts, reviewing the date calendar for that market, and rerunning the gate.
