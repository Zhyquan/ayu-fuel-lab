import json
import sys
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from prepare import DATA, FEATURES, CLASSES, feature_snapshot, label, load_market, official
from backtest import evaluate_probabilities, split_fold


class ResearchTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.frame = pd.read_csv(DATA/'snapshots.csv')
        cls.market = load_market()

    def test_frozen_deadband_boundaries_missing_not_flat(self):
        self.assertEqual(json.loads((DATA/'flat-decision.json').read_text())['deadband'], .02)
        self.assertEqual([label(v,.02) for v in [-.021,-.02,0,.02,.021]], ['DOWN','FLAT','FLAT','FLAT','UP'])
        self.assertTrue(np.isfinite(self.frame.return7d).all())
        for missing in [None, np.nan, np.inf]:
            with self.assertRaises(ValueError):
                label(missing,.02)

    def test_all_feature_inputs_available_at_prediction(self):
        count = 0
        for line in (DATA/'feature-provenance.jsonl').read_text().splitlines():
            row = json.loads(line)
            t = pd.Timestamp(row['predictionTimestamp'])
            self.assertEqual(set(row['features']), set(FEATURES))
            for points in row['features'].values():
                for p in points:
                    self.assertLessEqual(pd.Timestamp(p['availableAt']), t)
                    self.assertLess(pd.Timestamp(p['observationDate'],tz='UTC'), t.normalize())
                    count += 1
        self.assertGreater(count, 100000)

    def test_future_poison_does_not_change_features(self):
        t = pd.Timestamp('2020-05-01T01:00:00Z')
        before = feature_snapshot(self.market, t)
        poisoned = {k: v.copy() for k,v in self.market.items()}
        for v in poisoned.values():
            v.loc[v.availableAt > t, 'value'] = 999999
        self.assertEqual(before, feature_snapshot(poisoned,t))

    def test_same_day_release_is_not_available_early(self):
        b = self.market['brent']
        row = b.iloc[-1]
        t = pd.Timestamp(row.releaseDate,tz='Asia/Shanghai') + pd.Timedelta(hours=9)
        self.assertGreater(row.availableAt,t)

    def test_cycle_integrity_and_purged_label_availability(self):
        tested = set()
        for year in range(2019,2027):
            tr, ca, te, audit = split_fold(self.frame, year)
            self.assertFalse(set(tr.cycleId) & set(ca.cycleId))
            self.assertFalse(set(ca.cycleId) & set(te.cycleId))
            self.assertFalse(set(tr.cycleId) & set(te.cycleId))
            self.assertFalse(tested & set(te.cycleId))
            tested.update(te.cycleId)
            self.assertLess(pd.to_datetime(tr.labelKnownAt,utc=True).max(),pd.Timestamp(audit['calibrationStart']))
            self.assertLess(pd.to_datetime(ca.labelKnownAt,utc=True).max(),pd.Timestamp(audit['testStart']))

    def test_label_is_seven_calendar_days_not_future_filled(self):
        days = pd.to_datetime(self.frame.snapshotDate)
        end = pd.to_datetime(self.frame.endObservationDate)
        start = pd.to_datetime(self.frame.startObservationDate)
        self.assertTrue((end <= days+pd.Timedelta(days=6)).all())
        self.assertTrue((start <= days-pd.Timedelta(days=1)).all())
        self.assertTrue(((days+pd.Timedelta(days=6)-end).dt.days <= 7).all())

    def test_negative_wti_kept_and_finite(self):
        self.assertLess(self.market['wti'].value.min(),0)
        self.assertTrue(np.isfinite(self.frame[FEATURES].to_numpy()).all())
        self.assertNotIn('daysToNextAdjustment',FEATURES)
        self.assertNotIn('dieselChangePerTon',FEATURES)

    def test_official_actual_overrides_mechanism(self):
        record = official({'title':'成品油价格适当调整','publicationDate':'2026-09-24','text':'自9月24日24时起，国内汽、柴油价格每吨分别应上调830元、800元，调控后实际上调395元、385元。'})
        self.assertEqual(record['dieselChangePerTon'],385)

    def test_official_equal_amount_and_missing_unit(self):
        for text, expected in [('国内汽、柴油价格每吨均降低55元。',-55),('国内汽、柴油价格每吨分别提高175和165元。',165)]:
            row = official({'title':'国内成品油价格按机制调整','publicationDate':'2020-01-01','text':text})
            self.assertEqual(row['dieselChangePerTon'],expected)

    def test_tax_effective_date_and_policy_not_zero(self):
        row = official({'title':'成品油价格因增值税调整','publicationDate':'2019-03-29','text':'国内汽、柴油每吨分别降低225元和200元，自2019年3月31日24时起执行。'})
        self.assertEqual(row['adjustmentDate'],'2019-03-31')
        self.assertEqual(row['role'],'SPECIAL_TAX')
        bad = official({'title':'成品油价格消息','publicationDate':'2020-01-01','text':'没有金额或明确不调整结论。'})
        self.assertEqual(bad['status'],'UNPARSED')
        self.assertIsNone(bad['result'])

    def test_scoring_uses_all_three_classes(self):
        scores = evaluate_probabilities(CLASSES,np.ones((3,3))/3)
        self.assertAlmostEqual(scores['brier'],2/3)
        self.assertAlmostEqual(scores['logLoss'],np.log(3))
        self.assertEqual(len(scores['buckets']),30)

    def test_saved_gate_fails_and_scores_are_recomputable(self):
        results = json.loads((DATA/'backtest-results.json').read_text())
        self.assertEqual(results['gate'],'FAIL')
        oos = pd.read_csv(DATA/'oos-predictions.csv')
        p = oos[[f'logistic_calibrated_{c}' for c in CLASSES]].to_numpy()
        m = evaluate_probabilities(oos.target,p)
        self.assertAlmostEqual(m['brier'],results['overall']['logistic_calibrated']['brier'],places=12)
        self.assertAlmostEqual(m['logLoss'],results['overall']['logistic_calibrated']['logLoss'],places=12)
        status = json.loads((Path(__file__).resolve().parents[1]/'ui/candidate-status.json').read_text())
        self.assertEqual(status['contract']['status'],'UNAVAILABLE')
        self.assertIsNone(status['contract']['probabilities'])

    def test_bootstrap_and_report_use_same_scoring_convention(self):
        r = json.loads((DATA/'backtest-results.json').read_text())
        for key in ['brier','logLoss']:
            delta = r['overall']['frequency'][key] - r['overall']['logistic_calibrated'][key]
            self.assertAlmostEqual(delta,r['improvementVsFrequency'][key]['improvement'],places=12)


if __name__ == '__main__':
    unittest.main()
