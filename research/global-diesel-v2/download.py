"""Anonymous official downloads. Frozen files are verified, never silently refreshed."""
import hashlib
import io
import json
import subprocess
import time
import urllib.parse
import zipfile
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent
DATA = ROOT / 'data'
RAW = DATA / 'raw'
CONFIG = json.loads((ROOT / 'config.json').read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def fetch(url, name, fields=None):
    RAW.mkdir(parents=True, exist_ok=True)
    path = RAW / name
    meta = path.with_suffix(path.suffix + '.meta.json')
    if path.exists() and meta.exists():
        assert sha(path) == json.loads(meta.read_text())['sha256'], name
        return path.read_bytes()
    body = urllib.parse.urlencode(fields).encode() if fields else None
    args = ['curl', '-fLsS', '--max-time', '50', '--retry', '2']
    if body:
        args += ['--data-binary', '@-']
    b = subprocess.run(args + [url], input=body, capture_output=True, check=True).stdout
    path.write_bytes(b)
    meta.write_text(json.dumps({'url': url, 'retrievedAt': datetime.now(timezone.utc).isoformat(), 'sha256': sha(path), 'form': fields}, indent=2))
    time.sleep(.35)
    return b


def run():
    for series in CONFIG['series']:
        url = f'https://alfred.stlouisfed.org/series/downloaddata?seid={series}'
        soup = BeautifulSoup(fetch(url, f'{series}-form.html'), 'html.parser')
        end = soup.select_one('#form_obs_end_date')['value']
        dates = [o['value'] for o in soup.select('#form_selected_vintage_dates option') if o['value'] <= CONFIG['snapshotAt'][:10]]
        frames = []
        for offset in range(0, len(dates), 400):
            fields = [('form[units]', 'lin'), ('form[obs_start_date]', CONFIG['downloadStart']), ('form[obs_end_date]', end), ('form[file_type]', '4'), ('form[file_format]', 'csv'), ('form[download_data]', '')]
            fields += [('form[selected_vintage_dates][]', d) for d in dates[offset:offset + 400]]
            b = fetch(url, f'{series}-initial-{offset // 400}.zip', fields)
            if not zipfile.is_zipfile(io.BytesIO(b)):
                raise ValueError(f'{series}: expected initial-release ZIP')
            with zipfile.ZipFile(io.BytesIO(b)) as z:
                name, = [n for n in z.namelist() if n.endswith('.csv')]
                frame = pd.read_csv(io.BytesIO(z.read(name)), na_values=['.'])
                assert frame.columns.tolist() == ['period_start_date', series, 'realtime_start_date']
                frames.append(frame)
        frame = pd.concat(frames).drop_duplicates().sort_values('period_start_date')
        assert not frame.period_start_date.duplicated().any()
        frame.to_csv(DATA / f'{series}-initial.csv', index=False)
        print(series, len(frame), frame.period_start_date.min(), frame.period_start_date.max(), flush=True)
    # Independent current-value cross-check, not used as historical model features.
    fetch('https://www.eia.gov/dnav/pet/xls/PET_PRI_SPT_S1_D.xls', 'eia-current-spots.xls')
    for i in [1, 2]:
        fetch('https://fred.stlouisfed.org/graph/fredgraph.csv?id=DDFUELNYH', f'diesel-current-access-{i}.csv')
    files = {str(p.relative_to(DATA)): sha(p) for p in sorted(DATA.rglob('*')) if p.is_file() and (RAW in p.parents or p.name.endswith('-initial.csv'))}
    (DATA / 'download-manifest.json').write_text(json.dumps({'snapshotAt': CONFIG['snapshotAt'], 'files': files}, indent=2))


if __name__ == '__main__':
    run()
