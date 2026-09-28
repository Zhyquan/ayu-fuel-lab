"""V3 source admission and retrospective diagnostics. No forecasting on revised history."""
import hashlib
import json
from datetime import timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent
DATA = ROOT / 'data'
CONFIG = json.loads((ROOT / 'config.json').read_text())
US = ['DDFUELNYH', 'DDFUELUSGULF']
PROXY = 'SG_NZ_IMPORT_PROXY'


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + '\n')


def verify_manifest(data_dir=DATA):
    manifest = json.loads((data_dir / 'download-manifest.json').read_text())
    for name, expected in manifest['files'].items():
        path = data_dir / name
        if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            raise ValueError(f'FROZEN_SOURCE_CHANGED: {name}')


def validate_values(series, allow_missing=False):
    values = pd.to_numeric(series, errors='raise')
    if (not allow_missing and values.isna().any()) or not np.isfinite(values.dropna()).all() or (values.dropna() <= 0).any():
        raise ValueError('INVALID_PRICE_OR_FX')
    return values


def load_us(series):
    frame = pd.read_csv(DATA / 'raw' / f'{series}-current.csv', parse_dates=['observation_date'])
    if frame.columns.tolist() != ['observation_date', series] or frame.observation_date.duplicated().any():
        raise ValueError('US_SCHEMA_OR_DUPLICATE')
    frame[series] = validate_values(frame[series], allow_missing=True)
    return frame.set_index('observation_date')[series].sort_index()


def load_initial(series):
    frame = pd.read_csv(DATA / 'raw' / f'{series}-initial.csv', parse_dates=['period_start_date', 'realtime_start_date'])
    if frame.columns.tolist() != ['period_start_date', series, 'realtime_start_date'] or frame.period_start_date.duplicated().any():
        raise ValueError('INITIAL_RELEASE_SCHEMA_OR_DUPLICATE')
    frame[series] = pd.to_numeric(frame[series], errors='raise')
    missing = int(frame[series].isna().sum())
    early_release = frame.realtime_start_date < frame.period_start_date
    bad_price = frame[series].notna() & (~np.isfinite(frame[series]) | (frame[series] <= 0))
    invalid = early_release | bad_price
    quarantine = frame[invalid].copy()
    quarantine['reason'] = np.where(early_release[invalid], 'RELEASE_PRECEDES_OBSERVATION', 'INVALID_PRICE')
    frame = frame[~invalid & frame[series].notna()].copy()
    frame['availableAt'] = [
        (date.to_pydatetime() + timedelta(days=1)).replace(tzinfo=ZoneInfo('America/Chicago')).isoformat()
        for date in frame.realtime_start_date
    ]
    return frame, quarantine, missing


def load_proxy():
    frame = pd.read_csv(DATA / 'raw' / 'mbie-figure-source.csv', parse_dates=['Date'])
    if frame.columns.tolist() != ['Week', 'Date', 'Fuel', 'Variable', 'Value', 'Unit', 'Status'] or len(frame) != 35100:
        raise ValueError('MBIE_INCOMPLETE_OR_CHANGED_SCHEMA')
    cost = frame[(frame.Fuel == 'Diesel') & (frame.Variable == 'Importer cost')].copy()
    fx = frame[(frame.Variable == 'Exchange rate') & (frame.Unit == 'USD/NZD')].copy()
    if cost.Unit.unique().tolist() != ['NZD c/L'] or cost.Date.duplicated().any() or fx.Date.duplicated().any():
        raise ValueError('MBIE_UNIT_OR_DUPLICATE')
    cost.Value = validate_values(cost.Value)
    fx.Value = validate_values(fx.Value)
    cost = cost.set_index('Date').sort_index()
    fx = fx.set_index('Date').sort_index()
    if not cost.index.equals(fx.index) or not (cost.index.dayofweek == 4).all() or not (cost.index.to_series().diff().dropna().dt.days == 7).all():
        raise ValueError('MBIE_FX_OR_WEEK_ALIGNMENT')
    # Convert the licensed finished import-cost proxy, not the underlying Argus feed.
    cost['usdPerLiter'] = cost.Value * fx.Value / 100
    cost['usdPerNZD'] = fx.Value
    cost['vintageAvailableAt'] = CONFIG['mbieVintageAvailableAt']
    cost['historicalAvailableAt'] = None
    cost['historicalPITVerified'] = False
    cost['usableForTraining'] = False
    return cost


