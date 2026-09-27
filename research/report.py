"""Readable reports derived from saved out-of-sample predictions, not hand scores."""
import json
from collections import Counter

import numpy as np
import pandas as pd

from prepare import DATA, ROOT, REPORTS, CLASSES, SERIES
from backtest import MODELS


def table(headers, rows):
    return '| ' + ' | '.join(headers) + ' |\n|' + '|'.join(['---'] * len(headers)) + '|\n' + '\n'.join('| ' + ' | '.join(map(str, row)) + ' |' for row in rows)


def metrics_table(metrics):
    return table(['模型', 'N', 'Brier↓', 'Log loss↓', '平均classwise ECE↓', 'Accuracy', 'Macro F1'], [[m, s['n'], *[f'{s[k]:.6f}' for k in ['brier', 'logLoss', 'meanClasswiseECE', 'accuracy', 'macroF1']]] for m, s in metrics.items()])


def write_reports(frame, officials, market, r, oos, audits):
    REPORTS.mkdir(parents=True, exist_ok=True)
    for name in ['TARGET_DEFINITION.md', 'FEATURES_V1.md']:
        (REPORTS / name).write_text((ROOT / 'research' / name).read_text())
    primary_counts = frame.target.value_counts().to_dict()
    regular = [v for v in officials if v['status'] == 'OK' and v['role'] == 'REGULAR']
    exclusions = Counter(v['reason'] for v in json.loads((DATA / 'snapshot-exclusions.json').read_text()))
    labels = pd.read_csv(DATA / 'target-b-labels.csv')
    source_rows = [[name, code, len(m), m.observationDate.min(), m.observationDate.max(), m.releaseDate.max()] for (name, code), m in zip(SERIES.items(), market.values())]
    dataset = f'''# Dataset report

固定数据批次：2026-09-27。原始下载、URL、SHA256、POST公开表单参数保存在 `data/research/raw/` 及 input-manifest.json。原始响应保留，不能静默修补。

{table(['市场','ALFRED series','有效非空初值数','最早观测','最晚观测','最后首次发布日期'], source_rows)}

## 时间范围与标签

- 官方常规决策：{len(regular)}轮，{regular[0]['adjustmentDate']}—{regular[-1]['adjustmentDate']}，{dict(Counter(v['result'] for v in regular))}。
- 特殊VAT调整：{sum(v.get('role') == 'SPECIAL_TAX' for v in officials)}条，单列；政策说明不作调价标签。消费税与常规周期同期时保留最终执行值并标注taxChangeIncluded。
- 可标记Target B日期：{len(labels)}，{labels.snapshotDate.min()}—{labels.snapshotDate.max()}。
- 完整可用快照：**{len(frame)}**，{frame.snapshotDate.min()}—{frame.snapshotDate.max()}；**{frame.cycleId.nunique()}**个官方周期。
- PRIMARY标签：DOWN={primary_counts.get('DOWN',0)}，FLAT={primary_counts.get('FLAT',0)}，UP={primary_counts.get('UP',0)}。
- OOS：**{len(oos)}**个快照 / **{oos.cycleId.nunique()}**周期，{oos.snapshotDate.min()}—{oos.snapshotDate.max()}。
- 快照排除：{dict(exclusions)}。

## 必须保留的缺口

ALFRED的DEXCHUS公开vintage档案从2014-03-18开始，初值观测从2014-03-17开始。没有把今天下载的2013年汇率最终值当作2013年可用值，因此完整特征范围从2014年开始；设计期名义为2013—2016，实际只有可核验的{json.loads((DATA/'flat-decision.json').read_text())['designN']}个标签参与阈值估计。

官方归档在2015-12-15到2016-01-13间存在29日缺口，未自行填入一条零调整：该区间29天快照整体排除。其他周期最大间隔≤25日。常规公告未解析/冲突数={sum(v['status'] in ['UNPARSED','CONFLICT','FETCH_FAILED'] for v in officials)}。这不等于证明官方历史档案绝对完整。

`quarantined-source-records.json`保留首次发布日期早于观测日的异常：{len(json.loads((DATA/'quarantined-source-records.json').read_text()))}条。空值直接缺失；未前向填造价格、未把缺值当FLAT。负WTI保留，使用asinh特征。

## TARGET比较（不混用）

{table(['项目','A：官方下一轮柴油调价','B：固定7日成本压力'], [['样本',f'{len(regular)}个独立历史决策',f'{len(frame)}日快照，但仅{frame.cycleId.nunique()}组，不能当独立同分布样本'],['标签',str(dict(Counter(v['result'] for v in regular))),str(primary_counts)],['解释','贴近国内最终每吨调价，提前量可变','Brent×USD/CNY未来7自然日变化，±2% FLAT'],['长期可得性','2013年以来有官方公告，部分历史窗口缺失','原油从2013前覆盖；汇率初始版本2014起'],['国内相关性','Ground truth','见下面独立关联，不能声称最终国内价格概率']])}

OOS每周期取T-7一条（N={r['targetAssociation']['n']}）：代理7日回报与官方实际柴油变化Pearson相关系数={r['targetAssociation']['pearsonProxyReturnVsActualDieselChange']:.4f}；两者三类标签一致率={r['targetAssociation']['labelAgreement']:.2%}。这是事后Ground Truth关联，不是模型预测准确率；相关性不等于可预测性或因果关系。

## 来源与日期语义

- [ALFRED下载说明](https://alfred.stlouisfed.org/help/downloaddata)：Initial Release Only及realtime_start_date。采用初值和整个美国中部发布日期结束后的保守availableAt。
- [Brent](https://alfred.stlouisfed.org/series?seid=DCOILBRENTEU)、[WTI](https://alfred.stlouisfed.org/series?seid=DCOILWTICO)：EIA现货，经ALFRED提供版本。
- [USD/CNY](https://fred.stlouisfed.org/series/DEXCHUS)：美联储H.10，人民币/美元，不能把汇率方向反过来。
- [发改委历史专题](https://www.ndrc.gov.cn/xwdt/ztzl/gncpyjg/)及[新闻发布](https://www.ndrc.gov.cn/xwdt/xwfb/)：每条结果附原始公告URL。
- [2013机制通知](https://www.ndrc.gov.cn/xxgk/zcfb/tz/201303/t20130326_964571_ext.html)：10工作日及50元机制门槛；本轮实际标签另识别政策干预后的执行幅度。

原始HTML/ZIP仅作为本地和仓库研究复核材料；没有公开Pages部署或API服务。
'''
    (REPORTS / 'DATASET_REPORT.md').write_text(dataset)
    yearly = [[y, v['frequency']['n'], f"{v['frequency']['brier']:.6f}", f"{v['logistic_calibrated']['brier']:.6f}", f"{v['frequency']['logLoss']:.6f}", f"{v['logistic_calibrated']['logLoss']:.6f}", 'YES' if y in r['winningCompleteYears'] else 'NO / partial' if y == '2026' else 'NO'] for y,v in r['byYear'].items()]
    ahead = [[f'T-{n}', v['frequency']['n'], f"{v['frequency']['brier']:.6f}", f"{v['logistic_calibrated']['brier']:.6f}", f"{v['frequency']['logLoss']:.6f}", f"{v['logistic_calibrated']['logLoss']:.6f}"] for n,v in r['daysBeforeOfficialWindow'].items()]
    walk = f'''# Walk-forward backtest

2019—2026按年向前滚动。测试年Y：训练cycleYear<Y−1，校准cycleYear=Y−1，测试cycleYear=Y。cycleYear取整轮官方决策日所属年；因此日历12月末快照可能属于次年fold。2026为不完整年。

一周期内快照不拆到训练/校准/测试。训练标签必须在校准首个预测时点前已公开，校准标签必须在测试首个预测时点前已公开；使用labelKnownAt，不只按观测日截断。首次发布日期时区转换、每项特征可用时间和分组均有可执行断言。清除训练边界{sum(a['purgedTrainN'] for a in audits)}行次、校准边界{sum(a['purgedCalibrationN'] for a in audits)}行次（跨fold计数，非独立快照数）。

{table(['test year','train N','cal N','test N','purged train','purged cal'], [[a['testYear'],a['trainN'],a['calibrationN'],a['testN'],a['purgedTrainN'],a['purgedCalibrationN']] for a in audits])}

没有随机划分；StandardScaler只fit训练；校准不读取测试标签；阈值只使用2016及以前设计期。fold-audit.json保留所有cycleId和边界标签时间。

## 每年OOS

{table(['年','N','频率 Brier','候选 Brier','频率 LL','候选 LL','两项均改善'], yearly)}

完整年份两项均改善：{r['winningCompleteYears']} / 7。没有隐藏失败年份。

## 距官方窗口的提前量分层

下面每行仍预测**从当日往后7天Target B**；T-1/T-3/T-5/T-7仅表示当日距官方窗口的日数，不是四个不同horizon。尤其T-1结果不能代替七天能力，也不是Target A准确率。

{table(['距官方窗口','N','频率 Brier','候选 Brier','频率 LL','候选 LL'], ahead)}

## 每周一非重叠7日敏感性检查

{metrics_table(r['nonOverlappingMondaySensitivity'])}

全体日快照存在重叠标签和周期内相关性。改善区间按整周期block bootstrap 2000次；周一抽样用于补充核查，不能声称消除了跨周期宏观序列相关性。严格无泄漏指已实施并检查的数据可用时间/版本与划分规则，不能证明历史数据提供方绝无录入错误。
'''
    (REPORTS / 'WALK_FORWARD_BACKTEST.md').write_text(walk)
    comp = f'''# Baseline comparison

{metrics_table(r['overall'])}

Brier采用三类平方误差**求和**再取均值，范围0—2；LogLoss为自然对数。所有评估与bootstrap统一将概率裁剪到[1e-9,1]再归一化，避免零概率导致无穷损失；这是计分约定，不是校准或提升。统一DOWN/FLAT/UP顺序。频率基线只用训练样本，Laplace+1平滑；7日动量基线按冻结deadband分组，使用训练集条件频率；raw Logistic是第三基线。候选预指定logistic_calibrated，未按测试成绩改选Isotonic。

{table(['指标','baseline − candidate 改善','周期bootstrap95%','相对改善'], [[k,f"{v['improvement']:.6f}",f"[{v['cycleBootstrap95'][0]:.6f}, {v['cycleBootstrap95'][1]:.6f}]",f"{v['improvement']/r['overall']['frequency'][k]:.2%}"] for k,v in r['improvementVsFrequency'].items()])}

负改善表示比最简单基线更差。本轮不继续搜索复杂模型、特征或阈值来追逐这一批测试集。没有Gradient Boosting/XGBoost、ensemble或LLM概率。
'''
    (REPORTS / 'BASELINE_COMPARISON.md').write_text(comp)
    candidate = r['overall']['logistic_calibrated']
    bucketrows = [[b['class'],f"{int(b['lower']*100)}–{int(b['upper']*100)}%", b['n'], f"{b['meanPredicted']:.2%}" if b['n'] else '—', f"{b['observedFrequency']:.2%}" if b['n'] else '—', f"{b['absoluteGap']:.2%}" if b['n'] else '—'] for b in candidate['buckets']]
    near60 = []
    for c in CLASSES:
        p = oos[f'logistic_calibrated_{c}']; mask = (p >= .55) & (p < .65)
        near60.append([c, int(mask.sum()), f'{p[mask].mean():.2%}' if mask.any() else '无样本', f'{(oos.loc[mask,"target"]==c).mean():.2%}' if mask.any() else '不可验证'])
    calibration = f'''# Calibration report

只用过去校准年。候选为多分类Logistic/Platt式校准；Isotonic按类拟合再归一化，只作比较。所有以下数字来自OOS；已执行校准不代表校准成功。

{metrics_table({k:r['overall'][k] for k in ['logistic_raw','logistic_calibrated','isotonic_diagnostic']})}

候选每类ECE：{candidate['classwiseECE']}。分桶为左闭右开，最后一桶含1；没有样本的桶不可验证。每天样本相关，不将桶计数视为独立试验数。

![Classwise reliability](calibration.png)

## 完整分桶

{table(['类别','预测区间','N','平均预测','实际发生','绝对偏差'], bucketrows)}

## “约60%是否兑现”

以下是55%—65%预测带内实际结果，不代表精确60%的通用保证，也不据此重新调参。

{table(['类别','N','平均预测','实际发生'], near60)}

## 分类表现（仅诊断，不替代概率得分）

{table(['类别','实际N','argmax N','Precision','Recall','F1'], [[c,v['support'],v['predictedN'],f"{v['precision']:.4f}",f"{v['recall']:.4f}",f"{v['f1']:.4f}"] for c,v in candidate['byClass'].items()])}

混淆矩阵：行实际、列预测，顺序均DOWN/FLAT/UP。

{table(['实际 / 预测',*CLASSES], [[c,*candidate['confusionMatrix'][i]] for i,c in enumerate(CLASSES)])}

结论：Gate={r['gate']}。即便个别概率桶接近兑现比例，也不足以覆盖跨年份失效、类塌缩或整体proper-score退步。
'''
    (REPORTS / 'CALIBRATION_REPORT.md').write_text(calibration)
    _plot(candidate)
    failed = [k for k,v in r['gateChecks'].items() if not v]
    improvement = r['improvementVsFrequency']
    summary = f'''# AYU_FUEL_PROBABILITY_MODEL_V1_001

## PROBABILITY_MODEL_GATE = {r['gate']}

本轮完成独立统计研究与Candidate UI。未合并main、未部署公开Pages、未修改原有价格/Intelligence代码及证据链。未调用付费数据、LLM或任何新闻概率生成。

## 八个核心回答

1. **Ground Truth是什么？** PRIMARY B为Brent美元现货×USD/CNY的7自然日回报，±2.0%以内FLAT，低于−2% DOWN，高于+2% UP。初次发布版本标记真实可用时间。SECONDARY A是官方实际柴油每吨调价，独立保存和比较。
2. **能否称未来7天趋势？** 时间终点严格t+7自然日，可解释成“未来7天原油人民币成本压力”。不能解释为国内柴油最终涨跌概率或实际成交价预测。
3. **七天有没有统计价值？** 本轮未证明候选具备稳定增量价值。日快照、周一非重叠样本和T-1/3/5/7分层均已给出；不能拿临近窗口成绩冒充七天能力。
4. **提升多少？** 相比历史频率，Brier改善={improvement['brier']['improvement']:.6f}（相对{improvement['brier']['improvement']/r['overall']['frequency']['brier']:.2%}），LogLoss改善={improvement['logLoss']['improvement']:.6f}（相对{improvement['logLoss']['improvement']/r['overall']['frequency']['logLoss']:.2%}）。负数就是退步。只有{len(r['winningCompleteYears'])}/7个完整测试年份同时改善。
5. **是否校准过？** 是，每fold用过去一年进行多分类Logistic校准，并比较Isotonic；测试集不参与拟合。校准过不等于通过校准验收。
6. **输出60%时是否约60%兑现？** 不能作这种可靠性承诺；55%—65%预测带的实际兑现见下表，完整十分位桶见校准报告。稀疏/空桶不能声称有效。
7. **三类分别如何？** 下方列出实际支持、召回率和预测占比；没有用FLAT总体命中率代替三类质量。
8. **能给真实用户展示百分比吗？** **不能。** 当前合同status=UNAVAILABLE、probabilities=null；不导出可部署模型、不生成当前三类概率，UI只显示不可用状态。

{metrics_table({k:r['overall'][k] for k in ['frequency','momentum7d','logistic_raw','logistic_calibrated','isotonic_diagnostic']})}

{table(['约60%类别','N','平均预测','实际兑现'], near60)}

{table(['类别','实际样本','Recall','预测占比'], [[c,v['support'],f"{v['recall']:.2%}",f"{v['predictedN']/len(oos):.2%}"] for c,v in candidate['byClass'].items()])}

## Gate逐项

{table(['条件','结果'], [[k,'PASS' if v else 'FAIL'] for k,v in r['gateChecks'].items()])}

未通过项：{', '.join(failed)}。

## 数据边界与主要风险

{len(frame)}个完整快照，{frame.cycleId.nunique()}个周期；OOS {len(oos)}个快照、{oos.cycleId.nunique()}周期。完整特征从2014年开始，2013汇率初始版本缺失。官方公告有一段29日缺口，整体排除；没有伪造零调价。免费公开数据发布时间有周级滞后，成本代理未覆盖炼化、税收及政策干预。最大产品风险是把成本代理的概率误当成国内柴油最终价格概率。

## 交付与复跑

- [目标定义](TARGET_DEFINITION.md)、[FLAT决策](FLAT_LABEL_DECISION.md)、[数据报告](DATASET_REPORT.md)、[特征](FEATURES_V1.md)
- [Walk-forward](WALK_FORWARD_BACKTEST.md)、[校准](CALIBRATION_REPORT.md)、[基线比较](BASELINE_COMPARISON.md)
- 候选页：`research/ui/index.html`；原始/标准化/快照/OOS/manifest在`data/research/`。
- Python 3.12环境安装 `research/requirements-lock.txt` 后执行：`python research/run_probability_v1.py --download`。已保存数据默认缓存复用，逐文件hash校验；无需API Key。详见 `research/README.md`。
- 完整测试及remote-backed SHA见本任务外层 `DELIVERY.md` 与 `TEST_RESULTS.md`，避免自引用提交hash。

停止于研究候选，等待人工决定下一步。本轮FAIL不代表所有未来方法都无效，但不能继续以当前测试集择优后称为独立验证。
'''
    (REPORTS / 'PROBABILITY_MODEL_V1_RESULT.md').write_text(summary)


def _plot(candidate):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    fig, axes = plt.subplots(1, 3, figsize=(12, 4), sharex=True, sharey=True)
    for ax, c in zip(axes, CLASSES):
        rows = [b for b in candidate['buckets'] if b['class'] == c and b['n']]
        ax.plot([0,1],[0,1], linestyle='--', color='#9aa6b2', linewidth=1)
        ax.plot([b['meanPredicted'] for b in rows], [b['observedFrequency'] for b in rows], marker='o', color='#267ea5')
        for b in rows:
            ax.annotate(str(b['n']), (b['meanPredicted'],b['observedFrequency']), xytext=(2,5), textcoords='offset points', fontsize=7)
        ax.set(title=c, xlabel='Mean predicted probability', xlim=(0,1), ylim=(0,1))
        ax.grid(alpha=.15)
    axes[0].set_ylabel('Observed frequency')
    fig.suptitle('OOS logistic calibration | labels = snapshot counts (correlated)')
    fig.tight_layout()
    fig.savefig(REPORTS/'calibration.png', dpi=150)
    plt.close(fig)
