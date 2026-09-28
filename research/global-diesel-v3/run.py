"""One offline command: verified sources -> audit -> reports -> full authorized tests."""
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import subprocess
import sys

sys.dont_write_bytecode = True
os.environ['OMP_NUM_THREADS'] = '1'
os.environ['OPENBLAS_NUM_THREADS'] = '1'
ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[1]

for name, expected in [('numpy', '2.3.3'), ('pandas', '2.2.3'), ('matplotlib', '3.10.3')]:
    if importlib.metadata.version(name) != expected:
        raise RuntimeError(f'DEPENDENCY_VERSION_MISMATCH: {name}')

import audit
import report

stats, diagnostics, gates = audit.run()
report.run(stats, diagnostics, gates)
for name, args in [
    ('python-tests.txt', [sys.executable, '-B', '-W', 'error::RuntimeWarning', '-m', 'unittest', 'discover', '-s', str(ROOT / 'tests'), '-p', 'test_*.py', '-v']),
    ('node-existing-tests.txt', ['npm', 'test']),
    ('public-scan.json', ['node', 'scripts/scan-public-files.mjs']),
]:
    result = subprocess.run(args, cwd=REPO, capture_output=True, text=True)
    # Successful output is portable; failed traces remain local until repaired.
    if result.returncode:
        print(result.stdout, result.stderr)
        raise RuntimeError(f'VERIFICATION_FAILED: {name}')
    (ROOT / 'reports' / name).write_text(result.stdout + result.stderr)

artifacts = [ROOT / 'data/source-audit.json', ROOT / 'data/comovement-diagnostics.json', ROOT / 'data/gates.json', ROOT / 'data/non-us-proxy-audit.csv', ROOT / 'data/retrospective-weekly-log-returns.csv', ROOT / 'reports/CURRENT_GLOBAL_DIESEL_STATE.json', ROOT / 'reports/GLOBAL_DIESEL_V3_RESULT.md', ROOT / 'reports/GLOBAL_DIESEL_V3_DATA_SOURCE_REPORT.md', ROOT / 'reports/GLOBAL_DIESEL_COMPOSITE_VALIDATION.md', ROOT / 'reports/comovement-rolling-v3.png']
hashes = {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in artifacts}
path = ROOT / 'data/reproduction-hashes.json'
if path.exists() and json.loads(path.read_text()) != hashes:
    raise RuntimeError('FROZEN_REPRODUCTION_CHANGED')
audit.write_json(path, hashes)
print(json.dumps(gates, ensure_ascii=False, indent=2))
