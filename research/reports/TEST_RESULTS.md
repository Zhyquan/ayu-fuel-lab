# TEST_RESULTS — Probability V1

- Node: **102/102 PASS**，原有96项 + 新增6项概率合同测试。覆盖sum容差、非有限值、最大类方向、整数合计100、Gate FAIL不返回概率、过期和未来时间安全降级。
- Python: **13/13 PASS**。覆盖逐特征发布时间、未来数据污染不改变快照、同日尚未发布数据隔离、整周期分组、边界labelKnownAt剔除、7自然日端点、负WTI、官方实际幅度优先、同幅度/省略元解析、税改执行日期、未知不标FLAT、计分及bootstrap一致性、冻结FAIL合同。
- 实际重复运行：两次完整pipeline的2768条OOS预测CSV逐字节相同，最大概率差0；hash见reproducibility.json。后续计分检查也维持同一OOS文件；最终计分与bootstrap采用相同裁剪口径。
- RuntimeWarning视为错误，最终NumPy2.3.3运行通过。首轮2.2.6平台浮点警告已通过依赖修复消除，没有简单隐藏警告。
- 公共文件扫描PASS，无命中；Python字节码不写入仓库。
- UI实际操作：390×844查看福建；切换浙江（8.28元/升、估算9857元/吨）、辽宁（8.19元/升、估算9750元/吨）；展开/收起依据后恢复福建。价格均来自旧候选本地缓存，没有刷新API。
- 320×740窄屏：scrollWidth=viewport=320，无水平溢出；概率区域无百分比；浏览器error/warn日志为空。已保存移动端与展开依据截图。
- 与8cb2cabbceb5115981005c407c0e6977516a682b比较：dist、intelligence、.github、package.json均无改动。原Intelligence worktree仍在该SHA且clean。
- main远端核验保持eaeb3ada685099b4fe4d9cb66b6d3a7cc3488908；本轮推送分支research/probability-v1，不触发仅main的Pages workflow。

命令：

```sh
python research/run_probability_v1.py --download
python research/run_probability_v1.py
python -B -m unittest discover -s research/tests -v
npm test
npm run scan
```

完整文本日志：python-tests.txt、node-tests.txt。浏览器证据是本地Candidate验收，不代表公开部署、正式概率上线或现有Intelligence重新验收。
