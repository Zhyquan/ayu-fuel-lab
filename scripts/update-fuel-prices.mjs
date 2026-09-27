import { mkdir, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { provinces } from '../dist/data/provinces.js';
import { requestProvince } from './apizero-adapter.mjs';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Test injection never writes the published cache. Only main() writes files.
export async function collectFuelPrices({ names = provinces.map(p => p.name), fetchImpl = fetch, wait = sleep, onProgress = console.log } = {}) {
  const records = {}, evidence = [];
  let quotaStopped = false;
  for (const [index, province] of names.entries()) {
    if (quotaStopped) {
      records[province] = { province, diesel0Price: null, unit: null, updatedAt: null, sourceStatus: 'UNAVAILABLE', failureReason: 'NOT_REQUESTED_AFTER_QUOTA_LIMIT' };
      continue;
    }
    const result = await requestProvince(province, { fetchImpl });
    records[province] = result.record;
    evidence.push(result.evidence);
    onProgress(`${province}: ${result.record.sourceStatus}${result.record.failureReason ? ` (${result.record.failureReason})` : ''}`);
    let waitMs = 2000;
    if (result.record.failureReason === 'RATE_LIMITED') {
      const header = result.evidence.headers['retry-after'];
      const retryMs = /^\d+$/.test(header ?? '') ? Number(header) * 1000 : Number.isFinite(Date.parse(header)) ? Math.max(0, Date.parse(header) - Date.now()) : 30000;
      quotaStopped = result.evidence.businessCode === 4030 || retryMs > 60000;
      waitMs = Math.max(waitMs, retryMs);
    }
    if (index < names.length - 1 && !quotaStopped) await wait(waitMs);
  }
  const cache = { generatedAt: new Date().toISOString(), source: 'APIZero', provinces: records };
  const values = Object.values(records);
  const summary = { total: names.length, succeeded: values.filter(r => r.sourceStatus !== 'UNAVAILABLE').length, failed: values.filter(r => r.sourceStatus === 'UNAVAILABLE').length, stale: values.filter(r => r.sourceStatus === 'STALE').length };
  return { cache, summary, evidence };
}

async function main() {
  const site = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  // Explicit manual failure drill: no external requests and no publishable prices.
  const simulateFailure = process.env.SIMULATE_API_FAILURE === '1';
  const result = await collectFuelPrices(simulateFailure ? {
    fetchImpl: async () => new Response('Failure drill', { status: 503 }),
    wait: async () => {},
  } : {});
  const evidenceDir = resolve(site, 'evidence');
  await mkdir(evidenceDir, { recursive: true });
  const runId = result.cache.generatedAt.replace(/[:.]/g, '-');
  const evidencePath = resolve(evidenceDir, `${runId}.json`);
  await writeFile(evidencePath, JSON.stringify({ generatedAt: result.cache.generatedAt, anonymous: true, requestIntervalMs: 2000, ...result.summary, responses: result.evidence }, null, 2) + '\n');
  const cachePath = resolve(site, 'dist/data/normalized-live-cache.json');
  const temporaryPath = `${cachePath}.${runId}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(result.cache, null, 2) + '\n');
  await rename(temporaryPath, cachePath);
  console.log(JSON.stringify({ ...result.summary, generatedAt: result.cache.generatedAt, cachePath, evidencePath }));
  if (result.summary.failed) process.exitCode = 1;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
