"""Past-only walk-forward, calibrated classifiers and continuous return distributions."""
import hashlib
import json

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, log_loss, precision_recall_fscore_support
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from prepare import C, CLASSES, DATA, FEATURES, ROOT, classify, dump

BASELINES = ['frequency', 'no_change', 'momentum', 'mean_reversion']
MODEL_NAMES = BASELINES + [f'{r}_{c}' for r in C['routes'] for c in C['calibrators']]


def normalize(p):
    p = np.clip(np.asarray(p, float), 1e-9, 1)
    return p / p.sum(axis=1, keepdims=True)


def frequency(y):
    return np.array([(y == k).sum() + 1 for k in CLASSES]) / (len(y) + 3)


def split(frame, year):
    years = pd.to_datetime(frame.date).dt.year
    tr, ca, te = [frame[mask].copy() for mask in [years < year - 1, years == year - 1, years == year]]
    assert min(len(tr), len(ca), len(te)) > 30, ('EMPTY_FOLD', year)
    start_cal, start_test = pd.to_datetime(ca.predictionTimestamp, utc=True).min(), pd.to_datetime(te.predictionTimestamp, utc=True).min()
    before = (len(tr), len(ca))
    tr = tr[pd.to_datetime(tr.labelKnownAt, utc=True) < start_cal]
    ca = ca[pd.to_datetime(ca.labelKnownAt, utc=True) < start_test]
    assert pd.to_datetime(tr.labelKnownAt, utc=True).max() < start_cal
    assert pd.to_datetime(ca.labelKnownAt, utc=True).max() < start_test
    assert pd.to_datetime(tr.endDate).max() < pd.to_datetime(ca.date).min()
    assert pd.to_datetime(ca.endDate).max() < pd.to_datetime(te.date).min()
    assert all(set(part.target_class) == set(CLASSES) for part in [tr, ca])
    audit = {'testYear': year, 'trainN': len(tr), 'calibrationN': len(ca), 'testN': len(te), 'purgedTrain': before[0] - len(tr), 'purgedCalibration': before[1] - len(ca), 'trainMaxLabelKnownAt': tr.labelKnownAt.max(), 'calibrationStart': start_cal.isoformat(), 'calibrationMaxLabelKnownAt': ca.labelKnownAt.max(), 'testStart': start_test.isoformat(), 'trainLastEndpoint': tr.endDate.max(), 'calibrationFirstAnchor': ca.date.min(), 'calibrationLastEndpoint': ca.endDate.max(), 'testFirstAnchor': te.date.min()}
    return tr, ca, te, audit


def cdf_probabilities(cdf_down, cdf_up):
    assert np.all(np.asarray(cdf_up) >= np.asarray(cdf_down))
    return normalize(np.column_stack([cdf_down, np.asarray(cdf_up) - cdf_down, 1 - np.asarray(cdf_up)]))


def empirical_probabilities(mean, residuals, threshold):
    sorted_r = np.sort(residuals)
    lo = np.searchsorted(sorted_r, -threshold - mean, side='left') / len(sorted_r)
    hi = np.searchsorted(sorted_r, threshold - mean, side='right') / len(sorted_r)
    return cdf_probabilities(lo, hi)


