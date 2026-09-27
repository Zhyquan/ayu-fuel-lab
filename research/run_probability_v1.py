"""One command: pinned public data -> snapshots -> OOS -> calibration -> reports."""
import argparse
import hashlib
import importlib.metadata
import json
import platform
import sys
import warnings
from pathlib import Path

sys.dont_write_bytecode = True

from download_data import DATA, ROOT, main as download
from prepare import prepare
from backtest import run
from report import write_reports


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--download', action='store_true', help='Re-run anonymous public downloader; validated raw cache is reused')
    args = parser.parse_args()
    status = ROOT / 'research/ui/candidate-status.json'
    status.parent.mkdir(parents=True, exist_ok=True)
    unavailable = {'status': 'UNAVAILABLE', 'source': 'AYU_PROBABILITY_MODEL_V1', 'horizonDays': 7, 'probabilities': None, 'primaryDirection': None, 'reason': 'MODEL_GATE_FAILED'}
    status.write_text(json.dumps({'gate': 'FAIL', 'contract': {**unavailable, 'reason': 'RESEARCH_NOT_FINISHED'}}, indent=2))
    versions = {}
    for line in (ROOT/'research/requirements-lock.txt').read_text().splitlines():
        if not line or line.startswith('#'):
            continue
        package, version = line.split('==')
        versions[package] = importlib.metadata.version(package)
        assert versions[package] == version, f'Install pinned version: {line}'
    if args.download:
        download()
    paths = sorted(p for p in (DATA/'raw').glob('*') if p.is_file())
    paths += [DATA/n for n in ['DCOILBRENTEU-initial.csv','DCOILWTICO-initial.csv','DEXCHUS-initial.csv','ndrc-articles.json']]
    hashes = {str(p.relative_to(DATA)): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
    manifest = DATA/'input-manifest.json'
    if manifest.exists():
        assert json.loads(manifest.read_text())['files'] == hashes, 'PINNED_INPUT_CHANGED'
    else:
        manifest.write_text(json.dumps({'asOf': '2026-09-27', 'files': hashes}, indent=2))
    warnings.filterwarnings('error', category=RuntimeWarning)
    frame, official, market, threshold = prepare()
    results, oos, audits = run(frame, threshold)
    write_reports(frame, official, market, results, oos, audits)
    # This research version failed qualification; never serialize an unqualified fitted model.
    if results['gate'] == 'FAIL':
        status.write_text(json.dumps({'gate': 'FAIL', 'contract': unavailable}, indent=2))
    else:
        raise RuntimeError('Unexpected PASS on frozen V1 dataset: require a fresh reviewed artifact export')
    environment = {'python': platform.python_version(), 'platform': platform.system(), 'machine': platform.machine(), 'versions': versions, 'seed': results['seed'], 'datasetManifestSha256': hashlib.sha256(manifest.read_bytes()).hexdigest(), 'targetSha256': hashlib.sha256((ROOT/'research/TARGET_DEFINITION.md').read_bytes()).hexdigest(), 'featuresSha256': hashlib.sha256((ROOT/'research/FEATURES_V1.md').read_bytes()).hexdigest()}
    (DATA/'run-environment.json').write_text(json.dumps(environment, indent=2))
    print('PROBABILITY_MODEL_GATE =', results['gate'])


if __name__ == '__main__':
    main()
