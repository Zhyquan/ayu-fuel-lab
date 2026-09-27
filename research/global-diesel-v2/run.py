"""One command: verified snapshot -> diesel features -> frozen selection -> OOS -> reports."""
import sys
sys.dont_write_bytecode = True
import hashlib
import importlib.metadata
import json
import warnings

import pandas as pd
from threadpoolctl import threadpool_limits

import download
from prepare import C, DATA, REPORTS, ROOT, build, choose_threshold, classify, current_state, data_gate, dump, load_series
from evaluate import freeze_candidate, run_tests
import report


def run():
    warnings.simplefilter('error', RuntimeWarning)
    for line in (ROOT/'requirements-lock.txt').read_text().splitlines():
        package, version = line.split('==')
        assert importlib.metadata.version(package) == version, f'DEPENDENCY_MISMATCH:{package}'
    download.run()  # Reads checksum-verified cached downloads when present; no refresh.
    series, audit = load_series()
    gate = data_gate(series, audit)
    print('GLOBAL_DIESEL_DATA_GATE', gate['gate'], flush=True)
    if gate['gate'] != 'PASS':
        return
    frame = build(series)
    threshold = choose_threshold(frame)
    frame['target_class'] = frame.return_7d.map(lambda r: classify(r, threshold['threshold']))
    frame.to_csv(DATA/'dataset.csv', index=False)
    frame = pd.read_csv(DATA/'dataset.csv', float_precision='round_trip')
    with threadpool_limits(limits=1):
        freeze = freeze_candidate(frame, threshold['threshold'])
        state = current_state(series)
        result, oos = run_tests(frame, freeze, gate, state)
    report.run(result, oos, state)
    files = [DATA/n for n in ['dataset.csv','threshold-freeze.json','candidate-freeze.json','oos-predictions.csv','nonoverlapping-predictions.csv','backtest-results.json','fold-audit.json']]
    hashes = {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
    path = REPORTS/'reproducibility.json'
    if path.exists():
        assert json.loads(path.read_text())['sha256'] == hashes, 'REPRODUCIBILITY_MISMATCH'
    dump(path, {'snapshotAt': C['snapshotAt'], 'seed': C['seed'], 'sha256': hashes, 'mode': 'Frozen downloaded snapshot; no latest-data update'})
    print('GLOBAL_DIESEL_MODEL_GATE', result['gate'], flush=True)


if __name__ == '__main__':
    run()
