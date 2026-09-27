import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { provinces } from '../dist/data/provinces.js';
import { coastalProvinces } from '../dist/data/coastal-provinces.js';
import { recordError, validTimestamp, chinaDate } from '../dist/data/validation.js';

const cacheFields = ['generatedAt', 'source', 'provinces'];
const recordFields = ['province', 'diesel0Price', 'unit', 'updatedAt', 'sourceStatus', 'failureReason'];
const hasExtra = (value, allowed) => Object.keys(value).some(key => !allowed.includes(key));

export function validatePublicData(cache, { startedAt, now = new Date() } = {}) {
  const errors = [];
  const reject = reason => errors.push(reason);
  if (!cache || typeof cache !== 'object' || Array.isArray(cache)) return { gate: 'FAIL', errors: ['INVALID_CACHE'] };
  if (hasExtra(cache, cacheFields) || cache.source !== 'APIZero') reject('INVALID_CACHE_SCHEMA_OR_SOURCE');
  if (!validTimestamp(startedAt)) reject('MISSING_CURRENT_RUN_START');
  if (!validTimestamp(cache.generatedAt)) reject('INVALID_GENERATED_AT');
  else if (Date.parse(cache.generatedAt) < Date.parse(startedAt) || Date.parse(cache.generatedAt) > new Date(now).getTime() + 300000) reject('CACHE_NOT_FROM_CURRENT_RUN');
  const records = cache.provinces;
  if (!records || typeof records !== 'object' || Array.isArray(records)) return { gate: 'FAIL', errors: [...errors, 'INVALID_PROVINCES'] };
  const names = provinces.map(item => item.name);
  if (Object.keys(records).length !== 31 || names.some(name => !Object.hasOwn(records, name))) reject('NATIONAL_31_INCOMPLETE');
  for (const [province, record] of Object.entries(records)) {
    if (!names.includes(province) || !record || typeof record !== 'object' || Array.isArray(record) || hasExtra(record, recordFields)) {
      reject(`${province}:INVALID_RECORD_SCHEMA`);
      continue;
    }
    // No failure, stale fallback, forecast, history or next-adjustment field is deployable.
    if (record.sourceStatus !== 'LIVE' || record.failureReason) reject(`${province}:NOT_LIVE`);
    const error = recordError(record, province, now);
    if (error) reject(`${province}:${error}`);
    if (validTimestamp(cache.generatedAt) && record.updatedAt > chinaDate(cache.generatedAt)) reject(`${province}:DATE_AFTER_FETCH`);
  }
  for (const { name } of coastalProvinces) if (!Object.hasOwn(records, name)) reject(`${name}:MISSING_COASTAL`);
  return { gate: errors.length ? 'FAIL' : 'PASS', coastalRequired: 11, provinces: Object.keys(records).length, generatedAt: cache.generatedAt, errors };
}

async function main() {
  let result;
  try {
    const path = new URL('../dist/data/normalized-live-cache.json', import.meta.url);
    const cache = JSON.parse(await readFile(path, 'utf8'));
    result = validatePublicData(cache, { startedAt: process.env.RUN_STARTED_AT });
  } catch (error) {
    result = { gate: 'FAIL', errors: [`CACHE_READ_OR_JSON_FAILED:${error.code ?? error.name}`] };
  }
  console.log(`PUBLIC_DATA_GATE = ${result.gate}`);
  console.log(JSON.stringify(result));
  if (result.gate !== 'PASS') process.exitCode = 1;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