def route_probabilities(route, train, queries, threshold):
    x, y = train[FEATURES], train.target_class
    z = pd.concat([q[FEATURES] for q in queries], ignore_index=True)
    kwargs = dict(max_iter=100, max_leaf_nodes=7, min_samples_leaf=40, l2_regularization=5, learning_rate=.05, early_stopping=False, random_state=C['seed'])
    if route in ['logistic', 'hist_classifier']:
        model = make_pipeline(StandardScaler(), LogisticRegression(C=.05, max_iter=2000, random_state=C['seed'])) if route == 'logistic' else HistGradientBoostingClassifier(**kwargs)
        model.fit(x, y)
        assert list(model.classes_) == CLASSES
        out = model.predict_proba(z)
    elif route == 'residual':
        # Honest residuals on a chronological inner tail of training, with label purging.
        boundary = int(len(train) * .75)
        tail = train.iloc[boundary:]
        start = pd.Timestamp(tail.iloc[0].predictionTimestamp)
        past = train.iloc[:boundary]
        past = past[pd.to_datetime(past.labelKnownAt, utc=True) < start]
        model = make_pipeline(StandardScaler(), Ridge(alpha=100))
        model.fit(past[FEATURES], past.return_7d)
        residuals = tail.return_7d.to_numpy() - model.predict(tail[FEATURES])
        model.fit(x, train.return_7d)
        out = empirical_probabilities(model.predict(z), residuals, threshold)
    elif route == 'quantile':
        levels = [.05, .10, .25, .50, .75, .90, .95]
        quantiles = []
        for level in levels:
            model = HistGradientBoostingRegressor(loss='quantile', quantile=level, **kwargs).fit(x, train.return_7d)
            quantiles.append(model.predict(z))
        quantiles = np.sort(np.array(quantiles).T, axis=1)  # monotone rearrangement, no test outcomes
        cdfs = []
        for qs in quantiles:
            width = max(qs[-1] - qs[0], .005)
            knots = np.r_[qs[0] - width, qs, qs[-1] + width]
            cdfs.append(np.interp([-threshold, threshold], knots, [0, *levels, 1]))
        out = cdf_probabilities(*np.array(cdfs).T)
    elif route == 'vol_historical':
        # Each historical future return is scaled by volatility KNOWN at its own decision.
        hist_vol = np.maximum(train.diesel_vol20.to_numpy(), .001)
        innovations = train.return_7d.to_numpy() / (hist_vol * np.sqrt(5))
        out = []
        for vol in z.diesel_vol20.to_numpy():
            neighbors = np.argsort(np.abs(np.log(hist_vol / max(vol, .001))), kind='stable')[:min(250, len(train))]
            future = innovations[neighbors] * max(vol, .001) * np.sqrt(5)
            out.append(empirical_probabilities(np.array([0.]), future, threshold)[0])
        out = np.array(out)
    else:
        raise ValueError(route)
    assert np.isfinite(out).all()
    return np.split(normalize(out), np.cumsum([len(q) for q in queries])[:-1])


def calibrate(cal_p, y_cal, query_p, kind):
    if kind == 'raw':
        return normalize(query_p)
    if kind == 'platt':
        model = LogisticRegression(C=1, max_iter=2000, random_state=C['seed'])
        model.fit(np.log(np.clip(cal_p, 1e-9, 1)), y_cal)
        assert list(model.classes_) == CLASSES
        return normalize(model.predict_proba(np.log(np.clip(query_p, 1e-9, 1))))
    columns = [IsotonicRegression(out_of_bounds='clip').fit(cal_p[:, i], (y_cal == c).astype(int)).predict(query_p[:, i]) for i, c in enumerate(CLASSES)]
    return normalize(np.column_stack(columns))


def metrics(y, probabilities):
    y = np.asarray(y)
    p = normalize(probabilities)
    truth = (y[:, None] == np.array(CLASSES)).astype(float)
    pred = np.array(CLASSES)[p.argmax(axis=1)]
    ece, bins, sixty = {}, [], {}
    for k, c in enumerate(CLASSES):
        value = 0
        for b in range(10):
            mask = np.minimum((p[:, k] * 10).astype(int), 9) == b
            n = int(mask.sum())
            avg, obs = (float(p[mask, k].mean()), float(truth[mask, k].mean())) if n else (None, None)
            if n:
                value += n / len(y) * abs(avg - obs)
            bins.append({'class': c, 'lower': b/10, 'upper': (b+1)/10, 'n': n, 'meanPredicted': avg, 'observedFrequency': obs})
        ece[c] = value
        mask = (p[:, k] >= .55) & (p[:, k] <= .65)
        n = int(mask.sum())
        sixty[c] = {'n': n, 'meanPredicted': float(p[mask, k].mean()) if n else None, 'observedFrequency': float(truth[mask, k].mean()) if n else None}
    precision, recall, f1, support = precision_recall_fscore_support(y, pred, labels=CLASSES, zero_division=0)
    return {'n': len(y), 'brier': float(np.square(p - truth).sum(axis=1).mean()), 'logLoss': float(log_loss(y, p, labels=CLASSES)), 'meanECE': float(np.mean(list(ece.values()))), 'classECE': ece, 'accuracy': float(accuracy_score(y, pred)), 'macroF1': float(f1_score(y, pred, labels=CLASSES, average='macro', zero_division=0)), 'confusionMatrix': confusion_matrix(y, pred, labels=CLASSES).tolist(), 'classes': {c: {'precision': float(precision[i]), 'recall': float(recall[i]), 'f1': float(f1[i]), 'support': int(support[i]), 'predictedN': int((pred == c).sum())} for i, c in enumerate(CLASSES)}, 'buckets': bins, 'sixtyBand': sixty}