def pair_metrics(returns, left, right, rolling_weeks=True):
    pair = returns[[left, right]].dropna()
    nonzero = pair[(pair.abs() > 1e-12).all(axis=1)]
    result = {
        'n': len(pair), 'correlation': round(float(pair[left].corr(pair[right])), 8),
        'directionN': len(nonzero),
        'directionAgreement': round(float((np.sign(nonzero[left]) == np.sign(nonzero[right])).mean()), 8),
    }
    if rolling_weeks:
        rolling = pair[left].rolling(CONFIG['rollingCorrelationWeeks'], min_periods=CONFIG['rollingCorrelationWeeks']).corr(pair[right]).dropna()
        result.update({
            'rolling52wN': len(rolling),
            'rolling52wQuantiles': {str(k): round(float(v), 8) for k, v in rolling.quantile([0, .1, .5, .9, 1]).items()},
            'rollingSeries': [{'date': d.date().isoformat(), 'correlation': round(float(v), 8)} for d, v in rolling.items()],
        })
    return result


def comovement(us, proxy):
    weekly = []
    for name, series in us.items():
        mean = series.resample('W-FRI').mean()
        count = series.resample('W-FRI').count()
        weekly.append(mean.where(count >= CONFIG['weeklyMinimumUSObservations']).rename(name))
    levels = pd.concat(weekly + [proxy.usdPerLiter.rename(PROXY)], axis=1)
    # Keep the full weekly grid: a missing week must not become a false 7-day return.
    returns = np.log(levels).diff().dropna()
    daily = pd.concat([series.rename(name) for name, series in us.items()], axis=1).asfreq('D')
    daily_returns = np.log(daily).diff()
    seven_day_returns = np.log(daily) - np.log(daily.shift(7))
    result = {
        'purpose': 'RETROSPECTIVE_COMOVEMENT_ONLY_NOT_FORECAST_EVALUATION',
        'vintage': 'LATEST_REVISED_NOT_PIT',
        'nonUSProxy': PROXY,
        'proxyFormula': 'MBIE diesel importer cost [NZD c/L] * MBIE FX [USD/NZD] / 100 = USD/L',
        'weeklyWindow': 'Friday-labelled averages; minimum 3 real US observations; no forward-fill',
        'weeklyReturnStart': returns.index.min().date().isoformat(),
        'weeklyReturnEnd': returns.index.max().date().isoformat(),
        'weeklyCommonN': len(returns),
        'usOnly1CalendarDay': pair_metrics(daily_returns, *US, rolling_weeks=False),
        'usOnly7CalendarDays': pair_metrics(seven_day_returns, *US, rolling_weeks=False),
        'nonUS1CalendarDay': {'status': 'UNAVAILABLE_WEEKLY_SOURCE', 'correlation': None, 'n': 0},
        'weeklyPairs': {name: pair_metrics(returns, name, PROXY) for name in US},
        'mgoValidation': 'MGO_EXTERNAL_VALIDATION_LIMITED',
    }
    return result, levels.dropna(), returns


def assess_gate(stats, catalog):
    source = {entry['id']: entry for entry in catalog['sources']}
    years = CONFIG['minimumHistoryYears']
    us_ok = all(stats[name]['pitHistoryYears'] >= years and source[name]['pitHistoryVerified'] for name in US)
    proxy_coverage = stats[PROXY]['historyYears'] >= years and source['MBIE_IMPORT']['researchUse'].startswith('ALLOWED')
    non_us_pit = (proxy_coverage and source['MBIE_IMPORT']['pitHistoryVerified']
                  and CONFIG['mbieHistoricalAvailability'] == 'VERIFIED'
                  and stats[PROXY]['pitHistoryYears'] >= years)
    return {
        'sourceCoverageGate': 'PASS' if us_ok and proxy_coverage else 'FAIL',
        'sourceCoverageScope': 'US + Singapore-linked NZ import-cost proxy; not Europe or direct Asian MGO',
        'historicalPublicationGate': 'PASS' if non_us_pit else 'FAIL',
        'GLOBAL_DIESEL_DATA_GATE_V3': 'PASS' if us_ok and non_us_pit else 'FAIL',
        'GLOBAL_DIESEL_MODEL_GATE_V3': 'FAIL',
        'admittedPITRegions': ['US'] if us_ok else [],
        'nonUSAdmittedPITYears': stats[PROXY]['pitHistoryYears'] if non_us_pit else 0,
        'modelExecutionStatus': 'NOT_RUN_DATA_GATE_FAILED',
        'reason': 'NON_US_5_YEAR_POINT_IN_TIME_HISTORY_NOT_VERIFIED',
        'retrospectiveCorrelationIsPredictiveEvidence': False,
        'forecastDisplayAuthorized': False,
    }


