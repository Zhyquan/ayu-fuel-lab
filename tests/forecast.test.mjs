import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {adaptAPIZeroForecast} from '../scripts/apizero-forecast-adapter.mjs';
import {requestForecast,saveForecastSnapshot} from '../scripts/update-apizero-forecast.mjs';
import {mapForecastDirection,toPublicForecast,validateForecastCache} from '../dist/data/forecast-contract.js';
import {FORECAST_SOURCE,activeForecastSource} from '../dist/data/forecast-config.js';
import {forecastMarkup} from '../dist/data/forecast-view.js';
import {getForecast} from '../dist/data/forecast-service.js';
import {provinces} from '../dist/data/provinces.js';
import {coastalProvinces} from '../dist/data/coastal-provinces.js';
import {getPriceDisplay} from '../dist/data/price-display.js';
import {validatePublicData} from '../scripts/public-data-gate.mjs';

const now=new Date('2026-09-27T13:00:00Z');
// Synthetic contract fixtures only: never written into the candidate's dist cache.
const raw=()=>({code:0,data:{crude_oil:{brent:100,wti:90,brent_change:2,wti_change:1,source:'sina_finance'},prediction:{direction:'up',estimated_change_per_ton:260,estimated_change_per_liter:0.20,confidence:'HIGH',analysis:'untrusted provider prose'},next_adjust_date:'2026-10-15'}});
const proof=()=>({sourceBasis:'FUTURES',referenceBasis:'FUTURES',checkedAt:'2026-09-27T12:59:00Z',sourceDateEvidenceUrl:'https://example.invalid/test-only-dated-source',sourceDates:{brent:'2026-09-25',wti:'2026-09-25'},reference:{brent:{date:'2026-09-25',value:100},wti:{date:'2026-09-25',value:90}}});
const opts=()=>({httpStatus:200,rawFetchedAt:'2026-09-27T12:59:00Z',crosscheck:proof(),now});
const adapt=(data=raw(),options={})=>adaptAPIZeroForecast(data,{...opts(),...options});
const cache=()=>toPublicForecast(adapt().normalized);
const check=value=>validateForecastCache(value,{now,activeSource:FORECAST_SOURCE});

