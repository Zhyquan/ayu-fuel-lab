# V3 验证结果

**研究制品验证 PASS；Global Diesel Data / Model Gate 仍均为 FAIL。**

## 两次完整离线复现

```sh
python -B research/global-diesel-v3/run.py
```

固定原始响应上完成两次完整运行，均成功退出。第二次与首次冻结的 10 个关键制品 SHA256 完全一致，未删除、重置或忽略冻结哈希。记录见 [reproduction-verification.json](reproduction-verification.json) 和 [冻结哈希](../data/reproduction-hashes.json)。

| 验证 | 结果 | 证据 |
|---|---|---|
| 原始响应及 metadata 的18项 manifest | PASS | [download-manifest.json](../data/download-manifest.json) |
| 新增 Python 数据审计测试 | 15 / 15 PASS | [python-tests.txt](python-tests.txt) |
| 仓库既有回归测试 | 102 / 102 PASS，0 skip | [node-existing-tests.txt](node-existing-tests.txt) |
| 10项关键输出的两次复现一致性 | PASS | [reproduction-verification.json](reproduction-verification.json) |
| 公开文件扫描 | PASS，无 findings | [public-scan.json](public-scan.json) |
| 11个沿海地区实际选择与可见结果 | PASS | [浏览器验证](BROWSER_VERIFICATION.md) |

## 新增测试检查的实际风险

1. 原始数据缺失、被改动时停止；不能静默改用其它数据。
2. 非数字、零、负数、无穷和空价格或汇率拒绝。
3. 美国初始发布异常真实存在且被隔离；2022-02-22 USGC 的初始零报价未用后续正数替换。
4. 发布日早于观察日的行被隔离；美国 availableAt 保守且保留夏令时。
5. 非美国周度历史与同周汇率的单位换算明确；不混合绝对价格单位。
6. MBIE Final 标记不能证明过去已发布；全部历史 availableAt 为空，不能训练。
7. 仅更改来源 catalog 的标记不能创造不存在的5年历史版本。
8. 只有美国有效历史不能建立全球 Target。
9. 周度缺失不被拼接成连续7日收益；周度非美国腿没有伪造1日收益。
10. 当前全球状态保持 unavailable，无方向、百分比或被选中的 FLAT 阈值。
11. 不存在 V3 forecast、Target、Label 或模型制品。
12. 候选页只取本地参考快照，不调用价格服务；11地区数据独立显示。

## 验证边界

本轮完成来源侦察、数据准入审计、同期共动诊断与失败候选验证。没有进行模型训练、Purged Walk-Forward、校准或二分类评分；这些没有合格 Target，相关报告明确为 NOT_RUN_DATA_GATE_FAILED。117项测试通过不能作为概率产品放行依据。

本轮只新增 `research/global-diesel-v3/`，没有改动既有生产文件或部署工作流；远端身份在任务外层交付记录中核验。没有合并 main 或部署公开页面。

原始 CSV 保留服务器的 CRLF 换行字节，SHA256 与下载响应一致。格式检查使用仅本次命令生效的 `cr-at-eol` 规则识别原始换行；未改写响应、未修改仓库或全局 Git 配置。
