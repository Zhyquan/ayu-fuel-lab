# 自动 Forecast workflow

## 三条职责

| Workflow | 北京时间 / 触发 | 行为 |
| --- | --- | --- |
| intelligence-v2-evidence.yml | 02:30 / 07:30 / 13:30 / 18:30 | collect → Evidence Gate → debug artifact；contents: read，无模型、commit、部署 |
| intelligence-v2-official-daily.yml | 08:05；dispatch 默认 DRY_RUN | 独立新鲜采集 → Qwen → Forecast/Public Evidence Gate → history/cache/index → 回归/scan → 白名单 commit/push |
| update-and-deploy.yml | 原价格定时、push、dispatch；新增 trusted workflow_run | 原 31 省价格更新/Public Data Gate → Pages；Daily 触发先验证最新 Official 身份和时效 |

GitHub cron 使用 UTC；08:05 对应 5 0 * * *，不保证精确准点。

## Daily 顺序

main checkout 且不保留凭据 → Node 22 → 固定 checkout SHA → npm test → 同日索引预检 → 激活标记及 Key 存在检查 → 记录本次开始时间并清理旧 Gate/audit 输出 → 独立 collect → Evidence Gate → Qwen structured output → Forecast/Public Evidence Gate → immutable snapshot + atomic current/index → npm test → scan → 生成路径白名单/最新 main 校验 → commit → 普通 push。

不下载旧 Evidence artifact。fresh pack.generatedAt 必须不早于本次采集开始；两份 current Evidence 必须一致。模型步骤和最终 commit 步骤分别检查激活授权。缺 Key 或未激活会在采集及模型前明确停止；重复日期在模型前直接跳过。

Daily job 仅 contents: write；无 PAT、actions/administration/issues 等写权限。GITHUB_TOKEN 仅在最终提交步骤提供给受控 helper；checkout 不保存凭据。推送 token 的 HTTP header 仅存在于子进程环境，不写配置文件或日志。

## Pages 触发修正

GITHUB_TOKEN 推送不会触发另一个 push workflow，单靠附件原设想不能闭合链路。因此在本轮自动化代码授权范围内新增 workflow_run，沿用现有 Pages 构建/部署流程。

官方依据：[GITHUB_TOKEN 触发限制](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)、[workflow_run 事件和信任边界](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run)。

只接受指定 Daily workflow、同仓库 main、success conclusion。读取 main 源文件，不执行或下载触发 workflow 的 artifact。新索引 sourceCommit 必须匹配触发 run 的 head_sha；最新 commit 的 Official 身份、生成时间、audit、hash、cache 与全部 Gate 必须一致且仍新鲜。构建 checkout 后再校验一次，防止其间 main 变化。

DRY_RUN、当天重复、失败、过期、其他 source commit 或来源不可信时不触发 Daily 部署。普通价格定时/push/dispatch 保持可运行；build 对跳过的 Daily selection job 使用显式条件，避免误阻断原价格流程。

## 本轮验证边界

Node 22.23.3 实测模拟 Provider、ledger 和 delivery 判定；workflow YAML 已解析，流程合同测试通过。未执行远端 Actions、实际 collect/Qwen、main push 或 Pages 部署。GitHub token 写入能力、分支保护、账户配额及云端 E2E 留待授权后验证。
