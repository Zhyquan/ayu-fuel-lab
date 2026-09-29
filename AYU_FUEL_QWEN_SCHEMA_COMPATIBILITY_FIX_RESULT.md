# AYU_FUEL_QWEN_SCHEMA_COMPATIBILITY_FIX_001

## 结论

QWEN_SCHEMA_COMPATIBILITY_GATE = PASS

AUTOMATED_FORECAST_LOOP_GATE = PASS

NEXT_GATE = QWEN_FLASH_REAL_SMOKE_TEST_002

本轮只修复 Provider Schema 兼容性，未执行 Smoke Test 002。实现提交：

083a9c7495b154124baf48dfa44dc32c9a3e0d16

最终 feature remote HEAD 以本报告提交后的回报为准。

## 修复前问题

第一次真实 qwen3.8-flash Smoke Test 到达百炼 endpoint，HTTP 400 在模型推理前拒绝 response_format.json_schema.schema，首先指出 uniqueItems 格式不兼容。没有返回 model identity 或 token usage。

AUTH_STATUS = NOT_FULLY_PROVEN_BUT_REQUEST_ACCEPTED_FOR_SCHEMA_VALIDATION

MODEL_INFERENCE_PERMISSION = NOT_YET_PROVEN

该响应不是 API_KEY_INVALID，也不能证明 FLASH_PERMISSION_CONFIRMED。

## 官方兼容子集

百炼当前 Structured Output 和 OpenAI-compatible Chat 文档明确展示或说明：

- response_format.type = json_schema
- strict = true
- type、properties、required、items、enum
- additionalProperties；推荐 false
- description、title 出现在官方示例中
- qwen3.8-flash 系列支持 JSON Schema structured output

依据：

- https://help.aliyun.com/en/model-studio/qwen-structured-output
- https://help.aliyun.com/en/model-studio/qwen-api-via-openai-chat-completions

新增递归 qwenSchemaCompatibilityGate()，实际发送前扫描 analysisSchema(pack)。允许关键词固定为：

type, properties, required, items, enum, description, title, additionalProperties

properties 下的业务字段名及 enum 值不会被误判为 Schema keyword。任何其它关键词都会产生 QWEN_SCHEMA_COMPATIBILITY_FAILED，且在 HTTP 请求前停止。

## 删除的远端关键词

从 QWEN_FORECAST_SCHEMA.json 和动态 analysisSchema(pack) 中删除：

- uniqueItems
- minItems
- maxItems
- minLength

兼容 Gate 同时明确拒绝未来加入：

- pattern
- format
- minimum
- maximum
- multipleOf

三处动态 evidence ID enum 继续绑定当前 Evidence Pack。根对象、probabilities 对象和 assessment item 均继续 additionalProperties=false；本地 exactKeys() 继续拒绝额外字段。

根据当前官方 Structured Output 指引同时移除请求中的 max_tokens，避免结构化 JSON 被输出上限截断。仍保持 json_schema、strict=true、non-thinking、固定 qwen3.8-flash。

## 移到本地 validator 的约束

validateAnalysis() 原有严格约束全部保留：

- DOWN / FLAT / UP 必须为 5–90 的整数、5 的倍数且总和 100。
- main reasons 必须 1–3 个；counter reasons 必须 0–2 个。
- reason ID 非空、存在于当前 pack、不得重复或同时属于 main/counter。
- 同方向理由不得重复 eventGroup，方向必须与 primary/counter 角色一致。
- 存在反向 Evidence 时 counter 不得为空。
- assessments 数量严格等于 signals；每个 evidenceId 恰好一次，不得缺少、重复、额外或包外。
- strength 仅 LOW / MEDIUM / HIGH。

删除远端关键词没有降低 Candidate、Forecast Gate、Reason grounding、Official Daily、History 或 UI 合同。

## 测试

Node 22.23.3：

- Provider 定向测试：35 PASS。
- 完整测试：197 PASS，0 FAIL，0 skipped。
- Public source scan：PASS，1309 files，0 findings。
- git diff whitespace check：PASS。

新增覆盖：

- 最终远端 Schema 不含 uniqueItems / minItems / maxItems / minLength / pattern / format / minimum / maximum / multipleOf。
- 动态三处 evidence enum 保留。
- 三层 additionalProperties=false 保留。
- allowlist 递归检查不会误判 property 名或 enum 值。
- 0 / 4 个 main、3 个 counter、重复 main/counter、空/包外 ID 继续被本地拒绝。
- assessment 少、重复、多继续被拒绝。
- 概率总和和 5% 步长继续被拒绝。
- fake HTTP 请求仍为 json_schema、strict=true，且不含 max_tokens。

所有测试使用 fake transport。没有真实 Qwen 请求。

## 安全与停止点

real Qwen calls = 0

real model cost = 0

Production Forecast writes = 0

deployments = 0

main changes = 0

GitHub Secret mutations = 0

第二次真实调用必须等待用户对 QWEN_FLASH_REAL_SMOKE_TEST_002 的新明确授权。STOP。
