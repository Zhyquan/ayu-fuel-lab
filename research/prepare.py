"""Initial-release observations, official outcomes and as-of feature snapshots."""
import hashlib
import json
import math
import re
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data/research'
REPORTS = ROOT / 'research/reports'
SERIES = {'brent': 'DCOILBRENTEU', 'wti': 'DCOILWTICO', 'usdCny': 'DEXCHUS'}
CLASSES = ['DOWN', 'FLAT', 'UP']
FEATURES = [f'{s}{n}d' for s in ['brent', 'wti'] for n in [1, 3, 7, 14]] + ['usdCny3d', 'usdCny7d', 'volatility', 'proxy7d', 'brentAge', 'wtiAge', 'usdCnyAge']


def label(value, threshold):
    if value is None or not math.isfinite(value):
        raise ValueError('MISSING_TARGET_IS_NOT_FLAT')
    return 'UP' if value > threshold else 'DOWN' if value < -threshold else 'FLAT'


def official(row):
    text = re.sub(r'\s+', '', row.get('text', ''))
    title = row['title']
    if not text:
        return {**row, 'status': 'FETCH_FAILED'}
    # Off-cycle VAT adjustments are not a scheduled oil-cost decision.
    special = '增值税' in title
    if '超过每桶130美元调控上限后' in title:
        return {k: v for k, v in {**row, 'status': 'POLICY_ONLY', 'role': 'POLICY'}.items() if k != 'text'}
    value, rule = None, None
    actual = re.search(r'(?:实际|相抵后[^。]{0,30}?|调控后)(?:每吨)?(?:分别)?(上调|下调|降低|提高|上涨)(\d+)元?[、，和](\d+)元', text)
    pair = re.search(r'(?:汽[、，]柴油|汽油[、，]柴油)[^。]{0,85}?(?:每吨|每公吨)(?:分别)?(?:应)?(上调|下调|降低|提高|上涨)(\d+)元?[、，和](\d+)元', text)
    equal = re.search(r'汽[、，]柴油[^。]{0,45}?每吨(?:均)?(上调|下调|降低|提高|上涨)(\d+)元(?:[，。]|$)', text)
    reverse = re.search(r'(?:提高|降低|上调|下调)(?:国内)?汽[、，]柴油[^。]{0,40}?(\d+)[、，](\d+)元', text)
    if actual:
        value = int(actual[3]) * (-1 if actual[1] in ['下调', '降低'] else 1)
        rule = 'ACTUAL_IMPLEMENTED_PAIR'
    elif any(x in title for x in ['不作调整', '不做调整', '不调整', '暂缓调整']) or '暂缓调整国内成品油价格' in text[:120]:
        value, rule = 0, 'EXPLICIT_UNCHANGED_TITLE'
    elif pair:
        value = int(pair[3]) * (-1 if pair[1] in ['下调', '降低'] else 1)
        rule = 'GASOLINE_DIESEL_PAIR_SECOND'
    elif reverse:
        value = int(reverse[2]) * (-1 if any(x in reverse[0] for x in ['降低', '下调']) else 1)
        rule = 'REVERSED_SENTENCE_PAIR_SECOND'
    elif equal:
        value = int(equal[2]) * (-1 if equal[1] in ['下调', '降低'] else 1)
        rule = 'BOTH_FUELS_EQUAL_PER_TON'
    effect = re.search(r'(?:自|调价执行时间为)(?:(20\d\d)年)?(\d{1,2})月(\d{1,2})日24时', text)
    date = row['publicationDate']
    if effect:
        date = f'{effect[1] or date[:4]}-{int(effect[2]):02d}-{int(effect[3]):02d}'
    # Source dates describe a decision at that day's 24:00. They are never features.
    return {k: v for k, v in {**row, 'adjustmentDate': date, 'dieselChangePerTon': value, 'result': (label(value, 49.999) if value is not None else None), 'role': 'SPECIAL_TAX' if special else 'REGULAR', 'taxChangeIncluded': '消费税' in title, 'parseRule': rule, 'status': 'OK' if value is not None else 'UNPARSED'}.items() if k != 'text'}


def prepare_official():
    articles = json.loads((DATA / 'ndrc-articles.json').read_text())
    rows = [official(r) for r in articles]
    # Duplicate topic/news mirrors are retained as source URLs but not double-counted.
    grouped = {}
    for r in rows:
        key = r.get('adjustmentDate', r['publicationDate'])
        grouped.setdefault(key, []).append(r)
    out = []
    for date, group in sorted(grouped.items()):
        values = {r['dieselChangePerTon'] for r in group if r.get('status') == 'OK'}
        valid = [r for r in group if r.get('status') == 'OK']
        selected = dict(valid[0] if valid else group[0])
        selected['sourceUrls'] = [r['url'] for r in group]
        if len(values) > 1:
            selected.update(status='CONFLICT', dieselChangePerTon=None, result=None)
        out.append(selected)
    (DATA / 'official-adjustments.json').write_text(json.dumps(out, ensure_ascii=False, indent=2))
    good = pd.DataFrame([r for r in out if r['status'] == 'OK' and r['role'] == 'REGULAR'])
    good['date'] = pd.to_datetime(good.adjustmentDate)
    good['gapDays'] = good.date.diff().dt.days
    return good, out


