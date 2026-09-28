"""Report generation only; final scores are read only after explicit evaluation."""
import json,shutil
import numpy as np
import pandas as pd
from common import ROOT,V4,SETTINGS,save,sha,classify,now,round_probabilities
from prepare import load_dataset
from experiment import gain,fold
from model import columns

def md(name,body):(ROOT/name).write_text(body.rstrip()+'\n')
def number(value,digits=4):return 'N/A' if value is None else f'{value:.{digits}f}'
def pct(value):return 'N/A' if value is None else f'{100*value:.2f}%'
def table(headers,rows):
    return '| '+' | '.join(headers)+' |\n| '+' | '.join(['---']*len(headers))+' |\n'+''.join('| '+' | '.join(str(v) for v in row)+' |\n' for row in rows)

def data_reports():
    audit=json.loads((ROOT/'data/LEADING_SIGNAL_DATA_AUDIT.json').read_text())
    integrity=json.loads((ROOT/'data/TARGET_FREEZE_INTEGRITY.json').read_text())
    cot=audit['cftc'];eia=audit['eia']
    md('V5_LEADING_SIGNAL_DATA_AUDIT.md',f"""# V5 leading signal data audit

V5_DATA_GATE = {audit['V5_DATA_GATE']}

M1/M2 machine-readable audit precedes development. Exact raw bytes, request URL, HTTP200 and SHA256 are retained. V4 Target / threshold integrity is {integrity['gate']}; its selection was frozen {integrity['selectionFrozenAt']}, before test freeze {integrity['testFrozenAt']}. Theta stays 0.0075 log return; no threshold search occurs in V5.

## CFTC

[CFTC PRE Disaggregated Futures Only](https://publicreporting.cftc.gov/Commitments-of-Traders/Disaggregated-Futures-Only/72hh-3qpy): anonymous selected-field query for market 022651 / NYME / FutOnly returned {cot['rawRows']} rows. Audit raw history {cot['rawStart']}–{cot['rawEnd']}; primary {cot['primaryStart']}–{cot['primaryEnd']}, {cot['primaryRows']} records, {cot['quarantined']} quarantined report dates. Old Heating Oil rows remain audit-only.

[Official release schedule](https://www.cftc.gov/MarketReports/CommitmentsofTraders/ReleaseSchedule/index.htm): Tuesday observation normally released Friday15:30ET; holidays delay. Regular history uses next-week Friday16:00ET, deliberately one cutoff later. Shutdown / ION exceptions are explicitly quarantined or assigned the documented actual issue date plus next midnight. See CFTC_ULSD_CONTINUITY_AUDIT and V5_INFORMATION_CUTOFF_SPEC.

**The current PRE historical snapshot is not a full initial-vintage archive.** CFTC can correct data and reclassify traders. No ULSD correction was identified in the reviewed official special notices; this does not prove none ever happened. Conservative timestamps control known release delays, not unknown historical corrections. Inherited EU revision / exceptional delay risk also remains.

[Government data copyright policy](https://www.cftc.gov/WebPolicy/index.htm): CFTC government information is public domain with acknowledgement requested; no seal or private licensed material reused. No key, paid feed, purchase or new resource.

## EIA

[Original WPSR dated archives](https://www.eia.gov/petroleum/supply/weekly/archive/): inherited raw archive ZIP hash verified; first observation column of each original release only. {eia['rows']} report weeks, {eia['start']}–{eia['end']}. Stocks million barrels; production/inputs thousand barrels/day; utilization percent. Exact dated release + next New York midnight. This preserves release records and holiday dates; not a claim original archives can never be corrected.

Inventory seasonal baseline: preceding five calendar years, within +/-3 ISO weeks, only earlier years and already released reports. Every record's reference years are saved; no current/future-year five-year average. Calendar gaps are not transformed into one-week changes. Dataset imputation is fit on Train only; it never invents an underlying inventory quote.

## Admission and coverage

{audit['datasetRows']} weekly snapshots; {audit['modelableRows']} label/core-feature eligible. Valid recent source coverage: CFTC {audit['sourceCoverage']['cftc']}/{audit['datasetRows']}; EIA {audit['sourceCoverage']['eia']}/{audit['datasetRows']}. A report can supply an available level while its change feature remains unavailable. Missing/stale sources are explicit NaN, with older actual source IDs retained only up to 21 days.

{table(['Data check','Pass'],[(k,v) for k,v in audit['gateChecks'].items()])}

Data PASS is research admission under disclosed residual vintage risks. It neither certifies every archived number equals its first publication nor grants probability/product deployment.
""")
    md('V5_FEATURES.md',"""# V5 candidate features and limits

Candidates: GROUP A price/momentum/crude/season; GROUP B regional divergence; GROUP C eight normalized CFTC features; GROUP D four inventory and six refinery features. No news, LLM, war, OPEC score or Japan/MGO value enters the matrix.

CFTC: managedMoneyNetShare=(long-short)/OI; changes are differences of normalized shares at exact calendar lags. Producer/merchant and swap net shares similarly normalized. OI change is OI/OI_previous-1. Managed money gross=(long+short+2*spreading)/OI: spreading contributes one long and one short leg. Not a count of all unique traders.

Inventory: 1/4w level changes,4w percentage change,past-season zscore. Refinery: utilization level and1/4w changes,production1/4w changes,inputs4w change. No absolute crack conversion; upstream crude returns remain simple predictors.

"""+table(['Group','Features'],[
 ('A/B',', '.join(SETTINGS['priceBase'])),('CFTC',', '.join(SETTINGS['cftcFeatures'])),
 ('Inventory',', '.join(SETTINGS['inventoryFeatures'])),('Refinery',', '.join(SETTINGS['refineryFeatures']))])+"""
AIDI candidate maximum28 inputs, US expert maximum26, EU expert7; Regional Ensemble union maximum30. Regional experts retain13w volatility and prune the redundant4w volatility before development to satisfy the union cap. Hard cap30 applies to the full chosen input union. One preset configuration per Logistic or shallow HistGradientBoosting; no large search. The final selected list is frozen in V5_PREREGISTERED_PLAN. Old V4's original38-feature baseline is retained as a named reference exception; it cannot become the V5 winner.

All features retain source/value/observedAt/availableAt provenance, verified before fitting. Train-only median imputation and scaling. Unknown underlying records remain missing.
""")
    data=load_dataset()
    sizes=[]
    for year in SETTINGS['developmentYears']:
        tr,ca,fu=fold(data,year)
        sizes.append([year,len(tr),len(ca),len(fu),np.bincount(classify(tr.target),minlength=3).tolist(),
          np.bincount(classify(ca.target),minlength=3).tolist(),np.bincount(classify(fu.target),minlength=3).tolist()])
    md('V5_DATASET_REPORT.md',f"""# V5 independent weeks

{audit['datasetRows']} calendar snapshots (including unlabelled inference tail), {audit['modelableRows']} eligible independent target weeks; primary starts2013-06. Development accessible rows through2021: {len(data)}. Each target week is one observation, never expanded into daily labels.

{table(['Validation year','Train','Calibration','Validation','Train D/F/U','Cal D/F/U','Val D/F/U'],sizes)}

Train rows recur across expanding development folds and must not be summed as independent samples. Primary freezes next-week V4 LOCAL-CURRENCY AIDI, theta0.0075. Final dates are2022-01-01..2025-12-31, complete target weeks only;2026 is excluded from selection and final scores.

Exact dataset SHA256: {sha(ROOT/'data/dataset.csv')}

Final counts will be appended only after registered unlock. Previous V4 exposure to2022–2025 is disclosed: this is a V5 selection lock, not historically unseen data.
""")

