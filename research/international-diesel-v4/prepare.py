"""Offline weekly preparation. Original first-release US values; EC country data.

EU publication time is an explicit conservative schedule assumption, not a
fabricated historical vintage. Raw file hashes and audit precede fitting.
"""
import csv
import hashlib
import json
import re
import zipfile
from pathlib import Path
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent
RAW = ROOT / 'data/raw'
SPEC = json.loads((ROOT / 'spec.json').read_text())
ASOF = pd.Timestamp(SPEC['asOf'])
COUNTRIES = dict(AT='Austria', BE='Belgium', BG='Bulgaria', HR='Croatia', CY='Cyprus',
    CZ='Czech Republic', DK='Denmark', EE='Estonia', FI='Finland', FR='France', DE='Germany',
    GR='Greece', HU='Hungary', IE='Ireland', IT='Italy', LV='Latvia', LT='Lithuania',
    LU='Luxembourg', MT='Malta', NL='Netherlands', PL='Poland', PT='Portugal', RO='Romania',
    SK='Slovakia', SI='Slovenia', ES='Spain', SE='Sweden')

def save_json(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False) + '\n')

def monday(dates):
    return dates - pd.to_timedelta(dates.dt.weekday, unit='D')

def us_weekly(series):
    d = pd.read_csv(RAW / (series + '-initial.csv'))
    d['date'] = pd.to_datetime(d['period_start_date'])
    d['release'] = pd.to_datetime(d['realtime_start_date'])
    d['value'] = pd.to_numeric(d[series], errors='coerce')
    # Negative WTI is a genuine recorded observation, not a positive-price typo.
    valid = d['value'].notna() & (d['release'] >= d['date'])
    if series.startswith('DDFUEL'):
        valid &= d['value'] > 0
    d = d[valid].copy()
    d['week'] = monday(d['date'])
    d['availableAt'] = (d['release'] + pd.Timedelta(days=1)).dt.tz_localize('America/Chicago').dt.tz_convert('UTC')
    w = d.groupby('week').agg(price=('value', 'mean'), count=('value', 'size'), availableAt=('availableAt', 'max'))
    # Last observation can be a partially reported week; never call it complete.
    w = w[(w['count'] >= 2) & (w.index + pd.Timedelta(days=6) < d['date'].max())]
    return w

def europe():
    table = pd.read_excel(RAW / 'eu-history.xlsx', sheet_name='Prices wo taxes', header=None)
    columns = {str(v).replace('_price_wo_tax_diesel', ''): i for i, v in enumerate(table.iloc[0])
               if str(v).endswith('_price_wo_tax_diesel')}
    dates = pd.to_datetime(table[0], errors='coerce', format='mixed')
    d = pd.DataFrame({c: pd.to_numeric(table[i], errors='coerce') for c, i in columns.items() if c in COUNTRIES})
    d.index = dates
    d = d[d.index.notna()].sort_index().dropna(how='all') / 1000
    d = d.where(d > 0)
    assert d.index.is_unique and (d.index.weekday == 0).all(), 'Survey dates must be unique Mondays'
    return d

