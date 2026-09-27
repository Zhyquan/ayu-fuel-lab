"""V2 diesel target and point-in-time dataset. No V1 dataset or target imports."""
import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent
DATA = ROOT / 'data'
REPORTS = ROOT / 'reports'
C = json.loads((ROOT / 'config.json').read_text())
CLASSES = ['DOWN', 'FLAT', 'UP']
PREFIXES = {'DDFUELNYH': 'diesel', 'DCOILBRENTEU': 'brent', 'DCOILWTICO': 'wti'}
FEATURES = [f'{p}_{f}' for p in PREFIXES.values() for f in ['r1', 'r3', 'r5', 'r10', 'r20', 'vol5', 'vol20', 'ma20_distance', 'momentum7', 'reversal', 'age_days']] + ['crack', 'crack_change5', 'crack_ma20_distance']


def dump(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2, allow_nan=False) + '\n')


def available_at(release):
    # Date-only vintage: withhold until the entire local US release day has passed.
    return (pd.Timestamp(release) + pd.Timedelta(days=1)).tz_localize('America/Chicago').tz_convert('UTC')


def classify(value, threshold):
    return 'DOWN' if value < -threshold else 'UP' if value > threshold else 'FLAT'


def load_series():
    manifest = json.loads((DATA / 'download-manifest.json').read_text())
    for name, digest in manifest['files'].items():
        assert hashlib.sha256((DATA / name).read_bytes()).hexdigest() == digest, f'SNAPSHOT_CHANGED:{name}'
    series, audit = {}, {}
    for code in C['series']:
        f = pd.read_csv(DATA / f'{code}-initial.csv').rename(columns={'period_start_date': 'date', code: 'price', 'realtime_start_date': 'releaseDate'})
        anomalies = f[f.releaseDate < f.date]
        valid = f.price.notna() & (f.releaseDate >= f.date)
        q = f[valid].copy()
        q['availableAt'] = q.releaseDate.map(available_at)
        q = q[q.availableAt <= pd.Timestamp(C['snapshotAt'])].copy()
        q['date'] = pd.to_datetime(q.date)
        series[code] = q.reset_index(drop=True)
        lag = (pd.to_datetime(q.releaseDate) - q.date).dt.days
        audit[code] = {'rawRows': len(f), 'validRows': len(q), 'missingFirstRelease': int(f.price.isna().sum()), 'releaseBeforeObservation': anomalies.to_dict('records'), 'nonpositive': int((q.price <= 0).sum()), 'start': str(q.date.min().date()), 'end': str(q.date.max().date()), 'releaseLagDays': {'min': int(lag.min()), 'median': float(lag.median()), 'p95': float(lag.quantile(.95)), 'max': int(lag.max())}}
    dump(DATA / 'cleaning-audit.json', audit)
    return series, audit


def data_gate(series, audit):
    f = series['DDFUELNYH']
    latest = f.iloc[-1]
    accesses = [pd.read_csv(DATA / f'raw/diesel-current-access-{i}.csv').dropna() for i in [1, 2]]
    book = pd.read_excel(DATA / 'raw/eia-current-spots.xls', sheet_name=None, header=2)
    matched = [(name, col) for name, df in book.items() for col in df.columns if 'New York Harbor' in str(col) and 'Ultra-Low' in str(col)]
    assert len(matched) == 1, matched
    sheet, col = matched[0]
    eia = book[sheet][['Date', col]].dropna().iloc[-1]
    age = (pd.Timestamp(C['snapshotAt']).tz_convert('Asia/Shanghai').date() - latest.date.date()).days
    checks = {
        'minimumFiveYears': (f.date.max() - f.date.min()).days >= 365.25 * C['gate']['minimumHistoryYears'],
        'dailyUsableObservations': len(f) > 5 * 200,
        'twoAnonymousReadsAgree': accesses[0].equals(accesses[1]),
        'latestMatchesOfficialEIA': eia.Date == latest.date and float(eia[col]) == float(latest.price),
        'latestMatchesFRED': accesses[0].iloc[-1].observation_date == str(latest.date.date()) and float(accesses[0].iloc[-1].DDFUELNYH) == float(latest.price),
        'freshForWeeklyRelease': age <= C['gate']['maxObservationAgeDays'],
        'publicDomainNoKeyOrPayment': True
    }
    result = {'gate': 'PASS' if all(checks.values()) else 'FAIL', 'checks': {k: bool(v) for k, v in checks.items()}, 'scope': 'Delayed EIA New York Harbor diesel benchmark research; not global/MGO representativeness certification', 'snapshotAt': C['snapshotAt'], 'latestObservation': str(latest.date.date()), 'latestPrice': float(latest.price), 'latestRelease': latest.releaseDate, 'latestAvailableAt': latest.availableAt.isoformat(), 'observationAgeDays': age, 'unit': 'USD/US gallon', 'seriesAudit': audit, 'crossCheckEiaColumn': str(col)}
    dump(DATA / 'data-gate.json', result)
    return result


