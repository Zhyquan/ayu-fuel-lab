import hashlib
import json
import unittest
import numpy as np
import pandas as pd
from prepare import ROOT, SPEC, us_weekly
from backtest import load, split, columns
from evaluate import metrics, normalize, calibrate, classify

class WeeklyResearchTests(unittest.TestCase):
    def test_spec_identity_and_no_old_target(self):
        frozen=json.loads((ROOT/'SPEC_FREEZE.json').read_text())
        self.assertEqual(frozen['sha256'],hashlib.sha256((ROOT/'spec.json').read_bytes()).hexdigest())
        self.assertEqual(SPEC['primary'],'LOCAL_CURRENCY')
        self.assertEqual(SPEC['regionWeights'],{'US':.5,'EU':.5})
        self.assertFalse(frozen['testOpened'])

    def test_raw_hashes(self):
        audit=json.loads((ROOT/'data/DATA_AUDIT.json').read_text())
        for name,digest in audit['rawHashes'].items():
            self.assertEqual(hashlib.sha256((ROOT/name).read_bytes()).hexdigest(),digest,name)

    def test_weekly_release_archive_bytes(self):
        import zipfile
        with zipfile.ZipFile(ROOT/'data/raw/eia-weekly-releases.zip') as archive:
            files=[name for name in archive.namelist() if name.endswith('.csv')]
            self.assertEqual(len(files),769)
            for name in files:
                meta=json.loads(archive.read(name+'.meta.json'))
                self.assertEqual(hashlib.sha256(archive.read(name)).hexdigest(),meta['sha256'])

    def test_original_zip_and_csv_match(self):
        import io,zipfile
        for series in ['DDFUELNYH','DDFUELUSGULF','DCOILBRENTEU','DCOILWTICO']:
            original=[]
            for path in sorted((ROOT/'data/raw').glob(series+'-initial-*.zip')):
                with zipfile.ZipFile(path) as z:
                    name,=[n for n in z.namelist() if n.endswith('.csv')]
                    original.append(pd.read_csv(io.BytesIO(z.read(name)),na_values=['.']))
            expected=pd.concat(original).drop_duplicates().sort_values('period_start_date').reset_index(drop=True)
            actual=pd.read_csv(ROOT/'data/raw'/(series+'-initial.csv'))
            pd.testing.assert_frame_equal(expected,actual,check_dtype=False)

    def test_complete_calendar_and_formula(self):
        p=pd.read_csv(ROOT/'data/weekly-index.csv',index_col='week',parse_dates=['week'])
        self.assertTrue((p.index.to_series().diff().dropna()==pd.Timedelta(days=7)).all())
        self.assertTrue((p.index.weekday==0).all())
        valid=p[['aidi_return','us_return','eu_return']].dropna()
        np.testing.assert_allclose(valid.aidi_return,.5*valid.us_return+.5*valid.eu_return,atol=1e-11)
        self.assertTrue(p.aidi_return[p.eu_matched<SPEC['euMinimumMatchedCountries']].isna().all())
        # Reindex to full calendar remains mandatory; no repeated daily labels.
        self.assertTrue(p.index.is_unique)

    def test_partial_us_week_and_anomaly(self):
        w=us_weekly('DDFUELUSGULF')
        self.assertNotIn(pd.Timestamp('2026-09-21'),w.index)
        self.assertTrue((w.price>0).all())
        d=pd.read_csv(ROOT/'data/raw/DDFUELUSGULF-initial.csv')
        self.assertEqual(float(d[d.period_start_date=='2022-02-22'].DDFUELUSGULF.iloc[0]),0)

    def test_available_at_and_purged_boundaries(self):
        d=load()
        self.assertTrue((d.featureAvailableAt<=d.decisionAt).all())
        for year in SPEC['validationYears']+SPEC['testYears']:
            train,cal,test=split(d,year)
            self.assertLess(train.labelKnownAt.max(),cal.decisionAt.min())
            self.assertLess(cal.labelKnownAt.max(),test.decisionAt.min())
            self.assertTrue(set(train.index).isdisjoint(test.index))
            self.assertTrue(set(cal.index).isdisjoint(test.index))

    def test_region_separation_and_capacity(self):
        d=load()
        for region in ['composite','us','eu']:
            c=columns(d,region)
            self.assertLessEqual(len(c),40)
            self.assertFalse(any('japan' in name.lower() for name in c))
            if region=='us':self.assertFalse(any(name.startswith('eu_') for name in c))
            if region=='eu':self.assertFalse(any(name.startswith('us_') or name.startswith('nyh_') for name in c))

    def test_no_test_selection(self):
        if not(ROOT/'results/SELECTION_FREEZE.json').exists():return
        value=json.loads((ROOT/'results/SELECTION_FREEZE.json').read_text())
        self.assertFalse(value['testOpened']);self.assertFalse(value['japanUsed'])
        entries=json.loads((ROOT/'results/validation.json').read_text())['entries']
        self.assertEqual({x['year'] for x in entries},set(SPEC['validationYears']))
        self.assertEqual(value['datasetSha256'],hashlib.sha256((ROOT/'data/weekly-dataset.csv').read_bytes()).hexdigest())

    def test_probabilities_and_scoring(self):
        y=np.array([0,1,2]);p=np.eye(3)
        self.assertLess(metrics(y,p)['brier'],1e-8)
        self.assertLess(metrics(y,p)['logLoss'],1e-5)
        np.testing.assert_allclose(normalize(np.ones((5,3))).sum(axis=1),1)
        np.testing.assert_array_equal(classify([-.011,-.01,0,.01,.011],.01),[0,1,1,1,2])

    def test_calibration_does_not_need_future_truth(self):
        pcal=np.tile([.2,.5,.3],(60,1));y=np.tile([0,1,2],20);pfuture=np.array([[.1,.7,.2],[.7,.2,.1]])
        for method in ['raw','platt','isotonic']:
            result=calibrate(pcal,y,pfuture,method)
            self.assertEqual(result.shape,(2,3));self.assertTrue(np.isfinite(result).all())
            np.testing.assert_allclose(result.sum(axis=1),1)

    def test_failure_product_has_no_forecast_or_model(self):
        if not(ROOT/'results/model-result.json').exists():return
        m=json.loads((ROOT/'results/model-result.json').read_text())
        if m['INTERNATIONAL_DIESEL_MODEL_GATE_V4']=='FAIL':
            self.assertFalse((ROOT/'CURRENT_AIDI_FORECAST.json').exists())
            self.assertEqual(list(ROOT.glob('*.pkl')),[])
            if (ROOT/'ui/index.html').exists():
                ui=(ROOT/'ui/index.html').read_text()
                self.assertIn('模型验证中',ui)
                self.assertNotIn('probabilities',ui)

if __name__=='__main__':unittest.main()