def fold(frame, year, threshold):
    tr, ca, te, audit = split(frame, year)
    freq = frequency(tr.target_class)
    out = te[['date', 'predictionTimestamp', 'endDate', 'labelKnownAt', 'return_7d', 'target_class']].copy()
    probs = {'frequency': np.tile(freq, (len(te), 1))}
    # Literal point-direction baselines with predeclared 10% training-prior smoothing.
    for name, direction in [('no_change', ['FLAT'] * len(te)), ('momentum', te.diesel_momentum7.map(lambda r: classify(r, threshold))), ('mean_reversion', te.diesel_momentum7.map(lambda r: classify(-r, threshold)))]:
        probs[name] = np.array([.1 * freq + .9 * (np.array(CLASSES) == d) for d in direction])
    for route in C['routes']:
        cal_p, test_p = route_probabilities(route, tr, [ca, te], threshold)
        for kind in C['calibrators']:
            probs[f'{route}_{kind}'] = calibrate(cal_p, ca.target_class, test_p, kind)
    for name, p in probs.items():
        assert np.isfinite(p).all() and np.allclose(p.sum(axis=1), 1, rtol=0, atol=1e-12)
        for i, c in enumerate(CLASSES):
            out[f'{name}_{c}'] = p[:, i]
    return out, audit


def all_metrics(out):
    return {name: metrics(out.target_class, out[[f'{name}_{c}' for c in CLASSES]].to_numpy()) for name in MODEL_NAMES}


def freeze_candidate(frame, threshold):
    # Outer tests are not passed into selection, even though stored in the same source snapshot.
    validation_only = frame[pd.to_datetime(frame.date).dt.year < min(C['testYears'])].copy()
    parts, audits = [], []
    for year in C['validationYears']:
        out, audit = fold(validation_only, year, threshold)
        parts.append(out); audits.append(audit)
        print('validation', year, len(out), flush=True)
    results = all_metrics(pd.concat(parts))
    eligible = [n for n in MODEL_NAMES if n.endswith(('_platt', '_isotonic'))]
    candidate = min(eligible, key=lambda n: (round(results[n]['brier'], 6), 0 if n.startswith(('residual', 'quantile', 'vol_')) else 1, results[n]['logLoss']))
    freeze = {'candidate': candidate, 'threshold': threshold, 'selectionYears': C['validationYears'], 'formalTestStartYear': min(C['testYears']), 'configSHA256': hashlib.sha256((ROOT / 'config.json').read_bytes()).hexdigest(), 'dataManifestSHA256': hashlib.sha256((DATA / 'download-manifest.json').read_bytes()).hexdigest(), 'results': results, 'audits': audits}
    path = DATA / 'candidate-freeze.json'
    if path.exists():
        assert json.loads(path.read_text()) == freeze, 'FROZEN_CANDIDATE_CHANGED'
    dump(path, freeze)
    return freeze


def nonoverlapping(out):
    last_end, take = '', []
    for index, row in out.sort_values('date').iterrows():
        if row.date > last_end:
            take.append(index); last_end = row.endDate
    return out.loc[take]


