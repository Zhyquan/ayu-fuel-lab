# 离线复现

原始下载已经固定在data/raw，包括769份EIA原始周文件（lossless ZIP）、ALFRED initial-release ZIP/CSV、EU XLSX/历史XLS及consumer table摘录、FRED FX CSV。metadata保存URL、读取时间、SHA256。下载不成功的日本数据不会被自动补齐。复现无需Key、账户或网络调用。

从repo根目录：

```sh
python3 -m venv research/international-diesel-v4/.venv
research/international-diesel-v4/.venv/bin/python -m pip install -r research/international-diesel-v4/requirements-lock.txt
PYTHONDONTWRITEBYTECODE=1 research/international-diesel-v4/.venv/bin/python research/international-diesel-v4/reproduce.py
```

首次安装依赖需要普通软件包下载，完整锁定依赖见requirements-lock.txt；实验重跑本身完全离线。建议Python3.12，原运行Python3.12.14、NumPy2.3.3、scikit-learn1.6.1、seed4001、单线程。

reproduce.py创建临时隔离副本，按prepare → Validation选择 → freeze → Test → Binary → descriptive/sensitivity/report → 12 tests执行；不会覆盖原有selection freeze。比较dataset byte hash、threshold/route/calibration、三分类和二分类分数（误差≤1e−10）、Current State。时间戳不同不作为算法变化。

已固定结果不要直接再次执行`backtest.py select`：它拒绝覆盖现有冻结文件。单项验证：

```sh
cd research/international-diesel-v4
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m unittest test_v4 -v
```

本地静态候选：从repo根目录启动普通HTTP server，打开`/research/international-diesel-v4/ui/`。价格来自复制的公开参考快照，国际状态来自本研究JSON；不调用真实预测API、不改变公开站点。源码只新增本研究子目录。

证据：results/REPRODUCTION_RESULT.json、results/TEST_RESULTS.json、results/UI_VERIFICATION.json、目录外REMOTE_IDENTITY.json。旧V1/V2/V3只有raw数据与框架参考；本轮Target、threshold、币种、指数权重和时间规则独立冻结。
