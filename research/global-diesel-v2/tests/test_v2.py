import sys
sys.dont_write_bytecode = True
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import json
import unittest
import tempfile
from unittest.mock import patch

import numpy as np
import pandas as pd
from threadpoolctl import threadpool_limits

from prepare import C, DATA, REPORTS, ROOT, FEATURES, available_at, classify, endpoint, features_at, load_series, choose_threshold
from evaluate import CLASSES, calibrate, empirical_probabilities, metrics, nonoverlapping, route_probabilities, split
from download import freeze_manifest


class DieselV2Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.frame = pd.read_csv(DATA/'dataset.csv', float_precision='round_trip')
        cls.series, cls.audit = load_series()

    def test_release_uses_us_local_day_end_and_dst(self):
        self.assertEqual(available_at('2026-09-23').isoformat(), '2026-09-24T05:00:00+00:00')
        self.assertEqual(available_at('2026-01-07').isoformat(), '2026-01-08T06:00:00+00:00')

    def test_holiday_rolls_forward_not_back(self):
        f = pd.DataFrame({'date': pd.to_datetime(['2024-01-08','2024-01-16']), 'price':[3.,3.1]})
        self.assertEqual(endpoint(f, pd.Timestamp('2024-01-08')).date, pd.Timestamp('2024-01-16'))

    def test_large_gap_and_unknown_endpoint_rejected(self):
        f = pd.DataFrame({'date':pd.to_datetime(['2024-01-08','2024-01-25']), 'price':[3.,3.1]})
        self.assertIsNone(endpoint(f,pd.Timestamp('2024-01-08')))
        self.assertIsNone(endpoint(f,pd.Timestamp('2024-01-25')))

    def test_deadband_includes_equal_boundaries(self):
        self.assertEqual([classify(v,.015) for v in [-.016,-.015,0,.015,.016]], ['DOWN','FLAT','FLAT','FLAT','UP'])

    def test_only_diesel_target(self):
        np.testing.assert_allclose(self.frame.return_7d, self.frame.price_t_plus_7/self.frame.price-1, atol=1e-15)
        self.assertNotIn('price',FEATURES)
        self.assertNotIn('price_t_plus_7',FEATURES)
        self.assertFalse(any('fx' in f or 'cycle' in f for f in FEATURES))

    def test_future_prices_cannot_change_features(self):
        ts=pd.Timestamp('2019-06-14T23:59:59',tz='America/New_York').tz_convert('UTC')
        original=features_at(self.series,ts)
        self.assertIsNotNone(original)
        mutated={k:v.copy() for k,v in self.series.items()}
        for f in mutated.values(): f.loc[f.availableAt>ts,'price']=999999
        self.assertEqual(original,features_at(mutated,ts))

    def test_threshold_cannot_see_validation_or_test(self):
        changed=self.frame.copy()
        changed.loc[changed.date>='2017-01-01','return_7d']=99
        with patch('prepare.dump'):
            self.assertEqual(choose_threshold(self.frame),choose_threshold(changed))

    def test_purge_all_folds_and_no_date_overlap(self):
        for year in C['validationYears']+C['testYears']:
            tr,ca,te,a=split(self.frame,year)
            self.assertLess(pd.Timestamp(tr.labelKnownAt.max()),pd.Timestamp(ca.predictionTimestamp.min()))
            self.assertLess(pd.Timestamp(ca.labelKnownAt.max()),pd.Timestamp(te.predictionTimestamp.min()))
            self.assertFalse(set(tr.date)&set(ca.date) or set(ca.date)&set(te.date))
            self.assertLess(tr.endDate.max(),ca.date.min())
            self.assertLess(ca.endDate.max(),te.date.min())

    def test_nonoverlapping_uses_actual_endpoints(self):
        f=pd.DataFrame({'date':['2024-01-01','2024-01-08','2024-01-09','2024-01-10'],'endDate':['2024-01-09','2024-01-15','2024-01-16','2024-01-17']})
        self.assertEqual(nonoverlapping(f).date.tolist(),['2024-01-01','2024-01-10'])

    def test_empirical_distribution_and_ties(self):
        p=empirical_probabilities(np.array([0.]),np.array([-.02,-.015,0,.015,.02]),.015)
        np.testing.assert_allclose(p,[[.2,.6,.2]])

    def test_routes_do_not_read_query_targets(self):
        tr,ca,te,_=split(self.frame,2018)
        q=te.iloc[:4].copy(); changed=q.copy();changed['target_class']='DOWN';changed['return_7d']=100
        with threadpool_limits(limits=1):
            for route in C['routes']:
                a,b=route_probabilities(route,tr,[q,changed],.015)
                np.testing.assert_allclose(a,b,atol=1e-12,rtol=0)
                np.testing.assert_allclose(a.sum(axis=1),1,atol=1e-12)

    def test_calibrators_finite_and_normalized(self):
        rng=np.random.default_rng(C['seed']); p=rng.dirichlet([2,2,2],size=90);y=pd.Series(CLASSES*30)
        for kind in ['raw','platt','isotonic']:
            out=calibrate(p,y,p[:5],kind)
            self.assertTrue(np.isfinite(out).all())
            np.testing.assert_allclose(out.sum(axis=1),1,atol=1e-12)

    def test_metrics_perfect_predictions_and_empty_sixty_band(self):
        m=metrics(CLASSES,np.eye(3))
        self.assertLess(m['brier'],1e-12)
        self.assertEqual(m['accuracy'],1)
        self.assertEqual(m['sixtyBand']['UP']['n'],0)
        self.assertIsNone(m['sixtyBand']['UP']['observedFrequency'])

    def test_cleaning_quarantines_impossible_release_date(self):
        for s in self.series.values():
            self.assertTrue((s.releaseDate>=s.date.dt.strftime('%Y-%m-%d')).all())
        self.assertEqual(len(self.audit['DDFUELNYH']['releaseBeforeObservation']),1)

    def test_dataset_availability_and_actual_horizon(self):
        self.assertTrue((pd.to_datetime(self.frame.featureMaxAvailableAt,utc=True)<=pd.to_datetime(self.frame.predictionTimestamp,utc=True)).all())
        span=(pd.to_datetime(self.frame.endDate)-pd.to_datetime(self.frame.date)).dt.days
        self.assertTrue(span.between(7,11).all())

    def test_crack_uses_matching_dates_and_us_barrels(self):
        ts=pd.Timestamp('2019-06-14T23:59:59',tz='America/New_York').tz_convert('UTC')
        features=features_at(self.series,ts)
        d=self.series['DDFUELNYH']; b=self.series['DCOILBRENTEU']
        common=d[d.availableAt<=ts].merge(b[b.availableAt<=ts],on='date',suffixes=('_d','_b')).iloc[-1]
        self.assertAlmostEqual(features['crack'],common.price_d*42-common.price_b)

    def test_negative_or_stale_price_window_is_not_fabricated(self):
        ts=pd.Timestamp('2019-06-14T23:59:59',tz='America/New_York').tz_convert('UTC')
        s={k:v.copy() for k,v in self.series.items()};f=s['DCOILWTICO']; idx=f[f.availableAt<=ts].index[-1];f.loc[idx,'price']=-37
        self.assertIsNone(features_at(s,ts))
        self.assertIsNone(features_at(self.series,pd.Timestamp('2027-01-01',tz='UTC')))

    def test_fail_gate_has_no_current_forecast_or_artifact(self):
        r=json.loads((DATA/'backtest-results.json').read_text())
        self.assertEqual(r['gate'],'FAIL')
        self.assertFalse((REPORTS/'CURRENT_GLOBAL_DIESEL_FORECAST.json').exists())
        self.assertFalse(list(ROOT.glob('*.joblib')))
        ui=json.loads((ROOT/'ui/candidate-status.json').read_text())
        self.assertIsNone(ui['probabilities']); self.assertIsNone(ui['contract'])

    def test_download_manifest_cannot_silently_accept_new_snapshot(self):
        with tempfile.TemporaryDirectory() as tmp, patch('download.DATA', Path(tmp)):
            freeze_manifest({'raw/example.csv':'frozen'})
            freeze_manifest({'raw/example.csv':'frozen'})
            with self.assertRaisesRegex(AssertionError,'FROZEN_DOWNLOAD_SNAPSHOT_CHANGED'):
                freeze_manifest({'raw/example.csv':'different'})
            self.assertEqual(json.loads((Path(tmp)/'download-manifest.json').read_text())['files']['raw/example.csv'],'frozen')


if __name__=='__main__': unittest.main()
