import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { evidenceGate, forecastGate, validateForecastCache, unavailableForecast } from '../dist/data/intelligence-v2-contract.js';
import { readForecast } from '../dist/data/intelligence-v2-service.js';
import { forecastMarkup } from '../dist/data/intelligence-v2-view.js';
import { publicEvidenceGate } from '../dist/data/public-evidence.js';
import { publicEvidenceMarkup } from '../dist/data/public-evidence-view.js';
import { evidenceHashFor } from '../scripts/intelligence-v2/history.mjs';
import { loadReplayFixture, replayCandidate, replayOutput } from '../scripts/intelligence-v2/replay.mjs';

const cache=JSON.parse(await readFile(new URL('../data/forecast-history-v2/2026-09-28T11-17-34.176Z-66453209e4ab.json',import.meta.url),'utf8'));
const generated=new Date(cache.generatedAt), expired=new Date(cache.validUntil), later=new Date('2026-10-05T12:00:00Z');
const read=(value,now=later)=>readForecast({fetchImpl:async()=>new Response(JSON.stringify(value)),now});
const markup=(value,now=later)=>forecastMarkup(value,{now})+publicEvidenceMarkup(value,{now});
let serviceVersion=0;
const freshService=()=>import(`../dist/data/intelligence-v2-service.js?last-known-test=${++serviceVersion}`);

test('LIVE presentation is unchanged; exact expiry preserves every historical field as STALE',()=>{
  assert.equal(validateForecastCache(cache,{now:generated}).status,'LIVE');
  assert.doesNotMatch(forecastMarkup(cache,{now:generated}),/上次判断|等待更新/);
  for(const now of [expired,new Date(+expired+1),later]) {
    const result=validateForecastCache(cache,{now});
    assert.deepEqual(result,{...cache,status:'STALE'});
    const html=markup(result,now);
    for(const text of ['偏涨','AI综合估计','35%','25%','40%','上次判断','9月28日 19:17','等待更新','查看来源'])assert.ok(html.includes(text),text);
    assert.doesNotMatch(html,/数据更新中/);
    assert.equal(validateForecastCache(result,{now}).status,'STALE');
  }
});

test('display history never extends validity or relaxes the production forecast/evidence gates',()=>{
  const {evidencePack,...candidate}=cache;
  assert.equal(forecastGate(candidate,evidencePack,{now:generated}).gate,'PASS');
  assert.equal(forecastGate(candidate,evidencePack,{now:expired}).gate,'FAIL');
  assert.equal(evidenceGate(evidencePack,{now:later}).gate,'FAIL');
  assert.equal(validateForecastCache(cache,{now:later}).status,'STALE');
  assert.equal(validateForecastCache(cache,{now:later}).validUntil,cache.validUntil);
});

test('expired forecast keeps its own evidence, source URLs, original publication dates and card IDs',()=>{
  const before=JSON.stringify(cache), options={now:generated}, input={forecast:cache,evidencePack:cache.evidencePack};
  const original=publicEvidenceGate(input,options), historical=publicEvidenceGate(input,{now:later});
  assert.equal(historical.gate,'PASS');assert.deepEqual(historical.cards,original.cards);
  assert.equal(historical.cards.length,4);
  assert.equal(JSON.stringify(cache),before);
  assert.match(publicEvidenceMarkup({...cache,status:'STALE'},{now:later}),/datetime="2026-09-23"/);
});

test('LIVE and STALE readers recompute canonical SHA-256; any hash/content tamper is unavailable',async()=>{
  for(const now of [generated,later]) {
    assert.equal((await read(cache,now)).status,now===generated?'LIVE':'STALE');
    for(const mutate of [c=>c.evidenceHash='0'.repeat(64),c=>c.evidencePack.signals[0].fact+=' 改动']) {
      const altered=structuredClone(cache);mutate(altered);
      const result=await read(altered,now);
      assert.equal(result.status,'UNAVAILABLE');assert.equal(result.reason,'EVIDENCE_HASH_MISMATCH');
      assert.equal(result.probabilities,null);assert.doesNotMatch(markup(result,now),/evidence-card|35%|偏涨/);
    }
  }
});

