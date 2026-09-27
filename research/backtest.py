"""Expanding, cycle-grouped train/calibration/test evaluation. No random split."""
import json

import numpy as np
import pandas as pd
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, log_loss, precision_recall_fscore_support
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from prepare import CLASSES, FEATURES, DATA, label

SEED = 20260927
MODELS = ['frequency', 'momentum7d', 'logistic_raw', 'logistic_calibrated', 'isotonic_diagnostic']


def normalize(p):
    p = np.clip(np.asarray(p, dtype=float), 1e-9, 1)
    return p / p.sum(axis=1, keepdims=True)


def frequency(y):
    return np.array([(y == c).sum() + 1 for c in CLASSES]) / (len(y) + 3)


def split_fold(frame, year):
    test = frame[frame.cycleYear == year].copy()
    calibration = frame[frame.cycleYear == year - 1].copy()
    train = frame[frame.cycleYear < year - 1].copy()
    if test.empty or calibration.empty:
        raise ValueError('EMPTY_FOLD')
    cal_start = pd.to_datetime(calibration.predictionTimestamp, utc=True).min()
    test_start = pd.to_datetime(test.predictionTimestamp, utc=True).min()
    before = (len(train), len(calibration))
    train = train[pd.to_datetime(train.labelKnownAt, utc=True) < cal_start]
    calibration = calibration[pd.to_datetime(calibration.labelKnownAt, utc=True) < test_start]
    groups = [set(part.cycleId) for part in [train, calibration, test]]
    assert not (groups[0] & groups[1] or groups[0] & groups[2] or groups[1] & groups[2])
    assert pd.to_datetime(train.labelKnownAt, utc=True).max() < cal_start
    assert pd.to_datetime(calibration.labelKnownAt, utc=True).max() < test_start
    audit = {'testYear': year, 'trainN': len(train), 'calibrationN': len(calibration), 'testN': len(test), 'purgedTrainN': before[0] - len(train), 'purgedCalibrationN': before[1] - len(calibration), 'calibrationStart': cal_start.isoformat(), 'testStart': test_start.isoformat(), 'maxTrainLabelKnownAt': train.labelKnownAt.max(), 'maxCalibrationLabelKnownAt': calibration.labelKnownAt.max(), 'trainCycles': sorted(groups[0]), 'calibrationCycles': sorted(groups[1]), 'testCycles': sorted(groups[2])}
    return train, calibration, test, audit


def evaluate_probabilities(y, p):
    p = normalize(p)
    y = np.asarray(y)
    onehot = np.array([[float(t == c) for c in CLASSES] for t in y])
    pred = np.array(CLASSES)[p.argmax(axis=1)]
    class_ece, buckets = {}, []
    for k, c in enumerate(CLASSES):
        ece = 0
        indices = np.minimum((p[:, k] * 10).astype(int), 9)
        for b in range(10):
            take = indices == b
            n = int(take.sum())
            mean = float(p[take, k].mean()) if n else None
            observed = float(onehot[take, k].mean()) if n else None
            if n:
                ece += n / len(y) * abs(mean - observed)
            buckets.append({'class': c, 'lower': b / 10, 'upper': (b + 1) / 10, 'n': n, 'meanPredicted': mean, 'observedFrequency': observed, 'absoluteGap': abs(mean - observed) if n else None})
        class_ece[c] = ece
    precision, recall, f1, support = precision_recall_fscore_support(y, pred, labels=CLASSES, zero_division=0)
    return {'n': len(y), 'brier': float(np.square(p - onehot).sum(axis=1).mean()), 'logLoss': float(log_loss(y, p, labels=CLASSES)), 'classwiseECE': class_ece, 'meanClasswiseECE': float(np.mean(list(class_ece.values()))), 'accuracy': float(accuracy_score(y, pred)), 'macroF1': float(f1_score(y, pred, labels=CLASSES, average='macro', zero_division=0)), 'confusionMatrix': confusion_matrix(y, pred, labels=CLASSES).tolist(), 'byClass': {c: {'precision': float(precision[i]), 'recall': float(recall[i]), 'f1': float(f1[i]), 'support': int(support[i]), 'predictedN': int((pred == c).sum())} for i, c in enumerate(CLASSES)}, 'buckets': buckets}


