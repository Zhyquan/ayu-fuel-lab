"""Deterministic research reports from frozen evaluation artifacts."""
import hashlib
import json

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import pandas as pd

from prepare import C, CLASSES, DATA, FEATURES, REPORTS, ROOT, dump
from evaluate import BASELINES


def write(name, lines):
    (REPORTS / name).write_text('\n'.join(lines) + '\n')


def table(metrics):
    lines = ['| 路线 | N | Brier ↓ | Log loss ↓ | ECE ↓ | Accuracy | Macro F1 |', '|---|---:|---:|---:|---:|---:|---:|']
    for n, m in metrics.items():
        lines.append(f"| {n} | {m['n']} | {m['brier']:.6f} | {m['logLoss']:.6f} | {m['meanECE']:.6f} | {m['accuracy']:.4f} | {m['macroF1']:.4f} |")
    return lines


def run(r, oos, state):
    REPORTS.mkdir(exist_ok=True)
    candidate = r['candidate']; cm = r['overall'][candidate]; fm = r['overall']['frequency']
    freeze = json.loads((DATA/'threshold-freeze.json').read_text())
    audit = json.loads((DATA/'dataset-audit.json').read_text())
    f = pd.read_csv(DATA/'dataset.csv')
    spans = (pd.to_datetime(f.endDate)-pd.to_datetime(f.date)).dt.days.value_counts().sort_index().to_dict()
    byyear = f.groupby(pd.to_datetime(f.date).dt.year).size().to_dict()
    write('GLOBAL_DIESEL_DATASET_REPORT.md', ['# GLOBAL_DIESEL_DATASET_REPORT', '', f"初次发布源2011-04-06—2026-09-22；当前修订版源从2006开始。有效研究Dataset {audit['start']}—{audit['end']}，{len(f)}个有标签观察，36个特征；正式OOS {len(oos)}，严格非重叠 {r['nonoverlapping'][candidate]['n']}。", '', '每行含 date、predictionTimestamp、price、anchorReleaseDate、endDate、price_t_plus_7、return_7d、target_class、labelKnownAt、featureMaxAvailableAt、featureLatestDieselDate及所有特征。原始下载、每个请求时间/参数、SHA256、清洗异常均在data目录。', '', f'每年有效Dataset行数：`{json.dumps(byyear)}`。', f'实际目标端点跨度（日）：`{json.dumps(spans)}`。', f"排除计数：`{json.dumps(audit['skipped'])}`；先检查端点再检查特征，原因互斥。未来端点未公布的记录不是失败标签。缺失初值、发布日期异常、20观察对齐不足、连续观察缺口及WTI非正价格窗口均可能造成特征不可用。", '', '**覆盖选择限制**：仅对保留观察评估，不代表缺失/极端负价窗口的表现；未填造价格。特征相邻观察缺口≤4天，最大年龄14天；训练只看到可获得初值，不使用后来修订值。初值与现行修订版可能不同。', '', f"时间可用性检查违规数：{audit['featureAvailabilityViolations']}。端点与标签发布跨块均purge，见fold-audit.json。每日重叠不能当独立样本；非重叠与28日块bootstrap另列。", '', '这里完全没有读取V1 Dataset/Target，也未写生产缓存；Brent/WTI作为公开原料特征重新独立下载。'])
    write('BASELINE_COMPARISON_V2.md', ['# BASELINE_COMPARISON_V2', '', f'预先验证选择的唯一正式候选：**{candidate}**。', '', *table(r['overall']), '', '所有raw/Platt/isotonic路线均为同一时序测试。raw仅诊断；不能从这张测试表重新选择候选。', '', '未校准vol_historical_raw出现总体分数改善，这是可见的诊断信号；它没有通过事先验证选中的校准路线，不能把测试后挑选包装为本轮PASS。', '', '## 非重叠样本', '', *table({n:r['nonoverlapping'][n] for n in [*BASELINES,candidate]}), '', '## 28日块bootstrap：频率损失减候选损失，正值才是改善', '', '```json', json.dumps(r['blockBootstrapVsFrequency'], indent=2), '```', '', '时间块仅近似处理依赖，不消除结构性市场漂移；这里连改善区间下界也未过零。'])
    years = ['# YEAR_BY_YEAR_RESULTS', '', '2026为不完整年，不进入完整年度稳定性分母。每年全量模型指标、class recall、混淆矩阵和概率桶保存在data/backtest-results.json。', '', '| 年份 | N | 基线Brier | 候选Brier | 基线LL | 候选LL | 基线ECE | 候选ECE | 基线Acc | 候选Acc |', '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|']
    for year, models in r['byYear'].items():
        a,b=models['frequency'],models[candidate]
        years.append(f"| {year} | {b['n']} | {a['brier']:.6f} | {b['brier']:.6f} | {a['logLoss']:.6f} | {b['logLoss']:.6f} | {a['meanECE']:.6f} | {b['meanECE']:.6f} | {a['accuracy']:.3f} | {b['accuracy']:.3f} |")
    years += ['',f"完整年度同时满足增量条件：{', '.join(r['goodCompleteYears']) or '无'}；{len(r['goodCompleteYears'])}/6。"]
    write('YEAR_BY_YEAR_RESULTS.md', years)
    lines = ['# CALIBRATION_V2', '', '确实在测试前一年的校准集拟合了Platt-style多分类logistic和逐类isotonic；执行过校准不等于校准效果合格。正式候选的classwise平均ECE比历史频率更差。', '', *table({n:r['overall'][n] for n in ['frequency','vol_historical_raw','vol_historical_platt','vol_historical_isotonic']}), '', '## 55%—65%概率桶（不是产品当前概率）', '', '| 类别 | 日度重叠N | 平均预测 | 实际发生 | 非重叠N | 平均预测 | 实际发生 |', '|---|---:|---:|---:|---:|---:|---:|']
    fmt = lambda x: '—' if x is None else f'{x:.2%}'
    for c in CLASSES:
        a,b=cm['sixtyBand'][c],r['nonoverlapping'][candidate]['sixtyBand'][c]
        lines.append(f"| {c} | {a['n']} | {fmt(a['meanPredicted'])} | {fmt(a['observedFrequency'])} | {b['n']} | {fmt(b['meanPredicted'])} | {fmt(b['observedFrequency'])} |")
    lines += ['', '三类非重叠桶都少于事先要求30；不能宣布60%可靠。尤其FLAT只有1个非重叠样本，0%兑现不是精确总体估计。UP重叠153个快照并非153个独立预测事件。', '', '## 各类10个等宽可靠性桶', '', '| 类别 | 概率范围 | N | 平均预测 | 实际发生 |', '|---|---|---:|---:|---:|']
    for b in cm['buckets']:
        lines.append(f"| {b['class']} | {b['lower']:.1f}—{b['upper']:.1f} | {b['n']} | {fmt(b['meanPredicted'])} | {fmt(b['observedFrequency'])} |")
    lines += ['', '![Reliability](calibration-v2.png)', '', '点旁N为重叠快照数。图和桶用于描述，不提供假设样本独立的误差棒。正式Gate另外使用非重叠60%桶与时间块区间。']
    write('CALIBRATION_V2.md',lines)
    fig, axes=plt.subplots(1,3,figsize=(11,3.8),sharey=True)
    for ax,c in zip(axes,CLASSES):
        ax.plot([0,1],[0,1],'--',color='#a3aeba')
        bins=[b for b in cm['buckets'] if b['class']==c and b['n']]
        ax.plot([b['meanPredicted'] for b in bins],[b['observedFrequency'] for b in bins],'o-',color='#19768e')
        for b in bins: ax.annotate(str(b['n']),(b['meanPredicted'],b['observedFrequency']),xytext=(3,5),textcoords='offset points',fontsize=7)
        ax.set(xlim=(0,1),ylim=(0,1),title=c,xlabel='Mean predicted probability'); ax.grid(alpha=.15)
    axes[0].set_ylabel('Observed frequency'); fig.suptitle('Frozen V2 candidate: out-of-sample reliability (counts overlap)',fontsize=11);fig.tight_layout();fig.savefig(REPORTS/'calibration-v2.png',dpi=160);plt.close(fig)
    result=['# GLOBAL_DIESEL_FORECAST_V2_RESULT', '', '**GLOBAL_DIESEL_DATA_GATE = PASS**', f"**GLOBAL_DIESEL_MODEL_GATE = {r['gate']}**", '', '研究线：research/global-diesel-forecast-v2；基线44ad784b34996067e13059c1f15582d7d0272526。数据/目标/验证选择在正式测试前提交aa518a87ff6f7bc6c1402b6326d7d41221fae02b；最终remote-backed身份见交付清单。', '', '## 十个结论', '', '1. **Benchmark**：EIA New York Harbor Ultra-Low-Sulfur No.2 Diesel Spot (DDFUELNYH)，USD/US gallon。ICE历史许可/费用不满足本轮条件。', '2. **国际代表性**：它是实际柴油成品价格，比原油成本更贴近研究目标；但只直接观察美国纽约港，尚不能证明它代表全球柴油整体。候选页面明确标注地区。', '3. **亚洲MGO关系**：EXTERNAL_VALIDATION_LIMITED；合法可用历史未取得，所有相关性/方向/外域分数为null。没有把公路柴油与MGO视为同一商品。', f"4. **历史跨度**：可用初次发布记录2011-04-06—2026-09-22，约15.5年、3,881个柴油观察；建模Dataset {len(f)}行，正式OOS {len(oos)}行（2020—2026），非重叠{r['nonoverlapping'][candidate]['n']}。", f"5. **基线增量**：不能稳定打败。冻结候选{candidate} Brier {cm['brier']:.6f} 对 {fm['brier']:.6f}（恶化{cm['brier']/fm['brier']-1:.2%}）；log loss {cm['logLoss']:.6f} 对 {fm['logLoss']:.6f}（恶化{cm['logLoss']/fm['logLoss']-1:.2%}）。仅{len(r['goodCompleteYears'])}/6完整年满足增量条件。", f"6. **校准**：确实实施了过去数据校准，但效果不合格。候选ECE {cm['meanECE']:.6f}，频率{fm['meanECE']:.6f}。", '7. **约60%兑现**：见下表，非重叠样本不足，不能宣称可靠。', '8. **三类表现**：见召回表，FLAT严重偏弱。', '9. **真实百分比展示资格**：没有。测试后的raw路线分数较好不能替代预先冻结的校准候选，未调松Gate。', '10. **当前未来7天预测**：不输出；未生成CURRENT_GLOBAL_DIESEL_FORECAST.json或model artifact。Candidate显示“模型验证中”。', '', '## 冻结候选三类表现', '', '| 类别 | 支持N | 预测N | Precision | Recall | F1 |', '|---|---:|---:|---:|---:|---:|']
    for c,m in cm['classes'].items(): result.append(f"| {c} | {m['support']} | {m['predictedN']} | {m['precision']:.2%} | {m['recall']:.2%} | {m['f1']:.2%} |")
    result += ['', f"混淆矩阵（行真实/列预测，DOWN/FLAT/UP）：`{json.dumps(cm['confusionMatrix'])}`。", '', '| 类别 | 55—65%桶N | 平均预测 | 实际发生 | 非重叠N/发生率 |', '|---|---:|---:|---:|---|']
    for c,a in cm['sixtyBand'].items():
        b=r['nonoverlapping'][candidate]['sixtyBand'][c]
        result.append(f"| {c} | {a['n']} | {fmt(a['meanPredicted'])} | {fmt(a['observedFrequency'])} | {b['n']} / {fmt(b['observedFrequency'])} |")
    result += ['', '## 当前状态（观察，不是预测）', '', f"最近已发布纽约港柴油 {state['benchmark']['latestValue']:.3f} USD/US gallon，观察2026-09-22、发布09-23；冻结研究日距观察6天。1日{state['changes']['1d']['return']:+.2%}、7日{state['changes']['7d']['return']:+.2%}、20日{state['changes']['20d']['return']:+.2%}。20观察分位{state['percentile20Observations']:.0%}，预定规则状态 **{state['currentState']} / 正常**，不能把最近7日回落自动叫未来偏跌。非盘中实时，也非全球平均。", '', '## Gate逐项证据', '', '| 检查 | 结果 |','|---|---|']
    result += [f'| {k} | {"PASS" if v else "FAIL"} |' for k,v in r['gateChecks'].items() if k!='mgoNotContradicted']
    result += ['| MGO外域条件 | NOT_EVALUATED / EXTERNAL_VALIDATION_LIMITED（条件不适用，不是代表性通过） |', '', '## 交付与限制', '', '- 所有改动在research/global-diesel-v2内；保留main、公开页面、价格生产链、Intelligence与原V1文件。没有付费、Key、订阅或部署。', '- 最新观察只是周度发布节奏下可接受，不能宣传实时；初值发布日期仅到日粒度；原始源缺值及WTI异常窗口导致覆盖缩小；MGO代表性未证。', '- 重跑、依赖、完整测试、浏览器证据见README.md与TEST_RESULTS.md；文件校验见reproducibility.json。', '- 已停止建模/调参。等待人工确认；不合并、不发布。']
    write('GLOBAL_DIESEL_FORECAST_V2_RESULT.md',result)
    # No current probabilities/model serialization after FAIL.
    if r['gate'] != 'PASS':
        assert not (REPORTS/'CURRENT_GLOBAL_DIESEL_FORECAST.json').exists()
        assert not (ROOT/'model-artifact.joblib').exists()
        dump(ROOT/'ui/candidate-status.json', {'gate': 'FAIL', 'status': 'VALIDATING', 'probabilities': None, 'contract': None, 'currentState': state, 'reason': 'Historical validation did not meet the frozen probability gate.'})