def audit_europe(d):
    comparisons = []
    for date in ['2014-03-24', '2014-07-28', '2014-11-17', '2015-01-26']:
        for line in (RAW / ('eu-' + date + '-eur-table.txt')).read_text().splitlines():
            match = re.match(r'^([A-Za-z ]+?)\s{2,}([\d,.]+)\s+([\d,.]+)', line)
            if match and match[1].strip() in COUNTRIES.values():
                country = next(c for c, name in COUNTRIES.items() if name == match[1].strip())
                old = float(match[3].replace(',', ''))
                now = float(d.loc[date, country] * 1000)
                comparisons.append(dict(date=date, country=country, archive=old, current=now, difference=now-old))
    for name in ['eu-2015-01-14.xls', 'eu-2015-01-19.xls']:
        table = pd.read_excel(RAW / name)
        for _, row in table[table['Product Name'] == 'Automotive gas oil'].iterrows():
            country = row['Country EU Code']
            if country not in COUNTRIES:
                continue
            date = row['Prices in force on']
            old = float(row['Weekly price without taxes'])
            now = float(d.loc[date, country] * 1000)
            comparisons.append(dict(date=str(date.date()), country=country, archive=old, current=now, difference=now-old))
    save_json(ROOT / 'data/eu-revision-comparison.json', comparisons)
    latest = pd.read_excel(RAW / 'eu-latest-ex-tax.xlsx', header=None)
    latest_cells = []
    for _, row in latest.iterrows():
        name = 'Czech Republic' if row[0] == 'Czechia' else row[0]
        if name in COUNTRIES.values():
            country = next(c for c, name_ in COUNTRIES.items() if name_ == name)
            # Latest columns: country / petrol / automotive diesel / heating ...
            latest_cells.append(dict(country=country, currentHistory=float(d.iloc[-1][country]*1000), latest=float(row[2])))
    # One observed correction, not mass reconstruction. Median return impact is
    # measured on both adjacent affected returns, with all other cells unchanged.
    changed = [r for r in comparisons if abs(r['difference']) > .005]
    old = d.copy()
    for r in changed:
        old.loc[r['date'], r['country']] = r['archive']/1000
    current_r = np.log(d/d.shift()).median(axis=1)
    archive_r = np.log(old/old.shift()).median(axis=1)
    effect = (archive_r-current_r).dropna()
    return {'cells': len(comparisons), 'dates': len(set(r['date'] for r in comparisons)),
            'changedBeyondRounding': changed, 'maxCountryDifferenceEurPer1000L': max(abs(r['difference']) for r in comparisons),
            'maxMedianLogReturnImpact': float(effect.abs().max()), 'latestComparison': latest_cells,
            'coverageLimitation': 'Sparse historical comparisons in 2014-2015; cannot prove absence of all later corrections',
            'admission': 'CONTROLLED_RESEARCH_RISK_NOT_UNIVERSAL_VINTAGE_PROOF'}

def eia_weekly():
    rows = []
    keys = {'stock': ('Stocks (Million Barrels)', 'Distillate Fuel Oil'),
            'production': ('Refiner and Blender Net Production', 'Distillate Fuel Oil'),
            'inputs': ('Refiner Inputs and Utilization', 'Crude Oil Inputs'),
            'utilization': ('Refiner Inputs and Utilization', 'Percent Utilization')}
    with zipfile.ZipFile(RAW/'eia-weekly-releases.zip') as archive:
        files = [(name, archive.read(name)) for name in sorted(archive.namelist()) if name.endswith('.csv')]
    for name, content in files:
        release = pd.Timestamp(Path(name).stem.replace('eia-table9-', '')[:10].replace('_', '-'))
        table = list(csv.reader(content.decode('utf-8', errors='replace').splitlines()))
        try:
            week = pd.to_datetime(table[0][2], format='mixed')
            fields = {(r[0].strip(), r[1].strip()): r[2] for r in table[1:] if len(r) > 2}
            values = {k: float(fields[labels].replace(',', '')) for k, labels in keys.items()}
            available = (release + pd.Timedelta(days=1)).tz_localize('America/New_York').tz_convert('UTC')
            rows.append({'week': week-pd.Timedelta(days=week.weekday()), 'availableAt': available, **values})
        except (KeyError, ValueError, IndexError):
            continue
    result = pd.DataFrame(rows)
    if result.empty:
        return result
    return result.sort_values('availableAt').drop_duplicates('week').set_index('week')

def features(price, prefix):
    result = {}
    returns = np.log(price/price.shift())
    for h in [1, 2, 4, 8, 13]:
        result[prefix + 'return_' + str(h) + 'w'] = np.log(price/price.shift(h))
    for h in [4, 13, 26]:
        result[prefix + 'volatility_' + str(h) + 'w'] = returns.rolling(h, min_periods=h).std()
        if h != 4 and prefix in ['brent_', 'wti_']:
            continue
    if prefix not in ['brent_', 'wti_']:
        for h in [4, 13, 26]:
            result[prefix + 'distance_MA' + str(h)] = price/price.rolling(h, min_periods=h).mean()-1
        result[prefix + 'momentum_4v13'] = result[prefix + 'return_4w']/4-result[prefix + 'return_13w']/13
        result[prefix + 'drawdown'] = price/price.cummax()-1
    else:
        result.pop(prefix+'return_13w')
        result.pop(prefix+'volatility_26w')
    return result

