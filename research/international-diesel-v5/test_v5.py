"""Negative data-time, contract, holdout and probability tests; no final scoring."""
import copy,json,subprocess,tempfile,unittest
from pathlib import Path
from unittest.mock import patch,Mock
import numpy as np
import pandas as pd
from common import ROOT,V4,SETTINGS,sha,save,versions,check_authorization,compose,round_probabilities,classify
from prepare import (load_dataset,audit_row,cot_availability,cftc,seasonal_reference,
    audit_seasonal_reference,load_v4)
from experiment import assert_development,fold,preregister,final_split
from model import raw_architecture,architecture_probabilities,columns,raw_hurdle

class V5Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data=load_dataset()
        cls.provenance=json.loads((ROOT/'data/provenance.json').read_text())

    def specimen(self,feature):
        data=self.data[self.data[feature].notna()]
        row=data.iloc[len(data)//2].copy()
        prov=copy.deepcopy(self.provenance[str(row.name.date())])
        return row,prov

    def test_01_target_freeze_before_v4_final(self):
        proof=json.loads((ROOT/'data/TARGET_FREEZE_INTEGRITY.json').read_text())
        self.assertEqual(proof['gate'],'PASS');self.assertTrue(all(proof['checks'].values()))
        self.assertEqual(SETTINGS['threshold'],.0075)
        self.assertEqual(classify([-.0075001,-.0075,.0075,.0075001]).tolist(),[0,1,1,2])

    def test_02_future_cftc_rejected(self):
        row,p=self.specimen('managedMoneyNetShare')
        p['managedMoneyNetShare']['availableAt']=str(row.decisionAt+pd.Timedelta(weeks=1))
        with self.assertRaisesRegex(ValueError,'LEAKAGE_FAIL'):audit_row(row,p)

    def test_03_tuesday_before_friday_release_rejected(self):
        available,_=cot_availability('2020-03-03')
        before=pd.Timestamp('2020-03-06 15:29',tz='America/New_York').tz_convert('UTC')
        self.assertGreater(available,before)
        self.assertGreater(available,pd.Timestamp('2020-03-03',tz='UTC'))

    def test_04_future_eia_release_rejected(self):
        row,p=self.specimen('inventory_change_1w')
        p['inventory_change_1w']['availableAt']=str(row.decisionAt+pd.Timedelta(weeks=1))
        with self.assertRaisesRegex(ValueError,'LEAKAGE_FAIL'):audit_row(row,p)

    def test_05_future_eu_bulletin_rejected(self):
        row,p=self.specimen('aidi_return_1w')
        p['aidi_return_1w']['availableAt']=str(row.decisionAt+pd.Timedelta(weeks=1))
        p['aidi_return_1w']['sourceId']='future-EU-bulletin'
        with self.assertRaisesRegex(ValueError,'LEAKAGE_FAIL'):audit_row(row,p)

    def test_06_target_week_return_rejected_even_fake_early_release(self):
        row,p=self.specimen('aidi_return_1w')
        row['target_week_return']=float(row.target)
        p['target_week_return']={'value':float(row.target),'availableAt':str(row.decisionAt-pd.Timedelta(days=1)),
           'observedAt':str(row.targetStart),'sourceId':'injected-target'}
        with self.assertRaisesRegex(ValueError,'target overlap'):audit_row(row,p)

    def test_07_future_year_inventory_reference_rejected(self):
        original=load_v4('prepare').eia_weekly()
        date=pd.Timestamp('2019-06-03');cutoff=original.loc[date,'availableAt']
        _,ref=seasonal_reference(original,date,cutoff)
        future=original.tail(1).copy();future.index=pd.DatetimeIndex([date+pd.Timedelta(weeks=104)])
        future['availableAt']=cutoff-pd.Timedelta(days=1)
        with self.assertRaisesRegex(ValueError,'future seasonal'):audit_seasonal_reference(pd.concat([ref,future]),date,cutoff)
        saved=json.loads((ROOT/'data/eia-seasonal-reference.json').read_text())
        self.assertTrue(all(all(y<pd.Timestamp(v['week']).year for y in v['priorYears']) for v in saved))

    def test_08_holdout_excluded_from_selection_features_threshold_hyperparameters(self):
        data=self.data.copy();data.loc[data.index[0],'targetStart']=pd.Timestamp('2022-01-03',tz='UTC')
        for purpose in ['feature selection','threshold','hyperparameter','architecture']:
            with self.subTest(purpose=purpose),self.assertRaisesRegex(ValueError,'HOLDOUT_IN_DEVELOPMENT'):
                assert_development(data)
        self.assertLess(self.data.targetStart.max(),pd.Timestamp('2022-01-01',tz='UTC'))

    def test_09_holdout_calibration_frame_rejected(self):
        tr,ca,fu=fold(self.data,2018);ca=ca.copy();ca.loc[ca.index[0],'targetStart']=pd.Timestamp('2022-01-03',tz='UTC')
        with self.assertRaisesRegex(ValueError,'HOLDOUT_TRAIN_OR_CALIBRATION'):
            raw_hurdle(tr,ca,fu,columns('BASE'),'logistic')

    def test_10_future_leading_shift_rejected(self):
        row,p=self.specimen('aidi_return_1w')
        p['aidi_return_1w']['availableAt']=str(pd.Timestamp(p['aidi_return_1w']['availableAt'])+pd.Timedelta(weeks=1))
        with self.assertRaisesRegex(ValueError,'LEAKAGE_FAIL'):audit_row(row,p)

    def test_11_past_shift_detects_frozen_definition_mismatch(self):
        row,p=self.specimen('aidi_return_1w')
        p['aidi_return_1w']['sourceId']='v4:'+str((row.name-pd.Timedelta(weeks=1)).date())
        with self.assertRaisesRegex(ValueError,'ALIGNMENT_FAIL'):audit_row(row,p)

    def test_12_pre2013_cftc_cannot_enter(self):
        row,p=self.specimen('managedMoneyNetShare')
        p['managedMoneyNetShare']['observedAt']='2012-12-18T00:00:00Z'
        p['managedMoneyNetShare']['availableAt']='2012-12-28T21:00:00Z'
        with self.assertRaisesRegex(ValueError,'CONTRACT_BREAK_FAIL'):audit_row(row,p)
        audited=pd.read_csv(ROOT/'data/cftc-audited.csv')
        self.assertGreaterEqual(pd.to_datetime(audited.reportDate).min(),pd.Timestamp('2013-06-04'))
        table,_=cftc()
        self.assertTrue(table.loc['2025-09-29':'2025-12-22','availableAt'].isna().all())

    def test_13_all_snapshots_availability_and_provenance(self):
        for _,row in self.data.iterrows():audit_row(row,self.provenance[str(row.name.date())])
        for year in SETTINGS['developmentYears']:
            tr,ca,fu=fold(self.data,year)
            self.assertLess(tr.labelKnownAt.max(),ca.decisionAt.min())
            self.assertLess(ca.labelKnownAt.max(),fu.decisionAt.min())

    def test_14_model_never_peeks_future_move_membership(self):
        tr,ca,fu=fold(self.data,2018);poison=fu.copy()
        for col in ['target','us_target','eu_target']:poison[col]=-.1 if col=='target' else .1
        for architecture in ['AIDI_HURDLE','REGIONAL_EXPERT']:
            a=architecture_probabilities(raw_architecture(tr,ca,fu,'BASE','logistic',architecture),'platt','platt')
            b=architecture_probabilities(raw_architecture(tr,ca,poison,'BASE','logistic',architecture),'platt','platt')
            np.testing.assert_allclose(a['probabilities'],b['probabilities'],atol=1e-12,rtol=0)
            self.assertEqual(len(a['upGivenMove']),len(fu))

    def test_15_probability_formula_and_exact_sum(self):
        move=np.array([.72,.01,.999]);up=np.array([.35,.9,.001])
        p=compose(move,up)
        np.testing.assert_allclose(p[:,0],move*(1-up),atol=1e-12)
        np.testing.assert_allclose(p[:,1],1-move,atol=1e-12)
        np.testing.assert_allclose(p[:,2],move*up,atol=1e-12)
        np.testing.assert_allclose(p.sum(axis=1),1,rtol=0,atol=1e-9)

    def test_16_integer_ui_rounding(self):
        self.assertEqual(round_probabilities([.474,.281,.245]),[47,28,25])
        self.assertEqual(sum(round_probabilities([1/3]*3)),100)
        script="import {roundProbabilitiesTo100} from "+json.dumps((ROOT/'ui/probability.js').as_uri())+"; const v=roundProbabilitiesTo100([.474,.281,.245]);if(JSON.stringify(v)!=='[47,28,25]')process.exit(1);if(roundProbabilitiesTo100([1/3,1/3,1/3]).reduce((a,b)=>a+b)!==100)process.exit(1);"
        result=subprocess.run(['node','--input-type=module','-e',script],capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stderr)

    def fake_plan(self,directory):
        directory=Path(directory);(directory/'data').mkdir();(directory/'data/dataset.csv').write_text('fixed-data\n')
        (directory/'data/provenance.json').write_text('{}\n');(directory/'settings.json').write_text('{}\n')
        plan={'protectedFileHashes':{'settings.json':sha(directory/'settings.json')},
          'datasetSha256':sha(directory/'data/dataset.csv'),'provenanceSha256':sha(directory/'data/provenance.json'),
          'inheritedV4Hashes':{},'rawHashes':{},'dependencyVersions':versions()}
        save(directory/'V5_PREREGISTERED_PLAN.json',plan)
        (directory/'V5_PREREGISTERED_PLAN.sha256').write_text(sha(directory/'V5_PREREGISTERED_PLAN.json')+' plan\n')
        return directory

    def test_17_config_mutation_invalidates_final_authorization(self):
        for purpose in ['features','threshold','hyperparameters','calibration','architecture']:
            with self.subTest(purpose=purpose),tempfile.TemporaryDirectory() as tmp:
                root=self.fake_plan(tmp);self.assertIsInstance(check_authorization(root),dict)
                (root/'settings.json').write_text(json.dumps({purpose:'modified'}))
                with self.assertRaisesRegex(ValueError,'AUTHORIZATION_INVALID'):check_authorization(root)

    def test_18_plan_is_immutable(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'V5_PREREGISTERED_PLAN.json').write_text('{}')
            with patch('experiment.ROOT',root),self.assertRaisesRegex(ValueError,'IMMUTABLE'):
                preregister()

    def test_19_default_does_not_read_final_results(self):
        import run
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'V5_PREREGISTERED_PLAN.json').write_text('{}')
            (root/'results').mkdir();(root/'results/final-result.json').write_text('MUST_NOT_READ')
            with patch('run.ROOT',root),patch('run.authorization',return_value={}),patch('run.evaluate_final') as evaluate:
                run.main([])
                evaluate.assert_not_called()

    def test_20_final_cannot_be_formally_run_twice(self):
        import run
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'V5_PREREGISTERED_PLAN.json').write_text('{}')
            (root/'results').mkdir();(root/'results/FINAL_EVALUATION_STARTED.json').write_text('{}')
            with patch('run.ROOT',root),patch('run.authorization',return_value={}),patch('run.evaluate_final') as evaluate:
                with self.assertRaisesRegex(ValueError,'ALREADY_STARTED'):run.main(['--unlock-final-holdout'])
                evaluate.assert_not_called()

    def test_21_full_selected_input_union_within_cap(self):
        for group in ['BASE','CFTC','EIA','BOTH']:
            self.assertLessEqual(len(columns(group)),30)
            self.assertLessEqual(len(set(columns(group,'us',expert=True)+columns(group,'eu',expert=True))),30)
        d=json.loads((ROOT/'results/development.json').read_text())
        self.assertLessEqual(len(set(sum(d['selectedFeatures'].values(),[]))),25)
        self.assertNotIn('target',sum(d['selectedFeatures'].values(),[]))

    def test_22_source_raw_hashes_and_production_scope(self):
        for file in (ROOT/'data/raw').glob('*.meta.json'):
            meta=json.loads(file.read_text());raw=file.with_name(file.name.removesuffix('.meta.json'))
            self.assertEqual(sha(raw),meta['sha256'])
        repo=ROOT.parent.parent
        if (repo/'.git').exists():
            result=subprocess.run(['git','diff','--exit-code',SETTINGS['v4Sha'],'--','dist','scripts','.github','package.json','package-lock.json'],cwd=repo,capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stdout)

    def test_23_fail_never_generates_current_probability(self):
        result=ROOT/'results/final-result.json'
        if result.exists() and json.loads(result.read_text())['V5_MODEL_GATE']=='FAIL':
            self.assertFalse((ROOT/'CURRENT_AIDI_FORECAST_V5.json').exists())
            self.assertFalse((ROOT/'results/model-artifact.joblib').exists())
            self.assertFalse((ROOT/'ui/forecast.json').exists())
        state=json.loads((ROOT/'CURRENT_AIDI_STATE.json').read_text())
        self.assertIs(state['isPrediction'],False);self.assertIsNone(state['probabilities'])

if __name__=='__main__':
    suite=unittest.defaultTestLoader.loadTestsFromTestCase(V5Tests)
    result=unittest.TextTestRunner(verbosity=2).run(suite)
    save(ROOT/'results/TEST_RESULTS.json',{'gate':'PASS' if result.wasSuccessful() else 'FAIL',
      'testsRun':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),
      'negativeLeakTests':True,'formalHoldoutEvaluationRunByTests':False})
    raise SystemExit(0 if result.wasSuccessful() else 1)
