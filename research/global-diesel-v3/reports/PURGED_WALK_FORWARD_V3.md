# Purged Walk-Forward V3

**NOT_RUN_DATA_GATE_FAILED；有效 folds = 0；OOS predictions = 0。**

没有把最新修订历史的观察日当成可得时间，也没有运行普通随机切分或复用 V2 标签。无合格 V3 Composite 及 Target 时，不启动估计器。

待数据准入后执行的时间规则：

1. Expanding train → 后续 calibration → test；候选和阈值选择需要更早独立 validation，Test 不参与。
2. 所有相邻 Train / Validation / Calibration / Test 边界至少 7 自然日 embargo。不能只删除 7 个交易行。
3. 训练和校准标签的实际端点必须早于下一块边界减 embargo；全部 label releaseKnownAt 也必须不晚于拟合截止。标签延后发布超过 7 日时，实际 purge 更长。
4. 特征逐项检查 availableAt ≤ decisionAt；标签成熟、价格观察、公开发布时间三者分别检查。
5. 同时输出 daily overlapping 和严格 non-overlapping weekly 评分。非重叠按真实标签区间选择，后续 T 必须晚于前一标签端点；不按“每7行”抽样假装非重叠。

本轮 A / B 两种评价均 NOT_RUN。MBIE 周度历史足以做同期周收益检查，但重复周价得到的日度行不增加独立观察，更不能用来完成上述每日预测要求。

`data/non-us-proxy-audit.csv` 的 historicalAvailableAt 全部为 null，usableForTraining 全部为 false；当前快照不能进入过往决策日的特征。测试覆盖这一阻断和原始快照篡改、异常报价隔离；不是声称本轮已经实现或验证了训练/校准 purging harness。