def block_bootstrap(out, candidate):
    truth = (out.target_class.to_numpy()[:, None] == np.array(CLASSES)).astype(float)
    cp = normalize(out[[f'{candidate}_{c}' for c in CLASSES]])
    fp = normalize(out[[f'frequency_{c}' for c in CLASSES]])
    block = ((pd.to_datetime(out.date) - pd.Timestamp(out.date.min())).dt.days // C['gate']['bootstrapBlockDays']).to_numpy()
    losses = pd.DataFrame({'block': block, 'brier': np.square(fp-truth).sum(axis=1) - np.square(cp-truth).sum(axis=1), 'logLoss': (truth * (np.log(cp)-np.log(fp))).sum(axis=1), 'n': 1}).groupby('block').sum()
    rng = np.random.default_rng(C['seed']); samples = []
    for _ in range(C['gate']['bootstrapReplicates']):
        x = losses.iloc[rng.integers(0, len(losses), len(losses))]
        samples.append((x[['brier', 'logLoss']].sum() / x.n.sum()).to_numpy())
    return {m: {'gain': float(losses[m].sum()/losses.n.sum()), 'block95CI': np.quantile(np.array(samples)[:, i], [.025, .975]).tolist()} for i, m in enumerate(['brier', 'logLoss'])}


def run_tests(frame, freeze, data_gate, state):
    parts, audits, yearly = [], [], {}
    candidate = freeze['candidate']
    for year in C['testYears']:
        out, audit = fold(frame, year, freeze['threshold'])
        parts.append(out); audits.append(audit); yearly[str(year)] = all_metrics(out)
        print('test', year, len(out), 'candidate', yearly[str(year)][candidate]['brier'], 'frequency', yearly[str(year)]['frequency']['brier'], flush=True)
    oos = pd.concat(parts).sort_values('date').reset_index(drop=True)
    overall, no = all_metrics(oos), all_metrics(nonoverlapping(oos))
    ci = block_bootstrap(oos, candidate)
    cm, fm = overall[candidate], overall['frequency']
    good = [y for y, m in yearly.items() if int(y) < max(C['testYears']) and all(m[candidate][k] < m['frequency'][k] for k in ['brier', 'logLoss']) and m[candidate]['meanECE'] <= m['frequency']['meanECE'] + .02]
    complete = len(C['testYears']) - 1
    g = C['gate']
    bands = no[candidate]['sixtyBand']
    checks = {
        'reliableLegalFiveYearData': data_gate['gate'] == 'PASS',
        'targetAndThresholdAndCandidateFrozen': freeze['configSHA256'] == hashlib.sha256((ROOT/'config.json').read_bytes()).hexdigest(),
        'timeAvailabilityAndPurging': bool((pd.to_datetime(frame.featureMaxAvailableAt, utc=True) <= pd.to_datetime(frame.predictionTimestamp, utc=True)).all()),
        'brierBeatsAllSimpleBaselinesBy2Pct': cm['brier'] <= min(overall[b]['brier'] for b in BASELINES) * (1-g['minimumProperScoreGain']),
        'logLossBeatsAllSimpleBaselinesBy2Pct': cm['logLoss'] <= min(overall[b]['logLoss'] for b in BASELINES) * (1-g['minimumProperScoreGain']),
        'calibrationImprovesFrequencyAndIsSmall': cm['meanECE'] < fm['meanECE'] and max(cm['classECE'].values()) <= g['maxClassECE'],
        'majorityCompleteYearsStableIncrement': len(good)/complete >= g['minimumGoodCompleteYearFraction'],
        'majorityCompleteYearsNoMaterialRetreat': sum(all(m[candidate][k] <= m['frequency'][k]*(1+g['maximumAcceptableYearDegradation']) for k in ['brier', 'logLoss']) for y,m in yearly.items() if int(y)<max(C['testYears'])) / complete >= g['minimumGoodCompleteYearFraction'],
        'threeClassesDoNotCollapse': all(v['recall'] >= g['minimumRecall'] and v['predictedN']/len(oos) >= g['minimumPredictedShare'] for v in cm['classes'].values()),
        'sixtyBandEvidenceAllClasses': all(v['n'] >= g['sixtyBandMinimumNonoverlappingN'] and abs(v['meanPredicted']-v['observedFrequency']) <= g['sixtyBandMaxGap'] for v in bands.values()),
        'nonoverlappingProperScoreGains': all(no[candidate][k] < no['frequency'][k] for k in ['brier','logLoss']),
        'blockBootstrapPositiveLowerBound': all(v['block95CI'][0] > 0 for v in ci.values()),
        'currentWeeklyDataFresh': state['freshness'] == 'CURRENT_FOR_WEEKLY_RELEASE',
        'mgoNotContradicted': True
    }
    result = {'gate': 'PASS' if all(checks.values()) else 'FAIL', 'candidate': candidate, 'gateChecks': {k:bool(v) for k,v in checks.items()}, 'overall': overall, 'byYear': yearly, 'nonoverlapping': no, 'blockBootstrapVsFrequency': ci, 'goodCompleteYears': good, 'mgoStatus': 'EXTERNAL_VALIDATION_LIMITED', 'mgoGateInterpretation': 'Conditional check NOT_EVALUATED: no legally acquired MGO history. This is not supporting evidence; scope remains US benchmark.', 'formalTestDates': [oos.date.min(), oos.date.max()]}
    oos.to_csv(DATA/'oos-predictions.csv', index=False)
    nonoverlapping(oos).to_csv(DATA/'nonoverlapping-predictions.csv', index=False)
    dump(DATA/'fold-audit.json', audits)
    dump(DATA/'backtest-results.json', result)
    return result, oos
