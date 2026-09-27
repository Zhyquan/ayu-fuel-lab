import { mkdir, writeFile, rename } from 'node:fs/promises';
import { fetchMarketData } from './market-source.mjs';
import { buildTrend, unavailableTrend } from '../dist/data/trend-baseline.js';

const site = new URL('../', import.meta.url);
let trend;
try {
  if (process.env.SIMULATE_TREND_FAILURE === '1') throw new Error('SIMULATED_MARKET_HTTP_503');
  const { rawCsv, observations } = await fetchMarketData();
  await mkdir(new URL('evidence/', site), { recursive: true });
  await writeFile(new URL('evidence/fred-crude.csv', site), rawCsv);
  const recent = Object.fromEntries(Object.entries(observations).map(([name, rows]) => [name, rows.slice(-20)]));
  trend = buildTrend(recent);
} catch (error) {
  trend = unavailableTrend(error.name === 'TimeoutError' ? 'MARKET_TIMEOUT' : error.message);
}
const path = new URL('dist/data/trend-cache.json', site);
const temporary = new URL('dist/data/trend-cache.json.tmp', site);
await writeFile(temporary, JSON.stringify(trend, null, 2) + '\n');
await rename(temporary, path);
console.log(JSON.stringify({ status: trend.status, direction: trend.direction, dataUpdatedAt: trend.dataUpdatedAt, generatedAt: trend.generatedAt, reason: trend.reason }));
