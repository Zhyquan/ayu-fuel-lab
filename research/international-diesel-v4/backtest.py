"""Separate validation freeze and one untouched chronological test pass."""
import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path
import numpy as np
import pandas as pd
from evaluate import ROUTES, CALIBRATORS, baseline, classify, raw_predictions, calibrate, metrics
from prepare import ROOT, SPEC, save_json

def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()

def load():
    audit=json.loads((ROOT/'data/DATA_AUDIT.json').read_text())
    if audit['INTERNATIONAL_DIESEL_DATA_GATE_V4']!='PASS':raise ValueError('DATA_GATE_FAIL_NO_TRAINING')
    d=pd.read_csv(ROOT/'data/weekly-dataset.csv',index_col='week',parse_dates=['week'])
    for c in ['decisionAt','featureAvailableAt','labelKnownAt']:
        d[c]=pd.to_datetime(d[c],utc=True)
    d['year']=d.decisionAt.dt.year
    d=d[d.target.notna() & d.aidi_return_13w.notna() & d.past_direction_return.notna()].copy()
    assert d.index.is_unique and (d.featureAvailableAt <= d.decisionAt).all()
    return d

def columns(d, region):
    context=[c for c in d if c.startswith(('brent_','wti_','eia_','season_'))]
    if region=='composite':
        result=context+[c for c in d if c.startswith('aidi_')]+['us_eu_divergence','nyh_usgc_divergence','regional_volatility_ratio','cross_region_dispersion','regional_direction_agreement','us_crude_return_spread','eu_crude_return_spread']
    else:
        result=context+[c for c in d if c.startswith(region+'_') and c!='us_eu_divergence']
        if region=='us':result+=['nyh_usgc_divergence']
    assert len(set(result))==len(result) and len(result)<=SPEC['maximumPrimaryFeatures']
    assert not any('japan' in c.lower() for c in result)
    return result

def split(d, year, binary=False, threshold=None):
    future=d[d.year==year].copy()
    cal=d[d.year==year-1].copy()
    train=d[d.year<year-1].copy()
    # The first decision in a block is the latest permissible fitting cutoff.
    cal_cut=cal.decisionAt.min();test_cut=future.decisionAt.min()
    train=train[train.labelKnownAt<cal_cut]
    cal=cal[cal.labelKnownAt<test_cut]
    if binary:
        train=train[train.target.abs()>threshold];cal=cal[cal.target.abs()>threshold];future=future[future.target.abs()>threshold]
    assert train.labelKnownAt.max()<cal_cut and cal.labelKnownAt.max()<test_cut
    assert set(train.index).isdisjoint(cal.index) and set(cal.index).isdisjoint(future.index)
    assert train.decisionAt.max()<cal.decisionAt.min()<future.decisionAt.min()
    return train,cal,future

def evaluate_fold(d,year,threshold,region,selected=None,binary=False):
    train,cal,future=split(d,year,binary,threshold)
    col=columns(d,region);truth=classify(future.target,threshold,binary);caltruth=classify(cal.target,threshold,binary)
    output={};predictions={}
    methods=ROUTES if selected is None else [selected['route']]
    for route in methods:
        pcal,pfuture=raw_predictions(train,cal,future,col,route,threshold,binary)
        cals=CALIBRATORS if selected is None else [selected['calibrator']]
        for method in cals:
            p=calibrate(pcal,caltruth,pfuture,method)
            key=route+'/'+method;output[key]=metrics(truth,p);predictions[key]=p
    base=baseline(train,future,threshold,binary)
    for name,p in base.items():
        output['baseline/'+name]=metrics(truth,p);predictions['baseline/'+name]=p
    sizes={'year':year,'train':len(train),'calibration':len(cal),'test':len(future),
           'trainCounts':np.bincount(classify(train.target,threshold,binary),minlength=2 if binary else 3).tolist(),
           'calCounts':np.bincount(caltruth,minlength=2 if binary else 3).tolist(),
           'testCounts':np.bincount(truth,minlength=2 if binary else 3).tolist(),
           'trainLabelKnownMax':train.labelKnownAt.max().isoformat(),'calStart':cal.decisionAt.min().isoformat(),
           'calLabelKnownMax':cal.labelKnownAt.max().isoformat(),'testStart':future.decisionAt.min().isoformat(),
           'features':col}
    return output,predictions,future,truth,sizes