def endpoint(frame, date):
    wanted = date + pd.Timedelta(days=C['horizonCalendarDays'])
    future = frame[frame.date >= wanted]
    if future.empty or (future.iloc[0].date - wanted).days > C['endpointRollForwardMaxDays']:
        return None
    return future.iloc[0]


def features_at(series, timestamp):
    features, windows = {}, {}
    for code, prefix in PREFIXES.items():
        known = series[code][series[code].availableAt <= timestamp]
        tail = known.tail(21)
        if len(tail) != 21 or (tail.price <= 0).any():
            return None
        age = (timestamp.tz_convert('America/New_York').date() - tail.iloc[-1].date.date()).days
        if age > C['gate']['maxFeatureAgeDays'] or tail.date.diff().dt.days.max() > 4:
            return None
        v = tail.price.to_numpy()
        r = v[1:] / v[:-1] - 1
        for days in [1, 3, 5, 10, 20]:
            features[f'{prefix}_r{days}'] = v[-1] / v[-1 - days] - 1
        for days in [5, 20]:
            features[f'{prefix}_vol{days}'] = np.std(r[-days:], ddof=1)
        features[f'{prefix}_ma20_distance'] = v[-1] / v[-20:].mean() - 1
        old = known[known.date <= tail.iloc[-1].date - pd.Timedelta(days=7)].iloc[-1]
        features[f'{prefix}_momentum7'] = v[-1] / old.price - 1
        features[f'{prefix}_reversal'] = -features[f'{prefix}_r1']
        features[f'{prefix}_age_days'] = age
        windows[code] = tail
    aligned = windows['DDFUELNYH'].merge(windows['DCOILBRENTEU'], on='date', suffixes=('_d', '_b'))
    if len(aligned) < 20:
        return None
    crack = aligned.price_d.to_numpy() * 42 - aligned.price_b.to_numpy()
    features.update(crack=crack[-1], crack_change5=crack[-1] - crack[-6], crack_ma20_distance=crack[-1] - crack[-20:].mean())
    features['featureMaxAvailableAt'] = max(w.availableAt.max() for w in windows.values()).isoformat()
    features['featureLatestDieselDate'] = str(windows['DDFUELNYH'].iloc[-1].date.date())
    assert pd.Timestamp(features['featureMaxAvailableAt']) <= timestamp
    return features


def build(series):
    diesel = series['DDFUELNYH']
    rows, skipped = [], {'endpointUnavailable': 0, 'featuresUnavailable': 0}
    for _, anchor in diesel[diesel.date >= C['datasetStart']].iterrows():
        end = endpoint(diesel, anchor.date)
        if end is None:
            skipped['endpointUnavailable'] += 1
            continue
        timestamp = (anchor.date + pd.Timedelta(hours=23, minutes=59, seconds=59)).tz_localize('America/New_York').tz_convert('UTC')
        features = features_at(series, timestamp)
        if features is None:
            skipped['featuresUnavailable'] += 1
            continue
        rows.append({'date': str(anchor.date.date()), 'predictionTimestamp': timestamp.isoformat(), 'price': float(anchor.price), 'anchorReleaseDate': anchor.releaseDate, 'endDate': str(end.date.date()), 'price_t_plus_7': float(end.price), 'return_7d': float(end.price / anchor.price - 1), 'labelKnownAt': max(anchor.availableAt, end.availableAt).isoformat(), **features})
    f = pd.DataFrame(rows)
    assert not f.date.duplicated().any()
    assert np.isfinite(f[FEATURES + ['return_7d']].to_numpy()).all()
    dump(DATA / 'dataset-audit.json', {'n': len(f), 'start': f.date.min(), 'end': f.date.max(), 'skipped': skipped, 'featureCount': len(FEATURES), 'featureAvailabilityViolations': int((pd.to_datetime(f.featureMaxAvailableAt, utc=True) > pd.to_datetime(f.predictionTimestamp, utc=True)).sum())})
    return f


