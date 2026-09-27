import test from 'node:test';
import assert from 'node:assert/strict';
import { provinces } from '../dist/data/provinces.js';
import { validatePublicData } from '../scripts/public-data-gate.mjs';
import { selectProvinceData } from '../dist/data/validation.js';
import { adaptAPIZero, requestProvince } from '../scripts/apizero-adapter.mjs';
import { collectFuelPrices } from '../scripts/update-fuel-prices.mjs';

// Synthetic test fixtures only. Never written to dist or uploaded as a site.
const now = new Date('2026-09-27T12:00:00.000Z');
const startedAt = '2026-09-27T11:59:00.000Z';
const valid = () => ({ generatedAt: now.toISOString(), source: 'APIZero', provinces: Object.fromEntries(provinces.map(({ name }) => [name, { province: name, diesel0Price: 8.29, unit: '元/升', updatedAt: '2026-09-10', sourceStatus: 'LIVE' }])) });
const check = cache => validatePublicData(cache, { startedAt, now });
const body = province => ({ code: 0, data: { province, update_date: '2026-09-10', prices: [{ type: 'diesel_0', price: 8.29, unit: '元/升' }] } });
const response = value => new Response(JSON.stringify(value));

test('31 provinces pass; an earlier source date does not imply stale data', () => {
  assert.equal(check(valid()).gate, 'PASS');
  assert.equal(selectProvinceData(valid(), '福建', now).status, 'LIVE');
  assert.equal(adaptAPIZero(body('福建'), '福建', now).sourceStatus, 'LIVE');
});
test('missing coastal or inland record, duplicates and extra province fail', () => {
  for (const name of ['福建', '浙江', '山东', '广东', '辽宁', '海南', '江苏', '河北', '天津', '上海', '广西', '北京']) {
    const cache = valid(); delete cache.provinces[name]; assert.equal(check(cache).gate, 'FAIL');
  }
  const cache = valid(); cache.provinces['未知'] = cache.provinces['福建']; assert.equal(check(cache).gate, 'FAIL');
});
test('invalid, non-numeric and extreme prices rejected without a narrow market band', () => {
  for (const value of [null, '8.29', NaN, Infinity, 0, -1, 0.0001, 10000]) {
    const cache = valid(); cache.provinces['福建'].diesel0Price = value; assert.equal(check(cache).gate, 'FAIL');
  }
  for (const value of [0.1, 1, 20, 100]) {
    const cache = valid(); cache.provinces['福建'].diesel0Price = value; assert.equal(check(cache).gate, 'PASS');
  }
});
test('units, dates, provenance, unknown fields and failed records are gated', () => {
  for (const patch of [{ unit: '元/吨' }, { updatedAt: null }, { updatedAt: '2026-02-30' }, { updatedAt: '2026-09-28' }, { updatedAt: '2026-09-27T08:00:00Z' }, { sourceStatus: 'MOCK' }, { sourceStatus: 'UNAVAILABLE' }, { province: '广东' }, { forecast: { up: 72 } }, { history30d: [] }, { next_adjustment: '9月24日' }, { failureReason: 'HTTP_ERROR' }]) {
    const cache = valid(); Object.assign(cache.provinces['福建'], patch); assert.equal(check(cache).gate, 'FAIL');
  }
  const cache = valid(); cache.source = 'OTHER'; assert.equal(check(cache).gate, 'FAIL');
});
test('only a valid timestamp from this run passes', () => {
  assert.equal(validatePublicData(valid(), { now }).gate, 'FAIL');
  for (const generatedAt of [null, 'invalid', '2026-09-27', '2026-09-27T11:58:59Z', '2026-09-27T12:06:00Z']) {
    const cache = valid(); cache.generatedAt = generatedAt; assert.equal(check(cache).gate, 'FAIL');
  }
  for (const cache of [null, [], {}, { ...valid(), provinces: null }]) assert.equal(check(cache).gate, 'FAIL');
});
test('cache age boundaries: 24h warning, 72h error; no invented source time', () => {
  for (const [hours, status, level] of [[24, 'LIVE', null], [24.01, 'STALE', 'WARNING'], [72, 'STALE', 'WARNING'], [72.01, 'STALE', 'ERROR']]) {
    const cache = valid(); cache.generatedAt = new Date(now.getTime() - hours * 3600000).toISOString();
    const result = selectProvinceData(cache, '福建', now);
    assert.equal(result.status, status); assert.equal(result.delayLevel, level);
    assert.equal(result.record.updatedAt, '2026-09-10');
  }
});
test('adapter rejects business errors, missing diesel, mismatched province and invalid fields', () => {
  for (const mutate of [b => b.code = 500, b => b.data.province = '未知', b => b.data.prices = [], b => b.data.prices[0].price = '8.29', b => delete b.data.update_date, b => b.data.prices[0].unit = '元/吨']) {
    const b = body('福建'); mutate(b); assert.throws(() => adaptAPIZero(b, '福建', now));
  }
  assert.throws(() => adaptAPIZero(body('不存在'), '不存在', now));
  const b = body('福建'); b.data.forecast = 'untrusted'; b.data.next_adjustment = 'expired';
  const record = adaptAPIZero(b, '福建', now);
  assert.equal('forecast' in record, false); assert.equal('next_adjustment' in record, false);
});
test('HTTP, malformed JSON, business failure and rate limit remain unavailable', async () => {
  for (const [fetchImpl, reason] of [[async () => new Response('error', { status: 503 }), 'HTTP_ERROR'], [async () => new Response('error', { status: 429 }), 'RATE_LIMITED'], [async () => new Response('{broken'), 'INVALID_JSON'], [async () => response({ code: 1 }), 'BUSINESS_ERROR'], [async () => response({ code: 4030 }), 'RATE_LIMITED']]) {
    const result = await requestProvince('福建', { fetchImpl });
    assert.equal(result.record.failureReason, reason); assert.equal(result.record.diesel0Price, null);
  }
});
test('request timeout is contained', async () => {
  const fetchImpl = (_, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  const result = await requestProvince('福建', { fetchImpl, timeoutMs: 5 });
  assert.equal(result.record.failureReason, 'TIMEOUT');
});
test('single-province failure does not interrupt collection; gate still blocks publication', async () => {
  const calls = [], waits = [];
  const fetchImpl = async (_, options) => {
    assert.deepEqual(options.headers, { 'Content-Type': 'application/json' });
    const { province } = JSON.parse(options.body); calls.push(province);
    return province === '福建' ? new Response('error', { status: 503 }) : response(body(province));
  };
  const result = await collectFuelPrices({ fetchImpl, wait: async ms => waits.push(ms), onProgress: () => {} });
  assert.equal(calls.length, 31); assert.equal(result.summary.succeeded, 30);
  assert.ok(waits.every(ms => ms >= 2000)); assert.equal(result.cache.provinces['广东'].sourceStatus, 'LIVE');
  assert.equal(validatePublicData(result.cache, { startedAt: new Date(Date.now() - 10000).toISOString() }).gate, 'FAIL');
});
test('daily quota failure stops further network requests and cannot pass gate', async () => {
  let requests = 0;
  const result = await collectFuelPrices({ fetchImpl: async () => { requests++; return response({ code: 4030 }); }, wait: async () => {}, onProgress: () => {} });
  assert.equal(requests, 1); assert.equal(result.summary.failed, 31);
  assert.equal(result.cache.provinces['福建'].sourceStatus, 'UNAVAILABLE');
});
