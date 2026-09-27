import { readFile, writeFile, rename } from 'node:fs/promises';
import { validateTrendCache, unavailableTrend } from '../dist/data/trend-baseline.js';

const path = new URL('../dist/data/trend-cache.json', import.meta.url);
let result;
try {
  const cache = JSON.parse(await readFile(path, 'utf8'));
  result = validateTrendCache(cache, { startedAt: process.env.RUN_STARTED_AT });
} catch {
  result = { gate: 'FAIL', trend: unavailableTrend('TREND_READ_OR_JSON_FAILED') };
}
const temporary = new URL('../dist/data/trend-cache.json.tmp', import.meta.url);
await writeFile(temporary, JSON.stringify(result.trend, null, 2) + '\n');
await rename(temporary, path);
console.log(`TREND_FRESHNESS_GATE = ${result.gate}`);
console.log(`TREND_DATA_GATE = ${result.gate}`);
console.log(JSON.stringify({ status: result.trend.status, reason: result.trend.reason, direction: result.trend.direction, dataUpdatedAt: result.trend.dataUpdatedAt }));
// Optional capability: a rejected trend becomes UNAVAILABLE; price gating stays mandatory.
