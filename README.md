# Ayu Fuel Lab · 渔船柴油参考价

独立公开测试 V0。界面提供 11 个沿海省级地区的 0# 柴油参考价，数据层保留大陆 31 个省级行政区。
无登录、无付费服务、无预测或历史图表。

## 数据更新与部署

- 浏览器只读取本站静态 JSON，绝不直连数据提供方。
- GitHub Actions 使用 Node 22、免费标准 Ubuntu 运行器，匿名请求 APIZero。
- 北京时间 01:17、07:17、13:17、19:17 更新；UTC cron 为 `17 5,11,17,23 * * *`。
- 每轮 31 次串行请求，间隔至少 2 秒；每天计划 124 次，低于当前匿名 500 次/天、3 QPS 限制。手动运行也占用额度。
- 更新 → 独立 PUBLIC_DATA_GATE → 静态 artifact → GitHub Pages。Gate 要求全部 31 省成功（包含 11 沿海地区）。任何失败都阻止部署，已有线上版本继续服务。
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