def fit_fold(train, cal, test, threshold):
    model = make_pipeline(StandardScaler(), LogisticRegression(C=1, max_iter=3000, random_state=SEED))
    model.fit(train[FEATURES], train.target)
    assert list(model.classes_) == CLASSES
    cal_p, raw_p = model.predict_proba(cal[FEATURES]), model.predict_proba(test[FEATURES])
    # Joint logistic calibration of log probabilities; sums to one by construction.
    calibrator = LogisticRegression(C=1, max_iter=3000, random_state=SEED)
    calibrator.fit(np.log(np.clip(cal_p, 1e-9, 1)), cal.target)
    calibrated = calibrator.predict_proba(np.log(np.clip(raw_p, 1e-9, 1)))
    isotonic = []
    for i, c in enumerate(CLASSES):
        iso = IsotonicRegression(out_of_bounds='clip').fit(cal_p[:, i], (cal.target == c).astype(int))
        isotonic.append(iso.predict(raw_p[:, i]))
    train_m = train.proxy7d.map(lambda x: label(x, threshold))
    conditional = {c: frequency(train.loc[train_m == c, 'target']) for c in CLASSES}
    output = {'frequency': np.tile(frequency(train.target), (len(test), 1)), 'momentum7d': np.array([conditional[label(x, threshold)] for x in test.proxy7d]), 'logistic_raw': raw_p, 'logistic_calibrated': calibrated, 'isotonic_diagnostic': normalize(np.array(isotonic).T)}
    return output


def bootstrap_improvement(oos, model='logistic_calibrated'):
    y = np.array([[float(t == c) for c in CLASSES] for t in oos.target])
    a = normalize(oos[[f'{model}_{c}' for c in CLASSES]].to_numpy())
    b = normalize(oos[[f'frequency_{c}' for c in CLASSES]].to_numpy())
    losses = pd.DataFrame({'cycleId': oos.cycleId, 'brier': np.square(b - y).sum(axis=1) - np.square(a - y).sum(axis=1), 'logLoss': -(y * np.log(b)).sum(axis=1) + (y * np.log(a)).sum(axis=1), 'n': 1}).groupby('cycleId').sum()
    rng = np.random.default_rng(SEED)
    samples = []
    for _ in range(2000):
        sample = losses.iloc[rng.integers(0, len(losses), len(losses))]
        samples.append((sample[['brier', 'logLoss']].sum() / sample.n.sum()).to_numpy())
    return {metric: {'improvement': float(losses[metric].sum() / losses.n.sum()), 'cycleBootstrap95': np.quantile(np.array(samples)[:, i], [.025, .975]).tolist()} for i, metric in enumerate(['brier', 'logLoss'])}


