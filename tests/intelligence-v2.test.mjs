import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DAY, evidenceGate, filterAndDeduplicateSignals, forecastGate, normalizeAiEstimateTo5PercentSteps, primaryDirectionFor, validateForecastCache, signalFailure, marketObservationLag } from '../dist/data/intelligence-v2-contract.js';
import { collectEvidence, SOURCES, parseDailyPrices } from '../scripts/intelligence-v2/collect.mjs';
import { createForecastProvider } from '../scripts/intelligence-v2/provider.mjs';
import { evidenceHashFor, saveForecastSnapshot, recordOutcome } from '../scripts/intelligence-v2/history.mjs';
import { runForecast } from '../scripts/intelligence-v2/run.mjs';
import { readForecast } from '../dist/data/intelligence-v2-service.js';
import { forecastMarkup } from '../dist/data/intelligence-v2-view.js';
import { coastalProvinces } from '../dist/data/coastal-provinces.js';
import { provinces } from '../dist/data/provinces.js';
import { selectProvinceData } from '../dist/data/validation.js';
import { getPriceDisplay } from '../dist/data/price-display.js';
import { getProvinceFuelData } from '../dist/data/fuel-service.js';

const root=fileURLToPath(new URL('../',import.meta.url));
// Immutable MANUAL golden snapshot: Official Daily current files change every day.
const {evidencePack:pack,...candidate}=JSON.parse(await readFile(join(root,'data/forecast-history-v2/2026-09-28T11-17-34.176Z-66453209e4ab.json'),'utf8'));
const now=new Date(candidate.generatedAt);
const gate=(c=candidate,p=pack)=>forecastGate(c,p,{now,expectedEvidenceHash:evidenceHashFor(p)});
const fixture=()=>({candidate:structuredClone(candidate),pack:structuredClone(pack)});
const priceFixture=()=>({generatedAt:now.toISOString(),source:'APIZero',provinces:Object.fromEntries(provinces.map(({name},i)=>[name,{province:name,diesel0Price:8+i/100,unit:'元/升',updatedAt:'2026-09-26',sourceStatus:'LIVE'}]))});
const temporary=async callback=>{const path=await mkdtemp(join(tmpdir(),'ayu-v2-'));try{return await callback(path);}finally{await rm(path,{recursive:true,force:true});}};

// Small synthetic source fixtures exercise collection without live calls or news copies.
const daily=`<h1>September 25, 2026</h1><table summary="Spot Petroleum Prices"><b>Wholesale Spot Petroleum Prices, 9/24/26 Close</b>
<tr><td class="s1">Crude Oil ($/barrel)</td><td class="s2">WTI</td><td class="d1">95.88</td><td class="up">+2.7</td></tr>
<tr><td class="s2">Brent</td><td class="d1">120.92</td><td class="up">+3.0</td></tr>
<tr><td class="s1">Low-Sulfur Diesel ($/gallon)</td><td class="s2">NY Harbor</td><td class="d1">4.88</td><td class="dn">-1.6</td></tr></table>`;
const weekly='For the week ending September 18, 2026, U.S. refineries processed 16.8 million barrels per day (b/d), down 519,000 b/d from the previous week, at 94.0% capacity utilization. Distillate production decreased to 5.2 million b/d. Distillate inventories decreased 0.4 million barrels, 12% below the five-year average.';
const article=()=>`<script type="application/ld+json">${JSON.stringify({'@type':'NewsArticle',headline:'Oil Hormuz deadlock',publisher:{name:'Business Recorder'},datePublished:'2026-09-28T10:44:01Z',author:[{name:'Reuters'}]})}</script><div class='story__content'><p>TEST FIXTURE ONLY: US President TestTrump rejected an Iranian proposal involving Hormuz. A deadlock produced concerns regarding oil supplies.</p></div>`;
const rss=`<rss>${Array.from({length:15},(_,i)=>`<item><title>${i<2?'Oil Hormuz deadlock':'Unrelated fixture'}</title><link>https://www.brecorder.com/news/${i+1}</link><pubDate>Mon, 28 Sep 2026 10:44:01 GMT</pubDate></item>`).join('')}</rss>`;
function sourceFetch(url) {
  if (url===SOURCES.opec) return Promise.resolve(new Response('',{status:403}));
  const body=url===SOURCES.prices?daily:url===SOURCES.summary?weekly:url===SOURCES.metadata?JSON.stringify({metadata:{release_date:'2026-09-23',time_period:{end_date:'2026-09-18'}}}):url===SOURCES.weekly?'<a href="archive/2026/2026_09_23/">Latest</a>':url===SOURCES.schedule?'Wednesday 10:30 am':url===SOURCES.recent?'observation_date,DCOILBRENTEU,DCOILWTICO,DDFUELNYH\n2026-09-16,125,105,5.1\n2026-09-17,123,104,5.1\n2026-09-18,120,103,5\n2026-09-21,118,98,5\n2026-09-22,115,97,4.9':url.startsWith(SOURCES.gdelt)?JSON.stringify({articles:[]}):url===SOURCES.rss?rss:article();
  return Promise.resolve(new Response(body));
}