def choose(entries):
    scores={}
    for entry in entries:
        base=entry['metrics']['baseline/frequency']
        for key,m in entry['metrics'].items():
            if key.startswith('baseline/'):continue
            scores.setdefault(key,[]).append(.5*(m['brier']/base['brier']+m['logLoss']/base['logLoss']))
    key=min(scores,key=lambda k:(np.mean(scores[k]),k))
    route,method=key.split('/')
    return {'route':route,'calibrator':method,'validationRatio':float(np.mean(scores[key]))}

def select(d):
    freeze=ROOT/'results/SELECTION_FREEZE.json'
    if freeze.exists():raise ValueError('Selection already frozen; do not overwrite after Test')
    entries=[];candidates=[]
    for threshold in SPEC['thresholdCandidates']:
        trial=[];eligible=True
        for year in SPEC['validationYears']:
            result,_,_,_,sizes=evaluate_fold(d,year,threshold,'composite')
            for counts in [sizes['trainCounts'],sizes['testCounts']]:
                shares=np.array(counts)/sum(counts)
                eligible &= bool(shares.min()>=.15 and shares.max()<=.60)
            trial.append({'year':year,'threshold':threshold,'region':'composite','metrics':result,'sizes':sizes})
        choice=choose(trial)
        candidates.append({'threshold':threshold,'eligible':eligible,'choice':choice})
        entries+=trial
        print('VALIDATION',threshold,eligible,choice,flush=True)
    allowed=[c for c in candidates if c['eligible']]
    if not allowed:raise ValueError('No economically balanced threshold; no test run')
    winner=min(allowed,key=lambda c:(c['choice']['validationRatio'],c['threshold']))
    threshold=winner['threshold']; selections={'composite':winner['choice']}
    for region in ['us','eu']:
        regional=[]
        for year in SPEC['validationYears']:
            result,_,_,_,sizes=evaluate_fold(d,year,threshold,region)
            regional.append({'year':year,'threshold':threshold,'region':region,'metrics':result,'sizes':sizes})
        entries+=regional;selections[region]=choose(regional)
    save_json(ROOT/'results/validation.json',{'entries':entries,'thresholdCandidates':candidates})
    value={'frozenAt':dt.datetime.now(dt.timezone.utc).isoformat(),'specSha256':sha(ROOT/'spec.json'),
           'datasetSha256':sha(ROOT/'data/weekly-dataset.csv'),'threshold':threshold,'selections':selections,
           'testOpened':False,'japanUsed':False,'phase':'AFTER_VALIDATION_BEFORE_TEST'}
    save_json(freeze,value);print(json.dumps(value,indent=2),flush=True)

def records(future,truth,predictions,year):
    output=[]
    for i,(week,row) in enumerate(future.iterrows()):
        output.append({'week':str(week.date()),'year':year,'decisionAt':row.decisionAt.isoformat(),
          'targetWeek':row.targetWeek,'target':float(row.target),'truth':int(truth[i]),
          'probabilities':{name:p[i].tolist() for name,p in predictions.items()}})
    return output

def pooled(rows):
    names=rows[0]['probabilities']; y=np.array([r['truth'] for r in rows])
    return {name:metrics(y,np.array([r['probabilities'][name] for r in rows])) for name in names}

