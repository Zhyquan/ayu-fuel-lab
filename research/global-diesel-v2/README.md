# Ayu Global Diesel Forecast V2

独立柴油基准R&D，分支 `research/global-diesel-forecast-v2`。

**DATA_GATE=PASS / MODEL_GATE=FAIL。** 所有正式结论见[结果报告](reports/GLOBAL_DIESEL_FORECAST_V2_RESULT.md)。该分支没有生产发布、数据更新定时器或当前模型制品。

## 一条命令重跑

Python 3.12，先在独立虚拟环境安装 `requirements-lock.txt`（包含完整固定依赖），然后在仓库根目录运行：

```sh
python -B research/global-diesel-v2/run.py
```

首次环境准备示例：

```sh
python3.12 -m venv .work/global-diesel-v2-venv
.work/global-diesel-v2-venv/bin/pip install -r research/global-diesel-v2/requirements-lock.txt
.work/global-diesel-v2-venv/bin/python -B research/global-diesel-v2/run.py
```

本轮实际使用已安装且版本匹配的Python环境，没有重复购买/创建资源。NumPy固定2.3.3；其余版本及传递依赖见锁文件；种子20260928、单线程；RuntimeWarning视为错误。不要将虚拟环境或`__pycache__`写入提交。

脚本顺序：核对依赖 → 官方下载入口（已存在快照则校验SHA256并离线读取）→ 清洗及Data Gate → 柴油PIT特征/未来标签 → 设计期FLAT冻结核验 → 2018/19候选选择冻结核验 → 2020起walk-forward → 校准/分年/非重叠/块bootstrap → 当前已发布状态 → 报告与FAIL候选状态。

原始ZIP/表单/元数据、独立V2初次发布CSV均已随分支固定。因此正常重跑不联网、不更新成当前数据。缺少源文件时下载程序只请求ALFRED/FRED/EIA公开数据；旧manifest的校验不能被新响应静默覆盖。若历史快照无法按原SHA恢复则必须失败，不能称为相同数据复现。

若任何冻结阈值、候选验证结果或复现哈希不同，程序抛错。不能通过删除freeze/manifest或改Test来“修复”结果。当前状态只是冻结研究日的描述，页面到期自动标记过期。

## 文件地图

| 文件/目录 | 用途 |
|---|---|
| `config.json` | 测试前冻结的时间规则、设计/验证/测试块及Gate |
| `download.py` | 匿名公开表单/文件下载、原始响应及校验 |
| `prepare.py` | 全新柴油Target、初值可获得时间、特征及当前状态 |
| `evaluate.py` | 5条路线、两种校准、4条基线、按时间purge及评分 |
| `run.py` / `report.py` | 可复现入口、报告、Gate失败状态 |
| `data/` | 初值、快照manifest、dataset、冻结记录、OOS和fold audit |
| `tests/` | 时间泄漏、标签端点、分布、单位、显示降级验证 |
| `ui/` | 独立本地候选；不引用V1目标或当前模型概率 |
| `reports/` | 12项所需报告/状态、图、测试与浏览器证据 |

价格候选只使用单独拷贝的11沿海地区参考快照 `data/coastal-reference-snapshot.json`。来源是之前独立候选已验收的APIZero快照：来源日2026-09-26、取得时间2026-09-27T11:01:00.875Z。只读复用现有验证/密度展示函数，不调用APIZero，不写`dist/data`，不改变当前价格服务。美元基准不换算成国内省级价格。

## 测试

```sh
npm test
node --test research/global-diesel-v2/tests/contract.test.mjs
python -B -W error::RuntimeWarning -m unittest discover -s research/global-diesel-v2/tests -p 'test_*.py' -v
npm run scan
```

测试结果：[TEST_RESULTS.md](reports/TEST_RESULTS.md)。既有Node102、新Node7、Python19，共128项通过。固定快照流水线两次独立完整运行，7个关键文件SHA256完全一致。

## 候选预览

从仓库根启动只绑定loopback的静态服务器：

```sh
python3 -m http.server 4402 --bind 127.0.0.1
```

打开 [V2本地候选](http://127.0.0.1:4402/research/global-diesel-v2/ui/)。三个模块为省级参考价、最近已公布纽约港柴油状态、未来7天“模型验证中”。没有当前百分比、预测方向或亚太MGO代表性宣称。

所有12项要求均在reports目录；Gate FAIL按要求不生成 `CURRENT_GLOBAL_DIESEL_FORECAST.json`、model artifact。候选页面按第21节失败状态要求保留。合并或更新公开网站不属于本轮交付。
