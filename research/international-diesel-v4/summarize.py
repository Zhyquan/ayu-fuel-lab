"""Generate evidence reports, descriptive state, and research-only diagnostics."""
import hashlib
import json
import math
import numpy as np
import pandas as pd
from prepare import ROOT, SPEC, save_json
from backtest import load, pooled, evaluate_fold, records, columns
from evaluate import classify, metrics

def read(name):return json.loads((ROOT/name).read_text())
def write(name,content):(ROOT/name).write_text(content.strip()+'\n')
def number(x):return 'N/A' if x is None else f'{x:.4f}'
def percent(x):return 'N/A' if x is None else f'{100*x:.2f}%'
def table(headers,rows):
    return '\n'.join(['|'+ '|'.join(headers)+'|','|'+'|'.join(['---']*len(headers))+'|']+['|'+'|'.join(map(str,row))+'|' for row in rows])
def metric_table(values):
    return table(['方案','n','Brier','Log Loss','ECE','Accuracy','Macro F1','DOWN/FLAT/UP recall'],
      [[name,m['n'],number(m['brier']),number(m['logLoss']),number(m['ece']),percent(m['accuracy']),number(m['macroF1']),'/'.join(percent(v) for v in m['recalls'])] for name,m in values.items()])

def wilson(k,n):
    if not n:return [None,None]
    z=1.96;p=k/n;center=(p+z*z/(2*n))/(1+z*z/n);width=z*math.sqrt(p*(1-p)/n+z*z/(4*n*n))/(1+z*z/n)
    return [center-width,center+width]

def state(index):
    times=pd.to_datetime(index[['nyh_availableAt','usgc_availableAt','eu_availableAt']].max(axis=1),utc=True)
    eligible=index[index.aidi_level.notna() & (times<=pd.Timestamp(SPEC['asOf']))]
    date=eligible.index[-1]; values={};percentiles={}
    for h in [1,4,13]:
        series=np.log(index.aidi_level/index.aidi_level.shift(h))
        value=float(series.loc[date]);past=series.loc[series.index<date].dropna()
        values[str(h)+'w']=value;percentiles[str(h)+'w']=float((past<value).mean())
    score=float(np.median(list(percentiles.values())));direction='WEAK' if score<1/3 else 'STRONG' if score>2/3 else 'NEUTRAL'
    value={'status':'RESEARCH_DESCRIPTIVE','source':'AYU_INTERNATIONAL_DIESEL_V4','asOf':SPEC['asOf'],
      'observationWeek':str(date.date()),'weekEnd':str((date+pd.Timedelta(days=6)).date()),
      'sourceAvailableAt':times.loc[date].isoformat(),'aidiLevel':float(index.loc[date,'aidi_level']),
      'currentState':direction,'returns':values,'historicalPercentiles':percentiles,'statePercentile':score,
      'isPrediction':False,'probabilities':None,'dataGate':'PASS','modelGate':'FAIL',
      'revisionEvidence':'EC formal country series; sparse archive comparison; not complete historical vintage proof'}
    save_json(ROOT/'CURRENT_AIDI_STATE.json',value)
    save_json(ROOT/'ui/current-state.json',value)
    history=[{'week':str(d.date()),'level':float(v)} for d,v in eligible.aidi_level.tail(26).items() if np.isfinite(v)]
    save_json(ROOT/'ui/history.json',history)
    return value

def currency(index,threshold):
    fx=pd.read_csv(ROOT/'data/raw/DEXUSEU-valid.csv');fx['date']=pd.to_datetime(fx.observation_date)
    fx['week']=fx.date-pd.to_timedelta(fx.date.dt.weekday,unit='D')
    weekly=fx.groupby('week').DEXUSEU.mean().reindex(index.index)
    primary=index.aidi_return;converted=primary+.5*np.log(weekly/weekly.shift())
    valid=primary.notna()&converted.notna()
    result={'primary':'LOCAL_CURRENCY','alternative':'USD_CONVERTED_DESCRIPTIVE_ONLY','fx':'FRED DEXUSEU, current vintage, weekday arithmetic mean USD per EUR',
      'n':int(valid.sum()),'correlation':float(primary[valid].corr(converted[valid])),
      'classAgreement':float((classify(primary[valid],threshold)==classify(converted[valid],threshold)).mean()),
      'primaryStd':float(primary[valid].std()),'convertedStd':float(converted[valid].std()),'usedForSelection':False,'pitModelClaim':False}
    save_json(ROOT/'results/currency-sensitivity.json',result);return result