test('STALE label cannot bless malformed identity, structure or a never-valid historical judgment',async()=>{
  for(const mutate of [
    c=>c.source='FORGED',c=>c.provider='FORGED',c=>c.generatedAt='invalid',
    c=>c.validUntil=c.generatedAt,c=>c.probabilities=null,c=>c.probabilities.UP=45,
    c=>c.mainReasons[0].evidenceId='unknown',c=>c.mainReasons={},c=>c.evidencePack=null,
    c=>{c.evidencePack.signals[0].checkedAt='2026-09-20T00:00:00Z';c.evidenceHash=evidenceHashFor(c.evidencePack);},
  ]) {
    const altered=structuredClone(cache);altered.status='STALE';mutate(altered);
    assert.equal((await read(altered)).status,'UNAVAILABLE');
  }
  assert.equal(validateForecastCache({status:'STALE',probabilities:null},{now:later}).status,'UNAVAILABLE');
});

test('no legal forecast ever received is unavailable, including HTTP errors and timeout',async()=>{
  for(const value of [null,{},unavailableForecast('NONE')]) {
    const result=await read(value);assert.equal(result.status,'UNAVAILABLE');
    assert.doesNotMatch(markup(result),/上次判断|evidence-card|35%|偏涨/);
  }
  for(const fetchImpl of [async()=>new Response('',{status:503}),async()=>{throw new Error('timeout');}])
    assert.equal((await readForecast({fetchImpl,now:later})).status,'UNAVAILABLE');
});

test('refresh atomically replaces verified STALE with new LIVE, then expiry retains the replacement',async context=>{
  const f=await loadReplayFixture(), now=new Date(f.now);
  // Existing synthetic replay transport only; nothing is saved or sent to a real model.
  const candidate=await replayCandidate(f.pack,replayOutput(f.pack,{probabilities:{DOWN:45,FLAT:25,UP:30}}),now);
  const replacement={...candidate,evidencePack:f.pack};
  context.mock.timers.enable({apis:['Date'],now:+now});
  let response=new Response(JSON.stringify(cache)), resolveFetch;
  context.mock.method(globalThis,'fetch',()=>response);
  const service=await freshService();
  const old=await service.getForecast();assert.equal(old.status,'STALE');
  const oldHtml=markup(old,now);
  context.mock.timers.tick(60000);
  response=new Promise(resolve=>{resolveFetch=resolve;});
  let settled=false;const update=service.getForecast().then(result=>{settled=true;return result;});
  await Promise.resolve();assert.equal(settled,false);assert.match(oldHtml,/35%/);
  resolveFetch(new Response(JSON.stringify(replacement)));
  const live=await update;
  assert.equal(live.status,'LIVE');assert.equal(live.primaryDirection,'DOWN');assert.deepEqual(live.probabilities,candidate.probabilities);
  assert.doesNotMatch(markup(live,new Date()),/上次判断|数据更新中/);
  assert.match(markup(live,new Date()),/偏跌/);
  context.mock.timers.setTime(Date.parse(candidate.validUntil));
  response=new Response(JSON.stringify(replacement));
  const stale=await service.getForecast();
  assert.deepEqual(stale,{...replacement,status:'STALE'});assert.match(markup(stale,new Date()),/上次判断/);
  assert.equal(publicEvidenceGate({forecast:stale,evidencePack:stale.evidencePack},{now:new Date()}).gate,'PASS');
});

test('failed or corrupt refresh never replaces the previously hash-verified last good forecast',async context=>{
  context.mock.timers.enable({apis:['Date'],now:+later});
  let payload=cache, fail=false;
  context.mock.method(globalThis,'fetch',async()=>fail?new Response('',{status:503}):new Response(JSON.stringify(payload)));
  const service=await freshService(), original=await service.getForecast();
  assert.equal(original.status,'STALE');
  const altered=structuredClone(cache);altered.evidenceHash='0'.repeat(64);
  for(const step of ['network','corrupt','unavailable']) {
    context.mock.timers.tick(60000);fail=step==='network';
    payload=step==='corrupt'?altered:unavailableForecast('UPDATE_FAILED');
    const result=await service.getForecast();assert.deepEqual(result,original);
    assert.match(markup(result),/35%/);assert.doesNotMatch(markup(result),/数据更新中/);
  }
});

test('service without a verified last good forecast cannot manufacture a fallback',async context=>{
  context.mock.timers.enable({apis:['Date'],now:+later});
  context.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify(unavailableForecast('NONE'))));
  assert.equal((await (await freshService()).getForecast()).status,'UNAVAILABLE');
});
