# Qwen Provider 合同

任务：AYU_FUEL_AUTOMATED_FORECAST_LOOP_001。开发候选；尚未激活真实 API。

## 固定配置

| 项目 | 合同 |
| --- | --- |
| Provider / model | QWEN / qwen3.8-flash |
| Region | China (Beijing) |
| 默认 base | https://dashscope.aliyuncs.com/compatible-mode/v1 |
| Endpoint | base + /chat/completions |
| Key | 仅运行时环境变量 DASHSCOPE_API_KEY |
| 可选 base | DASHSCOPE_BASE_URL；只接受北京官方 HTTPS 主机 |
| Runtime | Node 22 原生 fetch，无新增 SDK |
| 推理 | stream=false、enable_thinking=false、max_tokens=2048 |
| Schema | response_format=json_schema，strict=true |

阿里云官方文档确认 Qwen3.8-Flash 支持结构化输出和非思考参数。北京新工作空间 endpoint 可覆盖默认值；旧 DashScope endpoint 仍受支持。尚未用真实账户验证模型访问权限、配额或服务端接受本次完整 schema。

官方依据：[结构化输出](https://help.aliyun.com/zh/model-studio/qwen-structured-output)、[Chat API](https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-chat-completions)、[兼容 API 与北京 endpoint](https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope)。

## 输入

沿用现有 Evidence Gate；先克隆并 canonicalize，通过 Gate 与 evidenceHash 校验后才允许请求。模型只收到字段白名单投影：

- 5–12 个 signals 的事实、方向、时间、来源及必要 provenance。
- eventGroups、categoryChecks、recentMarketContext、conflicts、forecastHorizonDays。
- 这些嵌套结构也按字段白名单投影，不传 discovery、fetchLog、HTML、历史 Forecast 或研究文件。

单次请求体上限 65,536 bytes，响应上限相同。不给模型 tools 或 Web Search；来源 URL 仅为证据数据。Prompt 版本为 qwen-forecast-v1，协议沿用 ANALYSIS_PROTOCOL.md。

## 模型输出与可信构造

根 schema：[QWEN_FORECAST_SCHEMA.json](QWEN_FORECAST_SCHEMA.json)。请求时把三处 evidence ID enum 绑定到本轮 pack。远端 Schema 仅使用百炼文档明确展示的关键词；数组长度、唯一性、非空 ID、概率范围与全量 assessment 由本地 validateAnalysis 严格验证。

模型只返回四个字段：

1. probabilities：DOWN / FLAT / UP，各 5–90，步长 5，总和 100。
2. mainReasonEvidenceIds：1–3 个有效、同主方向且不重复的 ID。
3. counterReasonEvidenceIds：0–2 个有效反向 ID；存在反向证据时不得为空。
4. strengthAssessments：全部 signals 恰好一次，只有 evidenceId 与 LOW / MEDIUM / HIGH。

所有对象 required 完整、additionalProperties=false；本地严格校验继续拦截非法结构和语义。同方向理由不得对同一 eventKey 重复投票。

代码决定 source、provider、evidenceHash、generatedAt、validUntil、primaryDirection。UP > DOWN 时为 UP，否则 DOWN，平局也为 DOWN。理由 text 从 displayText 复制；impact / kind 从 Evidence 复制。完成时间来自实际时钟，validUntil 为完成后 24h。

生成后依次通过原 Forecast Gate 和 Public Evidence Gate；未知短摘要类型 fail closed。新增的三个反向短摘要仅覆盖现有解析器已支持的库存增加、Brent 回落、柴油上涨，未重设计页面。

## 调用与失败

每个 Provider 实例最多一次语义推断。仅网络故障、429、5xx 最多重试两次，退避 250 / 500ms，单请求超时 30s。4xx、JSON/schema、grounding 或 Gate 失败不重新推断，不切换 MANUAL。运输重试无法保证供应商只计费一次；超时后供应商可能已处理请求。

审计只保存 provider/model/promptVersion、起止时间、HTTP 状态、尝试数、payload bytes、usage 及成功状态。不保存响应正文、header、Key 或工具调用。失败语义响应的已知 token usage 仍记录。

qwen3.8-flash 使用指定 canonical ID，无 latest；它不是独立权重快照。供应商内部更新仍可能影响输出；后续切换 model 必须显式 commit，并审查历史索引兼容性。
