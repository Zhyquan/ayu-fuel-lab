"""Development selection and one registered fixed-model historical final evaluation."""
import itertools,json
import numpy as np
import pandas as pd
from common import ROOT,SETTINGS,save,sha,versions,protected_hashes,milestone,set_phase,classify,now
from prepare import load_dataset
from model import (raw_architecture,architecture_probabilities,multiclass_metrics,binary_metrics,
    baseline,columns,raw_hurdle,calibrated_hurdle,v4_best,direct_three_class,estimator)

GROUPS=['BASE','CFTC','EIA','BOTH']
ARCHITECTURES=['AIDI_HURDLE','REGIONAL_EXPERT']

def assert_development(*frames):
    for frame in frames:
        if len(frame) and frame.targetStart.max()>=pd.Timestamp('2022-01-01',tz='UTC'):
            raise ValueError('HOLDOUT_IN_DEVELOPMENT_FAIL')

def fold(data,year):
    future=data[data.targetStart.dt.year==year]
    cal=data[data.targetStart.dt.year==year-1]
    train=data[data.targetStart.dt.year<year-1]
    train=train[train.labelKnownAt<cal.decisionAt.min()]
    cal=cal[cal.labelKnownAt<future.decisionAt.min()]
    if len(train)<80 or len(cal)<20 or len(future)<20:raise ValueError('INSUFFICIENT_CHRONOLOGICAL_FOLD')
    if not (train.labelKnownAt.max()<cal.decisionAt.min() and cal.labelKnownAt.max()<future.decisionAt.min()):
        raise ValueError('LABEL_PURGE_FAIL')
    return train,cal,future

def final_split(data):
    lo=pd.Timestamp(SETTINGS['holdout']['start'],tz='UTC')
    hi=pd.Timestamp(SETTINGS['holdout']['end'],tz='UTC')+pd.Timedelta(days=1)
    future=data[(data.targetStart>=lo)&(data.targetEnd<=hi)]
    train=data[data.targetStart<pd.Timestamp('2021-01-01',tz='UTC')]
    cal=data[data.targetStart.dt.year==2021]
    train=train[train.labelKnownAt<cal.decisionAt.min()]
    cal=cal[cal.labelKnownAt<future.decisionAt.min()]
    assert_development(train,cal)
    if train.labelKnownAt.max()>=cal.decisionAt.min() or cal.labelKnownAt.max()>=future.decisionAt.min():raise ValueError('LABEL_PURGE_FAIL')
    return train,cal,future

def gain(model,reference):
    return {k:float(1-model[k]/reference[k]) for k in ['brier','logLoss']}

def better(model,reference,minimum=0):
    return all(v>minimum for v in gain(model,reference).values())

def key(config):
    return '/'.join(config[k] for k in ['architecture','family','calA','calB','group'])

def score(pieces):
    y=np.concatenate([v['truth'] for v in pieces]);p=np.concatenate([v['probabilities'] for v in pieces])
    result=multiclass_metrics(y,p)
    norms=[.5*(multiclass_metrics(v['truth'],v['probabilities'])['brier']/v['frequency']['brier']+
          multiclass_metrics(v['truth'],v['probabilities'])['logLoss']/v['frequency']['logLoss']) for v in pieces]
    result['validationSelectionScore']=float(np.mean(norms))
    return result