def run(frame, threshold):
    assert (pd.to_datetime(frame.featureMaxAvailableAt, utc=True) <= pd.to_datetime(frame.predictionTimestamp, utc=True)).all()
    audits, predictions, by_year = [], [], {}
    for year in range(2019, 2027):
        train, cal, test, audit = split_fold(frame, year)
        assert min(len(train), len(cal), len(test)) > 100
        assert all((train.target == c).sum() >= 30 and (cal.target == c).sum() >= 10 for c in CLASSES)
        probs = fit_fold(train, cal, test, threshold)
        out = test[['snapshotDate', 'predictionTimestamp', 'cycleId', 'cycleYear', 'daysToNextAdjustment', 'target', 'targetA', 'return7d', 'dieselChangePerTon']].copy()
        metrics = {}
        for name, p in probs.items():
            assert np.isfinite(p).all() and np.allclose(p.sum(axis=1), 1, atol=1e-12, rtol=0)
            for i, c in enumerate(CLASSES):
                out[f'{name}_{c}'] = p[:, i]
            metrics[name] = evaluate_probabilities(test.target, p)
        predictions.append(out)
        audits.append(audit)
        by_year[str(year)] = metrics
        print('fold', year, len(train), len(cal), len(test), 'brier', metrics['frequency']['brier'], metrics['logistic_calibrated']['brier'], flush=True)
    oos = pd.concat(predictions).sort_values('snapshotDate').reset_index(drop=True)
    assert not oos.snapshotDate.duplicated().any()
    overall = {name: evaluate_probabilities(oos.target, oos[[f'{name}_{c}' for c in CLASSES]].to_numpy()) for name in MODELS}
    ahead = {}
    for n in [1, 3, 5, 7]:
        subset = oos[oos.daysToNextAdjustment == n]
        ahead[str(n)] = {name: evaluate_probabilities(subset.target, subset[[f'{name}_{c}' for c in CLASSES]].to_numpy()) for name in ['frequency', 'logistic_calibrated']}
    mondays = oos[pd.to_datetime(oos.snapshotDate).dt.dayofweek == 0]
    sensitivity = {name: evaluate_probabilities(mondays.target, mondays[[f'{name}_{c}' for c in CLASSES]].to_numpy()) for name in ['frequency', 'logistic_calibrated']}
    # Ground-truth association, one T-7 row/cycle. This is NOT Target-A forecast accuracy.
    paired = oos[oos.daysToNextAdjustment == 7]
    association = {'n': len(paired), 'pearsonProxyReturnVsActualDieselChange': float(paired.return7d.corr(paired.dieselChangePerTon)), 'labelAgreement': float((paired.target == paired.targetA).mean()), 'crossTable': pd.crosstab(paired.target, paired.targetA).reindex(index=CLASSES, columns=CLASSES, fill_value=0).to_dict()}
    improvement = bootstrap_improvement(oos)
    candidate = overall['logistic_calibrated']
    winning_years = [y for y, m in by_year.items() if y != '2026' and m['logistic_calibrated']['brier'] < m['frequency']['brier'] and m['logistic_calibrated']['logLoss'] < m['frequency']['logLoss']]
    checks = {
        'A_asOfAvailabilityAndCyclePurging': True,
        'B_bothProperScoresBeatFrequencyWithPositive95CI': all(v['cycleBootstrap95'][0] > 0 for v in improvement.values()),
        'C_calibration': max(candidate['classwiseECE'].values()) <= .05 and all(b['absoluteGap'] <= .15 for b in candidate['buckets'] if b['n'] >= 50),
        'D_fixedSevenDaySkill': all(improvement[k]['improvement'] > 0 for k in improvement) and all(sensitivity['logistic_calibrated'][k] < sensitivity['frequency'][k] for k in ['brier', 'logLoss']),
        'E_allClassesPredicted': all(v['predictedN'] / len(oos) >= .01 and v['recall'] >= .05 for v in candidate['byClass'].values()),
        'F_notFlatOnly': candidate['byClass']['FLAT']['predictedN'] / len(oos) < .9,
        'G_yearStability': len(winning_years) / 7 >= .75,
        'H_domesticTargetAssociationMeasured': len(paired) > 100 and np.isfinite(association['pearsonProxyReturnVsActualDieselChange']),
    }
    results = {'seed': SEED, 'primaryTarget': 'B_RENAMED_CRUDE_COST_PRESSURE', 'horizonDays': 7, 'gate': 'PASS' if all(checks.values()) else 'FAIL', 'gateChecks': checks, 'overall': overall, 'byYear': by_year, 'daysBeforeOfficialWindow': ahead, 'nonOverlappingMondaySensitivity': sensitivity, 'improvementVsFrequency': improvement, 'winningCompleteYears': winning_years, 'targetAssociation': association}
    results['gateChecks'] = {k: bool(v) for k, v in checks.items()}
    oos.to_csv(DATA / 'oos-predictions.csv', index=False)
    (DATA / 'fold-audit.json').write_text(json.dumps(audits, indent=2))
    (DATA / 'backtest-results.json').write_text(json.dumps(results, ensure_ascii=False, indent=2, allow_nan=False))
    return results, oos, audits
