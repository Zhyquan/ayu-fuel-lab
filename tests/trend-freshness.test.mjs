import test from 'node:test';
import assert from 'node:assert/strict';
import { checkTrendFreshness, getExpectedLatestTradingDate, normalizeObservations } from '../dist/data/trend-freshness.js';
import { buildTrend, validateTrendCache } from '../dist/data/trend-baseline.js';
import { parseMarketCsv } from '../scripts/market-source.mjs';
import { provinces } from '../dist/data/provinces.js';
import { validatePublicData } from '../scripts/public-data-gate.mjs';

const now = new Date('2026-09-27T12:00:00Z');
// Synthetic unit fixtures only, never a deployed cache.
const input = () => Object.fromEntries(['Brent','WTI'].map(name => [name,
  Array.from({length:25},(_,i)=>({date:`2026-09-${String(i+1).padStart(2,'0')}`,price:100+i}))
    .filter(row=>![0,6].includes(new Date(row.date).getUTCDay()))]));
const check = (value, time=now) => checkTrendFreshness(value,{now:time});
const staleLeg = (value,name,date='2026-09-22') => value[name]=value[name].filter(row=>row.date<=date);

test('freshness: latest completed Friday is LIVE, with explainable metrics', () => {
  const trend=buildTrend(input(),{now:new Date('2026-09-25T22:00:00Z')});
  assert.equal(trend.status,'LIVE'); assert.equal(trend.marketData.brent.latestDate,'2026-09-25');
  assert.equal(trend.method,'MOMENTUM_BASELINE_V1');
});
test('freshness: weekend Friday is LIVE; Sunday is not a required observation', () => {
  assert.equal(getExpectedLatestTradingDate(now),'2026-09-25');
  assert.equal(check(input()).status,'LIVE');
});
test('freshness: both sources several completed days late are STALE, never LIVE', () => {
  const value=input();for(const name of ['Brent','WTI']) staleLeg(value,name);
  assert.equal(check(value).status,'STALE');
  assert.throws(()=>buildTrend(value,{now}),/STALE_MARKET_DATA/);
});
test('freshness: current Brent cannot hide stale WTI', () => {
  const value=input();staleLeg(value,'WTI');assert.equal(check(value).status,'STALE');
});
test('freshness: current WTI cannot hide stale Brent', () => {
  const value=input();staleLeg(value,'Brent');assert.equal(check(value).status,'STALE');
});
test('freshness: future and unfinished-session observations rejected', () => {
  const value=input();value.Brent.at(-1).date='2026-09-28';
  assert.equal(check(value).reason,'FUTURE_OBSERVATION');
  assert.equal(check(input(),new Date('2026-09-25T21:59:59Z')).reason,'INCOMPLETE_MARKET_DAY');
});
test('freshness: nonnumeric, zero, negative and infinite prices rejected', () => {
  for(const price of ['100',null,0,-1,NaN,Infinity]) {
    const value=input();value.WTI.at(-1).price=price;assert.equal(check(value).reason,'INVALID_MARKET_PRICE');
  }
});
test('freshness: duplicate dates fail, including identical duplicates', () => {
  const value=input();value.WTI.push({...value.WTI.at(-1)});
  assert.equal(check(value).reason,'DUPLICATE_OBSERVATION_DATE');
});
test('freshness: unordered observations and CSV are sorted without mutating caller', () => {
  const value=input();value.Brent.reverse();value.WTI.reverse();
  assert.equal(check(value).status,'LIVE');
  assert.equal(buildTrend(value,{now}).observations.Brent.at(-1).date,'2026-09-25');
  assert.equal(value.Brent[0].date,'2026-09-25');
  assert.equal(parseMarketCsv('observation_date,DCOILBRENTEU,DCOILWTICO\n2026-09-25,100,90\n2026-09-24,99,89').Brent[0].date,'2026-09-24');
});
test('freshness: too few points or missing 3d/7d anchors cannot become SIDEWAYS', () => {
  const value=input();value.Brent=value.Brent.slice(-3);
  assert.equal(check(value).reason,'INSUFFICIENT_OBSERVATIONS');
  const gap=input();gap.WTI=gap.WTI.filter(row=>row.date<'2026-09-10'||row.date==='2026-09-25');
  assert.equal(check(gap).reason,'MISSING_WINDOW_ANCHOR');
});
test('freshness: trend rejection leaves the mandatory 31-province price gate independent', () => {
  const value=input();staleLeg(value,'WTI');assert.equal(check(value).status,'STALE');
  const cache={generatedAt:now.toISOString(),source:'APIZero',provinces:Object.fromEntries(provinces.map(({name})=>[name,{province:name,diesel0Price:8.29,unit:'元/升',updatedAt:'2026-09-26',sourceStatus:'LIVE'}]))};
  assert.equal(validatePublicData(cache,{now,startedAt:now.toISOString()}).gate,'PASS');
  cache.provinces['福建'].diesel0Price=null;
  assert.equal(validatePublicData(cache,{now,startedAt:now.toISOString()}).gate,'FAIL');
});
test('freshness: unavailable trend refreshes and recovers on the next minute poll', async context => {
  context.mock.timers.enable({apis:['Date'],now:now.getTime()});
  let calls=0;
  context.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify(++calls===1 ? {status:'UNAVAILABLE',reason:'STALE_MARKET_DATA'} : buildTrend(input(),{now:new Date()}))));
  const {getMarketTrend}=await import('../dist/data/trend-service.js');
  assert.equal((await getMarketTrend()).status,'UNAVAILABLE');
  context.mock.timers.tick(60000);
  assert.equal((await getMarketTrend()).status,'LIVE');assert.equal(calls,2);
});
test('freshness: US holiday and UK bank holiday skip days with no common spot close', () => {
  assert.equal(getExpectedLatestTradingDate(new Date('2026-09-07T23:00:00Z')),'2026-09-04');
  assert.equal(getExpectedLatestTradingDate(new Date('2026-04-06T23:00:00Z')),'2026-04-02');
  assert.equal(getExpectedLatestTradingDate(new Date('2026-12-28T23:00:00Z')),'2026-12-24');
});
test('freshness: New York completion boundary respects summer/winter offset', () => {
  for(const [time,expected] of [['2026-09-25T21:59:59Z','2026-09-24'],['2026-09-25T22:00:00Z','2026-09-25'],['2026-12-04T22:59:59Z','2026-12-03'],['2026-12-04T23:00:00Z','2026-12-04']]) assert.equal(getExpectedLatestTradingDate(new Date(time)),expected);
});
test('freshness: unreviewed calendar year fails closed', () => {
  assert.throws(()=>getExpectedLatestTradingDate(new Date('2027-02-10T23:00:00Z')),/CALENDAR_REVIEW_REQUIRED/);
});
test('freshness: missing/invalid date, unknown series and excessive series gap fail', () => {
  for(const date of [undefined,'bad','2026-02-30']) { const value=input();value.Brent.at(-1).date=date;assert.equal(check(value).status,'UNAVAILABLE'); }
  const value=input();staleLeg(value,'WTI','2026-09-18');assert.equal(check(value).reason,'SERIES_DATE_GAP');
  assert.throws(()=>normalizeObservations({Brent:[]}),/INVALID_SERIES/);
});
test('freshness: cached LIVE is rechecked against current market day, removing old direction', () => {
  const trend=buildTrend(input(),{now});
  const result=validateTrendCache({...trend,generatedAt:'2026-09-28T23:00:00Z'},{now:new Date('2026-09-28T23:00:00Z')});
  assert.equal(result.trend.status,'UNAVAILABLE');assert.equal('direction' in result.trend,false);
  trend.marketData.brent.change7dPct=99;assert.equal(validateTrendCache(trend,{now}).gate,'FAIL');
});