def development():
    data=load_dataset();assert_development(data)
    records={};base_pieces=[];fold_sizes=[];v4_pieces=[]
    for year in SETTINGS['developmentYears']:
        train,cal,future=fold(data,year);assert_development(train,cal,future)
        truth=classify(future.target);base=baseline(train,cal,future)
        frequency=multiclass_metrics(truth,base['multiclass']['frequency'])
        base_pieces.append({'truth':truth,'probabilities':base['multiclass']['frequency'],'frequency':frequency})
        v4_pieces.append({'truth':truth,'probabilities':v4_best(train,cal,future),'frequency':frequency})
        fold_sizes.append({'validationYear':year,'train':len(train),'calibration':len(cal),'validation':len(future),
           'trainLabelKnownMax':str(train.labelKnownAt.max()),'calibrationStart':str(cal.decisionAt.min()),
           'calLabelKnownMax':str(cal.labelKnownAt.max()),'validationStart':str(future.decisionAt.min())})
        for group,architecture,family in itertools.product(GROUPS,ARCHITECTURES,SETTINGS['families']):
            raw=raw_architecture(train,cal,future,group,family,architecture)
            for ca,cb in itertools.product(SETTINGS['calibrators'],repeat=2):
                config=dict(group=group,architecture=architecture,family=family,calA=ca,calB=cb)
                prediction=architecture_probabilities(raw,ca,cb);name=key(config)
                if name not in records:records[name]={'config':config,'pieces':[]}
                records[name]['pieces'].append({'year':year,'truth':truth,'probabilities':prediction['probabilities'],
                     'move':prediction['move'],'upGivenMove':prediction['upGivenMove'],'frequency':frequency,
                     'weeks':[str(v.date()) for v in future.index]})
        print('Development fold '+str(year)+' complete; holdout not loaded',flush=True)
    for record in records.values():
        record['metrics']=score(record['pieces'])
        yt=np.concatenate([v['truth'] for v in record['pieces']]); significant=yt!=1
        record['stageA']=binary_metrics(significant.astype(int),np.concatenate([v['move'] for v in record['pieces']]))
        record['stageB']=binary_metrics((yt[significant]==2).astype(int),np.concatenate([v['upGivenMove'] for v in record['pieces']])[significant])
    admitted=[]
    cutoff=SETTINGS['ablationAdmissionRelativeGain']
    for architecture,family,ca,cb in itertools.product(ARCHITECTURES,SETTINGS['families'],SETTINGS['calibrators'],SETTINGS['calibrators']):
        configs={g:dict(group=g,architecture=architecture,family=family,calA=ca,calB=cb) for g in GROUPS}
        m={g:records[key(c)]['metrics'] for g,c in configs.items()}
        allowed={'BASE':True,'CFTC':better(m['CFTC'],m['BASE'],cutoff),'EIA':better(m['EIA'],m['BASE'],cutoff),
           'BOTH':better(m['BOTH'],m['EIA'],cutoff) and better(m['BOTH'],m['CFTC'],cutoff)}
        for g,c in configs.items():
            records[key(c)]['groupAdmission']=allowed[g]
            if allowed[g]:admitted.append(records[key(c)])
    winner=min(admitted,key=lambda r:(r['metrics']['validationSelectionScore'],key(r['config'])))
    config=winner['config']
    matched={g:records[key({**config,'group':g})]['metrics'] for g in GROUPS}
    selected_pieces=winner['pieces']
    truth=np.concatenate([v['truth'] for v in selected_pieces])
    move=np.concatenate([v['move'] for v in selected_pieces])
    up=np.concatenate([v['upGivenMove'] for v in selected_pieces])
    significant=truth!=1
    matched_predictions={g:{'metrics':matched[g],'admitted':records[key({**config,'group':g})]['groupAdmission']} for g in GROUPS}
    direct_pieces=[]
    for year in SETTINGS['developmentYears']:
        tr,ca,fu=fold(data,year)
        direct_pieces.append({'truth':classify(fu.target),'probabilities':direct_three_class(tr,ca,fu,config),
            'frequency':multiclass_metrics(classify(fu.target),baseline(tr,ca,fu)['multiclass']['frequency'])})
    output={'selection':config,'selectionMetrics':winner['metrics'],'frequency':score(base_pieces),
      'v4BestBaseline':score(v4_pieces),'matchedDirectThreeClass':score(direct_pieces),
      'stageA':binary_metrics((truth!=1).astype(int),move),
      'stageB':binary_metrics((truth[significant]==2).astype(int),up[significant]),
      'matchedAblation':matched_predictions,'folds':fold_sizes,'candidateCount':len(records),
      'candidates':[{k:v for k,v in r.items() if k!='pieces'} for r in records.values()],
      'noHoldoutRows':True,'holdoutOpened':False,'selectionRule':'Mean per-year normalized Brier/LogLoss; matched group admission >=0.5% each proper score',
      'selectedFeatures':{'aidi':columns(config['group'])} if config['architecture']=='AIDI_HURDLE' else
          {r:columns(config['group'],r,expert=True) for r in ['us','eu']}}
    # Same architecture/family/calibrators; removal tests evaluate Development
    # only and never update the already selected configuration.
    contribution=[]
    groups={'CFTC':SETTINGS['cftcFeatures'],'INVENTORY':SETTINGS['inventoryFeatures'],
       'REFINERY':SETTINGS['refineryFeatures'],'REGIONAL': ['us_eu_divergence','nyh_usgc_divergence'],
       'PRICE_MOMENTUM':['aidi_return_1w','aidi_return_4w','aidi_volatility_4w','aidi_volatility_13w',
           'us_return_1w','us_return_4w','us_volatility_4w','us_volatility_13w',
           'eu_return_1w','eu_return_4w','eu_volatility_4w','eu_volatility_13w']}
    chosen=set(sum(output['selectedFeatures'].values(),[]))
    for name,drop in groups.items():
        if not chosen.intersection(drop):
            contribution.append({'group':name,'used':False,'matchedRemovalGain':None});continue
        pieces=[]
        for year in SETTINGS['developmentYears']:
            train,cal,future=fold(data,year)
            raw=raw_architecture(train,cal,future,config['group'],config['family'],config['architecture'],drop=drop)
            pred=architecture_probabilities(raw,config['calA'],config['calB'])
            pieces.append({'truth':classify(future.target),'probabilities':pred['probabilities'],
              'frequency':multiclass_metrics(classify(future.target),baseline(train,cal,future)['multiclass']['frequency'])})
        removed=score(pieces)
        contribution.append({'group':name,'used':True,'removedMetrics':removed,'matchedRemovalGain':gain(winner['metrics'],removed)})
    output['featureContribution']=contribution
    save(ROOT/'results/development.json',output)
    milestone('M4','Development winner: '+key(config)+'; no final model scores read')
    set_phase('DEVELOPMENT',selection=config,finalHoldoutOpened=False)
    print(json.dumps({'winner':config,'metrics':winner['metrics'],'candidateCount':len(records)},indent=2))
    return output

