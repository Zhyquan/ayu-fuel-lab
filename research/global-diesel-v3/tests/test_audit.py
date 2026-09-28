import copy
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import audit


class SourceAuditTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.stats = json.loads((audit.DATA / 'source-audit.json').read_text())
        cls.catalog = json.loads((audit.DATA / 'source-catalog.json').read_text())

    def test_raw_snapshot_matches_manifest(self):
        audit.verify_manifest()

    def test_tampered_or_missing_raw_response_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            raw = directory / 'response.csv'
            raw.write_bytes(b'original response')
            expected = hashlib.sha256(raw.read_bytes()).hexdigest()
            (directory / 'download-manifest.json').write_text(json.dumps({'files': {'response.csv': expected}}))
            audit.verify_manifest(directory)
            raw.write_bytes(b'revised response')
            with self.assertRaisesRegex(ValueError, 'FROZEN_SOURCE_CHANGED'):
                audit.verify_manifest(directory)
            raw.unlink()
            with self.assertRaisesRegex(ValueError, 'FROZEN_SOURCE_CHANGED'):
                audit.verify_manifest(directory)

    def test_invalid_price_and_fx_rejected(self):
        for values in [[0], [-1], [np.inf], [np.nan], ['not a price']]:
            with self.subTest(values=values), self.assertRaises((ValueError, TypeError)):
                audit.validate_values(pd.Series(values))

    def test_real_initial_release_anomalies_quarantined_not_revised(self):
        for series in audit.US:
            initial, quarantine, missing = audit.load_initial(series)
            self.assertTrue((initial[series] > 0).all())
            self.assertTrue((initial.realtime_start_date >= initial.period_start_date).all())
            self.assertGreater(missing, 0)
            self.assertGreater(len(quarantine), 0)
        _, gulf_quarantine, _ = audit.load_initial('DDFUELUSGULF')
        zero = gulf_quarantine[gulf_quarantine.period_start_date == pd.Timestamp('2022-02-22')]
        self.assertEqual(zero.DDFUELUSGULF.tolist(), [0.0])
        self.assertEqual(zero.reason.tolist(), ['INVALID_PRICE'])

    def test_us_available_time_conservative_and_dst_preserved(self):
        initial, _, _ = audit.load_initial('DDFUELNYH')
        utc = pd.to_datetime(initial.availableAt, utc=True)
        self.assertTrue((utc.dt.tz_localize(None) > initial.realtime_start_date).all())
        self.assertTrue(initial.availableAt.str.endswith('-05:00').any())
        self.assertTrue(initial.availableAt.str.endswith('-06:00').any())

    def test_open_non_us_history_is_real_and_unit_conversion_explicit(self):
        proxy = audit.load_proxy()
        self.assertEqual(len(proxy), 1170)
        self.assertEqual(proxy.Unit.unique().tolist(), ['NZD c/L'])
        np.testing.assert_allclose(proxy.usdPerLiter, proxy.Value * proxy.usdPerNZD / 100, rtol=1e-12)
        self.assertEqual(proxy.index.min(), pd.Timestamp('2004-04-23'))

    def test_final_does_not_mean_historically_available(self):
        proxy = audit.load_proxy()
        revised_final = proxy[(proxy.index >= '2026-02-27') & (proxy.index < '2026-07-01')]
        self.assertTrue((revised_final.Status == 'Final').all())
        self.assertTrue(proxy.historicalAvailableAt.isna().all())
        self.assertFalse(proxy.usableForTraining.any())
        self.assertFalse(proxy.historicalPITVerified.any())
        self.assertEqual(proxy.vintageAvailableAt.unique().tolist(), [audit.CONFIG['mbieVintageAvailableAt']])

    def test_nominal_coverage_does_not_pass_point_in_time_gate(self):
        gates = audit.assess_gate(self.stats, self.catalog)
        self.assertEqual(gates['sourceCoverageGate'], 'PASS')
        self.assertEqual(gates['GLOBAL_DIESEL_DATA_GATE_V3'], 'FAIL')
        self.assertEqual(gates['nonUSAdmittedPITYears'], 0)
        self.assertEqual(gates['admittedPITRegions'], ['US'])

    def test_catalog_flip_cannot_create_missing_historical_vintages(self):
        catalog = copy.deepcopy(self.catalog)
        next(s for s in catalog['sources'] if s['id'] == 'MBIE_IMPORT')['pitHistoryVerified'] = True
        with patch.dict(audit.CONFIG, {'mbieHistoricalAvailability': 'VERIFIED'}):
            self.assertEqual(audit.assess_gate(self.stats, catalog)['GLOBAL_DIESEL_DATA_GATE_V3'], 'FAIL')

    def test_us_only_cannot_become_global(self):
        stats = copy.deepcopy(self.stats)
        stats[audit.PROXY]['historyYears'] = 0
        self.assertEqual(audit.assess_gate(stats, self.catalog)['GLOBAL_DIESEL_DATA_GATE_V3'], 'FAIL')

    def test_weekly_returns_do_not_bridge_missing_weeks(self):
        proxy = audit.load_proxy()
        us = {name: audit.load_us(name) for name in audit.US}
        missing_week = pd.Timestamp('2020-06-12')
        proxy.loc[missing_week, 'usdPerLiter'] = np.nan
        _, _, returns = audit.comovement(us, proxy)
        self.assertNotIn(missing_week, returns.index)
        self.assertNotIn(missing_week + pd.Timedelta(days=7), returns.index)

    def test_one_day_non_us_returns_remain_unavailable(self):
        diag = json.loads((audit.DATA / 'comovement-diagnostics.json').read_text())
        self.assertIsNone(diag['nonUS1CalendarDay']['correlation'])
        self.assertEqual(diag['purpose'], 'RETROSPECTIVE_COMOVEMENT_ONLY_NOT_FORECAST_EVALUATION')
        self.assertEqual(diag['vintage'], 'LATEST_REVISED_NOT_PIT')

    def test_no_invented_global_state_or_probability(self):
        gates = audit.assess_gate(self.stats, self.catalog)
        state = audit.unavailable_state(gates)
        self.assertEqual(state['status'], 'UNAVAILABLE')
        self.assertIsNone(state['currentState'])
        self.assertTrue(all(v is None for v in state['returns'].values()))
        self.assertEqual(state['coverageRatio'], 0)
        self.assertFalse(gates['forecastDisplayAuthorized'])

    def test_no_current_forecast_model_label_or_selected_flat(self):
        self.assertIsNone(audit.CONFIG['flatThreshold'])
        for name in ['CURRENT_GLOBAL_DIESEL_FORECAST.json', 'target.csv', 'labels.csv']:
            self.assertFalse(list(audit.ROOT.rglob(name)))
        for extension in ['*.pkl', '*.joblib', '*.onnx']:
            self.assertFalse(list(audit.ROOT.rglob(extension)))

    def test_failed_candidate_fetches_only_local_reference_snapshot(self):
        app = (audit.ROOT / 'ui/app.js').read_text()
        html = (audit.ROOT / 'ui/index.html').read_text()
        self.assertIn("fetch('../data/coastal-reference-snapshot.json'", app)
        self.assertNotIn('https://', app)
        self.assertNotIn('fuel-service', app)
        self.assertNotIn('%', app + html)
        self.assertIn('当前：暂不可用', html)
        self.assertIn('模型验证中', html)
        self.assertEqual(len(json.loads((audit.DATA / 'coastal-reference-snapshot.json').read_text())['provinces']), 11)


if __name__ == '__main__':
    unittest.main()
