"""Small, fixed-capacity routes and honest chronological calibration."""
import numpy as np
from sklearn.pipeline import make_pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression, Ridge, ElasticNet
from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor
from sklearn.isotonic import IsotonicRegression
from sklearn.metrics import accuracy_score, f1_score, recall_score, log_loss

ROUTES = ['logistic','boost_classifier','ridge','elastic_net','boost_regressor','quantile_cdf']
CALIBRATORS = ['raw','platt','isotonic']

def normalize(p):
    p = np.maximum(np.asarray(p, dtype=float), 1e-6)
    return p/p.sum(axis=1, keepdims=True)

def classify(r, threshold, binary=False):
    return (np.asarray(r)>0).astype(int) if binary else np.where(np.asarray(r)<-threshold,0,np.where(np.asarray(r)>threshold,2,1))

def ece(y, p):
    values = []
    for c in range(p.shape[1]):
        result = 0.
        for low in np.arange(0,1,.1):
            mask = (p[:,c] >= low) & (p[:,c] < low+.1+1e-12)
            if mask.any():
                result += mask.mean()*abs((y[mask]==c).mean()-p[mask,c].mean())
        values.append(float(result))
    winner = p.argmax(axis=1); confidence=p.max(axis=1); top=0.
    for low in np.arange(0,1,.1):
        mask=(confidence>=low)&(confidence<low+.1+1e-12)
        if mask.any():top+=mask.mean()*abs((winner[mask]==y[mask]).mean()-confidence[mask].mean())
    return float(top),values

def metrics(y,p):
    p=normalize(p); y=np.asarray(y,dtype=int); pred=p.argmax(axis=1)
    top,classes=ece(y,p)
    buckets=[]
    for c in range(p.shape[1]):
        mask=(p[:,c]>=.55)&(p[:,c]<=.65)
        buckets.append({'n':int(mask.sum()),'meanForecast':float(p[mask,c].mean()) if mask.any() else None,
                        'realized':float((y[mask]==c).mean()) if mask.any() else None})
    return {'n':len(y),'brier':float(((p-np.eye(p.shape[1])[y])**2).sum(axis=1).mean()),
            'logLoss':float(log_loss(y,p,labels=list(range(p.shape[1])))), 'ece':top,'classECE':classes,
            'accuracy':float(accuracy_score(y,pred)), 'macroF1':float(f1_score(y,pred,average='macro',zero_division=0)),
            'recalls':recall_score(y,pred,labels=list(range(p.shape[1])),average=None,zero_division=0).tolist(),
            'predictionShares':np.bincount(pred,minlength=p.shape[1]).astype(float).tolist(), 'sixtyBuckets':buckets}

def baseline(train, future, threshold, binary=False):
    classes=2 if binary else 3
    y=classify(train.target,threshold,binary)
    freq=(np.bincount(y,minlength=classes)+.5)/(len(y)+.5*classes)
    n=len(future); out={'frequency':np.tile(freq,(n,1))}
    def soft(label):
        probs=np.full((n,classes),.02)
        probs[np.arange(n),np.asarray(label,dtype=int)] = 1-.02*(classes-1)
        return probs
    out['dominant']=soft(np.repeat(np.argmax(freq),n))
    if not binary:out['always_flat']=soft(np.ones(n,dtype=int))
    known=classify(future.past_direction_return.fillna(0),threshold,binary)
    out['continuation']=soft(known)
    out['reversal']=soft(classes-1-known)
    return out

def estimator(route, quantile=None):
    if route=='logistic':m=LogisticRegression(C=.05,max_iter=1500,random_state=4001)
    elif route=='boost_classifier':m=HistGradientBoostingClassifier(max_iter=60,max_depth=2,min_samples_leaf=25,l2_regularization=.5,early_stopping=False,random_state=4001)
    elif route=='ridge':m=Ridge(alpha=100)
    elif route=='elastic_net':m=ElasticNet(alpha=.001,l1_ratio=.25,max_iter=5000,random_state=4001)
    else:m=HistGradientBoostingRegressor(loss='quantile' if quantile else 'squared_error',quantile=quantile,max_iter=60,max_depth=2,min_samples_leaf=25,l2_regularization=.5,early_stopping=False,random_state=4001)
    return make_pipeline(SimpleImputer(strategy='median',keep_empty_features=True),StandardScaler(),m)

def raw_predictions(train, cal, future, columns, route, threshold, binary=False):
    x=train[columns];r=train.target.to_numpy();y=classify(r,threshold,binary)
    if route in ['logistic','boost_classifier']:
        model=estimator(route).fit(x,y)
        return normalize(model.predict_proba(cal[columns])),normalize(model.predict_proba(future[columns]))
    if route=='quantile_cdf':
        qs=np.array([.05,.15,.3,.5,.7,.85,.95]); cal_q=[];future_q=[]
        for q in qs:
            model=estimator(route,float(q)).fit(x,r)
            cal_q.append(model.predict(cal[columns]));future_q.append(model.predict(future[columns]))
        def probabilities(values):
            values=np.sort(np.asarray(values).T,axis=1);output=[]
            for row in values:
                width=max(row[-1]-row[0],.005)
                points=np.r_[row[0]-width,row,row[-1]+width];cdf=np.r_[0,qs,1]
                down=np.interp(-threshold,points,cdf);up=1-np.interp(threshold,points,cdf)
                output.append([down,1-down-up,up])
            out=np.array(output)
            return normalize(out[:,[0,2]]) if binary else normalize(out)
        return probabilities(cal_q),probabilities(future_q)
    # Distribution residuals come from an honest chronological holdout contained
    # entirely in Train. No in-sample residuals and no calibration/test labels.
    split=max(40 if binary else 60,len(train)-52)
    warm=estimator(route).fit(x.iloc[:split],r[:split])
    residual=r[split:]-warm.predict(x.iloc[split:])
    if len(residual)<20:raise ValueError('Insufficient honest residual observations')
    model=estimator(route).fit(x,r)
    def probabilities(values):
        distribution=np.asarray(values)[:,None]+residual[None,:]
        down=(distribution < -threshold).sum(axis=1)+.5
        up=(distribution > threshold).sum(axis=1)+.5
        flat=((distribution >= -threshold)&(distribution <= threshold)).sum(axis=1)+.5
        out=np.c_[down,flat,up]
        return normalize(out[:,[0,2]]) if binary else normalize(out)
    return probabilities(model.predict(cal[columns])),probabilities(model.predict(future[columns]))

def calibrate(pcal,ycal,pfuture,method):
    pcal=normalize(pcal);pfuture=normalize(pfuture)
    if method=='raw':return pfuture
    result=[]
    for c in range(pcal.shape[1]):
        y=(ycal==c).astype(int)
        if len(np.unique(y))<2:
            result.append(np.repeat((y.sum()+.5)/(len(y)+1),len(pfuture)));continue
        if method=='platt':
            logit=lambda p:np.log(np.clip(p,1e-6,1-1e-6)/(1-np.clip(p,1e-6,1-1e-6)))[:,None]
            m=LogisticRegression(C=.25,max_iter=1000).fit(logit(pcal[:,c]),y)
            result.append(m.predict_proba(logit(pfuture[:,c]))[:,1])
        else:
            m=IsotonicRegression(out_of_bounds='clip').fit(pcal[:,c],y)
            result.append(m.predict(pfuture[:,c]))
    return normalize(np.array(result).T)