def development_reports(dev):
    c=dev['selection'];matched=dev['matchedAblation']
    rows=[]
    for group,item in matched.items():
        m=item['metrics'];g=gain(m,matched['BASE']['metrics'])
        rows.append([group,number(m['brier']),number(m['logLoss']),pct(g['brier']),pct(g['logLoss']),item['admitted']])
    md('V5_ABLATION_REPORT.md',"""# Development-only ablation

Same architecture, model family and calibration settings; only signal group changes. 2017–2020 rolling Validation, no2022+ row. A standalone group needs >=0.5% gain on both proper scores versusBASE; BOTH requires incremental >=0.5% on both scores againstCFTC and againstEIA. This rule was set before development.

"""+table(['Signals','Brier','Log Loss','Brier gain vsBASE','LL gain vsBASE','Admitted'],rows)+f"""
Selected group: {c['group']}. EIA groups not proving increment are excluded; availability does not force retention. These are matched development estimates, not final causal contribution or trading value.
""")
    config_rows=[]
    for arch in ['AIDI_HURDLE','REGIONAL_EXPERT']:
        entries=[v for v in dev['candidates'] if v['config']['architecture']==arch and v['groupAdmission']]
        best=min(entries,key=lambda v:v['metrics']['validationSelectionScore'])
        config_rows.append([arch,best['config'],number(best['metrics']['brier']),number(best['metrics']['logLoss'])])
    md('V5_DEVELOPMENT_REPORT.md',f"""# Development winner

{dev['candidateCount']} preset candidates =4 groups x2 architectures x2 model families x2 StageA calibration methods x2 StageB methods. Each family has one configuration; StageA/B share the family to keep search small. No final labels/scores enter pruning, threshold, calibration or architecture selection.

{table(['Architecture','Best admitted configuration','Brier','Log Loss'],config_rows)}

Frozen winner: {c}. Mean per-year normalized proper-score objective {number(dev['selectionMetrics']['validationSelectionScore'])}; {dev['selectionMetrics']['n']} independent validation targets. AUC, accuracy and ECE are reported, not substituted after selection.

V4 best single-stage reference, same V5 development weeks: Brier {number(dev['v4BestBaseline']['brier'])}, LL {number(dev['v4BestBaseline']['logLoss'])}. Matched-feature direct three-class reference: {number(dev['matchedDirectThreeClass']['brier'])}/{number(dev['matchedDirectThreeClass']['logLoss'])}. Neither reference is an architecture candidate or licenses dropping failing holdout years.

Regional experts train regional US/EU labels at the fixed0.0075 band; calibrate each region only on its pre-validation year; average probabilities50/50. This mixture is a transparent predictive approximation, not a mathematical identity for the class probability of an average return. All final scores and StageA/B diagnostics use the unchanged **AIDI** target. Own-region probabilities must demonstrate usefulness on that target.

Final fitting remains fixed Train through2020 -> Calibration2021 ->2022–2025. No final-year refitting or recalibration. Full settings and hashes are preregistered before unlock.
""")
    for stage,title in [('stageA','MOVE_CALIBRATION_REPORT.md'),('stageB','DIRECTION_CALIBRATION_REPORT.md')]:
        calkey='calA' if stage=='stageA' else 'calB'
        rows=[]
        for method in ['platt','isotonic']:
            match={**c,calkey:method}
            v=next(v for v in dev['candidates'] if v['config']==match)
            m=v[stage]
            rows.append([method,m['n'],number(m['brier']),number(m['logLoss']),number(m['auc']),number(m['ece'])])
        md(title,f"""# {stage} calibration

Selected {c[calkey]} in Development only. Fits use chronological prior-year Calibration; evaluation uses the subsequent held-out Development year. StageB fits only historical MOVE labels and predicts **all future rows** before any scoring subset.

{table(['Method','n','Binary Brier','Log Loss','AUC','ECE'],rows)}

Binary Brier is mean(p-y)^2, not the two-column sum; final multiclass Brier is the sum across three classes. For Regional Expert, calibrated regional hurdles are mixed50/50 and StageA/B diagnostics score reconstructed AIDI-facing MOVE and conditional direction probabilities. This distinction is explicit.

Final calibration evidence will be appended after registered unlock. No confidence sharpening, temperature scaling or manual probability stretching.
""")
    rows=[]
    for v in dev['featureContribution']:
        g=v['matchedRemovalGain']
        rows.append([v['group'],v['used'],pct(g['brier']) if g else 'Not retained',pct(g['logLoss']) if g else 'Not retained'])
    md('V5_FEATURE_CONTRIBUTION.md',"""# Development-only contribution

The selected architecture/family/calibration is kept fixed; entire groups are removed and re-fit on the same chronological development folds. Positive gain means the full selected model has lower loss than the model without that group. This is predictive ablation evidence, not causal attribution. No impurity importance or holdout feature pruning.

"""+table(['Removed group','Used in winner','Brier gain of retaining group','LL gain of retaining group'],rows)+"""
CFTC's increment must be reported at Development evidence level. Inventory/refinery availability was verified; absence of admitted increment leads to exclusion. Price and regional groups retain information, but small matched differences cannot identify a universal dominant economic mechanism. Final results cannot be used to change these inputs.
""")