def choose_threshold(frame):
    # Only design-era outcomes known by end-2016; no post-2016 validation/test label access.
    design = frame[(frame.date <= C['thresholdDesignEnd']) & (pd.to_datetime(frame.labelKnownAt, utc=True) < pd.Timestamp('2017-01-01', tz='UTC'))]
    scores = []
    for t in C['thresholdCandidates']:
        shares = design.return_7d.map(lambda x: classify(x, t)).value_counts(normalize=True).reindex(CLASSES, fill_value=0).to_dict()
        scores.append({'threshold': t, 'shares': shares, 'balanced': min(shares.values()) >= .20 and max(shares.values()) <= .50 and shares['FLAT'] >= .25})
    balanced = [s for s in scores if s['balanced']]
    selected = min(balanced, key=lambda s: s['threshold']) if balanced else min(scores, key=lambda s: abs(s['shares']['FLAT'] - 1/3))
    freeze = {'threshold': selected['threshold'], 'designN': len(design), 'designStart': design.date.min(), 'designEnd': design.date.max(), 'designMaxLabelKnownAt': design.labelKnownAt.max(), 'absoluteReturnQuantiles': design.return_7d.abs().quantile([.25, .5, .75, .9, .95]).to_dict(), 'candidates': scores, 'rule': C['thresholdRule'], 'configSHA256': hashlib.sha256((ROOT / 'config.json').read_bytes()).hexdigest()}
    path = DATA / 'threshold-freeze.json'
    if path.exists():
        assert json.loads(path.read_text()) == json.loads(json.dumps(freeze)), 'FROZEN_THRESHOLD_CHANGED'
    dump(path, freeze)
    return freeze


def current_state(series):
    f = series['DDFUELNYH']
    last = f.iloc[-1]
    changes = {}
    for n in [1, 7, 20]:
        prior = f[f.date <= last.date - pd.Timedelta(days=n)].iloc[-1]
        changes[f'{n}d'] = {'return': float(last.price / prior.price - 1), 'fromDate': str(prior.date.date()), 'toDate': str(last.date.date())}
    percentile = float((f.tail(20).price <= last.price).mean())
    state = 'STRONG' if changes['7d']['return'] >= .01 and percentile >= .6 else 'WEAK' if changes['7d']['return'] <= -.01 and percentile <= .4 else 'NEUTRAL'
    age = (pd.Timestamp(C['snapshotAt']).tz_convert('Asia/Shanghai').date() - last.date.date()).days
    obj = {'source': 'EIA / ALFRED DDFUELNYH', 'generatedAt': C['snapshotAt'], 'benchmark': {'name': 'EIA New York Harbor Ultra-Low-Sulfur No.2 Diesel Spot', 'latestDate': str(last.date.date()), 'latestValue': float(last.price), 'unit': 'USD/US gallon'}, 'releaseDate': last.releaseDate, 'availableAt': last.availableAt.isoformat(), 'observationAgeDays': age, 'freshness': 'CURRENT_FOR_WEEKLY_RELEASE' if age <= C['gate']['maxObservationAgeDays'] else 'STALE', 'validUntil': (last.date + pd.Timedelta(days=C['gate']['maxObservationAgeDays'] + 1)).tz_localize('Asia/Shanghai').isoformat(), 'changes': changes, 'percentile20Observations': percentile, 'currentState': state, 'stateRule': '7-calendar-day change >=1% and 20-observation percentile >=60% => STRONG; <=-1% and <=40% => WEAK; else NEUTRAL', 'scope': 'Latest published US regional diesel benchmark; not an observed global marine fuel index; not a prediction', 'mgoValidation': 'EXTERNAL_VALIDATION_LIMITED', 'inventories': None, 'refineryUtilization': None}
    obj['recentObservations'] = [{'date': str(row.date.date()), 'value': float(row.price)} for _, row in f.tail(20).iterrows()]
    obj['crudeContext'] = {}
    for code in ['DCOILBRENTEU', 'DCOILWTICO']:
        crude = series[code]; latest = crude.iloc[-1]
        before = crude[crude.date <= latest.date-pd.Timedelta(days=7)].iloc[-1]
        obj['crudeContext'][PREFIXES[code]] = {'latestDate': str(latest.date.date()), 'latestValue': float(latest.price), 'change7dUSD': float(latest.price-before.price), 'unit': 'USD/barrel'}
    dump(REPORTS / 'CURRENT_GLOBAL_DIESEL_STATE.json', obj)
    return obj