test('V2 01 automatic collector + current real world frozen pack pass independently',async()=>{
  const result=await collectEvidence({fetchImpl:sourceFetch,now});
  assert.equal(result.gate.gate,'PASS');assert.equal(result.pack.discovery.candidateCount,15);
  assert.equal(result.pack.signals.length,7);assert.equal(evidenceGate(pack,{now}).gate,'PASS');
  assert.equal(pack.runType,'CURRENT_REAL_WORLD_RUN');assert.ok(pack.fetchLog.filter(r=>r.status==='OK').length>=7);
});
test('V2 02 ten syndicated copies add no event or evidence weight',()=>{
  const news=pack.signals.find(s=>s.category==='SUPPLY_DISRUPTION');
  const result=filterAndDeduplicateSignals([...pack.signals,...Array.from({length:10},(_,i)=>({...news,id:`syndication-${i}`}))],now);
  assert.equal(result.signals.length,pack.signals.length);assert.equal(result.independentEventCount,3);
  assert.equal(result.excluded.filter(e=>e.reason==='DUPLICATE_EVENT').length,10);
});
test('V2 03 old event with a new publication date is excluded',()=>{
  const news=structuredClone(pack.signals.find(s=>s.kind==='RISK'));news.eventAt='2026-09-20T10:44:01Z';news.eventDate='2026-09-20';
  assert.equal(signalFailure(news,now),'EXPIRED_NEWS');assert.equal(filterAndDeduplicateSignals([news],now).signals.length,0);
});
test('V2 04 URL absent/unsafe evidence is excluded',()=>{
  for (const sourceUrl of [null,'javascript:alert(1)','https://example.com/?access=value']) {
    const s={...pack.signals[0],sourceUrl};assert.equal(filterAndDeduplicateSignals([s],now).signals.length,0);
  }
});
test('V2 05 insufficient evidence becomes unavailable without invented fallback',()=>{
  const p={...pack,signals:pack.signals.slice(0,2)};assert.equal(evidenceGate(p,{now}).status,'UNAVAILABLE');
  assert.equal(validateForecastCache({...candidate,evidencePack:p},{now}).status,'UNAVAILABLE');
});
test('V2 06 AI-added fact, hidden narrative and forged Evidence ID all fail',()=>{
  for (const modify of [c=>c.mainReasons[0].text='全球所有油田停产',c=>c.mainReasons[0].evidenceId='FAKE',c=>c.signalAssessments[0].claim='invented',c=>c.newFact='invented']) {
    const f=fixture();modify(f.candidate);assert.equal(gate(f.candidate,f.pack).gate,'FAIL');
  }
});
test('V2 07 probability total must be exactly 100',()=>{
  const f=fixture();f.candidate.probabilities.UP+=5;assert.ok(gate(f.candidate).errors.includes('INVALID_PROBABILITIES'));
});
test('V2 08 non 5% step, string, non-finite and out-of-range probabilities fail',()=>{
  for(const value of [41,'40',NaN,Infinity,0,95]) {const f=fixture();f.candidate.probabilities.UP=value;assert.equal(gate(f.candidate).gate,'FAIL');}
  for(const input of [{DOWN:57.42,FLAT:18.31,UP:24.27},{DOWN:0,FLAT:100,UP:0}]) {
    const p=normalizeAiEstimateTo5PercentSteps(input);assert.equal(p.DOWN+p.FLAT+p.UP,100);assert.ok(Object.values(p).every(n=>n%5===0&&n>=5&&n<=90));
  }
  assert.throws(()=>normalizeAiEstimateTo5PercentSteps({DOWN:0,FLAT:0,UP:0}));
});
test('V2 09 primary UP/DOWN only; ties and highest FLAT still compare UP versus DOWN',()=>{
  for(const primaryDirection of ['FLAT','SIDEWAYS','constructor']) {const f=fixture();f.candidate.primaryDirection=primaryDirection;assert.ok(gate(f.candidate).errors.includes('INVALID_PRIMARY_DIRECTION'));}
  assert.equal(primaryDirectionFor({DOWN:35,FLAT:30,UP:35}),'DOWN');assert.equal(primaryDirectionFor({DOWN:20,FLAT:55,UP:25}),'UP');
});
test('V2 10 expiry at exactly 24h is STALE and UI retains the last judgment',()=>{
  const options={now:new Date(candidate.validUntil)}, cache={...candidate,evidencePack:pack};
  assert.equal(validateForecastCache(cache,options).status,'STALE');
  const html=forecastMarkup(cache,options);assert.ok(html.includes('上次判断'));assert.equal(html.includes('数据更新中'),false);assert.ok(html.includes('40%'));
});
test('V2 11 failed forecast leaves actual price path independent',async context=>temporary(async directory=>{
  const pricePath=join(directory,'normalized-live-cache.json'),cachePath=join(directory,'forecast-cache.json'),price=priceFixture();
  const raw=JSON.stringify(price);await writeFile(pricePath,raw);
  const f=fixture();f.candidate.mainReasons[0].text='invented';
  const result=await runForecast({pack:f.pack,manualCandidate:f.candidate,historyDirectory:join(directory,'history'),cachePath,now});
  assert.equal(result.gate.gate,'FAIL');assert.equal(await readFile(pricePath,'utf8'),raw);
  assert.equal(JSON.parse(await readFile(cachePath,'utf8')).status,'UNAVAILABLE');
  context.mock.method(globalThis,'fetch',async()=>new Response(raw));
  assert.equal((await getProvinceFuelData('福建',{refresh:true})).record.diesel0Price,price.provinces['福建'].diesel0Price);
}));
test('V2 12 all 11 coastal areas are selectable and national 31 preserved',()=>{
  const price=priceFixture();assert.equal(provinces.length,31);assert.equal(coastalProvinces.length,11);
  for(const {name} of coastalProvinces) assert.equal(selectProvinceData(price,name,now).record.province,name);
});
test('V2 13 dominant tons still use 0.84kg/L and liters retain source price',()=>{
  const data=getPriceDisplay(8.28);assert.equal(data.estimatedPricePerTon,9857);assert.equal(data.diesel0PricePerLiter,8.28);assert.equal(data.dieselDensityKgPerLiter,0.84);
});
test('V2 14 full snapshot hash saved; a repeat cannot overwrite history',async()=>temporary(async directory=>{
  const first=await saveForecastSnapshot(directory,candidate,pack,{now}),raw=await readFile(first.path,'utf8');
  await assert.rejects(saveForecastSnapshot(directory,candidate,pack,{now}),{code:'EEXIST'});assert.equal(await readFile(first.path,'utf8'),raw);
  const snapshot=JSON.parse(raw);assert.deepEqual(snapshot.evidencePack,pack);assert.equal(snapshot.evidenceHash,evidenceHashFor(pack));
}));
test('V2 15 active browser import graph cannot reach retired intelligence/quant outputs',async()=>{
  const visited=new Set();
  async function visit(path) {
    if(visited.has(path))return;visited.add(path);
    const source=await readFile(path,'utf8');
    assert.doesNotMatch(source,/research\/|intelligence-(?:service|view|contract)\.js|trend-cache\.json|trend-(?:config|service|contract|freshness)\.js|(?:global|international)-diesel-v[1-6]/);
    for(const m of source.matchAll(/(?:import[^;]*?from\s*|import\s*)['"]([^'"]+)['"]/g)) if(m[1].startsWith('.')) await visit(resolve(dirname(path),m[1]));
  }
  await visit(join(root,'dist/app.js'));
  assert.ok([...visited].some(p=>p.endsWith('intelligence-v2-contract.js')));
  const workflow=await readFile(join(root,'.github/workflows/intelligence-v2-evidence.yml'),'utf8');
  assert.ok(workflow.includes("cron: '30 18,23,5,10 * * *'"));assert.doesNotMatch(workflow,/npm run intelligence:v2:run|deploy-pages|git push|OPENAI_API/);
});
test('V2 hash tampering, future timestamps, expired EIA and missing category reject',async()=>{
  const f=fixture();f.pack.signals[0].fact+='改动';
  const result=await readForecast({fetchImpl:async()=>new Response(JSON.stringify({...f.candidate,evidencePack:f.pack})),now});
  assert.equal(result.reason,'EVIDENCE_HASH_MISMATCH');
  const future=fixture();future.candidate.generatedAt=new Date(+now+1000).toISOString();assert.equal(gate(future.candidate).gate,'FAIL');
  const p=structuredClone(pack);p.signals.find(s=>s.id==='eia-stocks').nextReleaseAt=now.toISOString();assert.equal(evidenceGate(p,{now}).gate,'FAIL');
  const q={...pack,categoryChecks:pack.categoryChecks.slice(0,6)};assert.equal(evidenceGate(q,{now}).gate,'FAIL');
});
test('V2 LIVE read verifies hash; HTTP errors never leak old forecasts',async()=>{
  const live=await readForecast({fetchImpl:async()=>new Response(JSON.stringify({...candidate,evidencePack:pack})),now});assert.equal(live.status,'LIVE');
  assert.equal((await readForecast({fetchImpl:async()=>new Response('',{status:503}),now})).status,'UNAVAILABLE');
  assert.equal((await readForecast({fetchImpl:async()=>{throw new Error('timeout');},now})).status,'UNAVAILABLE');
});
test('V2 paid provider always blocks before making any request',async context=>{
  context.mock.method(globalThis,'fetch',async()=>{throw new Error('network must not be reached');});
  for(const name of ['OPENAI','OTHER']) await assert.rejects(createForecastProvider(name).generateForecast({evidencePack:pack,evidenceHash:evidenceHashFor(pack),manualCandidate:candidate}),/PAID_PROVIDER_NOT_AUTHORIZED/);
  assert.equal(globalThis.fetch.mock.callCount(),0);
});
test('V2 explicit market date parser is timezone independent; no NA price converts to zero',()=>{
  assert.equal(parseDailyPrices(daily,now.toISOString())[0].eventDate,'2026-09-24');
  assert.equal(parseDailyPrices(daily,now.toISOString())[0].publishedAtPrecision,'DATE_ONLY');
  assert.equal(marketObservationLag('2026-09-24',now),1);
  assert.throws(()=>parseDailyPrices(daily.replace('95.88','NA'),now.toISOString()),/DAILY_PRICE_MISSING/);
});
test('V2 collector source failures yield UNAVAILABLE, not an invented pack',async()=>{
  const result=await collectEvidence({fetchImpl:async()=>new Response('',{status:429}),now});
  assert.equal(result.gate.status,'UNAVAILABLE');assert.equal(result.pack.signals.length,0);assert.ok(result.pack.fetchLog.every(r=>r.status==='FAILED'));
});
test('V2 T+7 outcome is a separate exclusive sidecar; original remains immutable',async()=>temporary(async directory=>{
  const {path}=await saveForecastSnapshot(directory,candidate,pack,{now}),raw=await readFile(path,'utf8');
  const late=new Date(+now+8*DAY),baseline=pack.signals.find(s=>s.id==='market-diesel');
  const input={series:'NY_HARBOR_LOW_SULFUR_DIESEL',unit:'USD/gallon',baselineDate:baseline.eventDate,baselinePrice:baseline.observation.price,observedPrice:baseline.observation.price*0.99,observationDate:late.toISOString().slice(0,10),observedAt:late.toISOString(),sourceUrl:SOURCES.prices};
  await assert.rejects(recordOutcome(path,input,{now}),/OUTCOME_NOT_DUE/);
  await assert.rejects(recordOutcome(path,{...input,evidenceHash:'forged'},{now:late}),/INVALID_OUTCOME_CONTRACT/);
  const result=await recordOutcome(path,input,{now:late});assert.equal(result.outcome.actualObservedDirection,'DOWN');assert.equal(await readFile(path,'utf8'),raw);
  await assert.rejects(recordOutcome(path,input,{now:late}),{code:'EEXIST'});assert.equal((await readdir(directory)).length,2);
}));