def current_state():
    p=pd.read_csv(V4/'data/weekly-index.csv',index_col='week',parse_dates=['week'])
    available=p[['nyh_availableAt','usgc_availableAt','eu_availableAt']].apply(lambda s:pd.to_datetime(s,utc=True)).max(axis=1)
    usable=p[p.aidi_level.notna()&(available<=pd.Timestamp(SETTINGS['asOf']))]
    week=usable.index[-1];returns={};percentiles={}
    for h in [1,4,13]:
        values=np.log(p.aidi_level/p.aidi_level.shift(h))
        returns[str(h)+'w']=float(values.loc[week]);prior=values.loc[values.index<week].dropna()
        percentiles[str(h)+'w']=float((prior<=values.loc[week]).mean())
    rank=float(np.median(list(percentiles.values())))
    state='STRONG' if rank>2/3 else 'WEAK' if rank<1/3 else 'NEUTRAL'
    value={'status':'RESEARCH_DESCRIPTIVE','source':'AYU_INTERNATIONAL_DIESEL_V5','asOf':SETTINGS['asOf'],
       'observationWeek':str(week.date()),'weekEnd':str((week+pd.Timedelta(days=6)).date()),'sourceAvailableAt':str(available.loc[week]),
       'currentState':state,'aidiLevel':float(p.loc[week,'aidi_level']),'returns':returns,'historicalPercentiles':percentiles,
       'isPrediction':False,'probabilities':None,'dataGate':'PASS','currentSourceSnapshotSha256':sha(V4/'data/weekly-index.csv')}
    save(ROOT/'CURRENT_AIDI_STATE.json',value)
    history=usable.tail(26)
    save(ROOT/'ui/current-state.json',value);save(ROOT/'ui/history.json',[{'week':str(w.date()),'level':float(r.aidi_level)} for w,r in history.iterrows()])
    return value

