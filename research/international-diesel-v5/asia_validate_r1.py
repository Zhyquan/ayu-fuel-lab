"""Post-freeze external diagnostics only. No training, selection or inference."""
import argparse
import csv
import hashlib
import json
import math
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import openpyxl

ROOT = Path(__file__).resolve().parent


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read(path):
    return json.loads(path.read_text())


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + '\n')


def label(value, theta):
    return 0 if value < -theta else 2 if value > theta else 1


def extract(path):
    workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
    sheet = workbook['軽油']
    assert '全国' == ''.join(str(sheet['C1'].value).split())
    assert 'ﾘｯﾄﾙ' in str(sheet['A1'].value)
    records, notes, unavailable = [], [], []
    for number, row in enumerate(sheet.iter_rows(values_only=True), 1):
        date, price = row[1], row[2]
        if not isinstance(date, datetime):
            notes.extend(str(v) for v in row if isinstance(v, str) and ('※' in v or '著作' in v or '転載' in v))
            continue
        week = date.date() - timedelta(days=date.weekday())
        if not isinstance(price, (int, float)) or isinstance(price, bool) or not math.isfinite(price) or price <= 0:
            unavailable.append({'row': number, 'surveyDate': date.date().isoformat(), 'reason': 'nonpositive or missing national price'})
            continue
        records.append({'sourceRow': number, 'surveyDate': date.date().isoformat(), 'surveyWeek': week.isoformat(), 'priceJPYPerLitre': float(price)})
    workbook.close()
    counts = {}
    for item in records:
        counts[item['surveyWeek']] = counts.get(item['surveyWeek'], 0) + 1
    for item in records:
        if counts[item['surveyWeek']] > 1:
            unavailable.append({**item, 'reason': 'duplicate calendar survey week excluded'})
    records = [item for item in records if counts[item['surveyWeek']] == 1]
    records.sort(key=lambda x: x['surveyWeek'])
    return records, notes, unavailable