def run_test(d):
    freeze=json.loads((ROOT/'results/SELECTION_FREEZE.json').read_text())
    assert freeze['specSha256']==sha(ROOT/'spec.json') and freeze['datasetSha256']==sha(ROOT/'data/weekly-dataset.csv')
    rows=[];years=[];threshold=freeze['threshold']
    for year in SPEC['testYears']:
        merged={};sizes=None;output={}
        for region in ['composite','us','eu']:
            m,p,f,y,s=evaluate_fold(d,year,threshold,region,freeze['selections'][region])
            selected=freeze['selections'][region];key=selected['route']+'/'+selected['calibrator']
            merged[region]=p[key];output[region]=m[key]
            if region=='composite':
                merged.update({k:v for k,v in p.items() if k.startswith('baseline/')});output.update({k:v for k,v in m.items() if k.startswith('baseline/')});sizes=s
        rows+=records(f,y,merged,year);years.append({'year':year,'metrics':output,'sizes':sizes})
        print('TEST',year,output['composite']['brier'],output['composite']['logLoss'],flush=True)
    result={'selection':freeze,'pooled':pooled(rows),'yearByYear':years}
    best_b=min((k for k in result['pooled'] if k.startswith('baseline/')),key=lambda k:result['pooled'][k]['brier'])
    best_l=min((k for k in result['pooled'] if k.startswith('baseline/')),key=lambda k:result['pooled'][k]['logLoss'])
    m=result['pooled']['composite']; n=m['n']
    full=[v for v in years if v['year']<2026]
    good=sum(v['metrics']['composite']['brier']<=v['metrics'][best_b]['brier'] and v['metrics']['composite']['logLoss']<=v['metrics'][best_l]['logLoss'] for v in full)
    increment={r:sum(v['metrics']['composite']['brier']<v['metrics'][r]['brier'] and v['metrics']['composite']['logLoss']<v['metrics'][r]['logLoss'] for v in full) for r in ['us','eu']}
    buckets=m['sixtyBuckets']
    gates={'data':True,'weeklyAvailabilityChecks':True,'definitionFrozen':True,'thresholdFrozenBeforeTest':True,
      'brierBeatsBestSimple':m['brier']<result['pooled'][best_b]['brier'],
      'logLossBeatsBestSimple':m['logLoss']<result['pooled'][best_l]['logLoss'],
      'calibration':m['ece']<=.10 and max(m['classECE'])<=.10,
      'majorityFullYears':good>len(full)/2,
      'noClassCollapse':min(m['predictionShares'])/n>=.05 and min(m['recalls'])>=.10,
      'sixtyBuckets':all(b['n']>=30 and abs(b['meanForecast']-b['realized'])<=.10 for b in buckets),
      'compositeIncrement':all(m['brier']<result['pooled'][r]['brier'] and m['logLoss']<result['pooled'][r]['logLoss'] and increment[r]>len(full)/2 for r in ['us','eu']),
      'asiaIndependentEvidence':False}
    result.update({'bestSimpleBrier':best_b,'bestSimpleLogLoss':best_l,'goodFullYears':good,'compositeBetterYears':increment,
                   'gateChecks':gates,'INTERNATIONAL_DIESEL_MODEL_GATE_V4':'PASS' if all(gates.values()) else 'FAIL'})
    save_json(ROOT/'results/test-predictions.json',rows);save_json(ROOT/'results/model-result.json',result)
    save_json(ROOT/'results/MODEL_FREEZE.json',{'selectionSha256':sha(ROOT/'results/SELECTION_FREEZE.json'),
        'testPredictionsSha256':sha(ROOT/'results/test-predictions.json'),'frozenAt':dt.datetime.now(dt.timezone.utc).isoformat(),'japanUsed':False})
    print(json.dumps(result['pooled'],indent=2),flush=True)

def binary(d):
    model=json.loads((ROOT/'results/model-result.json').read_text())
    threshold=model['selection']['threshold']; val=[]
    for year in SPEC['validationYears']:
        m,_,_,_,s=evaluate_fold(d,year,threshold,'composite',binary=True)
        val.append({'year':year,'metrics':m,'sizes':s})
    selected=choose(val);freeze={'threshold':threshold,'selected':selected,'phase':'BINARY_VALIDATION_BEFORE_BINARY_TEST','japanUsed':False}
    save_json(ROOT/'results/BINARY_SELECTION_FREEZE.json',freeze)
    rows=[];years=[]
    for year in SPEC['testYears']:
        m,p,f,y,s=evaluate_fold(d,year,threshold,'composite',selected,binary=True)
        key=selected['route']+'/'+selected['calibrator'];p['binary']=p.pop(key)
        m['binary']=m.pop(key);rows+=records(f,y,p,year);years.append({'year':year,'metrics':m,'sizes':s})
    save_json(ROOT/'results/binary.json',{'selection':freeze,'validation':val,'pooled':pooled(rows),'yearByYear':years,'eligibleForProduct':False})
    save_json(ROOT/'results/binary-predictions.json',rows)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('phase',choices=['select','test','binary']);args=parser.parse_args()
    {'select':select,'test':run_test,'binary':binary}[args.phase](load())