def candidate_ui(result=None):
    for name in ['index.html','style.css','app.js','price-snapshot.json','price-snapshot.meta.json']:
        source=V4/'ui'/name;target=ROOT/'ui'/name
        if name.endswith(('.html','.js','.css')):target.write_text(source.read_text().replace('V4','V5'))
        else:shutil.copyfile(source,target)
    current_state()
    if result and result['V5_MODEL_GATE']=='PASS':
        # Real research probability artifact only exists after the final gate.
        import joblib
        from prepare import load_dataset
        from experiment import final_split
        from model import raw_architecture,architecture_probabilities
        data=load_dataset(final=True);train,cal,_=final_split(data)
        allrows=pd.read_csv(ROOT/'data/dataset.csv',index_col='week',parse_dates=['week'])
        for name in ['decisionAt','targetStart','targetEnd','labelKnownAt']:allrows[name]=pd.to_datetime(allrows[name],utc=True)
        future=allrows[allrows.decisionAt<=pd.Timestamp(SETTINGS['asOf'])].tail(1)
        c=result['selection'];raw=raw_architecture(train,cal,future,c['group'],c['family'],c['architecture'])
        predicted=architecture_probabilities(raw,c['calA'],c['calB']);p=predicted['probabilities'][0]
        forecast={'status':'RESEARCH','source':'AYU_INTERNATIONAL_DIESEL_V5','generatedAt':now(),'horizonDays':7,
           'predictionCutoff':str(future.decisionAt.iloc[0]),'targetStart':str(future.targetStart.iloc[0]),'targetEnd':str(future.targetEnd.iloc[0]),
           'primaryDirection':['DOWN','FLAT','UP'][int(p.argmax())],'probabilities':dict(zip(['down','flat','up'],p.tolist())),
           'components':{'moveProbability':float(predicted['move'][0]),'upGivenMove':float(predicted['upGivenMove'][0])},
           'calibrated':True,'modelVersion':'V5','productGate':result.get('V5_PRODUCT_GATE','LIMITED'),
           'modelGate':'PASS','planSha256':result['planSha256']}
        save(ROOT/'CURRENT_AIDI_FORECAST_V5.json',forecast);save(ROOT/'ui/forecast.json',forecast)
        joblib.dump({'modelsAndCalibrationReferences':raw,'selection':c,'planSha256':result['planSha256']},ROOT/'results/model-artifact.joblib')
        app="import { roundProbabilitiesTo100 } from './probability.js';\n"+(ROOT/'ui/app.js').read_text()+"""
try {
  const f = await read('./forecast.json');
  if (f.modelGate === 'PASS') {
    const p = [f.probabilities.down, f.probabilities.flat, f.probabilities.up];
    const rounded = roundProbabilitiesTo100(p);
    const box = document.querySelector('.forecast');
    box.innerHTML = '<h2>未来7天趋势</h2><strong>' + ({ DOWN:'偏跌', FLAT:'基本不变', UP:'偏涨' }[f.primaryDirection]) + '</strong>' +
      ['下跌','基本不变','上涨'].map((label,i) => '<p>' + label + ' ' + rounded[i] + '%</p>').join('') +
      '<small>国际指数研究预测 · 亚洲适用性尚待验证</small>';
  }
} catch {}
"""
        (ROOT/'ui/app.js').write_text(app)