def scores(truth, probabilities):
    y = np.asarray(truth, dtype=int)
    p = np.asarray(probabilities, dtype=float)
    assert len(y) and np.all(np.isfinite(p)) and np.max(np.abs(p.sum(axis=1) - 1)) <= 1e-9
    return {'n': len(y), 'brier': float(np.mean(np.sum((p - np.eye(3)[y]) ** 2, axis=1))),
            'logLoss': float(-np.mean(np.log(np.clip(p[np.arange(len(y)), y], 1e-6, 1)))),
            'accuracy': float(np.mean(p.argmax(axis=1) == y)), 'classCounts': np.bincount(y, minlength=3).tolist()}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--validate-frozen-model', action='store_true')
    args = parser.parse_args()
    if not args.validate_frozen_model:
        print(json.dumps({'finalHoldoutResultsRead': False, 'message': 'Explicit --validate-frozen-model required'}))
        return
    plan = read(ROOT / 'ASIA_VALIDATION_PLAN_R1.json')
    for relative, expected in plan['inputHashes'].items():
        assert digest(ROOT / relative) == expected, 'EXTERNAL_FROZEN_INPUT_HASH_MISMATCH:' + relative
    assert digest(Path(__file__)) == plan['analysisCodeSha256'], 'EXTERNAL_ANALYSIS_CODE_CHANGED'
    source = ROOT / 'data/asia-evidence/japan-national-weekly.xlsx'
    records, notes, unavailable = extract(source)
    by_week = {x['surveyWeek']: x for x in records}
    changes = {}
    for week, first in by_week.items():
        next_week = (datetime.fromisoformat(week).date() + timedelta(days=7)).isoformat()
        if next_week not in by_week:
            continue  # No interpolation across absent survey weeks.
        second = by_week[next_week]
        changes[week] = {'targetWeek': week, 'firstSurveyDate': first['surveyDate'], 'lastSurveyDate': second['surveyDate'],
                         'firstPrice': first['priceJPYPerLitre'], 'lastPrice': second['priceJPYPerLitre'],
                         'return': math.log(second['priceJPYPerLitre'] / first['priceJPYPerLitre']),
                         'elapsedDays': (datetime.fromisoformat(second['surveyDate']) - datetime.fromisoformat(first['surveyDate'])).days}
    with (ROOT / 'data/asia-evidence/japan-national-weekly.csv').open('w', newline='') as file:
        writer = csv.DictWriter(file, fieldnames=list(records[0]))
        writer.writeheader()
        writer.writerows(records)
    predictions = read(ROOT / 'results/final-predictions.json')
    theta = plan['diagnosticThreshold']
    diagnostics, aligned = [], []
    for lag in plan['calendarWeekLags']:
        pairs = []
        for item in predictions:
            target_week = datetime.fromisoformat(item['targetStart']).date()
            shifted = (target_week + timedelta(weeks=lag)).isoformat()
            if shifted in changes:
                pairs.append((item, changes[shifted]))
        aidi = np.asarray([x[0]['targetReturn'] for x in pairs])
        japan = np.asarray([x[1]['return'] for x in pairs])
        diagnostics.append({'japanLagWeeks': lag, 'n': len(pairs), 'pearsonReturnCorrelation': float(np.corrcoef(aidi, japan)[0, 1]),
                            'signAgreement': float(np.mean(np.sign(aidi) == np.sign(japan))),
                            'threeClassAgreement': float(np.mean([label(a, theta) == label(j, theta) for a, j in zip(aidi, japan)]))})
        if lag == 0:
            aligned = [{'targetWeek': j['targetWeek'], 'decisionAt': x['decisionAt'], 'aidiReturn': x['targetReturn'],
                        'japan': j, 'japanDiagnosticLabel': label(j['return'], theta), 'frozenProbabilities': x['probabilities']} for x, j in pairs]
    historical = [x for week, x in changes.items() if plan['baselineStart'] <= week and
                  datetime.fromisoformat(week).date() + timedelta(days=7) < datetime.fromisoformat(plan['baselineEndExclusive']).date()]
    counts = np.bincount([label(x['return'], theta) for x in historical], minlength=3)
    frequency = (counts + .5) / (len(historical) + 1.5)
    truth = [x['japanDiagnosticLabel'] for x in aligned]
    result = {'status': 'LIMITED', 'japanStatus': 'AVAILABLE_EXTERNAL_ONLY', 'mgoStatus': 'UNAVAILABLE',
              'source': 'METI / Agency for Natural Resources and Energy national retail diesel', 'unit': 'JPY/litre, tax-inclusive in this period',
              'sourceRows': len(records), 'sourceStart': records[0]['surveyDate'], 'sourceEnd': records[-1]['surveyDate'],
              'sourceSheet': '軽油', 'dateColumn': 'B', 'nationalPriceColumn': 'C', 'unavailableRows': unavailable, 'sourceNotes': notes,
              'modelFreezeSha256': digest(ROOT / 'results/MODEL_FREEZE.json'), 'externalPlanSha256': digest(ROOT / 'ASIA_VALIDATION_PLAN_R1.json'),
              'n': len(aligned), 'statistics': diagnostics,
              'probabilityDiagnostic': scores(truth, [x['frozenProbabilities'] for x in aligned]),
              'japanFrequencyBaseline': scores(truth, [frequency.tolist()] * len(aligned)),
              'japanBaselineRows': len(historical), 'japanBaselineClassCounts': counts.tolist(), 'japanBaselineProbabilities': frequency.tolist(),
              'surveyElapsedDays': {str(d): sum(x['japan']['elapsedDays'] == d for x in aligned) for d in sorted({x['japan']['elapsedDays'] for x in aligned})},
              'usedInSelection': False, 'modelFits': 0, 'thresholdOrWeightsChanged': False,
              'limitations': ['Retail tax-inclusive national price is not a marine gasoil or Chinese transaction price',
                              'Survey-to-survey change bracketing target week is not the AIDI weekly-average target',
                              'Holiday surveys have variable actual elapsed days; missing calendar weeks are excluded',
                              'Inherited AIDI threshold is an external diagnostic label only, not a new product Target',
                              'All three predeclared lags are reported; no lag is selected to tune the model',
                              'Current official historical workbook is not a complete first-vintage release archive',
                              'MGO candidate terms restrict ML and commercial-product use; no price series ingested']}
    write(ROOT / 'results/ASIA_VALIDATION_RESULT.json', result)
    write(ROOT / 'results/asia-aligned-diagnostics.json', aligned)
    access = read(ROOT / 'data/asia-access-audit.json')
    access.update({k: result[k] for k in ['status', 'japanStatus', 'mgoStatus', 'n', 'statistics', 'modelFreezeSha256', 'usedInSelection']})
    access['reason'] = 'Official Japan weekly workbook obtained through normal anonymous browser download after HTTP403; Singapore candidate rejected by terms.'
    access['statisticsFile'] = 'results/ASIA_VALIDATION_RESULT.json'
    write(ROOT / 'data/asia-access-audit.json', access)
    gate = read(ROOT / 'results/product-gate.json')
    assert gate['V5_MODEL_GATE'] == 'FAIL' and gate['V5_PRODUCT_GATE'] == 'FAIL'
    gate['asiaStatus'] = 'LIMITED'
    write(ROOT / 'results/product-gate.json', gate)
    table = '\n'.join(f"| {x['japanLagWeeks']:+d} | {x['n']} | {x['pearsonReturnCorrelation']:.4f} | {x['signAgreement']:.2%} | {x['threeClassAgreement']:.2%} |" for x in diagnostics)
    p, b = result['probabilityDiagnostic'], result['japanFrequencyBaseline']
    report = f"""# Asian external product validation

ASIA_VALIDATION_STATUS = LIMITED

Japan = AVAILABLE_EXTERNAL_ONLY. Singapore/APAC MGO = UNAVAILABLE.

Source: [METI national weekly retail price survey](https://www.enecho.meti.go.jp/statistics/petroleum_and_lpgas/pl007/results.html), original workbook `data/asia-evidence/japan-national-weekly.xlsx`, sheet 軽油, B dates / C national diesel, JPY/litre. Source observations: {len(records)} from {records[0]['surveyDate']} to {records[-1]['surveyDate']}. Processed by Ayu Fuel Lab; these diagnostics are not produced or endorsed by METI. [Public data use policy](https://www.enecho.meti.go.jp/about/linksto_thissite/index.html), PDL1.0 with attribution and processing disclosure. No separate third-party restriction was identified in the inspected diesel sheet.

## Method frozen before external scores

`ASIA_VALIDATION_PLAN_R1.json` hash {result['externalPlanSha256']}. Model freeze hash {result['modelFreezeSha256']}. This analysis loads frozen predictions and never fits a model. Raw workbook byte hash is recorded. Japan change for target week W is log(survey price in W+1 / price in W), on adjacent calendar survey weeks; actual survey dates and elapsed days remain in aligned diagnostics. Missing weeks are not interpolated. This is a point-survey external proxy, while AIDI is a weekly-average Target. All -1/0/+1 lags were predeclared and retained. Positive lag means Japan's change one calendar week later than the AIDI target.

| Japan lag | Paired weeks | Return correlation | Exact sign agreement including zero | 3-class agreement using inherited theta |
| --- | --- | --- | --- | --- |
{table}

## Fixed probability transfer diagnostic, same-week alignment

Paired n={len(aligned)}. Labels use inherited theta ±0.0075 as an explicitly external diagnostic. No threshold tuning. Frozen V5 Brier {p['brier']:.6f}, Log Loss {p['logLoss']:.6f}, accuracy {p['accuracy']:.2%}. Japan pre-2022 frequency baseline Brier {b['brier']:.6f}, Log Loss {b['logLoss']:.6f}, accuracy {b['accuracy']:.2%}. Baseline counts/probabilities and all row-level joins are in `results/ASIA_VALIDATION_RESULT.json` / `results/asia-aligned-diagnostics.json`. This does not validate calibration for Japan, MGO or Chinese fishermen.

## MGO rejection

[Ship & Bunker Singapore](https://shipandbunker.com/prices/apac/sea/sg-sin-singapore) has a limited recent public table and subscriber historical downloads. Its [terms](https://shipandbunker.com/terms), reviewed 2026-09-28, restrict ML/AI training/commercial-product related uses without written agreement. No MGO price series was acquired or used. No subscription, API key or paid resource was created. MGO statistics remain null, n=0.

V5_PRODUCT_GATE = FAIL. The independently failed Model Gate blocks product percentages. Japan access improves external evidence availability; it does not change the frozen model or establish marine/Asian product validity.
"""
    (ROOT / 'ASIA_PRODUCT_VALIDATION_V5.md').write_text(report)
    print(json.dumps({k: result[k] for k in ['status', 'sourceRows', 'n', 'statistics', 'probabilityDiagnostic', 'japanFrequencyBaseline']}, indent=2))


if __name__ == '__main__':
    main()
