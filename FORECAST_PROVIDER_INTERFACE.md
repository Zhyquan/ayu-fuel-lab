# Forecast Provider Interface

```js
createForecastProvider('MANUAL' /* default */).generateForecast({
  evidencePack,       // Source/Freshness Gate 已通过并冻结
  evidenceHash,       // canonical JSON SHA-256
  manualCandidate    // 按 ANALYSIS_PROTOCOL 由当前 Codex/人工填写
})
```

文件：`scripts/intelligence-v2/provider.mjs`。允许 provider 名称 MANUAL / OPENAI / OTHER，默认 MANUAL。当前 OPENAI/OTHER 在任何网络请求或凭据读取之前抛出 `PAID_PROVIDER_NOT_AUTHORIZED`。没有 SDK、Key、模型付费请求或充值操作。

返回相同 Forecast JSON：source=`AYU_INTELLIGENCE_V2`、status=`LIVE`、probabilityType=`AI_SUBJECTIVE_ESTIMATE`、forecastHorizonDays=7、provider、generatedAt、validUntil、evidenceHash、probabilities(DOWN/FLAT/UP)、primaryDirection(UP/DOWN)、mainReasons、counterReasons、signalAssessments。

本轮 MANUAL 可以由当前 Codex 根据冻结包生成输出，已完成真实运行。概率是该次分析的文件内容，不是 UI 或 collector 中的固定参数；normalize 函数只在提供者显式生成阶段使用。门禁对不合法输出直接 FAIL。

未来授权后只在 provider 层实现请求并映射同一合同，主流程继续执行独立 Forecast Gate。Provider 无权绕过来源、hash、时间、理由校验或直接写价格。标准合同接受三种 provider 标识，但付费执行授权在 provider 层强制关闭；本轮活跃缓存只由 MANUAL 产生。

理由不能添加自由文本事实，只能引用包中 evidenceId+displayText。每条 signalAssessments 都有 evidenceId+impact+kind+strength。明确“不新增事实”门禁是结构溯源约束，不能自动证实源文章真假。