def load_market():
    market, anomalies = {}, []
    for name, code in SERIES.items():
        frame = pd.read_csv(DATA / f'{code}-initial.csv').rename(columns={'period_start_date': 'observationDate', code: 'value', 'realtime_start_date': 'releaseDate'})
        invalid = frame.releaseDate < frame.observationDate
        anomalies += [{'series': name, **r} for r in frame[invalid].to_dict('records')]
        frame = frame[~invalid].dropna(subset=['value']).copy()
        if name != 'wti':
            assert (frame.value > 0).all()
        frame['date'] = pd.to_datetime(frame.observationDate)
        # ALFRED dates have no intraday stamp; wait through that entire US Central day.
        released = {d: (pd.Timestamp(d).tz_localize('America/Chicago') + pd.DateOffset(days=1)).tz_convert('UTC') for d in frame.releaseDate.unique()}
        frame['availableAt'] = frame.releaseDate.map(released)
        market[name] = frame.sort_values('date').reset_index(drop=True)
    (DATA / 'quarantined-source-records.json').write_text(json.dumps(anomalies, ensure_ascii=False, indent=2))
    return market


def endpoint(common, day):
    eligible = common[common.date <= day]
    if eligible.empty:
        return None
    r = eligible.iloc[-1]
    return r if (day - r.date).days <= 7 else None


def raw_labels(market):
    common = market['brent'][['date', 'value', 'availableAt']].merge(market['usdCny'][['date', 'value', 'availableAt']], on='date', suffixes=('_brent', '_fx'))
    common['proxy'] = common.value_brent * common.value_fx
    common['knownAt'] = common[['availableAt_brent', 'availableAt_fx']].max(axis=1)
    rows = []
    for t in pd.date_range('2013-03-27', '2026-09-27'):
        a, b = endpoint(common, t - pd.Timedelta(days=1)), endpoint(common, t + pd.Timedelta(days=6))
        # Endpoint must be observed by the pinned collection date; do not label unfinished horizons.
        if a is None or b is None or t + pd.Timedelta(days=6) > common.date.max():
            continue
        rows.append({'snapshotDate': t.strftime('%Y-%m-%d'), 'return7d': b.proxy / a.proxy - 1, 'startObservationDate': a.date.strftime('%Y-%m-%d'), 'endObservationDate': b.date.strftime('%Y-%m-%d'), 'labelKnownAt': max(a.knownAt, b.knownAt).isoformat()})
    return pd.DataFrame(rows)


def freeze_flat(labels):
    design = labels[labels.snapshotDate <= '2016-12-31']
    quantile = float(design.return7d.abs().quantile(.4))
    threshold = max(.005, math.floor(quantile / .005 + .5) * .005)
    decision = {'designStart': '2013-03-27', 'designEnd': '2016-12-31', 'designN': len(design), 'quantile': .4, 'absoluteReturnQuantile': quantile, 'deadband': threshold, 'method': 'HALF_UP_TO_0.5_PERCENTAGE_POINT', 'designDataSha256': hashlib.sha256(design.to_csv(index=False).encode()).hexdigest()}
    path = DATA / 'flat-decision.json'
    if path.exists():
        assert json.loads(path.read_text()) == decision, 'Frozen target changed: create a new experiment instead'
    else:
        path.write_text(json.dumps(decision, indent=2))
    (REPORTS / 'FLAT_LABEL_DECISION.md').write_text(f'''# FLAT label — frozen before fitting

PRIMARY B：7自然日 Brent×USD/CNY 变动在 **±{threshold:.1%}** 以内（含边界）为 FLAT。高于上界 UP，低于下界 DOWN。

设计期2013-03-27—2016-12-31，{len(design)}个可标记日期。绝对7日变动第40百分位={quantile:.6%}；按预先声明的0.5个百分点步长四舍五入，最小0.5%。未使用2019以后测试集选择阈值。冻结数据hash见 flat-decision.json。

这表示“成本代理一周小幅变化”，不表示国内柴油价格一定不变。缺失数据永不标FLAT。阈值固定跨年份，不追随危机期波动扩张以粉饰命中率。

SECONDARY A：官方实际柴油变化≥+50元/吨为UP，≤−50为DOWN，介于两者之间为FLAT。特殊税制变动单列；机制测算与实际不同时用实际执行幅度。
''')
    return threshold


