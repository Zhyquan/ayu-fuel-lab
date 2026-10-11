# FUEL REFLIGHT PHASE 3

日期：2026-10-11。结论：**FUEL_REFLIGHT_BLOCKED_V3**。

本地诊断、主因选择提示和理由长度提示已完成。真实国内 Forecast 尚未 accepted；严格按 1 → 2 → 3 的顺序，未进入自动 Test 交付，也未进入 Bridge → card 验收。没有形成 DOMESTIC_FORECAST_ACCEPTED_BASELINE。

## 1. 冻结身份

| 项目 | SHA / 状态 |
| --- | --- |
| Phase 2 Core 基线 | `04034b770f8850c6337f3750e0d61cbd261a4921` |
| 最新回读 origin/main | `395cb24b6345eb70741e299699fa78d3f9baa640`；本轮未集成 |
| Core 分支 | `feature/fuel-reflight-core-20261011` |
| 最终已测试 Core 代码 | `ac59149734b5b69413dfbe25f69f4f25e99ff017` |
| Consumer 分支 | `feature/fuel-reflight-consumer-20261011` |
| 最终 Consumer | `1d9857b3a9c590db50c4c91b038c82c7a0fbb1dc`；本轮未改 |

本报告与四份脱敏记录以随后独立的 docs-only checkpoint 冻结；交付消息给出包含报告的最终 Core HEAD。该 checkpoint 不改变上表已测试代码。

## 2. 主因拒绝已取得可定位证据

Phase 2 三次 HTTP 200 失败只保存了 hash、用量和 `DOMESTIC_PRIMARY_EVIDENCE_INVALID`。它们没有原始 selected IDs，**历史精确 subtype 仍为 UNKNOWN**，不反向推断。

Phase 3 第一次诊断调用：

| 字段 | 实际审计 |
| --- | --- |
| request / attempt ID | `fuel-reflight-phase3-695374e1-2377-4017-bdee-a9f390ddeb08` |
| provider response ID | `chatcmpl-757f2af7-682d-92e2-ba6e-c23d7546ffb1` |
| 输入性质 | SYNTHETIC_SEMANTIC_TEST；真实 Qwen、构造输入、未发布 |
| allowed IDs | `["synthetic-domestic-pricing"]` |
| selected IDs | `["synthetic-domestic-pricing", "synthetic-domestic-pricing"]` |
| 精确 subtype | `PRIMARY_EVIDENCE_DUPLICATE_ID` |
| invariant | `UNIQUE_PRIMARY_IDS` |
| field / index | `primaryEvidenceIds` / `1` |
| outputHash | `411176f42986548d7d4cf203051c7b237fb8d0d834f3da52c29350b5938d6872` |

**该新调用的 first bad layer 是模型输出中的主因选择。** Parser 只解析 JSON，没有把一个 ID 映射成两个。现有 schema 限制可选 ID，但不表达唯一性；原提示说明 1–3 条，没有明确唯一性及不必凑满。审计确认输出重复，不能据此证明模型内部为何重复。

最小补丁：继续使用现有动态 enum，明确列出 accepted direct IDs、最多 `min(3, allowedCount)`、至少一个、必须唯一、只有一个候选时只选一个。没有新增 ID 系统，没有静默去重、补值或放宽 validator。

安全审计现在保存 request/response/candidate 身份、evidenceRevision、实际 selected IDs、输出结构、exact subtype/invariant/field/index、outputHash。候选审计 ID 明确为 AUDIT_ONLY_NOT_FORECAST_ID；不是 accepted Forecast ID。敏感或畸形身份会脱敏，失败原始全文不保存到公开文件。

## 3. 真实来源与第一次当前资料调用

当前资料已分别验证来源字节、正文定位、发布日期精度、组合 receipt 与模型输入 hash。来源核验通过不等于 Forecast accepted。