test('forecast: success + dated independent crosscheck produces normalized LIVE',()=>{
 const r=adapt();assert.equal(r.gate,'PASS');assert.equal(r.normalized.status,'LIVE');assert.equal(r.normalized.direction,'UP');assert.equal(r.normalized.estimatedChangePerTon,260);
 assert.equal(r.normalized.sourceConfidenceRaw,'HIGH');assert.equal(check(cache()).gate,'PASS');
});
test('forecast: HTTP failure and timeout become unavailable',async()=>{
 assert.equal(adapt(raw(),{httpStatus:503}).normalized.status,'UNAVAILABLE');
 const hold=setTimeout(()=>{},50);
 const r=await requestForecast({timeoutMs:5,fetchImpl:async(_,o)=>new Promise((_,reject)=>o.signal.addEventListener('abort',()=>reject(o.signal.reason)))});
 clearTimeout(hold);assert.equal(r.error,'FORECAST_TIMEOUT');assert.equal(r.httpStatus,null);
});
test('forecast: HTTP 200 business failure, key requirement and malformed structure fail',()=>{
 for(const code of [1,4015,4022]){const data=raw();data.code=code;assert.equal(adapt(data).gate,'FAIL');}
 for(const data of [null,{}, {code:0,data:{}}]) assert.equal(adapt(data).normalized.status,'UNAVAILABLE');
});
test('forecast: only authorized direction aliases map; Chinese rise/fall not silently added',()=>{
 for(const [value,direction] of [['rise','UP'],['up','UP'],['fall','DOWN'],['down','DOWN'],['hold','SIDEWAYS'],['flat','SIDEWAYS'],['搁浅','SIDEWAYS']]) assert.equal(mapForecastDirection(value),direction);
 for(const value of ['上涨','下跌','unknown','__proto__','constructor',null]) {const data=raw();data.data.prediction.direction=value;assert.equal(adapt(data).normalized.status,'UNAVAILABLE');}
});
test('forecast: missing Brent rejected',()=>{const data=raw();delete data.data.crude_oil.brent;assert.ok(adapt(data).issues.includes('BRENT_INVALID'));});
test('forecast: missing WTI rejected',()=>{const data=raw();delete data.data.crude_oil.wti;assert.ok(adapt(data).issues.includes('WTI_INVALID'));});
test('forecast: nonnumeric and out-of-range amounts rejected',()=>{
 for(const field of ['estimated_change_per_ton','estimated_change_per_liter']) for(const v of ['260',null,NaN,Infinity,100000]) {const data=raw();data.data.prediction[field]=v;assert.equal(adapt(data).gate,'FAIL');}
});
test('forecast: expired or unverified adjustment dates are dropped without rejecting otherwise valid signal',()=>{
 for(const date of ['2026-09-24','2026-10-15','bad',undefined]) {const data=raw();data.data.next_adjust_date=date;const r=adapt(data);assert.equal(r.gate,'PASS');assert.equal(r.normalized.nextAdjustmentDate,null);}
});
test('forecast: large independent market mismatch fails',()=>{
 const data=raw();data.data.crude_oil.brent=80;assert.ok(adapt(data).issues.includes('BRENT_MARKET_CONFLICT'));
});
test('forecast: missing confidence stores null without changing core direction',()=>{
 const data=raw();delete data.data.prediction.confidence;const r=adapt(data);assert.equal(r.gate,'PASS');assert.equal(r.normalized.sourceConfidenceRaw,null);
});
test('forecast: missing analysis still permits direction and controlled Ayu reasons',()=>{
 const data=raw();delete data.data.prediction.analysis;const r=adapt(data);assert.equal(r.gate,'PASS');assert.deepEqual(r.normalized.reasons,['第三方调价信号偏向上调']);
});
test('forecast: failure leaves mandatory 31-province price gate independent',()=>{
 assert.equal(adapt(null).gate,'FAIL');
 const price={generatedAt:now.toISOString(),source:'APIZero',provinces:Object.fromEntries(provinces.map(({name})=>[name,{province:name,diesel0Price:8.29,unit:'元/升',updatedAt:'2026-09-26',sourceStatus:'LIVE'}]))};
 assert.equal(validatePublicData(price,{now,startedAt:now.toISOString()}).gate,'PASS');
 price.provinces['福建'].diesel0Price=null;assert.equal(validatePublicData(price,{now,startedAt:now.toISOString()}).gate,'FAIL');
});
test('forecast: old cache or old observation cannot pretend LIVE',()=>{
 const old=cache();old.generatedAt='2026-09-25T12:00:00Z';assert.equal(check(old).gate,'FAIL');
 const stale=cache();stale.market.wti.observedAt='2026-09-22';assert.equal(check(stale).gate,'FAIL');
 const c=cache();assert.equal(validateForecastCache(c,{now,activeSource:FORECAST_SOURCE,startedAt:'2026-09-27T12:59:01Z'}).gate,'FAIL');
});
test('forecast: UI uses controlled text, never raw JSON or provider analysis',()=>{
 const c=cache();c.analysis='<script>bad</script>';c.reasons=['untrusted'];
 const view=forecastMarkup(c);assert.ok(view.includes('主要依据'));assert.equal(view.includes('script'),false);assert.equal(view.includes('untrusted'),false);assert.equal(view.includes('direction='),false);
 assert.equal(check(c).gate,'FAIL');
});
test('forecast: raw confidence is archived only and absent from public projection and UI',()=>{
 for(const confidence of ['HIGH','MEDIUM','LOW','高','低']) {const data=raw();data.data.prediction.confidence=confidence;const r=adapt(data);const c=toPublicForecast(r.normalized);assert.equal('sourceConfidenceRaw' in c,false);assert.equal(forecastMarkup(c).includes(confidence),false);}
});
test('forecast: no probability, accuracy or ten-ton cost promise in UI',()=>{
 const html=forecastMarkup(cache());for(const text of ['72%','准确率','命中率','AI预测','10吨','高可信']) assert.equal(html.includes(text),false);
 assert.ok(html.includes('+260'));assert.ok(html.includes('+0.20'));
});
test('forecast: national/coastal counts and ton conversion unchanged',()=>{
 assert.equal(provinces.length,31);assert.equal(coastalProvinces.length,11);
 for(const [liter,ton] of [[8.29,9869],[8.36,9952]]){const value=getPriceDisplay(liter);assert.equal(value.estimatedPricePerTon,ton);assert.equal(value.dieselDensityKgPerLiter,0.84);assert.equal(value.tonPriceType,'ESTIMATED');}
});
test('forecast: timestamp versions never overwrite a same-day snapshot',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'ayu-forecast-test-'));const root=pathToFileURL(dir+'/');
 try {const s={httpStatus:200,rawFetchedAt:'2026-09-27T12:59:00Z',rawText:JSON.stringify(raw())};
 const a=await saveForecastSnapshot(s,{root,crosscheck:proof(),now});
 const before=await readFile(join(dir,'data/forecast-history',a.historyFile),'utf8');
 await assert.rejects(saveForecastSnapshot(s,{root,crosscheck:proof(),now}),{code:'EEXIST'});
 await saveForecastSnapshot({...s,rawFetchedAt:'2026-09-27T12:59:01Z'},{root,crosscheck:proof(),now});
 assert.equal((await readdir(join(dir,'data/forecast-history'))).length,2);assert.equal(await readFile(join(dir,'data/forecast-history',a.historyFile),'utf8'),before);
 } finally {await rm(dir,{recursive:true,force:true});}
});
test('forecast: close market values alone cannot establish source date',()=>{
 const p=proof();p.sourceDates={brent:null,wti:null};p.sourceDateEvidenceUrl=null;
 const r=adapt(raw(),{crosscheck:p});assert.equal(r.gate,'FAIL');assert.ok(r.issues.includes('SOURCE_DATE_EVIDENCE_MISSING'));
});
test('forecast: conflicting ton/liter signs and direction are never silently repaired',()=>{
 const data=raw();data.data.prediction.direction='down';data.data.prediction.estimated_change_per_ton=-2440;data.data.prediction.estimated_change_per_liter=1.808;
 assert.ok(adapt(data).issues.includes('CHANGE_UNIT_SIGN_CONFLICT'));assert.equal(data.data.prediction.estimated_change_per_liter,1.808);
});
test('forecast: unapproved APIZero blocks even a well-formed cached LIVE and makes no request',async context=>{
 assert.notEqual(activeForecastSource,FORECAST_SOURCE);assert.equal(validateForecastCache(cache(),{now}).gate,'FAIL');
 context.mock.method(globalThis,'fetch',async()=>{throw new Error('must not call');});
 assert.equal((await getForecast()).status,'UNAVAILABLE');assert.equal(globalThis.fetch.mock.callCount(),0);
});
test('forecast: future fetch, verification or source dates fail',()=>{
 assert.equal(adapt(raw(),{rawFetchedAt:'2026-09-28T13:00:00Z'}).gate,'FAIL');
 const p=proof();p.checkedAt='2026-09-28T13:00:00Z';assert.equal(adapt(raw(),{crosscheck:p}).gate,'FAIL');
 p.checkedAt=opts().rawFetchedAt;p.sourceDates.brent='2026-09-28';assert.equal(adapt(raw(),{crosscheck:p}).gate,'FAIL');
});
test('forecast: request is anonymous GET with no authorization header',async()=>{
 await requestForecast({fetchImpl:async(url,options)=>{assert.ok(url.endsWith('action=forecast'));assert.equal(options.headers,undefined);assert.equal(options.body,undefined);return new Response(JSON.stringify(raw()));}});
});
test('forecast: microsecond ISO capture timestamps are valid evidence, not market dates',()=>{
 const p=proof();p.checkedAt='2026-09-27T12:59:00.123456+00:00';
 assert.equal(adapt(raw(),{rawFetchedAt:'2026-09-27T12:59:00.123456+00:00',crosscheck:p}).gate,'PASS');
});
