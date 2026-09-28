# 亚洲外部验证

模型已冻结，见MODEL_FREEZE.json。JAPAN_DIESEL_WEEKLY = UNAVAILABLE；ASIA_MGO_VALIDATION_STATUS = UNAVAILABLE。

官方METI周序列历史从1990-08-27、Monday survey / Wednesday14:00 JST发布，假期可Thursday。浏览器读到2026-09-16版本链接，但普通HTTP两种客户端403、浏览器下载超时且文件0字节。无法解析原始周值，不把页面存在当作可用数据。另下载的北海道政府档案实际是地区月初摘录，已拒绝，不扩成全国周数据。

|检查|n|结果|
|---|---:|---|
|同期收益相关 / direction agreement|0|N/A|
|AIDI领先日本1周（lag+1）|0|N/A|
|日本领先AIDI1周（lag−1）|0|N/A|
|模型概率对日本辅助Brier/LL|0|N/A|

无法判断领先/同步关系或是否脱节；未知不能当PASS，亦不能写成已证明无相关。日本零售轻油含税、补贴与流通环节，不是MGO。日本数据/结果没有参与threshold、特征、模型或校准选择；没有为PASS设置相关门槛。当前证据**不支持亚洲产品代表性声明**。

原始访问证据：data/japan-access-audit.json。法规与许可见V4_DATA_SOURCE_AUDIT.md。