def delay_sensitivity(d,selection):
    full=pd.read_csv(ROOT/'data/weekly-dataset.csv',index_col='week',parse_dates=['week'])
    col=columns(d,'composite');shifted=d.copy()
    shifted[col]=full[col].shift().reindex(d.index)
    shifted['past_direction_return']=full.past_direction_return.shift().reindex(d.index)
    shifted['featureAvailableAt']=pd.to_datetime(full.featureAvailableAt,utc=True).shift().reindex(d.index)
    rows=[]
    for year in SPEC['testYears']:
        _,p,f,y,_=evaluate_fold(shifted,year,selection['threshold'],'composite',selection['selections']['composite'])
        key=selection['selections']['composite']['route']+'/'+selection['selections']['composite']['calibrator']
        p['composite']=p.pop(key);rows+=records(f,y,p,year)
    result={'featureLagWeeks':2,'selectionChanged':False,'n':len(rows),'pooled':pooled(rows)}
    save_json(ROOT/'results/publication-delay-sensitivity.json',result);return result

def paired_intervals(rows):
    y=np.array([r['truth'] for r in rows]);names=['us','eu','baseline/frequency'];rng=np.random.default_rng(4001);output={}
    pred=lambda n:np.asarray([r['probabilities'][n] for r in rows])
    def losses(p):return np.c_[((p-np.eye(3)[y])**2).sum(axis=1),-np.log(np.clip(p[np.arange(len(y)),y],1e-6,1))]
    main=losses(pred('composite'));length=len(y)
    starts=rng.integers(0,length,size=(2000,math.ceil(length/8)))
    indices=((starts[:,:,None]+np.arange(8))%length).reshape(2000,-1)[:,:length]
    for name in names:
        differences=losses(pred(name))-main
        draws=differences[indices].mean(axis=1)
        output[name]={'absoluteImprovement':differences.mean(axis=0).tolist(),'95pctBlockBootstrapCI':np.quantile(draws,[.025,.975],axis=0).T.tolist()}
    save_json(ROOT/'results/paired-improvement-ci.json',{'blockObservedWeeks':8,'draws':2000,'seed':4001,'comparisons':output})
    return output

