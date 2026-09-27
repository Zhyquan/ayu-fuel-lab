import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { parseMarketCsv } from './market-source.mjs';
import { buildTrend } from '../dist/data/trend-baseline.js';
import { trendConfig } from '../dist/data/trend-config.js';

const raw = await readFile(new URL('../evidence/fred-crude.csv', import.meta.url), 'utf8');
const observations = parseMarketCsv(raw);
const common = observations.Brent.filter(row => observations.WTI.some(w => w.date === row.date));
const lastDate = common.at(-1).date;
const cutoff = new Date(Date.parse(lastDate) - 365 * 86400000).toISOString().slice(0,10);
const windows = [];
for (const row of common.filter(row => row.date >= cutoff)) {
  const snapshot = Object.fromEntries(Object.entries(observations).map(([name, rows]) => [name, rows.filter(r => r.date <= row.date).slice(-20)]));
  const trend = buildTrend(snapshot, { now: new Date(`${row.date}T23:59:00Z`) });
  const b7 = trend.metrics.Brent.changes.day7.pct, w7 = trend.metrics.WTI.changes.day7.pct;
  const contradiction = (b7 < 0 && w7 < 0 && trend.direction === 'UP') || (b7 > 0 && w7 > 0 && trend.direction === 'DOWN');
  // Independent coarse check: two large weekly declines, with both 3d changes negative.
  const obviousFall = b7 < -5 && w7 < -5 && trend.metrics.Brent.changes.day3.pct < 0 && trend.metrics.WTI.changes.day3.pct < 0;
  windows.push({ date: row.date, direction: trend.direction, brent7dPct: b7, wti7dPct: w7, brent3dPct: trend.metrics.Brent.changes.day3.pct, wti3dPct: trend.metrics.WTI.changes.day3.pct, contradiction, obviousFall, obviousFallWrong: obviousFall && trend.direction !== 'DOWN' });
}
const counts = Object.fromEntries(['UP','SIDEWAYS','DOWN'].map(direction => [direction, windows.filter(w => w.direction === direction).length]));
const errors = windows.filter(w => w.contradiction || w.obviousFallWrong);
const result = { rule: 'TREND_BASELINE_V1', config: trendConfig, firstDate: windows[0].date, lastDate, windowCount: windows.length, counts, contradictoryDirections: windows.filter(w => w.contradiction).length, obviousFallWindows: windows.filter(w => w.obviousFall).length, obviousFallWrong: windows.filter(w => w.obviousFallWrong).length, errors, windows };
await mkdir(new URL('../evidence/', import.meta.url), { recursive: true });
await writeFile(new URL('../evidence/trend-sanity.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ ...result, windows: undefined }));
if (errors.length) process.exitCode = 1;