def preregister():
    path=ROOT/'V5_PREREGISTERED_PLAN.json'
    if path.exists():raise ValueError('PREREGISTRATION_IMMUTABLE_ALREADY_EXISTS')
    development_result=json.loads((ROOT/'results/development.json').read_text())
    audit=json.loads((ROOT/'data/LEADING_SIGNAL_DATA_AUDIT.json').read_text())
    config=development_result['selection']
    plan={'task':SETTINGS['task'],'registeredAt':now(),'phase':'PREREGISTERED_BEFORE_FINAL_EVALUATION',
      'datasetSha256':sha(ROOT/'data/dataset.csv'),'provenanceSha256':sha(ROOT/'data/provenance.json'),
      'developmentSha256':sha(ROOT/'results/development.json'),'targetDefinition':'Inherited V4 LOCAL-CURRENCY AIDI; no target or threshold reselection',
      'threshold':SETTINGS['threshold'],'featureLists':development_result['selectedFeatures'],'architectureChoice':config['architecture'],
      'stageAModel':config['family'],'stageBModel':config['family'],'hyperparameters':estimator(config['family']).steps[-1][1].get_params(),
      'preprocessing':{'imputer':'Train median, keep_empty_features=True','scaler':'Train StandardScaler, with_mean=True, with_std=True'},
      'dependencyLockSha256':sha(ROOT/'requirements-lock.txt'),
      'calibration':{'stageA':config['calA'],'stageB':config['calB'],'plattC':SETTINGS['calibratorPlattC']},
      'selectedGroup':config['group'],'selection':config,'holdoutDates':SETTINGS['holdout'],'calibrationYear':2021,
      'finalModelPolicy':SETTINGS['finalModelUpdatePolicy'],'evaluationMetrics':['multiclassBrier','LogLoss','topLabelECE','classwiseECE','accuracy','macroF1','recalls','binaryBrier','binaryLogLoss','AUC'],
      'gates':{**SETTINGS['gates'],'beatsV4BothProperScores':True,'beatsMatchedDirectThreeClassBothProperScores':True},
      'reliabilityBuckets':[0,.05,.15,.25,.35,.45,.55,.65,.75,.85,.95,1],
      'bootstrap':SETTINGS['bootstrap'],'randomSeed':SETTINGS['seed'],'dependencyVersions':versions(),
      'protectedFileHashes':protected_hashes(),'inheritedV4Hashes':audit['inheritedV4Hashes'],
      'rawHashes':{str(p.relative_to(ROOT)):sha(p) for p in sorted((ROOT/'data/raw').glob('*')) if p.is_file()},
      'baselineRules':{'frequency':'all mature Train+Calibration labels; Jeffreys .5 smoothing',
       'dominant':'same pre-final dominant class, .96 confidence',
       'continuation':'last available AIDI class; pre-final empirical reliability >=1/3',
       'meanReversion':'DOWN/UP reversed, FLAT retained; pre-final reliability',
       'directionMomentum':'sign(last published AIDI return), pre-final MOVE reliability confidence .5..95',
       'usOnlyEuOnly':'V5 chosen family/calibration, same AIDI labels, own regional inputs; US keeps admitted leading signals',
       'v4Best':'fixed ElasticNet alpha=.001 l1_ratio=.25 + Platt, original 38-feature baseline exception; same V5 cutoffs/target weeks',
       'matchedDirectThreeClass':'chosen small family on union of chosen features, direct AIDI labels, fixed OVR Platt C=.25; diagnostic comparator, not selection candidate'},
      'priorHoldoutExposure':SETTINGS['holdoutDisclosure'],'holdoutOpened':False,'japanOrMgoUsedInSelection':False,
      'probabilitySumTolerance':1e-9,'minimumProperScoreGains':{'brier':.02,'logLoss':.02},
      'dataGate':audit['V5_DATA_GATE']}
    save(path,plan,exclusive=True)
    (ROOT/'V5_PREREGISTERED_PLAN.sha256').write_text(sha(path)+'  V5_PREREGISTERED_PLAN.json\n')
    milestone('M5','Preregister SHA256 '+sha(path))
    set_phase('PREREGISTERED',planSha256=sha(path),finalHoldoutAuthorization='VALID',finalHoldoutOpened=False)
    print(json.dumps({'preregisterSha256':sha(path),'architecture':config['architecture']}))
    return plan

