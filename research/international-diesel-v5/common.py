"""Shared immutable-plan utilities; no network or production paths."""
import hashlib, importlib.util, json, platform
from datetime import datetime, timezone
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parent
V4=ROOT.parent/'international-diesel-v4'
SETTINGS=json.loads((ROOT/'settings.json').read_text())
def sha(path): return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def now(): return datetime.now(timezone.utc).isoformat()
def save(path, value, exclusive=False):
    path=Path(path); path.parent.mkdir(parents=True,exist_ok=True)
    with path.open('x' if exclusive else 'w') as f:
        json.dump(value,f,indent=2,ensure_ascii=False,allow_nan=False);f.write('\n')
def load_v4(name):
    spec=importlib.util.spec_from_file_location('v4_'+name,V4/(name+'.py'))
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
def versions():
    import pandas, scipy, sklearn
    return {'python':platform.python_version(),'numpy':np.__version__,'pandas':pandas.__version__,'scipy':scipy.__version__,'scikit-learn':sklearn.__version__}
def classify(values):
    a=np.asarray(values);t=SETTINGS['threshold']
    return np.where(a < -t,0,np.where(a > t,2,1))
def compose(move, up):
    move=np.clip(np.asarray(move),1e-6,1-1e-6);up=np.clip(np.asarray(up),1e-6,1-1e-6)
    p=np.column_stack((move*(1-up),1-move,move*up))
    if not np.allclose(p.sum(axis=1),1,rtol=0,atol=1e-9):raise ValueError('PROBABILITY_SUM_FAIL')
    return p
def round_probabilities(p):
    a=np.asarray(p,dtype=float)
    if len(a)!=3 or not np.isfinite(a).all() or (a<0).any() or abs(a.sum()-1)>1e-9: raise ValueError('INVALID_PROBABILITY')
    scaled=a*100;out=np.floor(scaled).astype(int)
    for i in np.argsort(-(scaled-out),kind='stable')[:100-out.sum()]:out[i]+=1
    return out.tolist()
def milestone(label,detail):
    path=ROOT/'results/MILESTONES.json'
    data=json.loads(path.read_text()) if path.exists() else []
    if any(v['milestone']==label for v in data):return
    data.append({'milestone':label,'at':now(),'detail':detail});save(path,data)
def set_phase(phase,**other):
    path=ROOT/'results/RESEARCH_STATE.json'
    old=json.loads(path.read_text()) if path.exists() else {}
    save(path,{**old,'phase':phase,'updatedAt':now(),**other})
def protected_hashes():
    names=['settings.json','common.py','prepare.py','model.py','experiment.py','run.py','reports.py','test_v5.py','requirements.txt','requirements-lock.txt']
    return {n:sha(ROOT/n) for n in names}
def check_authorization(root=None):
    root=Path(root) if root else ROOT
    plan=json.loads((root/'V5_PREREGISTERED_PLAN.json').read_text())
    expected=(root/'V5_PREREGISTERED_PLAN.sha256').read_text().split()[0]
    if sha(root/'V5_PREREGISTERED_PLAN.json')!=expected:raise ValueError('FINAL_HOLDOUT_AUTHORIZATION_INVALID: plan hash')
    for file,digest in plan['protectedFileHashes'].items():
        if sha(root/file)!=digest:raise ValueError('FINAL_HOLDOUT_AUTHORIZATION_INVALID: '+file)
    if sha(root/'data/dataset.csv')!=plan['datasetSha256']:raise ValueError('FINAL_HOLDOUT_AUTHORIZATION_INVALID: dataset')
    if sha(root/'data/provenance.json')!=plan['provenanceSha256']:raise ValueError('FINAL_HOLDOUT_AUTHORIZATION_INVALID: provenance')
    for file,digest in plan['inheritedV4Hashes'].items():
        if sha(root.parent/'international-diesel-v4'/file)!=digest:raise ValueError('FINAL_HOLDOUT_AUTHORIZATION_INVALID: V4 '+file)
    for file,digest in plan['rawHashes'].items():
        if sha(root/file)!=digest:raise ValueError('FINAL_HOLDOUT_AUTHORIZATION_INVALID: raw '+file)
    if versions()!=plan['dependencyVersions']:raise ValueError('FINAL_HOLDOUT_AUTHORIZATION_INVALID: dependencies')
    return plan
