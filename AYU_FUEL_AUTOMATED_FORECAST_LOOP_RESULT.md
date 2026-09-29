# AYU_FUEL_AUTOMATED_FORECAST_LOOP_001

## 结论

AUTOMATED_FORECAST_LOOP_GATE = PASS

QWEN_IMPLEMENTATION_GATE = PASS

QWEN_API_ACTIVATION_GATE = NEEDS_USER_AUTHORIZATION

这里的 PASS 是自动化开发候选及模拟验收通过，不是已启用真实每日服务。当前公开 main 保持 d70bae003e990054f829cdd6264556c5c1377a47；候选位于 feature/automated-forecast-loop-qwen，提交 SHA 以最终 remote-backed 回报为准。

## 里程碑

| 阶段 | 结果 |
| --- | --- |
| M1 | 远端 main 精确匹配；复用原 Collector / MANUAL Provider / V2 Gate / history / Pages |
| M2 | QWEN + qwen3.8-flash、版本化 Prompt、strict schema 与可信 Candidate 构造 |
| M3 | fake HTTP → Forecast / Public Evidence Gate E2E PASS |
| M4 | 同日唯一、并发保护、次日新样本、不可覆盖历史、原子缓存 PASS |
| M5 | daily/evidence-only workflow 与 trusted workflow_run Pages 链合同完成 |
| M6 | Node 22.23.3：189 / 189 测试 PASS；public scan、YAML 解析、diff whitespace 检查 PASS |
| M7 | 本地 Key 和 GitHub 同名 Secret 均不存在；停在真实 API 激活边界 |

## Gate

| Gate | 结果 | 证据 |
| --- | --- | --- |
| QWEN_PROVIDER_CONTRACT_GATE | PASS | 官方结构化/非思考文档、固定北京配置、fake HTTP 请求合同 |
| QWEN_STRUCTURED_OUTPUT_GATE | PASS | ID/schema/概率步长及总和、全量 assessment、额外字段拒绝 |
| QWEN_GROUNDING_GATE | PASS | 理由及 impact/kind/日期/hash/方向只由可信代码构造，冻结 pack |
| QWEN_SECRET_SAFETY_GATE | PASS | 元数据白名单、缺 Key/授权零请求、public scan 无发现 |
| OFFICIAL_DAILY_IDEMPOTENCY_GATE | PASS | 同日零重复调用、次日可新增、并发锁、北京时间跨日拒绝 |
| AUTOMATED_FORECAST_HISTORY_GATE | PASS | exclusive snapshot、hash/index、旧 MANUAL 保留、原子替换与失败保护 |
| AUTOMATED_FORECAST_WORKFLOW_GATE | PASS | YAML 解析及受控流程、路径白名单、main 竞争拒绝、trusted Pages 判定 |
| AUTOMATED_FORECAST_REGRESSION_GATE | PASS | 全部 189 测试，包括既有 31 省、11 沿海、0.84、UI/卡片/时效/价格 Gate |
| AUTOMATED_FORECAST_LOOP_GATE | PASS | 以上开发候选 Gate 全 PASS；远端执行不在本轮范围 |

## 精确修改文件：26

### Workflow / runtime

1. .github/workflows/intelligence-v2-evidence.yml
2. .github/workflows/intelligence-v2-official-daily.yml
3. .github/workflows/update-and-deploy.yml
4. package.json
5. scripts/intelligence-v2/provider.mjs
6. scripts/intelligence-v2/qwen-provider.mjs
7. scripts/intelligence-v2/prompts/qwen-forecast-v1.mjs
8. scripts/intelligence-v2/run.mjs
9. scripts/intelligence-v2/official-daily.mjs
10. scripts/intelligence-v2/commit-official-daily.mjs
11. scripts/intelligence-v2/pages-delivery-ready.mjs
12. dist/data/intelligence-v2-contract.js
13. dist/data/public-evidence.js
14. data/forecast-history-v2/official-daily-index.json

### Tests

15. tests/intelligence-v2.test.mjs
16. tests/public-evidence.test.mjs
17. tests/qwen-provider.test.mjs
18. tests/official-daily.test.mjs
19. tests/automated-forecast-workflow.test.mjs
20. tests/fixtures/qwen-fixture.mjs

### 本轮六份合同 / 报告

21. AYU_FUEL_AUTOMATED_FORECAST_LOOP_RESULT.md
22. QWEN_PROVIDER_CONTRACT.md
23. QWEN_FORECAST_SCHEMA.json
24. OFFICIAL_DAILY_POLICY.md
25. AUTOMATED_FORECAST_WORKFLOW.md
26. QWEN_SECRET_AND_COST_SAFETY.md

现有测试改为读取 immutable MANUAL golden snapshot，避免每天更新 current 后测试误依赖旧手写概率。新增三个安全反向短摘要是每日不同方向下兼容卡片所需；页面 HTML、CSS、价格链及当前 Evidence/Forecast 内容没有改动。Collector 与 history 原实现保持沿用。

## 验证及剩余风险

执行完整 node --test tests/*.test.mjs（Node 22.23.3）：189 PASS、0 FAIL、0 skipped；首次本地 Node 25 回归也通过。public scan 未发现敏感项；三个 workflow YAML 解析成功。mock 端到端保留旧 cache、重复运行零请求、本地 bare Git 实测普通 push 拒绝竞争提交。

尚未验证真实 Qwen schema 接受/配额/费用、GitHub 实际 scheduled run、GITHUB_TOKEN 的 main 分支保护权限及云端 Pages E2E。qwen3.8-flash 是 canonical ID，不是权重快照。当前 Collector 的新闻准入较窄，可能无法每天取得合格多来源证据；Evidence FAIL 时按合同停更。既有市场时效日历只覆盖 2026，未来年份 fail closed；本轮未扩展数据源/日历。

传输重试最多三个 HTTP attempts，但供应商可能对超时或失败请求计费；不可把一次 accepted Official 误当作一次账单调用。磁盘异常可留下未提交孤立 history，失败 runner 不发布；Git commit 是对外发布边界。

## 停止点

real Qwen calls = 0

real model cost = 0

deployments = 0

main changes = 0

候选可审查；未 merge、未执行远端 workflow、未激活 API。下一步首次真实调用会产生潜在费用，必须另获用户明确授权。STOP。
