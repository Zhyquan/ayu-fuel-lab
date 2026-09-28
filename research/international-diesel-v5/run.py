"""Default stops at preregistration. Final scores require an explicit unlock."""
import os
os.environ.setdefault('OMP_NUM_THREADS','1')
os.environ.setdefault('OPENBLAS_NUM_THREADS','1')
os.environ['PYTHONDONTWRITEBYTECODE']='1'
import argparse,json,shutil,subprocess,sys
from pathlib import Path
sys.dont_write_bytecode=True
from common import ROOT,V4,save,sha,now,check_authorization,set_phase,milestone
from prepare import prepare
from experiment import development,preregister,evaluate_final
from reports import data_reports,development_reports,candidate_ui,final_reports

def tests_gate():
    result=subprocess.run([sys.executable,str(ROOT/'test_v5.py')],env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1'})
    if result.returncode:raise ValueError('TEST_GATE_FAIL_NO_PREREGISTRATION')

def authorization():
    try:return check_authorization()
    except Exception:
        set_phase('PREREGISTERED',finalHoldoutAuthorization='INVALID')
        raise

def reproduce(destination,unlock):
    destination=Path(destination).resolve()
    if destination.exists():raise ValueError('REPRODUCTION_DESTINATION_MUST_BE_NEW')
    destination.mkdir(parents=True)
    parent=destination/'research';parent.mkdir()
    shutil.copytree(V4,parent/V4.name,ignore=shutil.ignore_patterns('__pycache__'))
    ignored=['__pycache__','CURRENT_AIDI_FORECAST_V5.json','model-artifact.joblib',
      'FINAL_EVALUATION_STARTED.json','final-result.json','final-predictions.json','MODEL_FREEZE.json',
      'MILESTONES.json','RESEARCH_STATE.json','TEST_RESULTS.json','UI_VERIFICATION.json','candidate-mobile.png']
    shutil.copytree(ROOT,parent/ROOT.name,ignore=shutil.ignore_patterns(*ignored))
    command=[sys.executable,str(parent/ROOT.name/'run.py'),'--reproduce-frozen-plan']
    if unlock:command+=['--unlock-final-holdout']
    result=subprocess.run(command,env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1'})
    if result.returncode:raise ValueError('REPRODUCTION_FAILED')
    if unlock:
        original=json.loads((ROOT/'results/final-result.json').read_text())
        repeated=json.loads((parent/ROOT.name/'results/final-result.json').read_text())
        checks={'sameSelection':original['selection']==repeated['selection'],
          'sameDatasetHash':sha(ROOT/'data/dataset.csv')==sha(parent/ROOT.name/'data/dataset.csv'),
          'samePlanHash':sha(ROOT/'V5_PREREGISTERED_PLAN.json')==sha(parent/ROOT.name/'V5_PREREGISTERED_PLAN.json'),
          'sameModelGate':original['V5_MODEL_GATE']==repeated['V5_MODEL_GATE'],
          'sameScores':all(abs(original['metrics'][k]-repeated['metrics'][k])<1e-10 for k in ['brier','logLoss','ece','accuracy']),
          'productionFilesChanged':0,'networkRequests':0,'formalResultChanged':False}
        save(ROOT/'results/REPRODUCTION_RESULT.json',{'gate':'PASS' if all(checks[k] for k in ['sameSelection','sameDatasetHash','samePlanHash','sameModelGate','sameScores']) else 'FAIL',**checks})
    print(json.dumps({'reproductionComplete':True,'finalUnlocked':unlock,'formalResultUnchanged':True}))

def main(argv=None):
    parser=argparse.ArgumentParser()
    parser.add_argument('--unlock-final-holdout',action='store_true')
    parser.add_argument('--reproduce-to')
    parser.add_argument('--reproduce-frozen-plan',action='store_true')
    parser.add_argument('--write-final-reports',action='store_true')
    parser.add_argument('--audit-only',action='store_true')
    args=parser.parse_args(argv)
    if args.reproduce_to:
        return reproduce(args.reproduce_to,args.unlock_final_holdout)
    plan_path=ROOT/'V5_PREREGISTERED_PLAN.json'
    if args.write_final_reports:
        authorization()
        if not (ROOT/'results/final-result.json').exists():raise ValueError('NO_FROZEN_FINAL_RESULT')
        dev=json.loads((ROOT/'results/development.json').read_text());development_reports(dev)
        result=json.loads((ROOT/'results/final-result.json').read_text())
        final_reports(result);return
    if plan_path.exists() and not args.reproduce_frozen_plan:
        plan=authorization()
    else:
        prepare();data_reports()
        if args.audit_only:return
        dev=development();development_reports(dev);candidate_ui();tests_gate()
        if args.reproduce_frozen_plan:
            plan=authorization()
            if sha(ROOT/'results/development.json')!=plan['developmentSha256']:raise ValueError('DEVELOPMENT_REPRODUCTION_HASH_FAIL')
        else:plan=preregister()
    if not args.unlock_final_holdout:
        state_path=ROOT/'results/RESEARCH_STATE.json'
        phase=json.loads(state_path.read_text()).get('phase') if state_path.exists() else 'PREREGISTERED'
        print(json.dumps({'phase':phase,'finalHoldoutResultsReadThisInvocation':False,'planSha256':sha(plan_path),
          'message':'Final scores not loaded; explicit --unlock-final-holdout required'}));return
    plan=authorization()
    marker=ROOT/'results/FINAL_EVALUATION_STARTED.json'
    if marker.exists():raise ValueError('FINAL_EVALUATION_ALREADY_STARTED_NO_RERUN')
    save(marker,{'startedAt':now(),'planSha256':sha(plan_path),'kind':'FROZEN_PLAN_REPRODUCTION' if args.reproduce_frozen_plan else 'FORMAL_ONCE',
      'explicitUnlock':True},exclusive=True)
    milestone('M6','Explicit final holdout unlock; frozen plan hash verified')
    result=evaluate_final(plan)
    save(ROOT/'results/MODEL_FREEZE.json',{'planSha256':sha(plan_path),
        'finalResultSha256':sha(ROOT/'results/final-result.json'),'finalPredictionsSha256':sha(ROOT/'results/final-predictions.json'),
        'frozenAt':now(),'noModelOrThresholdChangesAfterFinal':True},exclusive=True)
    external=ROOT/'data/asia-access-audit.json'
    if not external.exists():
        save(external,{'status':'UNAVAILABLE','japanStatus':'UNAVAILABLE','mgoStatus':'UNAVAILABLE','n':0,
          'statistics':None,'reason':'External retrieval not yet admitted; offline pipeline never fabricates validation',
          'modelFreezeSha256':sha(ROOT/'results/MODEL_FREEZE.json'),'usedInSelection':False})
    final_reports(result)
    tests_gate()

if __name__=='__main__':
    main()