def generate():
    data=read('data/DATA_AUDIT.json');result=read('results/model-result.json');validation=read('results/validation.json');binary=read('results/binary.json');rows=read('results/test-predictions.json')
    index=pd.read_csv(ROOT/'data/weekly-index.csv',index_col='week',parse_dates=['week'])
    for col in [c for c in index if c.endswith('_availableAt')]:index[col]=pd.to_datetime(index[col],utc=True)
    d=load();selection=result['selection'];threshold=selection['threshold'];scores=result['pooled'];main=scores['composite']
    s=state(index);fx=currency(index,threshold);delay=delay_sensitivity(d,selection);ci=paired_intervals(rows)
    names=['DOWN','FLAT','UP'];buckets=[]
    for c,name in enumerate(names):
        b=main['sixtyBuckets'][c];interval=wilson(round((b['realized'] or 0)*b['n']),b['n']);buckets.append([name,b['n'],percent(b['meanForecast']),percent(b['realized']),f'{percent(interval[0])}–{percent(interval[1])}'])
    independent=len(d);test_counts=np.bincount([r['truth'] for r in rows],minlength=3).tolist()
    sizes=table(['Test year','Train','Calibration','Test','Train D/F/U','Cal D/F/U','Test D/F/U'],[[v['year'],v['sizes']['train'],v['sizes']['calibration'],v['sizes']['test'],v['sizes']['trainCounts'],v['sizes']['calCounts'],v['sizes']['testCounts']] for v in result['yearByYear']])
    write('AIDI_DATASET_REPORT.md',f'''# 独立周样本

US/EU共同区间 {data['commonStart']}–{data['commonEnd']}，{data['commonYears']:.2f}年。EU本身{data['euStart']}–{data['euEnd']}。完整calendar grid {data['weeklyRows']}周；有独立未来一周标签{data['usableLabels']}；去掉13w特征/已知方向缺失后可建模{independent}周。Test共{main['n']}个独立周，D/F/U={test_counts}。没有daily扩样，也没有同一目标周重复行。

{sizes}

Train是扩展重复利用历史，不能把各fold Train相加宣称独立样本。Calibration用前一calendar year且purge尾部未发布标签。2026为部分年度。实际边界timestamp见model-result.json，原始CSV不能用sourceDate冒充availableAt。

EU覆盖：{data['euCoverageCounts']}；不足20个matching国家的周不作为标签。EIA 769个原始release文件，价格共同区间内{data['eiaWeeks']}周可对齐；2011早期行业feature缺失保留，特征层Train-median imputation，不生成假库存报价。''')
    threshold_rows=[]
    for c in validation['thresholdCandidates']:
        matches=[v for v in validation['entries'] if v['region']=='composite' and v['threshold']==c['threshold']]
        threshold_rows.append([percent(c['threshold']),c['eligible'],number(c['choice']['validationRatio']),c['choice']['route']+'/'+c['choice']['calibrator'],'; '.join(str(v['sizes']['trainCounts'])+' / '+str(v['sizes']['testCounts']) for v in matches)])
    write('AIDI_FLAT_THRESHOLD_DECISION.md',f'''# FLAT 阈值

冻结θ = ±{percent(threshold)} log return，约等于同幅度周涨跌；边界属于FLAT。选择发生于{selection['frozenAt']}，Test未打开、日本未使用。0.75%对国际两地区参考指数是小幅周变动带，并不是中国调价阈值。

{table(['候选','类别约束通过','Validation normalized proper score','最佳route/cal','2016/17 Train D/F/U / Validation D/F/U'],threshold_rows)}

类别规则和选择式预写spec；只在Train/Validation选择。较窄band FLAT过少、较宽band会吞掉过多方向样本。未用Test class比例回头调整。Test D/F/U={test_counts}，仅报告。''')
    write('AIDI_BASELINE_COMPARISON.md',f'''# 基线与Composite增量

同一AIDI Target与同一独立Test周。区域路线各自Validation选型，非弱化基线。频率用mature Train+Jeffreys smoothing；常量/延续/反转预设soft概率ε=.02，不以Test调softness。延续只用当时已知T−1方向。

{metric_table(scores)}

最佳简单基线（按各proper score分别）Brier={result['bestSimpleBrier']}，Log Loss={result['bestSimpleLogLoss']}。

{table(['比较对象','Brier改善','LL改善','Brier gain 95%CI','LL gain 95%CI'],[[k,number(v['absoluteImprovement'][0]),number(v['absoluteImprovement'][1]),str(v['95pctBlockBootstrapCI'][0]),str(v['95pctBlockBootstrapCI'][1])] for k,v in ci.items()])}

正值代表Composite改善；8个观测周block、2000次paired bootstrap只用于不确定度，不改变模型。区域正分数不是来自不同Target。''')
    calrows=[]
    route=selection['selections']['composite']['route']
    for entry in validation['entries']:
        if entry['region']=='composite' and entry['threshold']==threshold:
            for method in SPEC['calibrators']:
                m=entry['metrics'][route+'/'+method];calrows.append([entry['year'],method,number(m['brier']),number(m['logLoss']),number(m['ece'])])
    reliability=[];truth=np.array([r['truth'] for r in rows]);p=np.array([r['probabilities']['composite'] for r in rows])
    for c,name in enumerate(names):
        for low in np.arange(0,1,.1):
            mask=(p[:,c]>=low)&(p[:,c]<low+.1);n=int(mask.sum());k=int((truth[mask]==c).sum());interval=wilson(k,n)
            reliability.append([name,f'{low:.1f}–{low+.1:.1f}',n,percent(float(p[mask,c].mean())) if n else 'N/A',percent(k/n) if n else 'N/A',f'{percent(interval[0])}–{percent(interval[1])}'])
    write('AIDI_CALIBRATION_REPORT.md',f'''# 校准

Primary冻结：{route} + {selection['selections']['composite']['calibrator']}。Platt为各class的regularized sigmoid后归一化，Isotonic各class单调拟合后归一化。没有用Test fit/calibration selection。

{table(['Validation year','方法','Brier','Log Loss','ECE'],calrows)}

Test top-label ECE={number(main['ece'])}；class ECE={main['classECE']}；冻结calibration门槛通过={result['gateChecks']['calibration']}。ECE正常不自动证明有预测增量或覆盖每个概率区间。

## 55–65% 桶

{table(['class','n','平均预测','实际兑现','Wilson95%CI'],buckets)}

冻结要求每class n≥30且均值与兑现差≤10pp；无样本/少样本不能声称“60%已验证”。60%桶通过={result['gateChecks']['sixtyBuckets']}。

## 全概率可靠性表

{table(['class','概率bin','n','平均预测','实际率','Wilson95%CI'],reliability)}''')
    yearrows=[]
    for v in result['yearByYear']:
        m=v['metrics']['composite'];bb=v['metrics'][result['bestSimpleBrier']];bl=v['metrics'][result['bestSimpleLogLoss']]
        yearrows.append([str(v['year'])+(' partial' if v['year']==2026 else ''),m['n'],number(m['brier']),number(m['logLoss']),percent(m['accuracy']),number(m['ece']),number(bb['brier']-m['brier']),number(bl['logLoss']-m['logLoss']),number(v['metrics']['us']['brier']),number(v['metrics']['eu']['brier'])])
    write('AIDI_YEAR_BY_YEAR.md',f'''# 逐年稳定性

{table(['年度','n','Brier','LL','Accuracy','ECE','vs baseline Brier gain','vs baseline LL gain','US-only Brier','EU-only Brier'],yearrows)}

相对pooled best simple baseline，完整Test年份中同时不退化 {result['goodFullYears']}/8。Composite同时胜US-only年份{result['compositeBetterYears']['us']}/8，胜EU-only {result['compositeBetterYears']['eu']}/8。2026部分年不计入全年多数门槛。所有坏年份保留。''')
    japan=read('data/japan-access-audit.json')
    assert japan['status']=='UNAVAILABLE', 'New Japan evidence requires a separate frozen external assessment'
    save_json(ROOT/'results/asia-validation.json',{'status':'UNAVAILABLE','modelFreezeSha256':hashlib.sha256((ROOT/'results/MODEL_FREEZE.json').read_bytes()).hexdigest(),
      'n':0,'contemporaneousCorrelation':None,'lagPlus1Correlation':None,'lagMinus1Correlation':None,'directionAgreement':None,'modelAuxiliaryBrier':None,'modelAuxiliaryLogLoss':None,
      'usedForTraining':False,'usedForThreshold':False,'supportsProductValue':'NOT_DEMONSTRATED','ASIA_MGO_VALIDATION_STATUS':'UNAVAILABLE'})
    write('ASIA_VALIDATION_REPORT.md',f'''# 亚洲外部验证

模型已冻结，见MODEL_FREEZE.json。JAPAN_DIESEL_WEEKLY = UNAVAILABLE；ASIA_MGO_VALIDATION_STATUS = UNAVAILABLE。

官方METI周序列历史从1990-08-27、Monday survey / Wednesday14:00 JST发布，假期可Thursday。浏览器读到2026-09-16版本链接，但普通HTTP两种客户端403、浏览器下载超时且文件0字节。无法解析原始周值，不把页面存在当作可用数据。另下载的北海道政府档案实际是地区月初摘录，已拒绝，不扩成全国周数据。

|检查|n|结果|
|---|---:|---|
|同期收益相关 / direction agreement|0|N/A|
|AIDI领先日本1周（lag+1）|0|N/A|
|日本领先AIDI1周（lag−1）|0|N/A|
|模型概率对日本辅助Brier/LL|0|N/A|

无法判断领先/同步关系或是否脱节；未知不能当PASS，亦不能写成已证明无相关。日本零售轻油含税、补贴与流通环节，不是MGO。日本数据/结果没有参与threshold、特征、模型或校准选择；没有为PASS设置相关门槛。当前证据**不支持亚洲产品代表性声明**。

原始访问证据：data/japan-access-audit.json。法规与许可见V4_DATA_SOURCE_AUDIT.md。''')
    bm=binary['pooled']['binary'];freq=binary['pooled']['baseline/frequency']
    write('V4_BINARY_DIAGNOSTIC.md',f'''# 明显涨跌二分类诊断

主三分类FAIL后执行；沿用θ={percent(threshold)}，回溯排除future FLAT，**运行时无法提前知道哪些周应排除**。不能作为上线过滤器。

Binary仅用Validation选 {binary['selection']['selected']['route']} + {binary['selection']['selected']['calibrator']}，日本未使用。Test n={bm['n']}，DOWN/UP独立方向样本。主要结果Brier={number(bm['brier'])}、LL={number(bm['logLoss'])}、accuracy={percent(bm['accuracy'])}、ECE={number(bm['ece'])}。频率baseline Brier={number(freq['brier'])}、LL={number(freq['logLoss'])}。

{metric_table(binary['pooled'])}

两个proper score均胜频率={bm['brier']<freq['brier'] and bm['logLoss']<freq['logLoss']}。这只是条件方向诊断；主三分类同时存在概率覆盖/类别塌缩/地区增量/亚洲证据门槛，不可把“排除难预测FLAT”的结果替代主Target。''')
    def gain(name,key):return (scores[name][key]-main[key])/scores[name][key]
    lines=[
      '1. 美国：EIA/FRED/ALFRED NYH DDFUELNYH + USGC DDFUELUSGULF；初始vintage日价→真实完整周。',
      '2. 欧洲：EC Weekly Oil Bulletin EU27柴油WITHOUT TAX国家series，匹配国家log return中位数。',
      f'3. 共同历史{data["commonYears"]:.2f}年，{data["weeklyRows"]}calendar周；建模{independent}个独立周，Test{main["n"]}周。',
      '4. 美国首次vintage可审计；欧洲162单元格/6周抽样发现1处实质修订，最大EU单周median影响0.1105%，AIDI影响0.0552%；无全历史vintage等值保证。保守发布lag与另加1周敏感性控制时间风险，剩余迟报/修订风险必须保留。',
      '5. AIDI log return = 0.5×US(两市场均值log return)+0.5×EU(国家log return中位数)，level从100链式累积。',
      '6. International指美国+欧洲两独立区域；不是全球消费加权或亚洲/MGO船燃指数。',
      '7. 日本同期/±1周相关性均N/A，n=0，官方文件403/下载失败；没有制造相关数。',
      f'8. 没有得到满足全部Gate的稳定未来一周预测增量：总体proper-score gain和逐年证据见下表。只有{result["goodFullYears"]}/8完整年同时不退化。',
      f'9. 相对US-only：Brier相对改善{percent(gain("us","brier"))}，LL相对改善{percent(gain("us","logLoss"))}。负值即更差。',
      f'10. 相对EU-only：Brier相对改善{percent(gain("eu","brier"))}，LL相对改善{percent(gain("eu","logLoss"))}。',
      f'11. 相对最佳简单baseline：Brier改善{percent(gain(result["bestSimpleBrier"],"brier"))}，LL改善{percent(gain(result["bestSimpleLogLoss"],"logLoss"))}；区间见baseline报告。',
      f'12. Brier={number(main["brier"])}，Log Loss={number(main["logLoss"])}（Brier是三class误差平方之和，未除3）。',
      f'13. ECE={number(main["ece"])}，class ECE={main["classECE"]}，预设calibration条件={result["gateChecks"]["calibration"]}；不代表60%覆盖或MODEL合格。',
      '14. 55–65%兑现见下表；样本不足时结论为未验证。',
      f'15. FLAT recall={percent(main["recalls"][1])}，DOWN/UP recall={percent(main["recalls"][0])}/{percent(main["recalls"][2])}；二分类用不同条件样本，不能仅凭它变好就断言FLAT是唯一难点。',
      f'16. 明显涨跌Binary n={bm["n"]}，Brier={number(bm["brier"])}、LL={number(bm["logLoss"])}；分别较频率改善{percent((freq["brier"]-bm["brier"])/freq["brier"])} / {percent((freq["logLoss"]-bm["logLoss"])/freq["logLoss"])}。只作诊断，无法成为上线资格。',
      '17. 亚洲产品价值未验证，不是已证实完全脱节；日本与MGO缺少可分析数据。',
      '18. 没有资格向真实用户展示未来趋势百分比。候选只显示模型验证中；研究回测概率不能当当前预测。',
      '19. MODEL FAIL：CURRENT_AIDI_FORECAST与model artifact不生成。描述性CURRENT_AIDI_STATE单独保存；不是预测。']
    checks=table(['Gate检查','通过'],[[name,ok] for name,ok in result['gateChecks'].items()])
    write('AYU_INTERNATIONAL_DIESEL_V4_RESULT.md',f'''# AYU_INTERNATIONAL_DIESEL_FORECAST_V4_001

INTERNATIONAL_DIESEL_DATA_GATE_V4 = {data['INTERNATIONAL_DIESEL_DATA_GATE_V4']}

INTERNATIONAL_DIESEL_MODEL_GATE_V4 = {result['INTERNATIONAL_DIESEL_MODEL_GATE_V4']}

DATA PASS为有剩余修订风险的研究准入，见source audit。与生产资格不同。模型、threshold、primary币种均未用Test改选；日本未用于任何训练/选择。

## 19项回答

{chr(10).join(lines)}

{metric_table(scores)}

{table(['class','55–65% n','平均预测','实际兑现','Wilson95%CI'],buckets)}

## Gate逐项

{checks}

## 描述状态与敏感性

最新可发布完整观测周{s['observationWeek']}–{s['weekEnd']}，当前{s['currentState']}，可得时间{s['sourceAvailableAt']}。1/4/13w={s['returns']}；历史percentile={s['historicalPercentiles']}。源日期不等于页面计算日，不能称今天即时市场状态。

USD转换敏感性：n={fx['n']}，与Primary收益相关={number(fx['correlation'])}，三分类agreement={percent(fx['classAgreement'])}；是current FX描述分析，不训练、不重选Primary。

额外1周输入发布延迟（沿用冻结模型）：Brier={number(delay['pooled']['composite']['brier'])}，LL={number(delay['pooled']['composite']['logLoss'])}；未重新选择threshold/route/calibration。

## 交付与边界

本目录含全部14份要求报告/状态、原始ZIP/XLS/CSV与哈希、Validation冻结、逐周预测、binary、校准/年份表、代码和测试。`REPRODUCE.md`提供离线命令。Candidate位于ui/，读取复制的公开参考价格快照，绝不改动价格服务或公开Sites。

没有merge main、Pages部署、关联生产项目读写或连接、受限生产服务操作、付费资源。research branch可远程核对的SHA由目录外REMOTE_IDENTITY.json / DELIVERY.md记录。完成后停止，等待人工确认。''')
    # Research figure is a standalone artifact, never product forecast UI.
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    fig,axes=plt.subplots(1,3,figsize=(11,3.4),sharex=True,sharey=True)
    for c,ax in enumerate(axes):
        ax.plot([0,1],[0,1],color='#a5afb4',linestyle='--')
        for low in np.arange(0,1,.1):
            mask=(p[:,c]>=low)&(p[:,c]<low+.1)
            if mask.any():ax.scatter(p[mask,c].mean(),(truth[mask]==c).mean(),s=max(12,int(mask.sum())*.7),color='#267f8c')
        ax.set(title=names[c],xlabel='Mean forecast',xlim=(0,1),ylim=(0,1));ax.grid(alpha=.15)
    axes[0].set_ylabel('Observed frequency');fig.suptitle('AIDI V4 — research holdout calibration; not a current forecast')
    fig.tight_layout();fig.savefig(ROOT/'results/reliability.png',dpi=160);plt.close(fig)

if __name__=='__main__':generate()