def build():
    for sub in ['data', 'results', 'ui']:
        (ROOT/sub).mkdir(exist_ok=True)
    eu = europe()
    audit = audit_europe(eu)
    raw_us = {s: us_weekly(s) for s in ['DDFUELNYH', 'DDFUELUSGULF', 'DCOILBRENTEU', 'DCOILWTICO']}
    index = pd.date_range(raw_us['DDFUELNYH'].index.min(), raw_us['DDFUELNYH'].index.max(), freq='W-MON')
    p = pd.DataFrame(index=index)
    for s, w in raw_us.items():
        name = {'DDFUELNYH':'nyh', 'DDFUELUSGULF':'usgc', 'DCOILBRENTEU':'brent', 'DCOILWTICO':'wti'}[s]
        p[name] = w['price']
        p[name+'_availableAt'] = w['availableAt']
    aligned = eu.reindex(index)
    country_returns = np.log(aligned/aligned.shift())
    p['eu_coverage'] = aligned.notna().sum(axis=1)
    p['eu_matched'] = country_returns.notna().sum(axis=1)
    p['eu_return'] = country_returns.median(axis=1).where(p['eu_matched'] >= SPEC['euMinimumMatchedCountries'])
    p['eu_availableAt'] = pd.Series(index+pd.Timedelta(days=11), index=index).dt.tz_localize('Europe/Brussels').dt.tz_convert('UTC')
    p['us_return'] = .5*np.log(p['nyh']/p['nyh'].shift())+.5*np.log(p['usgc']/p['usgc'].shift())
    p['aidi_return'] = .5*p['us_return']+.5*p['eu_return']
    # Chain actual endpoint returns across a missing week without treating that
    # multiweek change as a one-week target. Only consecutive calendar rows label.
    eu_level = []; last_date = None; level = 100.
    for date, row in eu.reindex(index).iterrows():
        if row.notna().sum() < SPEC['euMinimumMatchedCountries']:
            eu_level.append(np.nan); continue
        if last_date is not None:
            r = np.log(row/eu.reindex(index).loc[last_date]).dropna()
            if len(r) < SPEC['euMinimumMatchedCountries']:
                eu_level.append(np.nan); continue
            level *= np.exp(r.median())
        eu_level.append(level); last_date = date
    p['eu_level'] = eu_level
    us_geo = np.sqrt(p['nyh']*p['usgc'])
    p['us_level'] = 100*us_geo/us_geo.dropna().iloc[0]
    p['aidi_level'] = np.sqrt(p['us_level']*p['eu_level'])
    # Exact formula is asserted on every valid adjacent pair.
    assert np.allclose(np.log(p['aidi_level']/p['aidi_level'].shift()).dropna(), p['aidi_return'].dropna(), atol=1e-12)
    f = {}
    for name in ['aidi', 'us', 'eu']:
        f.update(features(p[name+'_level'], name+'_'))
    for name in ['brent', 'wti']:
        f.update(features(p[name].where(p[name] > 0), name+'_'))
    f['us_eu_divergence'] = p['us_return']-p['eu_return']
    f['nyh_usgc_divergence'] = np.log(p['nyh']/p['nyh'].shift())-np.log(p['usgc']/p['usgc'].shift())
    f['regional_volatility_ratio'] = pd.Series(f['us_volatility_13w'])/(pd.Series(f['eu_volatility_13w'])+1e-6)
    f['cross_region_dispersion'] = (p['us_return']-p['eu_return']).abs()
    f['regional_direction_agreement'] = pd.Series(np.where(p['us_return']*p['eu_return'] > 0, 1., 0.), index=index).where(p['aidi_return'].notna())
    f['us_crude_return_spread'] = p['us_return']-pd.Series(f['wti_return_1w'])
    f['eu_crude_return_spread'] = p['eu_return']-pd.Series(f['brent_return_1w'])
    eia = eia_weekly().reindex(index)
    for k in ['stock', 'production', 'inputs', 'utilization']:
        f['eia_'+k+'_change'] = eia[k]/eia[k].shift()-1 if k != 'utilization' else eia[k]-eia[k].shift()
    # Features refer to T-1; publication timestamps still checked, not inferred
    # merely from a lag. EIA follows actual release dates including holidays.
    dataset = pd.DataFrame(f, index=index).shift(SPEC['featureLagWeeks'])
    dataset['season_sin'] = np.sin(2*np.pi*index.isocalendar().week.to_numpy(dtype=float)/52.1775)
    dataset['season_cos'] = np.cos(2*np.pi*index.isocalendar().week.to_numpy(dtype=float)/52.1775)
    dataset['decisionAt'] = (index+pd.Timedelta(days=6, hours=23, minutes=59, seconds=59)).tz_localize('UTC')
    all_available = p[[k for k in p if k.endswith('_availableAt')]].copy()
    all_available['eia_availableAt'] = eia['availableAt']
    dataset['featureAvailableAt'] = all_available.max(axis=1).cummax().shift()
    dataset['target'] = p['aidi_return'].shift(-1)
    dataset['targetWeek'] = index+pd.Timedelta(days=7)
    regional_available = p[['nyh_availableAt', 'usgc_availableAt', 'eu_availableAt']].max(axis=1)
    dataset['labelKnownAt'] = pd.concat([regional_available, regional_available.shift(-1)], axis=1).max(axis=1)
    dataset.loc[dataset['featureAvailableAt'] > dataset['decisionAt'], 'target'] = np.nan
    dataset['past_direction_return'] = p['aidi_return'].shift()
    dataset.index.name = 'week'
    dataset.replace([np.inf,-np.inf], np.nan).to_csv(ROOT/'data/weekly-dataset.csv', float_format='%.12g')
    p.index.name = 'week';p.to_csv(ROOT/'data/weekly-index.csv', float_format='%.12g')
    eu.to_csv(ROOT/'data/eu-country-prices.csv', float_format='%.12g')
    raw_files = {str(path.relative_to(ROOT)): hashlib.sha256(path.read_bytes()).hexdigest() for path in sorted(RAW.iterdir()) if path.is_file()}
    common = p['aidi_level'].dropna()
    gate = ((common.index[-1]-common.index[0]).days/365.25 >= 8
            and len(eu.columns) == 27 and len(audit['latestComparison']) == 27
            and max(abs(r['latest']-r['currentHistory']) for r in audit['latestComparison']) < .005
            and .5*audit['maxMedianLogReturnImpact'] < min(SPEC['thresholdCandidates']))
    summary = {'INTERNATIONAL_DIESEL_DATA_GATE_V4': 'PASS' if gate else 'FAIL',
       'weeklyRows':len(dataset), 'usableLabels': int(dataset['target'].notna().sum()),
       'commonStart':str(common.index[0].date()), 'commonEnd':str(common.index[-1].date()),
       'commonYears':(common.index[-1]-common.index[0]).days/365.25,
       'euStart':str(eu.index[0].date()),'euEnd':str(eu.index[-1].date()),
       'euCoverageCounts':{str(k):int(v) for k,v in p['eu_coverage'].value_counts().items()},
       'eiaWeeks': int(eia['stock'].notna().sum()), 'europeRevisionAudit':audit,
       'rawHashes':raw_files,'japanAdmission':'NOT_IN_TRAINING_OR_SELECTION'}
    save_json(ROOT/'data/DATA_AUDIT.json', summary)
    print(json.dumps({k:v for k,v in summary.items() if k not in ['rawHashes','europeRevisionAudit']},indent=2))

if __name__ == '__main__':
    build()