def reliability(y,p):
    edges=[0,.05,.15,.25,.35,.45,.55,.65,.75,.85,.95,1];rows=[]
    for c,name in enumerate(['DOWN','FLAT','UP']):
        for i,(lo,hi) in enumerate(zip(edges[:-1],edges[1:])):
            mask=(p[:,c]>=lo)&(p[:,c]<hi if i<len(edges)-2 else p[:,c]<=hi)
            n=int(mask.sum())
            mean=float(p[mask,c].mean()) if n else None;observed=float((y[mask]==c).mean()) if n else None
            rows.append({'class':name,'low':lo,'high':hi,'n':n,'predictedMean':mean,
                'observedFrequency':observed,'absoluteGap':abs(mean-observed) if n else None})
    return rows

def bootstrap_difference(future,y,model_p,baseline_p,baseline_ll=None):
    onehot=np.eye(3)[y]
    brier=np.sum((baseline_p-onehot)**2,axis=1)-np.sum((model_p-onehot)**2,axis=1)
    reference_ll=baseline_p if baseline_ll is None else baseline_ll
    ll=np.log(np.clip(model_p[np.arange(len(y)),y],1e-12,1))-np.log(np.clip(reference_ll[np.arange(len(y)),y],1e-12,1))
    dates=pd.DatetimeIndex(future.targetStart.dt.tz_localize(None))
    calendar=pd.date_range(dates.min(),dates.max(),freq='W-MON')
    losses=pd.DataFrame({'brier':brier,'logLoss':ll},index=dates).reindex(calendar)
    opts=SETTINGS['bootstrap'];rng=np.random.default_rng(opts['seed']);result={}
    for column in ['brier','logLoss']:
        values=losses[column].to_numpy();draws=[]
        for _ in range(opts['repetitions']):
            sample=[]
            while len(sample)<len(y):
                start=int(rng.integers(0,len(values)-opts['blockWeeks']+1))
                block=values[start:start+opts['blockWeeks']]
                sample.extend(block[np.isfinite(block)].tolist())
            draws.append(np.mean(sample[:len(y)]))
        interval=np.quantile(draws,[.025,.975]).tolist()
        result[column]={'meanBaselineMinusModel':float(losses[column].mean()),'ci95':interval,
            'evidence':'EVIDENCE_WEAK' if interval[0]<=0<=interval[1] else 'POSITIVE' if interval[0]>0 else 'NEGATIVE'}
    return {'method':'Moving blocks of 8 calendar weeks; preserve missing weeks; paired losses','repetitions':opts['repetitions'],**result}

