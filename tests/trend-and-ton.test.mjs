import test from 'node:test';
import assert from 'node:assert/strict';
import { getPriceDisplay } from '../dist/data/price-display.js';
import { dieselDensityKgPerLiter } from '../dist/data/fuel-config.js';
import { buildTrend, validateTrendCache, percentChange } from '../dist/data/trend-baseline.js';
import { parseMarketCsv, fetchMarketData } from '../scripts/market-source.mjs';

const now = new Date('2026-09-27T12:00:00Z');
// Clearly synthetic fixtures: tests only, never written into the site cache.
const series = slope => Array.from({ length: 20 }, (_, i) => ({ date: `2026-09-${String(i + 3).padStart(2,'0')}`, price: 100 + i * slope }));
const input = slope => ({ Brent: series(slope), WTI: series(slope) });
const good = () => buildTrend(input(1), { now });
const check = data => validateTrendCache(data, { now });

test('ton conversion: density, rounded yuan/ton, original yuan/liter retained', () => {
  assert.equal(dieselDensityKgPerLiter, 0.84);
  for (const [liter, ton] of [[8.29,9869],[8.28,9857],[8.21,9774],[8.31,9893],[8.19,9750],[8.36,9952]]) {
    const result = getPriceDisplay(liter);
    assert.equal(result.estimatedPricePerTon,ton);
    assert.equal(result.diesel0PricePerLiter,liter);
    assert.equal(result.tonPriceType,'ESTIMATED');
  }
  for (const value of [null,undefined,NaN,Infinity,-1,0,'8.29']) assert.throws(()=>getPriceDisplay(value));
});
test('three deterministic directions from observed changes, never missing-data SIDEWAYS', () => {
  assert.equal(good().direction,'UP');
  assert.equal(buildTrend(input(-1), { now }).direction,'DOWN');
  assert.equal(buildTrend(input(0), { now }).direction,'SIDEWAYS');
  assert.equal(buildTrend({ Brent:series(1), WTI:series(-1) }, { now }).direction,'SIDEWAYS');
  assert.equal(check(null).trend.status,'UNAVAILABLE');
  assert.equal('direction' in check(null).trend,false);
});
test('significant recent reversal suppresses an otherwise rising 7d signal', () => {
  const values = input(1);
  for (const rows of Object.values(values)) { rows.at(-4).price=118; rows.at(-2).price=114; rows.at(-1).price=115; }
  const trend = buildTrend(values,{now});
  assert.ok(trend.metrics.Brent.changes.day7.pct>2);
  assert.ok(trend.metrics.Brent.changes.day3.pct<-1);
  assert.equal(trend.direction,'SIDEWAYS');
});
test('percentage and calendar anchors are recomputable, not 7 trading sessions', () => {
  assert.equal(percentChange(110,100),10.000000000000009);
  const trend=good();
  assert.equal(trend.metrics.Brent.changes.day7.fromDate,'2026-09-15');
  const values=input(1);
  for (const rows of Object.values(values)) rows.splice(rows.findIndex(r=>r.date==='2026-09-19'),1);
  const holiday=buildTrend(values,{now});
  assert.equal(holiday.metrics.Brent.changes.day3.fromDate,'2026-09-18');
  assert.equal(holiday.metrics.Brent.changes.day3.toDate,'2026-09-22');
});
test('each source date is validated; future, stale, duplicate and missing series fail', () => {
  for (const mutate of [v=>v.Brent=[], v=>delete v.WTI, v=>v.Brent.at(-1).date='2026-09-28', v=>v.WTI.at(-1).date='2026-02-30', v=>v.Brent.at(-1).date=v.Brent.at(-2).date, v=>v.WTI.at(-1).price='bad', v=>v.WTI.at(-1).price=0]) {
    const values=input(1);mutate(values);assert.throws(()=>buildTrend(values,{now}));
  }
  assert.throws(()=>buildTrend(input(1),{now:new Date('2026-09-30T12:00:00Z')}),/STALE/);
});
test('freshness boundaries: 7 source days allowed, older source and 24h+ cache unavailable', () => {
  assert.equal(buildTrend(input(1),{now:new Date('2026-09-29T12:00:00Z')}).status,'LIVE_BASELINE');
  const trend=good();
  assert.equal(validateTrendCache(trend,{now:new Date('2026-09-28T12:00:01Z')}).trend.status,'UNAVAILABLE');
  assert.equal(validateTrendCache(trend,{now,startedAt:'2026-09-27T12:00:01Z'}).gate,'FAIL');
});
test('TREND_DATA_GATE rejects tampered direction, label, percentages and raw abnormal values', () => {
  for (const mutate of [t=>t.direction='INVALID',t=>t.direction='DOWN',t=>t.label='假的标签',t=>t.basedOn=['NaN'],t=>t.metrics.Brent.changes.day7.pct=999,t=>t.observations.Brent.at(-1).price=Infinity,t=>t.forecast={up:72},t=>t.source='untrusted',t=>t.generatedAt='bad']) {
    const trend=good();mutate(trend);const checked=check(trend);
    assert.equal(checked.gate,'FAIL');assert.equal(checked.trend.status,'UNAVAILABLE');assert.equal('direction' in checked.trend,false);
  }
  assert.equal(check(good()).gate,'PASS');
});
test('CSV handles missing trading observations; malformed price/date/header rejected', () => {
  const rows=parseMarketCsv('observation_date,DCOILBRENTEU,DCOILWTICO\n2026-09-21,100,90\n2026-09-22,.,91\n');
  assert.equal(rows.Brent.length,1);assert.equal(rows.WTI.length,2);
  for (const csv of ['<html>error</html>','observation_date,DCOILBRENTEU,DCOILWTICO\n2026-02-30,100,90','observation_date,DCOILBRENTEU,DCOILWTICO\n2026-09-22,NaN,90']) assert.throws(()=>parseMarketCsv(csv));
});
test('market HTTP failure and timeout stay failures, not flat market observations', async () => {
  await assert.rejects(fetchMarketData({fetchImpl:async()=>new Response('bad',{status:503})}),/HTTP_503/);
  const hold=setTimeout(()=>{},50);
  await assert.rejects(fetchMarketData({timeoutMs:5,fetchImpl:async(_,options)=>new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true}))}));
  clearTimeout(hold);
});