| 来源 | 用途及事实边界 |
| --- | --- |
| [发改委 2016 通知及现行附件](https://www.ndrc.gov.cn/xxgk/zcfb/tz/201601/t20160113_963566_ext.html) | 使用完整 2016 规章 PDF 第 6、7、22 条；未把 2013 试行文件当现行依据 |
| [发改委 9 月 24 日公告](https://www.ndrc.gov.cn/xwdt/xwfb/202609/t20260924_1407824.html) | 当前执行期从 9 月 24 日 24:00 开始；临时调控已应用于这一期，下一窗口是否延续仍 UNKNOWN |
| [中石化调价日历](https://cx.sinopecsales.com/yjkqiantai/core/toCalendar)及实际 202610 图片 | 可核验 10 月 15 日 / 29 日；图片发布日期 UNKNOWN，未将 Last-Modified 当发布日期 |
| [隆众 10 月 10 日公开原始材料](https://www.oilchem.net/26-1010-08-5212c0fd09f45f70.html) | 原站 08:31 发布，分钟精度；截至 10 月 9 日，第 6 工作日、变化率 -6.18%、预计下调 290 元/吨；为机构估计，非官方最终调幅 |
| 当天采集的已有 EIA / FRED 数据 | 保留原观测期和发布日期：行情观测为 10 月 8 日、10 月 9 日发布；基本面统计周为 10 月 2 日、10 月 7 日发布。保留 6 条信号，全部 INPUT_ONLY，不直接升级为国内结论 |

六份国内来源响应均为 HTTP 200，实际 body hash/bytes 和接收时间见 [source-provenance.safe.json](reflight-phase3/source-provenance.safe.json)。组合 policy/window hash 明确是 CANONICAL_MANIFEST_SHA256_NOT_SINGLE_SOURCE_BYTES，具有逐字段来源绑定。

资料版本为 v2：仅把三项组合 receipt 的 checkedAt 校正为实际完整核验时间 `2026-10-11T04:45:30.664Z`。来源原始获取时间、价格日期、发布日期及窗口没有被改写。v1 留存，未用于该模型请求。

| 当前真实输入 | 值 |
| --- | --- |
| evidenceRevision | `2a0877d029865565e81474bdbd596774ce59abf4ebf1a2b05a575ea76d0b8489` |
| 实际请求 body hash | `904efb59132de25ee31737e30617f41c539cb32a6a7011f9f6eb154dc2eed919` |
| 输入 body bytes | `15403` |
| horizon | 10 月 11 日 04:45:30.664Z → 10 月 18 日同一时刻 |
| 下次有效窗口 | 10 月 15 日 24:00 北京时间，位于该 7 天区间内，不能仅凭日历输出 HOLD |
| 唯一 accepted direct primary ID | `lz-current-window-estimate-20261009` |
| 未取得角色 | FX_INPUT、GEOPOLITICAL_INPUT、RELATED_LOW_IMPACT，如实记缺失 |

已有两份新闻材料继续作为 UNASSESSED_NEWS_INPUT，来源可靠不自动等于 LOW、NEUTRAL 或国内主因。没有修改 accepted news/display 合同。

第 5 次、也是本轮唯一使用当前真实国内资料的模型调用：

| 字段 | 实际结果 |
| --- | --- |
| request / attempt ID | `fuel-reflight-phase3-c154057e-4960-4380-84e2-b07d1b86251c` |
| response ID | `chatcmpl-069f2f14-597e-9b0a-b3e6-e4fac2057df8` |
| 代码 SHA | `57adb93bde418ef5c1e493d6e9442b8d42648e68` |
| provider/model/HTTP | QWEN / qwen3.8-flash / 200 |
| attempt / retry | 1 / 0 |
| tokens / latency | input 4547，output 245，5749 ms |
| selected primary ID | `lz-current-window-estimate-20261009`，一项且唯一 |
| 拒绝字段 | `reason`，实际 202 个 Unicode 字符 |
| precise code / invariant | `DOMESTIC_REASON_TEXT_INVALID` / `PLAIN_NONEMPTY_REASON_MAX_180` |
| legacy code | `DOMESTIC_REASON_INVALID` |
| outputHash | `2442d58ded91c764170a55637ea32dc34bbc6eb2182b639319fb6c0387de4920` |
| accepted Forecast ID | 无 |

执行顺序证明 target/horizon、整数概率、sum、主因存在/accepted/方向/唯一性、confidence 检查已经通过；随后在 202 > 180 处拒绝。**理由语言与数字 grounding 的后续检查没有执行，仍 UNKNOWN。** 原始 reason 未留存，不伪造或重建它。审计中的 5 / 60 / 35 仅是被拒绝响应的结构，未作为产品预测发布。

**当前 first bad layer 是模型 reason 超出现有 180 字符合同。** 原提示只说“简短中文”，未写明确上限。`ac591497...` 仅补非空、不换行、纯文本、最多 180 Unicode 字符及简短概括提示。原 validator 的 180 字符上限不变，schema 未改（reason 仍只声明 string 类型），无截断、自动改写、补概率或真实重试。新提示尚未真实复验。

## 4. Responsiveness 与本地回放

以下三态使用构造 domestic evidence 与真实 Qwen，仅证明受控输入响应，不替代当前真实资料的 accepted baseline，不证明预测准确率。

| Case | 模型结果 UP / DOWN / HOLD | 结论 |
| --- | --- | --- |
| CASE_UP | 85% / 0% / 15%，方向 UP | Forecast/Audit Gate PASS；未发布 |
| CASE_DOWN | 5% / 90% / 5%，方向 DOWN | Forecast/Audit Gate PASS；未发布 |
| CASE_HOLD | 0% / 0% / 100%，方向 HOLD | Forecast/Audit Gate PASS；未发布 |
| CASE_INTERNATIONAL_ONLY | 无 Forecast；输入 Gate FAIL | 模型请求 0，国际资料不能单独替代国内直接依据 |

三份构造 Forecast 的完整 ID/revision/time 见 [semantic-cases.safe.json](reflight-phase3/semantic-cases.safe.json)。改变国内直接证据后结果确实有意义地改变；没有人为改模型概率。

理由长度回放使用与实际 202 字符拒绝相同形状的**构造反例**，不是拿到了原始模型回答：

- before：2 PASS / 1 FAIL，失败断言为生产 prompt 未明确 180 字符上限；202 字符本来就被 validator 拒绝。
- after：3 / 3 PASS；202 字符仍拒绝，合法简短理由完整保留并通过。
- 179 个汉字 + 1 个 astral Unicode 字符按 180 字符通过；181 字符拒绝，无静默截断。
- 空串、控制字符/换行、markup、非字符串仍拒绝。
- Core 全量 **608 / 608 PASS**，0 FAIL、0 SKIP；实际运行 Node **v25.9.0**，没有声称已在 Node 22 或云端运行。
- Consumer **136 / 136 PASS** 为冻结 Phase 2 证明，本轮代码无 diff，没有把旧证明标成新的云端或手机验收。
- 独立 reviewer 对最终代码聚焦回归 **40 / 40 PASS**，裁决：本地补丁准入 PASS，整体 V3 BLOCKED。
- 补丁代码完成后的扫描 1383 文件 PASS；加入本报告及四份脱敏记录后，最终扫描 **1388 文件 PASS，findings=[]**。

日志 hash、合同 hash、回放结果及旧 Test 快照见 [verification.safe.json](reflight-phase3/verification.safe.json)。

## 5. Delivery 未越过前置

Core 现有行情/Evidence generatedAt 为 `2026-10-11T01:55:04.832Z`；现有 main 的 international Forecast generatedAt 为 `2026-10-11T01:55:26.439Z`，target 为空，不能把它算成国内 accepted Forecast。

最后已有 Test 只读快照采样于 `2026-10-11T03:01:04.436Z`：Forecast generatedAt 为 `2026-10-09T02:59:23.116Z`，validUntil 为 10 月 10 日同一时刻，target 为空；sourceCommit 为 `59c30087207954db347ee1a05e2f5a2d0b380643`。这是先前管理只读快照，**不是本轮新交付、受保护真实用户读取或手机证明**。未重新确认其后的 Test 状态。

因为真实 accepted domestic Forecast 尚未形成：

| 环节 | Phase 3 结果 |
| --- | --- |
| T0 accepted domestic Forecast | FAIL / 未形成 |
| T1 publisher trigger → T2 Test write | NOT_RUN_PREREQUISITE_NOT_MET |
| T3 protected read → T4 same Consumer | NOT_RUN_PREREQUISITE_NOT_MET |
| Core → Test latency | N/A，不能报延迟改善 |
| Bridge → accepted card → protected read | NOT_RUN_PREREQUISITE_NOT_MET |
| 新 Test 版 / 手机体验验收 | NOT_RUN |

不声称已关闭 Core → Test 日期落差。Phase 2 LKG continuity、过期边界、LOW news/display、国内 public 合同和 Consumer 本地证明继续冻结；本轮对应路径没有修改，真实自动替换连续性未验证。

## 6. 最小文件范围与权限账本

Phase 2 → Phase 3 业务代码仅四个路径：

1. `scripts/intelligence-v2/domestic-fuel.mjs`：分解已有拒绝条件的安全 subtype/invariant，传递 attempt ID，明确既有唯一主因选择要求；接受条件不放宽。
2. `scripts/intelligence-v2/qwen-provider.mjs`：domestic 专用结构化脱敏审计；不保存失败模型全文、不改旧目标推理逻辑或 retry 配置。
3. `scripts/intelligence-v2/prompts/qwen-domestic-fuel-v1.mjs`：明确现有 reason 的 180 字符纯文本要求。
4. `tests/domestic-qwen-diagnostics.test.mjs`：诊断、安全脱敏、提示合同和边界回放。

另新增本报告及四份 `docs/reflight-phase3/*.safe.json`，全部接受公共扫描。没有把诊断放进扫描器忽略目录。

| 账本 | 数量 / 状态 |
| --- | --- |
| 本轮真实 Qwen Test 请求 | **5**：1 次重复 ID 失败、3 次构造语义通过未发布、1 次真实资料理由过长失败 |
| 重试 / 长度提示补丁后真实请求 | **0 / 0** |
| 本轮 input / output tokens | 16971 / 959；实际扣费 UNKNOWN |
| 本轮执行器调用上限 | 5，已用完；不自动扩大 |
| Official dispatch / reservation 修改 | 0 / 0 |
| 10 月 11 日 reservation | `qwen-inference-reserved-2026-10-11`，artifact 11688567102，原 run 38103404963；只读确认仍存在 |
| feature push / merge / Stable Integration / CTO 接入 | 0 / 0 / 0 / 0 |
| Test 写入 / Test 部署 / Client 上传 | 0 / 0 / 0 |
| Production 写入 / 部署 | 0 / 0 |
| Payment / Release / Client 修改 | 0 / 0 / 0 |

## 7. 剩余 blocker 与停止点

**唯一当前执行阻断：真实资料国内 Forecast 尚未 accepted。** 已确认 reason 202 > 180；长度提示的最小补丁和本地回放通过，但没有补丁后的真实接受证明。本轮停模型调用，不把失败输出改写成可发布产物。

自动 Core → Test 与 Bridge → card 仍是后续未完成验收，受同一前置阻断；没有新造第二个根因。下一步必须先在冻结代码、合格真实资料及既有费用/预约保护下取得真实 accepted domestic Forecast，随后才能继续原有 Test delivery 链。不能用构造三态产物代替它。

| Gate | 结果 |
| --- | --- |
| DOMESTIC_REJECTION_DIAGNOSIS | PASS，新增调用细分可定位；历史 subtype UNKNOWN |
| PRIMARY_SELECTION_FORWARD_VALIDATION | PASS，受控真实三态通过且唯一主因 |
| REAL_DOMESTIC_SOURCE_INPUT | PASS，来源及输入准入 |
| REASON_BOUND_MINIMAL_LOCAL_PATCH | PASS，严格边界保留 |
| CONTROLLED_RESPONSIVENESS | PASS，构造输入 / 真实 Qwen |
| REAL_DOMESTIC_FORECAST_ACCEPTED | FAIL |
| CORE_TO_TEST_AUTOMATIC_DELIVERY | NOT_RUN_PREREQUISITE_NOT_MET |
| BRIDGE_CARD_REAL_E2E | NOT_RUN_PREREQUISITE_NOT_MET |
| FUEL_REFLIGHT_CANDIDATE_V3_READY | 不成立 |
| 总结 | **FUEL_REFLIGHT_BLOCKED_V3** |

冻结本地代码与脱敏证明后 STOP。没有合入主线，没有部署，没有把本地 PASS 写成生产或体验版已恢复。
