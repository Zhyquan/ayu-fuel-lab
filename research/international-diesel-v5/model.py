"""Small two-stage candidates, chronological calibration, fixed baselines."""
import numpy as np
from sklearn.pipeline import make_pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.isotonic import IsotonicRegression
from sklearn.metrics import log_loss,roc_auc_score,accuracy_score,f1_score,recall_score,precision_score
from common import SETTINGS,classify,compose,load_v4

def columns(group,region='aidi',expert=False):
    if region=='aidi':base=SETTINGS['priceBase']
    else:
        base=[region+'_return_1w',region+'_return_4w',region+'_volatility_13w',
              'brent_return_1w','season_sin','season_cos']
        if region=='us':base+=['wti_return_1w','nyh_usgc_divergence']
        elif expert:base+=['us_eu_divergence']
    leading=[]
    if region!='eu':
        if group in ['CFTC','BOTH']:leading+=SETTINGS['cftcFeatures']
        if group in ['EIA','BOTH']:leading+=SETTINGS['inventoryFeatures']+SETTINGS['refineryFeatures']
    result=base+leading
    assert len(result)==len(set(result)) and len(result)<=SETTINGS['featureHardLimit']
    assert not any('target' in c or 'japan' in c.lower() for c in result)
    return result

def estimator(family):
    opts=SETTINGS['families'][family]
    m=LogisticRegression(**opts) if family=='logistic' else HistGradientBoostingClassifier(**opts)
    return make_pipeline(SimpleImputer(strategy='median',keep_empty_features=True),StandardScaler(),m)

def raw_hurdle(train,cal,future,features,family,target='target'):
    import pandas as pd
    boundary=pd.Timestamp('2022-01-01',tz='UTC')
    if train.targetStart.max()>=boundary or cal.targetStart.max()>=boundary:raise ValueError('HOLDOUT_TRAIN_OR_CALIBRATION_FAIL')
    if train.labelKnownAt.max()>=cal.decisionAt.min() or cal.labelKnownAt.max()>=future.decisionAt.min():raise ValueError('LABEL_PURGE_FAIL')
    y=classify(train[target]);ycal=classify(cal[target])
    move=(y!=1).astype(int);calmove=(ycal!=1).astype(int)
    a=estimator(family).fit(train[features],move)
    significant=y!=1
    b=estimator(family).fit(train.loc[significant,features],(y[significant]==2).astype(int))
    return {'calMove':a.predict_proba(cal[features])[:,1],'futureMove':a.predict_proba(future[features])[:,1],
        'calUp':b.predict_proba(cal[features])[:,1],'futureUp':b.predict_proba(future[features])[:,1],
        'yCalMove':calmove,'yCalUp':(ycal[calmove==1]==2).astype(int),
        'calMoveMask':calmove==1,'models':(a,b),'features':features}

def binary_calibrate(raw,y,values,method):
    raw=np.clip(np.asarray(raw),1e-6,1-1e-6);values=np.clip(np.asarray(values),1e-6,1-1e-6)
    if len(np.unique(y))<2:return np.repeat((np.sum(y)+.5)/(len(y)+1),len(values))
    if method=='platt':
        logit=lambda v:np.log(v/(1-v))[:,None]
        m=LogisticRegression(C=SETTINGS['calibratorPlattC'],max_iter=1000,random_state=SETTINGS['seed']).fit(logit(raw),y)
        p=m.predict_proba(logit(values))[:,1]
    elif method=='isotonic':
        m=IsotonicRegression(out_of_bounds='clip').fit(raw,y);p=m.predict(values)
    else:raise ValueError('UNKNOWN_CALIBRATION')
    return np.clip(p,1e-6,1-1e-6)

def calibrated_hurdle(raw,cal_a,cal_b):
    move=binary_calibrate(raw['calMove'],raw['yCalMove'],raw['futureMove'],cal_a)
    up=binary_calibrate(raw['calUp'][raw['calMoveMask']],raw['yCalUp'],raw['futureUp'],cal_b)
    return {'probabilities':compose(move,up),'move':move,'upGivenMove':up}

def raw_architecture(train,cal,future,group,family,architecture,drop=()):
    if architecture=='AIDI_HURDLE':
        return {'aidi':raw_hurdle(train,cal,future,[c for c in columns(group) if c not in drop],family)}
    if architecture=='REGIONAL_EXPERT':
        assert len(set(columns(group,'us',expert=True)+columns(group,'eu',expert=True)))<=SETTINGS['featureHardLimit']
        return {region:raw_hurdle(train,cal,future,[c for c in columns(group,region,expert=True) if c not in drop],family,region+'_target') for region in ['us','eu']}
    raise ValueError('UNKNOWN_ARCHITECTURE')

def architecture_probabilities(raw,cal_a,cal_b):
    if 'aidi' in raw:return calibrated_hurdle(raw['aidi'],cal_a,cal_b)
    experts={name:calibrated_hurdle(value,cal_a,cal_b) for name,value in raw.items()}
    p=.5*experts['us']['probabilities']+.5*experts['eu']['probabilities']
    move=1-p[:,1];up=p[:,2]/move
    return {'probabilities':p,'move':move,'upGivenMove':up,'experts':experts}

