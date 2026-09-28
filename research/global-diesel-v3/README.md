# AYU_GLOBAL_DIESEL_FORECAST_V3_COMPOSITE_001

独立研究分支 `research/global-diesel-forecast-v3-composite`，基于 V2 冻结提交 `0e2f9e3c89c0877a0990175148a90242d6a1249b`。本轮仅新增本目录；没有更改公开网站、沿海价格生产链或 main。

## 结论

| Gate | 本轮结果 |
|---|---|
| SOURCE_COVERAGE_GATE | PASS：美国与非美国合法长期价格历史已取得 |
| GLOBAL_DIESEL_DATA_GATE_V3 | FAIL：非美国历史发布时间版本未核验，不能满足无泄漏训练要求 |
| GLOBAL_DIESEL_MODEL_GATE_V3 | FAIL：NOT_RUN_DATA_GATE_FAILED，模型没有准入训练 |

MBIE 的 Singapore-linked 新西兰柴油进口成本有 1170 周、22.404 年历史；它与 NYH / USGC 同期周收益相关性约 0.763 / 0.752。这只能说明同期共同变化，不能证明未来 7 日预测能力。历史回修与暂停后的回填使过去的可得版本成为关键缺口。没有用观察日、Final 标记或通常的发布星期伪造 historicalAvailableAt。

正式 Composite、Target、标签、阈值选择、Routes A/B/C、基线评分、概率校准和二分类诊断均未运行；未来收益和概率均无结果。没有生成 `CURRENT_GLOBAL_DIESEL_FORECAST.json` 或模型制品。当前国际状态为 UNAVAILABLE，候选页显示“当前：暂不可用”和“模型验证中”。

## 一条复现命令

在仓库根目录、Python 3.12 环境中执行：

```sh
python -B research/global-diesel-v3/run.py
```

依赖固定为 `requirements.txt` 的 numpy 2.3.3、pandas 2.2.3、matplotlib 3.10.3；环境需有 Node.js / npm，以运行仓库既有测试和公开文件扫描。若需建立新的 Python 环境，可安装本目录的 requirements；本轮使用已有环境，没有新增付费服务。

该命令离线运行，不重新抓取数据，不访问真实价格 API，不训练模型，不部署。执行顺序为：

1. 校验已提交原始响应与 metadata 的 SHA256；缺失或改动立即停止。
2. 校验美国初次发布的价格、日期和保守可得时间；隔离异常，禁止用后续修订报价补洞。
3. 校验 MBIE 的周度原始行、单位和同周汇率；保持过去可得时间为 null。
4. 生成来源审计、回顾性同期共动诊断、Gate、当前 unavailable 状态与三份数据报告。
5. 执行 15 项新增 Python 测试、102 项仓库既有测试与公开文件扫描。
6. 与 `data/reproduction-hashes.json` 比较 10 个关键制品，改变则报 `FROZEN_REPRODUCTION_CHANGED`。

退出成功表示冻结研究结果与验证通过，不表示 Data / Model Gate 为 PASS。其余模型阶段报告是明确写明 NOT_RUN 的研究合同，不会被误生成成模型结果。原始获取网址、时间、表单条件、下载限制与许可证据见 `data/`。

## 本地候选预览

在仓库根目录启动：

```sh
python -m http.server 4404 --bind 127.0.0.1
```

打开 [V3 研究候选](http://127.0.0.1:4404/research/global-diesel-v3/ui/)。沿海价格读取本目录注明日期的固定参考快照，使用既有只读价格显示工具；不调用生产价格服务。页面提供 11 个沿海地区选择和判断依据展开，无预测方向或百分比。

## 指定交付文件

1. [完整结果及13项回答](reports/GLOBAL_DIESEL_V3_RESULT.md)
2. [全球数据源报告](reports/GLOBAL_DIESEL_V3_DATA_SOURCE_REPORT.md)
3. [Composite 定义与准入](reports/GLOBAL_DIESEL_COMPOSITE_DEFINITION.md)
4. [共同波动核验](reports/GLOBAL_DIESEL_COMPOSITE_VALIDATION.md)
5. [V3 Target 合同](reports/GLOBAL_DIESEL_V3_TARGET.md)
6. [FLAT 决策状态](reports/GLOBAL_DIESEL_V3_FLAT_DECISION.md)
7. [Features V3](reports/FEATURES_V3.md)
8. [Purged Walk-Forward 状态](reports/PURGED_WALK_FORWARD_V3.md)
9. [Baseline 比较状态](reports/BASELINE_COMPARISON_V3.md)
10. [概率校准状态](reports/CALIBRATION_V3.md)
11. [年度与 Regime 评价状态](reports/YEAR_BY_YEAR_V3.md)
12. [MGO 产品验证限制](reports/MGO_PRODUCT_VALIDATION.md)
13. [二分类诊断状态](reports/BINARY_DIAGNOSTIC_REPORT.md)
14. [当前国际市场状态](reports/CURRENT_GLOBAL_DIESEL_STATE.json)

补充：[数据与许可说明](data/README.md)、[测试记录](reports/TEST_RESULTS.md)、[真实浏览器交互记录](reports/BROWSER_VERIFICATION.md)、[原始响应 manifest](data/download-manifest.json)、[冻结复现哈希](data/reproduction-hashes.json)。远端提交身份在本任务外层交付记录中核对，避免把提交自身的 SHA 写进自身。

## 文件职责及剩余限制

- `audit.py`：来源校验、历史可得时间阻断、单位转换、同期诊断、准入与 unavailable 状态。
- `report.py`：只生成本轮事实报告和同期滚动相关图。
- `run.py`：离线复现与验证入口；`tests/test_audit.py` 检查实际数据风险。
- `data/`：公开原始响应、获取和许可记录、异常隔离、派生审计和固定沿海价快照。
- `reports/`：14 项交付、测试日志和浏览器证据；`ui/`：独立失败候选。

尚缺非美国至少 5 年可核验的历史发布版本、直接亚洲 MGO 验证与欧洲授权数据。进口成本含运费及其它成本，不能充当港口 MGO 报价。本轮停止于这些有证据的限制，不调低 Gate。