def final_reports(result):
    dev=json.loads((ROOT/'results/development.json').read_text());m=result['metrics'];base=result['baselines']
    asia=json.loads((ROOT/'data/asia-access-audit.json').read_text())
    result['asiaStatus']=asia['status']
    result['V5_PRODUCT_GATE']='FAIL' if result['V5_MODEL_GATE']=='FAIL' else 'LIMITED' if asia['status']!='PASS' else 'PASS'
    save(ROOT/'results/product-gate.json',{'V5_DATA_GATE':result['V5_DATA_GATE'],'V5_MODEL_GATE':result['V5_MODEL_GATE'],'V5_PRODUCT_GATE':result['V5_PRODUCT_GATE'],'asiaStatus':asia['status']})
    md('ASIA_PRODUCT_VALIDATION_V5.md',f"""# Asian external product validation

ASIA_VALIDATION_STATUS = {asia['status']}

Japan/MGO access attempts and rejected fallback evidence: data/asia-access-audit.json. No Asian value entered training, architecture, signal pruning, threshold, calibration or ensemble weight. The analysis status was finalized after model freeze.

Japan nationwide weekly file has not been obtained as an auditable downloadable series in this run. Regional/monthly extracts cannot be relabeled national/weekly. Correlation, +/-1w lag agreement, external probability scores: unavailable; n=0. MGO validation is UNAVAILABLE. No synthetic result or paywall purchase.

V5_PRODUCT_GATE = {result['V5_PRODUCT_GATE']}

Model failure independently blocks product percentage qualification. Even a Model PASS with unavailable Asia evidence would mean LIMITED product interpretation; model statistics alone do not prove usefulness for Chinese/Asian fishermen or MGO procurement.
""")
    rows=[[name,x['n'],number(x['brier']),number(x['logLoss']),number(x['ece']),pct(x['accuracy'])] for name,x in [('V5',m)]+list(base.items())]
    md('V5_FINAL_HOLDOUT_REPORT.md',f"""# Registered final holdout

V5_MODEL_GATE = {result['V5_MODEL_GATE']}

Plan SHA256: {result['planSha256']}. One formal evaluation; fixed Train<=2020 / Calibration2021; no holdout refit. Full target weeks in2022–2025 only. No rerun, threshold change, model change or deletion of bad years after final scores.2026 excluded.

{table(['Model / baseline','n','Multiclass Brier','Log Loss','ECE','Accuracy'],rows)}

Best simple Brier comparator: {result['bestSimpleForBrier']}; LL comparator: {result['bestSimpleForLogLoss']}. Relative gains {pct(result['relativeGain']['brier'])} / {pct(result['relativeGain']['logLoss'])}; positive means better.

{table(['Preregistered Gate','Pass'],list(result['gateChecks'].items()))}

StageA binary Brier/LL/AUC: {number(result['stageA']['brier'])}/{number(result['stageA']['logLoss'])}/{number(result['stageA']['auc'])}; frequency {number(result['stageABaseline']['brier'])}/{number(result['stageABaseline']['logLoss'])}.
StageB binary Brier/LL/Accuracy/AUC: {number(result['stageB']['brier'])}/{number(result['stageB']['logLoss'])}/{pct(result['stageB']['accuracy'])}/{number(result['stageB']['auc'])}; same-holdout momentum {number(result['stageBMomentumBaseline']['brier'])}/{number(result['stageBMomentumBaseline']['logLoss'])}/{pct(result['stageBMomentumBaseline']['accuracy'])}. Historical MOVE scoring subset only; future inference predicts every row.

## Limits

The2022–2025 history was previously examined inV4. V5 locks configuration before new final scores, but cannot restore historical blindness. EU/CFTC/EIA archival revision assumptions are disclosed in data audit. StageB and mixture performance cannot be presented as MGO, Chinese retail adjustment, causal inventory effects or transaction returns.
""")
    md('V5_YEAR_BY_YEAR.md',"""# Registered final years

A complete target week may be absent because the original market/reference data is missing; no imputed target or omitted bad year. Fixed model for all four years. Joint clear degradation means both proper losses >2% worse. Require >=3/4 not jointly degraded and >=2/4 improve both.

"""+table(['Year','n','Brier','LL','ECE','Accuracy','Brier gain','LL gain'],[[r['year'],r['model']['n'],number(r['model']['brier']),number(r['model']['logLoss']),number(r['model']['ece']),pct(r['model']['accuracy']),pct(r['relativeGain']['brier']),pct(r['relativeGain']['logLoss'])] for r in result['years']]))
    bins=result['reliability']
    md('V5_RELIABILITY_REPORT.md',f"""# Final reliability

Top-label ECE={number(m['ece'])}; classwise DOWN/FLAT/UP ECE={m['classECE']}. Preregistered top-label cap0.08; reliability buckets with n>=20 require absolute gap<=0.15. Sparse bins remain unvalidated rather than fabricated.

{table(['Class','Probability bucket','n','Mean predicted','Observed','Absolute gap'],[[b['class'],f"{int(100*b['low'])}–{int(100*b['high'])}%",b['n'],pct(b['predictedMean']),pct(b['observedFrequency']),pct(b['absoluteGap'])] for b in bins])}

Bin intervals are left-inclusive/right-exclusive, last right-inclusive. No confidence sharpening. Brier and LogLoss remain the primary probability-loss criteria; low ECE alone is insufficient for a Model PASS.
""")
    for title,key,reference in [('MOVE_CALIBRATION_REPORT.md','stageA','stageABaseline'),('DIRECTION_CALIBRATION_REPORT.md','stageB','stageBMomentumBaseline')]:
        path=ROOT/title
        with path.open('a') as f:f.write('\n## Frozen final evidence\n\n'+table(['System','n','Binary Brier','Log Loss','AUC','Accuracy','ECE'],[[name,x['n'],number(x['brier']),number(x['logLoss']),number(x['auc']),pct(x['accuracy']),number(x['ece'])] for name,x in [('V5',result[key]),('baseline',result[reference])]])+'\n')
    boot=result['bootstrap']
    md('V5_BLOCK_BOOTSTRAP.md',f"""# Paired calendar block bootstrap

{boot['method']};3000 repeats, seed5001. Separate best-simple comparator for each proper loss. Positive baseline-minus-model means improvement. Calendar holes preserved; weeks are not treated as IID. CI crossing zero is EVIDENCE_WEAK, not automatically converted to a p-value Gate.

{table(['Loss','Mean baseline-model','95% CI','Evidence'],[[k,number(boot[k]['meanBaselineMinusModel'],6),boot[k]['ci95'],boot[k]['evidence']] for k in ['brier','logLoss']])}
""")
    split=result['split']
    with (ROOT/'V5_DATASET_REPORT.md').open('a') as f:f.write('\n## Frozen final split\n\n'+json.dumps(split,indent=2)+'\n\nFinal D/F/U='+str(m['classCounts'])+'; effective independent n='+str(m['n'])+'.\n')
    candidate_ui(result)
    state=json.loads((ROOT/'CURRENT_AIDI_STATE.json').read_text())
    c=dev['selection'];matched=dev['matchedAblation'];cftc_gain=gain(matched['CFTC']['metrics'],matched['BASE']['metrics']);eia_gain=gain(matched['EIA']['metrics'],matched['BASE']['metrics'])
    sixty=[b for b in bins if b['low']==.55]
    answer=[
      ['1','CFTC starts','2013-06-04 report; pre-ULSD positions and all lag references excluded'],
      ['2','2013 contract transition','Physical sulfur change May delivery; June title administrative; PRIMARY post-transition only'],
      ['3','CFTC availableAt','Normal report delayed one extra Friday cutoff; known ION actual issue next midnight; unproven catch-up intervals quarantined'],
      ['4','EIA leakage','Actual original release+next midnight; seasonal reference past years only; negative injection tests enforce timestamps; archive revision risk remains'],
      ['5','Retained signals',c['group']+'; '+str(dev['selectedFeatures'])],
      ['6','Deleted signals','EIA inventory/refinery excluded if no matched Development gain; raw audit retained'],
      ['7','StageA predictable',f"Brier {number(result['stageA']['brier'])} vs frequency {number(result['stageABaseline']['brier'])}; LL {number(result['stageA']['logLoss'])} vs {number(result['stageABaseline']['logLoss'])}; gate {result['gateChecks']['stageABothProper']}"],
      ['8','StageB beats momentum',f"Accuracy {pct(result['stageB']['accuracy'])} vs {pct(result['stageBMomentumBaseline']['accuracy'])}; both proper+accuracy gate {result['gateChecks']['stageBBothProperAndAccuracy']}"],
      ['9','Hurdle vs V4',f"V5 {number(m['brier'])}/{number(m['logLoss'])}; V4 {number(base['v4_best']['brier'])}/{number(base['v4_best']['logLoss'])}; matched direct {number(base['matched_direct_three_class']['brier'])}/{number(base['matched_direct_three_class']['logLoss'])}"],
      ['10','Regional vs AIDI single','Architecture selected on Development only; see Development report; alternative not re-selected on final'],
      ['11','Final Brier',number(m['brier'],6)],
      ['12','Final LL',number(m['logLoss'],6)],
      ['13','Gain vs best simple',pct(result['relativeGain']['brier'])+' / '+pct(result['relativeGain']['logLoss'])],
      ['14','Each2022–2025 year','All four retained; see year table below'],
      ['15','Calibration',f"ECE {number(m['ece'])}; ECE gate {result['gateChecks']['multiclassECE']}; bucket gate {result['gateChecks']['adequateReliabilityBins']}"],
      ['16','55–65% realized','; '.join(f"{v['class']} n={v['n']}, mean={pct(v['predictedMean'])}, realized={pct(v['observedFrequency'])}" for v in sixty)],
      ['17','Block stability','Brier '+boot['brier']['evidence']+' / LL '+boot['logLoss']['evidence']],
      ['18','CFTC increment','Matched Development '+pct(cftc_gain['brier'])+' / '+pct(cftc_gain['logLoss'])+'; not a claimed final causal contribution'],
      ['19','EIA increment','Matched Development '+pct(eia_gain['brier'])+' / '+pct(eia_gain['logLoss'])+'; not retained'],
      ['20','Asia',asia['status']+'; Japan/MGO statistics unavailable, n=0'],
      ['21','Real user percentage qualification','NO' if result['V5_MODEL_GATE']=='FAIL' else 'Research model only; product gate '+result['V5_PRODUCT_GATE']],
      ['22','Current probability','Not generated: MODEL FAIL' if result['V5_MODEL_GATE']=='FAIL' else 'See CURRENT_AIDI_FORECAST_V5.json']
    ]
    md('AYU_INTERNATIONAL_DIESEL_V5_RESULT.md',f"""# AYU_INTERNATIONAL_DIESEL_FORECAST_V5_LEADING_SIGNALS_001

V5_DATA_GATE = {result['V5_DATA_GATE']}

V5_MODEL_GATE = {result['V5_MODEL_GATE']}

V5_PRODUCT_GATE = {result['V5_PRODUCT_GATE']}

Frozen selection: {c}; theta0.0075; formal final evaluation count1. Preregister hash {result['planSha256']}. Model/configuration/threshold not changed after final scores.

## 22 required answers

{table(['#','Question','Answer'],answer)}

## 2022–2025

{(ROOT/'V5_YEAR_BY_YEAR.md').read_text().split('Fixed model for all four years.')[1]}

## Current description and delivery

Current descriptive state {state['currentState']}, complete observation week ending {state['weekEnd']}; not a prediction. No probability artifact or fitted model when Model FAIL. Candidate reads a copied public reference-price snapshot only; no price service mutation or public deployment.

Required leak/integrity/state tests, full test results, reproduction commands, raw source bytes, source hashes, exact feature lists, phase milestones and frozen predictions accompany this directory. Actual test totals and remote-backed identity are in the delivery files outside Git. No main merge, public Pages/Sites change, production-project access, paid data/API/resource or key.

Residual risks: previous V4 exposure to the final history; European historical revisions/rare late releases; CFTC corrected historical snapshots and incomplete actual release archives; no Asian representative validation. Data availability does not grant statistical or product qualification. Completed and stopped for manual review.
""")
    return result