def unavailable_state(gates):
    return {
        'asOf': CONFIG['snapshotAt'], 'indexName': 'GLOBAL_DIESEL_COMPOSITE_INDEX',
        'status': 'UNAVAILABLE', 'currentState': None, 'isForecast': False,
        'returns': {'1d': None, '3d': None, '7d': None, '20d': None},
        'volatility': None, 'trendPosition': None,
        'activeLegs': [], 'missingLegs': ['US_NYH', 'USGC', PROXY], 'coverageRatio': 0,
        'reason': gates['reason'],
        'note': 'No admitted global composite. The weekly import proxy is not a direct Asian MGO quote; do not substitute US state.',
    }


def run():
    verify_manifest()
    catalog = json.loads((DATA / 'source-catalog.json').read_text())
    us = {name: load_us(name) for name in US}
    stats = {}
    for name, series in us.items():
        valid = series.dropna()
        initial, quarantine, missing = load_initial(name)
        initial.to_csv(DATA / f'{name}-pit-audit.csv', index=False)
        quarantine.to_csv(DATA / f'{name}-quarantine.csv', index=False)
        stats[name] = {
            'currentRows': len(series), 'missingCurrent': int(series.isna().sum()),
            'firstObservation': valid.index.min().date().isoformat(), 'latestObservation': valid.index.max().date().isoformat(),
            'latestValue': float(valid.iloc[-1]), 'unit': 'USD/US gal',
            'pitValidRows': len(initial), 'pitQuarantinedRows': len(quarantine), 'pitMissingRows': missing,
            'pitFirst': initial.period_start_date.min().date().isoformat(),
            'pitLast': initial.period_start_date.max().date().isoformat(),
            'pitHistoryYears': round((initial.period_start_date.max() - initial.period_start_date.min()).days / 365.25, 3),
        }
    proxy = load_proxy()
    proxy.to_csv(DATA / 'non-us-proxy-audit.csv', index_label='observationDate')
    stats[PROXY] = {
        'rows': len(proxy), 'firstObservation': proxy.index.min().date().isoformat(), 'latestObservation': proxy.index.max().date().isoformat(),
        'historyYears': round((proxy.index.max() - proxy.index.min()).days / 365.25, 3),
        'statusCounts': {k: int(v) for k, v in proxy.Status.value_counts().items()},
        'latestCostNZDCentsPerLiter': float(proxy.Value.iloc[-1]), 'latestCostUSDPerLiter': float(proxy.usdPerLiter.iloc[-1]),
        'historicalAvailableAtVerifiedRows': 0, 'usableForecastTrainingRows': 0,
        'pitHistoryYears': 0,
        'knownVintageAvailableAt': CONFIG['mbieVintageAvailableAt'],
        'oneDayReturnAvailable': False, 'isDirectMGOQuote': False,
    }
    diagnostics, levels, returns = comovement(us, proxy)
    levels.to_csv(DATA / 'retrospective-weekly-levels.csv', index_label='weekEnding')
    returns.to_csv(DATA / 'retrospective-weekly-log-returns.csv', index_label='weekEnding')
    gates = assess_gate(stats, catalog)
    if gates['GLOBAL_DIESEL_DATA_GATE_V3'] != 'FAIL':
        raise ValueError('FROZEN_RESEARCH_SCOPE_CHANGED_REQUIRES_NEW_ADMISSION_REVIEW')
    write_json(DATA / 'source-audit.json', stats)
    write_json(DATA / 'comovement-diagnostics.json', diagnostics)
    write_json(DATA / 'gates.json', gates)
    write_json(ROOT / 'reports/CURRENT_GLOBAL_DIESEL_STATE.json', unavailable_state(gates))
    write_json(ROOT / 'ui/candidate-status.json', {'gates': gates, 'currentState': unavailable_state(gates)})
    return stats, diagnostics, gates
