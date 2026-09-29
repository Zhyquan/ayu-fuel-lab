# Official Daily 与历史政策

## 唯一身份

沿用 Intelligence V2 的 immutable snapshot。新索引为 data/forecast-history-v2/official-daily-index.json。

每条 Official 记录 forecastId、Asia/Shanghai forecastDate、historyFile、forecastHash、evidenceHash、generatedAt、role=OFFICIAL_DAILY，以及 provider、model、sourceCommit。

forecastHash 是完整 snapshot（Candidate + 起始 Evidence Pack）的 canonical SHA-256；forecastId 等于该 hash。每个北京时间日期最多一条 Official。索引只允许增加一条记录，不允许修改旧 entries 或 legacyHistory。

现有两个 2026-09-28 MANUAL 文件保持原字节；索引标记 ROLE_UNCONFIRMED，不自动认定它们是正式准确率样本。

## 同日、并发与失败

模型前读取索引；同日已存在时返回 OFFICIAL_DAILY_ALREADY_EXISTS，不调用、不覆盖。GitHub concurrency 串行化 workflow；本地 exclusive lock 防止同目录并发；history 使用 wx，拒绝覆盖。

生成跨越北京时间午夜时拒绝进入原日期的样本。次日可创建新样本，但仍必须有新鲜合格 Evidence。

Evidence、Provider、Forecast 或 Public Evidence Gate 失败时不写新的 history / current cache，不伪造 MANUAL，不延长旧 validUntil。旧 Forecast 按已有 freshness 自然 STALE / UNAVAILABLE，价格功能独立。

缓存与索引用临时文件 + rename 原子替换。多个文件在本地不是同一数据库事务；磁盘写入途中失败可能留下未提交的孤立 snapshot。workflow 失败不推送，临时 runner 丢弃该工作区。只有通过全套验证并进入同一受控 Git commit 的记录才发布；索引中的已有 snapshot 每次读回都核验 hash。

## 提交保护

提交前验证新索引只追加一条、history/cache/current 全部一致、Forecast/Public Evidence Gate 仍 PASS、Provider audit 是真实成功运行。只有显式生成路径白名单允许提交；已有 history、outcome、源码、workflow、package、测试、CSS、HTML 不允许自动改动。

fetch origin main，要求本次源 HEAD 与远端仍相同。主线变化时尝试 pull --ff-only 后停止，等待下一次运行，不复用旧 source tree 的预测。最后 push 不带 force；fetch 之后发生的竞争也会由 Git fast-forward 限制拒绝。

本任务未启动 T+7 resolver 或 Accuracy UI。