def ece(y,p):
    y=np.asarray(y,dtype=int);p=np.asarray(p);pred=p.argmax(axis=1);conf=p.max(axis=1)
    def compute(truth,prob):
        total=0.
        edges=np.linspace(0,1,11)
        for i in range(10):
            mask=(prob>=edges[i])&(prob<edges[i+1] if i<9 else prob<=edges[i+1])
            if mask.any():total+=mask.mean()*abs(np.mean(truth[mask])-np.mean(prob[mask]))
        return float(total)
    return compute(pred==y,conf),[compute(y==c,p[:,c]) for c in range(p.shape[1])]

def multiclass_metrics(y,p):
    y=np.asarray(y,dtype=int);p=np.clip(np.asarray(p),1e-12,1);p=p/p.sum(axis=1,keepdims=True)
    pred=p.argmax(axis=1);top,classes=ece(y,p)
    return {'n':len(y),'brier':float(np.mean(np.sum((p-np.eye(3)[y])**2,axis=1))),
      'logLoss':float(log_loss(y,p,labels=[0,1,2])),'ece':top,'classECE':classes,
      'accuracy':float(accuracy_score(y,pred)),'macroF1':float(f1_score(y,pred,labels=[0,1,2],average='macro',zero_division=0)),
      'recalls':recall_score(y,pred,labels=[0,1,2],average=None,zero_division=0).tolist(),
      'predictionCounts':np.bincount(pred,minlength=3).tolist(),'classCounts':np.bincount(y,minlength=3).tolist()}

def binary_metrics(y,p,hard=None):
    y=np.asarray(y,dtype=int);p=np.clip(np.asarray(p),1e-6,1-1e-6)
    pred=(p>=.5).astype(int) if hard is None else np.asarray(hard,dtype=int)
    top,classes=ece(y,np.column_stack((1-p,p)))
    return {'n':len(y),'brier':float(np.mean((p-y)**2)),'logLoss':float(log_loss(y,np.column_stack((1-p,p)),labels=[0,1])),
        'auc':float(roc_auc_score(y,p)) if len(np.unique(y))==2 else None,
        'accuracy':float(accuracy_score(y,pred)),'precision':float(precision_score(y,pred,zero_division=0)),
        'recall':float(recall_score(y,pred,zero_division=0)),'ece':top,'classECE':classes}

def baseline(train,cal,future):
    known=np.r_[classify(train.target),classify(cal.target)]
    freq=(np.bincount(known,minlength=3)+.5)/(len(known)+1.5)
    all_past=np.r_[train.past_direction_return,cal.past_direction_return]
    past=classify(all_past);later=classify(future.past_direction_return);n=len(future)
    def probabilities(labels,confidence):
        p=np.full((n,3),(1-confidence)/2);p[np.arange(n),labels]=confidence;return p
    out={'frequency':np.tile(freq,(n,1)),'dominant':probabilities(np.full(n,np.argmax(freq)),.96)}
    out['continuation']=probabilities(later,float(np.clip(np.mean(past==known),1/3,.95)))
    out['mean_reversion']=probabilities(2-later,float(np.clip(np.mean(2-past==known),1/3,.95)))
    significant=known!=1
    direction=(all_past[significant]>=0).astype(int);truth=(known[significant]==2).astype(int)
    hit=float(np.clip(np.mean(direction==truth),.5,.95))
    next_direction=(future.past_direction_return.to_numpy()>=0).astype(int)
    p_up=np.where(next_direction==1,hit,1-hit)
    return {'multiclass':out,'moveFrequency':np.repeat(1-freq[1],n),
       'directionMomentum':p_up,'momentumHard':next_direction,
       'directionFrequency':np.repeat((truth.sum()+.5)/(len(truth)+1),n),
       'momentumConfidenceFromPreTest':hit}

def v4_best(train,cal,future):
    cols=[c for c in train if c.startswith(('aidi_','brent_','wti_','eia_','season_'))]
    cols+=['us_eu_divergence','nyh_usgc_divergence','regional_volatility_ratio',
      'cross_region_dispersion','regional_direction_agreement','us_crude_return_spread','eu_crude_return_spread']
    assert len(cols)==38 and not any('target' in c for c in cols)
    old=load_v4('evaluate')
    pc,pf=old.raw_predictions(train,cal,future,cols,'elastic_net',SETTINGS['threshold'])
    return old.calibrate(pc,classify(cal.target),pf,'platt')

def direct_three_class(train,cal,future,config):
    if config['architecture']=='AIDI_HURDLE':features=columns(config['group'])
    else:features=list(dict.fromkeys(columns(config['group'],'us',expert=True)+columns(config['group'],'eu',expert=True)))
    m=estimator(config['family']).fit(train[features],classify(train.target))
    old=load_v4('evaluate')
    return old.calibrate(m.predict_proba(cal[features]),classify(cal.target),m.predict_proba(future[features]),'platt')