def evaluate_final(plan):
    data=load_dataset(final=True);train,cal,future=final_split(data)
    c=plan['selection'];raw=raw_architecture(train,cal,future,c['group'],c['family'],c['architecture'])
    prediction=architecture_probabilities(raw,c['calA'],c['calB'])
    truth=classify(future.target);p=prediction['probabilities'];base=baseline(train,cal,future)
    refs={name:multiclass_metrics(truth,value) for name,value in base['multiclass'].items()}
    refs['v4_best']=multiclass_metrics(truth,v4_best(train,cal,future))
    refs['matched_direct_three_class']=multiclass_metrics(truth,direct_three_class(train,cal,future,c))
    regional={}
    for region in ['us','eu']:
        r=raw_hurdle(train,cal,future,columns(c['group'],region),c['family'])
        rp=calibrated_hurdle(r,c['calA'],c['calB'])['probabilities']
        regional[region]=rp;refs[region+'_only']=multiclass_metrics(truth,rp)
    primary=multiclass_metrics(truth,p)
    best_brier=min(base['multiclass'],key=lambda k:refs[k]['brier'])
    best_ll=min(base['multiclass'],key=lambda k:refs[k]['logLoss'])
    move=truth!=1
    stage_a=binary_metrics(move.astype(int),prediction['move'])
    stage_a_base=binary_metrics(move.astype(int),base['moveFrequency'])
    stage_b=binary_metrics((truth[move]==2).astype(int),prediction['upGivenMove'][move])
    stage_b_base=binary_metrics((truth[move]==2).astype(int),base['directionMomentum'][move],hard=base['momentumHard'][move])
    years=[];not_degraded=0;improved=0
    for year in range(2022,2026):
        mask=future.targetStart.dt.year.to_numpy()==year
        m=multiclass_metrics(truth[mask],p[mask])
        rb=multiclass_metrics(truth[mask],base['multiclass'][best_brier][mask])
        rl=multiclass_metrics(truth[mask],base['multiclass'][best_ll][mask])
        gains={'brier':1-m['brier']/rb['brier'],'logLoss':1-m['logLoss']/rl['logLoss']}
        joint_degraded=all(v < -SETTINGS['gates']['yearMaxJointDegradation'] for v in gains.values())
        not_degraded+=not joint_degraded;improved+=all(v>0 for v in gains.values())
        years.append({'year':year,'model':m,'baselineBrier':rb['brier'],'baselineLogLoss':rl['logLoss'],'relativeGain':gains,'jointClearlyDegraded':joint_degraded})
    bins=reliability(truth,p);adequate=[v for v in bins if v['n']>=SETTINGS['gates']['reliabilityMinimumN']]
    relative={'brier':1-primary['brier']/refs[best_brier]['brier'],'logLoss':1-primary['logLoss']/refs[best_ll]['logLoss']}
    gates={'data':plan['dataGate']=='PASS','brierTwoPercent':relative['brier']>=.02,'logLossTwoPercent':relative['logLoss']>=.02,
       'yearNotJointDegraded3of4':not_degraded>=3,'yearsBothImprove2of4':improved>=2,
       'stageABothProper':better(stage_a,stage_a_base),
       'stageBBothProperAndAccuracy':better(stage_b,stage_b_base) and stage_b['accuracy']>stage_b_base['accuracy'],
       'multiclassECE':primary['ece']<=.08,
       'adequateReliabilityBins':all(v['absoluteGap']<=.15 for v in adequate),
       'beatsV4BothProperScores':better(primary,refs['v4_best']),
       'beatsMatchedDirectThreeClassBothProperScores':better(primary,refs['matched_direct_three_class'])}
    result={'V5_DATA_GATE':plan['dataGate'],'V5_MODEL_GATE':'PASS' if all(gates.values()) else 'FAIL',
       'planSha256':sha(ROOT/'V5_PREREGISTERED_PLAN.json'),'selection':c,'metrics':primary,'baselines':refs,
       'bestSimpleForBrier':best_brier,'bestSimpleForLogLoss':best_ll,'relativeGain':relative,
       'stageA':stage_a,'stageABaseline':stage_a_base,'stageB':stage_b,'stageBMomentumBaseline':stage_b_base,
       'years':years,'reliability':bins,'gateChecks':gates,'bootstrap':bootstrap_difference(future,truth,p,base['multiclass'][best_brier],base['multiclass'][best_ll]),
       'split':{'train':len(train),'calibration':len(cal),'final':len(future),'trainClassCounts':np.bincount(classify(train.target),minlength=3).tolist(),
           'calibrationClassCounts':np.bincount(classify(cal.target),minlength=3).tolist(),
           'trainMaxLabelKnown':str(train.labelKnownAt.max()),'calibrationFirstDecision':str(cal.decisionAt.min()),
           'calMaxLabelKnown':str(cal.labelKnownAt.max()),'finalFirstDecision':str(future.decisionAt.min()),
           'finalLastTargetEnd':str(future.targetEnd.max())},
       'fixedModelNoHoldoutRefit':True,'evaluationCompletedAt':now(),'finalEvaluationCount':1}
    predictions=[{'week':str(w.date()),'decisionAt':str(row.decisionAt),'targetStart':str(row.targetStart),
        'targetEnd':str(row.targetEnd),'targetReturn':float(row.target),'truth':int(truth[i]),
        'probabilities':p[i].tolist(),'moveProbability':float(prediction['move'][i]),'upGivenMove':float(prediction['upGivenMove'][i]),
        'simpleBaselines':{name:value[i].tolist() for name,value in base['multiclass'].items()},
        'usOnly':regional['us'][i].tolist(),'euOnly':regional['eu'][i].tolist()}
        for i,(w,row) in enumerate(future.iterrows())]
    save(ROOT/'results/final-predictions.json',predictions,exclusive=True)
    save(ROOT/'results/final-result.json',result,exclusive=True)
    milestone('M7','Final model gate '+result['V5_MODEL_GATE']+'; results frozen')
    set_phase('FINAL_EVALUATED',modelGate=result['V5_MODEL_GATE'],finalHoldoutOpened=True,finalEvaluationCount=1)
    print(json.dumps({k:result[k] for k in ['V5_DATA_GATE','V5_MODEL_GATE','metrics','relativeGain','gateChecks']},indent=2))
    return result
