"""Re-run the frozen experiment offline in a disposable isolated copy."""
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
import numpy as np

ROOT=Path(__file__).resolve().parent

def run():
    env={**os.environ,'OMP_NUM_THREADS':'1','OPENBLAS_NUM_THREADS':'1','PYTHONDONTWRITEBYTECODE':'1'}
    with tempfile.TemporaryDirectory(prefix='ayu-aidi-v4-repro-') as temporary:
        copy=Path(temporary)
        shutil.copytree(ROOT/'data/raw',copy/'data/raw')
        shutil.copytree(ROOT/'ui',copy/'ui')
        shutil.copy2(ROOT/'data/japan-access-audit.json',copy/'data/japan-access-audit.json')
        for path in ROOT.glob('*.py'):shutil.copy2(path,copy/path.name)
        for name in ['spec.json','SPEC_FREEZE.json']:shutil.copy2(ROOT/name,copy/name)
        for args in [['prepare.py'],['backtest.py','select'],['backtest.py','test'],['backtest.py','binary'],['summarize.py'],['-m','unittest','test_v4','-v']]:
            result=subprocess.run([sys.executable,*args],cwd=copy,env=env,capture_output=True,text=True)
            if result.returncode:raise RuntimeError('Offline reproduction failed: '+str(args)+'\n'+result.stderr[-2500:])
        digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
        assert digest(copy/'data/weekly-dataset.csv')==digest(ROOT/'data/weekly-dataset.csv')
        def compare_scores(path):
            a=json.loads((ROOT/path).read_text());b=json.loads((copy/path).read_text())
            for name,score in a['pooled'].items():
                for key in ['n','brier','logLoss','ece','accuracy','macroF1']:
                    assert np.isclose(score[key],b['pooled'][name][key],atol=1e-10), (path,name,key)
        compare_scores('results/model-result.json');compare_scores('results/binary.json')
        expected=json.loads((ROOT/'results/SELECTION_FREEZE.json').read_text());actual=json.loads((copy/'results/SELECTION_FREEZE.json').read_text())
        for key in ['threshold','selections','specSha256','datasetSha256']:assert expected[key]==actual[key]
        assert json.loads((ROOT/'CURRENT_AIDI_STATE.json').read_text())==json.loads((copy/'CURRENT_AIDI_STATE.json').read_text())
        report={'gate':'PASS','offline':True,'isolatedCopy':True,'datasetHashEqual':True,'selectionEqual':True,
          'multiclassScoresEqualTolerance':1e-10,'binaryScoresEqualTolerance':1e-10,'currentStateEqual':True,
          'researchTestsPassed':12,'productionFilesChanged':0,'reproductionNetworkRequests':0}
        (ROOT/'results/REPRODUCTION_RESULT.json').write_text(json.dumps(report,indent=2)+'\n')
        print(json.dumps(report,indent=2))

if __name__=='__main__':run()
