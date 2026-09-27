"""Public, anonymous, cached research downloads; never reads production services."""
import hashlib
import io
import json
import re
import subprocess
import time
import urllib.parse
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data/research'
RAW = DATA / 'raw'
AS_OF = '2026-09-27'


def fetch(url, name, payload=None):
    RAW.mkdir(parents=True, exist_ok=True)
    path = RAW / name
    meta = path.with_suffix(path.suffix + '.meta.json')
    if path.exists() and meta.exists():
        b = path.read_bytes()
        assert hashlib.sha256(b).hexdigest() == json.loads(meta.read_text())['sha256']
        return b
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, data=payload, headers={'User-Agent': 'AyuFuelResearch/1.0 (public academic-style data feasibility study)'})
            if payload is not None:
                # curl handles this site's large form posts more reliably than urllib.
                b = subprocess.run(['curl', '-fLsS', '--max-time', '50', '--data-binary', '@-', url], input=payload, check=True, capture_output=True).stdout
                content_type = 'application/zip' if zipfile.is_zipfile(io.BytesIO(b)) else 'text/html'
            else:
                with urllib.request.urlopen(req, timeout=40) as r:
                    assert r.status == 200
                    b = r.read()
                    content_type = r.headers.get('Content-Type')
            path.write_bytes(b)
            meta.write_text(json.dumps({'url': url, 'retrievedAt': datetime.now(timezone.utc).isoformat(), 'sha256': hashlib.sha256(b).hexdigest(), 'contentType': content_type, 'postBody': payload.decode() if payload else None}, ensure_ascii=False, indent=2))
            time.sleep(.2)
            return b
        except Exception:
            if attempt == 2:
                raise
            time.sleep(1 + attempt)


def alfred():
    import pandas as pd
    for series in ['DCOILBRENTEU', 'DCOILWTICO', 'DEXCHUS']:
        url = f'https://alfred.stlouisfed.org/series/downloaddata?seid={series}'
        soup = BeautifulSoup(fetch(url, f'{series}-form.html'), 'html.parser')
        end = soup.select_one('#form_obs_end_date')['value']
        dates = [o['value'] for o in soup.select('#form_selected_vintage_dates option') if '2012-12-01' <= o['value'] <= AS_OF]
        frames = []
        # ALFRED explicitly caps daily-series requests at 450 vintages.
        for offset in range(0, len(dates), 400):
            selected = dates[offset:offset + 400]
            fields = [('form[units]', 'lin'), ('form[obs_start_date]', '2012-12-01'), ('form[obs_end_date]', end), ('form[file_type]', '4'), ('form[file_format]', 'csv'), ('form[download_data]', '')]
            fields += [('form[selected_vintage_dates][]', d) for d in selected]
            body = urllib.parse.urlencode(fields).encode()
            raw = fetch(url, f'{series}-initial-{offset // 400}.zip', body)
            if not zipfile.is_zipfile(io.BytesIO(raw)):
                raise ValueError(f'{series}: response is not a ZIP, not accepted as data')
            with zipfile.ZipFile(io.BytesIO(raw)) as z:
                name, = [n for n in z.namelist() if n.endswith('.csv')]
                frame = pd.read_csv(io.BytesIO(z.read(name)), na_values=['.'])
                assert list(frame.columns) == ['period_start_date', series, 'realtime_start_date']
                frames.append(frame)
        combined = pd.concat(frames).drop_duplicates().sort_values('period_start_date')
        assert not combined.period_start_date.duplicated().any()
        # Preserve source anomalies for the cleaner to quarantine and report.
        assert len(combined) > 3000
        combined.to_csv(DATA / f'{series}-initial.csv', index=False)
        print(series, len(combined), combined.period_start_date.min(), combined.period_start_date.max(), flush=True)


def ndrc():
    links = {}
    for base, pages in [('https://www.ndrc.gov.cn/xwdt/ztzl/gncpyjg/', 10), ('https://www.ndrc.gov.cn/xwdt/xwfb/', 40)]:
        kind = 'archive' if 'ztzl' in base else 'news'
        for p in range(pages):
            url = base + ('index.html' if p == 0 else f'index_{p}.html')
            soup = BeautifulSoup(fetch(url, f'ndrc-{kind}-index-{p}.html'), 'html.parser')
            dates = []
            for li in soup.select('li'):
                a = li.select_one('a[href]')
                date = re.search(r'20\d\d/\d\d/\d\d', li.get_text())
                if not a or not date:
                    continue
                date = date[0].replace('/', '-')
                dates.append(date)
                title = a.get('title') or a.get_text(strip=True)
                if date < '2013-03-26' or date > AS_OF or '成品油价格' not in title:
                    continue
                if any(t in title for t in ['答记者', '有关负责人', '机制进一步', '价格机制改革', '价格机制的通知']):
                    continue
                key = urllib.parse.urljoin(url, a['href'])
                links[key] = {'publicationDate': date, 'title': title, 'url': key}
            print('index', kind, p, min(dates) if dates else 'EMPTY', len(links), flush=True)
            cutoff = '2013-03-26' if kind == 'archive' else '2021-12-01'
            if dates and min(dates) < cutoff:
                break
    records = []
    for i, (url, row) in enumerate(sorted(links.items(), key=lambda item: item[1]['publicationDate'])):
        name = 'ndrc-' + hashlib.sha256(url.encode()).hexdigest()[:16] + '.html'
        try:
            soup = BeautifulSoup(fetch(url, name), 'html.parser')
            content = soup.select_one('.TRS_Editor') or soup.select_one('.article') or soup
            text = content.get_text(' ', strip=True)
            row.update({'rawFile': 'raw/' + name, 'text': text})
        except Exception as e:
            row.update({'fetchError': str(e)})
        records.append(row)
        if i % 25 == 0:
            print('articles', i + 1, '/', len(links), row['publicationDate'], flush=True)
    (DATA / 'ndrc-articles.json').write_text(json.dumps(records, ensure_ascii=False, indent=2))


def main():
    DATA.mkdir(parents=True, exist_ok=True)
    alfred()
    ndrc()
    files = {}
    for path in sorted(DATA.rglob('*')):
        if path.is_file() and (RAW in path.parents or path.name in ['DCOILBRENTEU-initial.csv', 'DCOILWTICO-initial.csv', 'DEXCHUS-initial.csv', 'ndrc-articles.json']):
            files[str(path.relative_to(DATA))] = hashlib.sha256(path.read_bytes()).hexdigest()
    (DATA / 'download-manifest.json').write_text(json.dumps({'asOf': AS_OF, 'files': files}, indent=2))


if __name__ == '__main__':
    main()