def feature_snapshot(market, t):
    values, provenance, latest = {}, {}, {}
    for name, frame in market.items():
        visible = frame[(frame.availableAt <= t) & (frame.date.dt.tz_localize('UTC') < t.normalize())]
        if len(visible) < 15:
            return None
        last = visible.iloc[-1]
        if (t.tz_localize(None).normalize() - last.date).days > 14:
            return None
        latest[name] = {'value': float(last.value), 'observationDate': last.observationDate, 'availableAt': last.availableAt.isoformat()}
        def add(key, value, points):
            values[key] = float(value)
            provenance[key] = [{'series': name, 'observationDate': r.observationDate, 'availableAt': r.availableAt.isoformat()} for r in points]
        add(name + 'Age', (t.tz_localize(None).normalize() - last.date).days, [last])
        for n in ([3, 7] if name == 'usdCny' else [1, 3, 7, 14]):
            old = visible[visible.date <= last.date - pd.Timedelta(days=n)]
            if old.empty:
                return None
            old = old.iloc[-1]
            if (last.date - old.date).days > n + 7:
                return None
            # WTI can be negative: bounded-scale asinh is defined across zero, unlike log returns.
            change = np.arcsinh(last.value / 50) - np.arcsinh(old.value / 50) if name == 'wti' else last.value / old.value - 1
            add(f'{name}{n}d', change, [old, last])
        if name == 'brent':
            window = visible[visible.date >= last.date - pd.Timedelta(days=21)]
            if len(window) < 8:
                return None
            add('volatility', np.log(window.value).diff().dropna().std(ddof=1), [r for _, r in window.iterrows()])
    # Product of independently visible component returns; no unpublished common-date anchor.
    values['proxy7d'] = (1 + values['brent7d']) * (1 + values['usdCny7d']) - 1
    provenance['proxy7d'] = provenance['brent7d'] + provenance['usdCny7d']
    assert all(pd.Timestamp(p['availableAt']) <= t for points in provenance.values() for p in points)
    return values, provenance, latest


def prepare():
    REPORTS.mkdir(parents=True, exist_ok=True)
    market = load_market()
    official_frame, official_rows = prepare_official()
    labels = raw_labels(market)
    threshold = freeze_flat(labels)  # MUST run before any model fit.
    labels['target'] = labels.return7d.map(lambda r: label(r, threshold))
    labels.to_csv(DATA / 'target-b-labels.csv', index=False)
    rows, audit, excluded = [], [], []
    for r in labels.to_dict('records'):
        d = pd.Timestamp(r['snapshotDate'])
        timestamp = d.tz_localize('Asia/Shanghai') + pd.Timedelta(hours=9)
        timestamp = timestamp.tz_convert('UTC')
        future = official_frame[official_frame.date >= d]
        previous = official_frame[official_frame.date < d]
        if future.empty or previous.empty:
            excluded.append({'date': r['snapshotDate'], 'reason': 'NO_CLOSED_OFFICIAL_CYCLE'})
            continue
        cycle = future.iloc[0]
        # Missing official windows must not silently become a long artificial cycle.
        if (cycle.date - previous.iloc[-1].date).days > 25:
            excluded.append({'date': r['snapshotDate'], 'reason': 'OFFICIAL_GAP_OVER_25_DAYS'})
            continue
        result = feature_snapshot(market, timestamp)
        if result is None:
            excluded.append({'date': r['snapshotDate'], 'reason': 'FEATURE_MISSING_OR_OVER_14_DAYS_OLD'})
            continue
        features, provenance, latest = result
        max_at = max(p['availableAt'] for points in provenance.values() for p in points)
        rows.append({**r, 'predictionTimestamp': timestamp.isoformat(), 'cycleId': cycle.adjustmentDate, 'cycleYear': cycle.date.year, 'daysToNextAdjustment': (cycle.date - d).days, 'targetA': cycle.result, 'dieselChangePerTon': int(cycle.dieselChangePerTon), 'featureMaxAvailableAt': max_at, **features})
        audit.append({'snapshotDate': r['snapshotDate'], 'predictionTimestamp': timestamp.isoformat(), 'market': latest, 'features': provenance})
    frame = pd.DataFrame(rows)
    assert len(frame) > 1000
    frame.to_csv(DATA / 'snapshots.csv', index=False)
    with (DATA / 'feature-provenance.jsonl').open('w') as f:
        for row in audit:
            f.write(json.dumps(row, ensure_ascii=False, separators=(',', ':')) + '\n')
    (DATA / 'snapshot-exclusions.json').write_text(json.dumps(excluded, indent=2))
    return frame, official_rows, market, threshold


if __name__ == '__main__':
    print(prepare()[0].shape)
