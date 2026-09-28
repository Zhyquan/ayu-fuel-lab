# Intelligence V2 自动化架构

```text
公开市场 / EIA / OPEC / GDELT 与 RSS
    → 有限自动采集 + 原文核实 + 事件去重
    → Source / Freshness Gate
    → pending-intelligence-pack.json
    → Phase A: 当前 Codex / MANUAL_PROVIDER
    → Forecast Gate（含事实引用与包 hash）
    → exclusive immutable history
    → candidate forecast-cache.json
    → Candidate UI
```

## Phase A 当前完成的范围

`.github/workflows/intelligence-v2-evidence.yml` 配置北京时间 07:30 / 18:30。它只采集、执行 Evidence Gate 和上传待分析包，无写仓库权限、无付费 provider 调用、无 forecast 发布、无 Pages 部署。失败也保留诊断 artifact。新 workflow 位于 feature 分支，GitHub 定时 schedule 只对默认分支生效，因此**本轮尚未启用线上定时执行**。实际自动采集已在本地执行；workflow 定时调度未宣称已在 GitHub 运行。

手动阶段每日建议北京时间 08:00 执行一次分析，遇到重大事件允许手动再跑。分析输入冻结，理由最多 3/2；不会逐次索要 HUMAN 批准文件。系统保存每次通过预测门禁的快照，拒绝同名覆盖；Outcome T+7 单独保存。当前候选始终 24h 到期，页面读取时/每分钟/重新可见时复核。

价格链独立保持：31 省数据缓存 → 沿海 11 地区选择 → 已验收 0.84 kg/L 吨价估算。预测失败只影响预测缓存，不触碰价格。旧研究 V1–V5 和 V6 部分调查笔记保留冻结，候选页面及自动任务不读它们。候选价格 workflow 去除了无用途的旧 trend 更新步骤，原价格采集与价格门禁保留。

## Phase B 仅预留

获得明确付费模型授权后，替换 provider 的 generateForecast 实现即可沿用 Evidence Pack、Prompt Contract、Forecast Gate、History 和 UI 数据合同。提供商故障/重大来源冲突/证据不足/异常输出进入 UNAVAILABLE 或待核实，不跳过门禁。届时另行批准授权费用、自动写仓库与 Pages 发布，本轮均未执行。

## 运行方式

```sh
npm run intelligence:v2:collect
# 只在 READY 的包上按 ANALYSIS_PROTOCOL 生成 CURRENT_FORECAST_CANDIDATE_V2.json
npm run intelligence:v2:run
npm test
npm run scan
python3 -m http.server 4410 --bind 127.0.0.1 --directory dist
```

价格缓存沿用既有价格采集器，故仍是 ignored 的运行数据。本次候选预览只读公开网站已经验证的 31 省缓存。该价格缓存不会随新分支被替换或部署到公开站。

浏览器当前使用 V2 service/view/contract；退休的 V1 service 与量化文件仍在档案中。完整依赖图回归断言任何旧研究、旧情报 service、旧 trend/cache 均无法从候选 app.js 到达。单测保留旧合同回归，但不会启动研究训练或回测。
