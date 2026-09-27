import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {hashText,reviewIntelligence,REVIEW_CHECKS} from '../scripts/intelligence-review.mjs';
import {saveIntelligenceRun} from '../scripts/run-intelligence.mjs';
import {validateIntelligenceCache} from '../dist/data/intelligence-contract.js';
import {getProvinceFuelData} from '../dist/data/fuel-service.js';
import {validatePublicData} from '../scripts/public-data-gate.mjs';
import {provinces} from '../dist/data/provinces.js';
import {coastalProvinces} from '../dist/data/coastal-provinces.js';
import {getPriceDisplay} from '../dist/data/price-display.js';
const names={evidence:'current-evidence',analysis:'current-analysis',sourceReview:'source-review',humanReview:'human-review'};
const raw=Object.fromEntries(await Promise.all(Object.entries(names).map(async([key,file])=>[key,await readFile(new URL(`../intelligence/${file}.json`,import.meta.url),'utf8')])));
const approved=Object.fromEntries(Object.entries(raw).map(([key,value])=>[key,JSON.parse(value)]));
const evidenceHash=hashText(raw.evidence),analysisHash=hashText(raw.analysis);
const reviewTime=new Date(approved.humanReview.reviewedAt),expiry=new Date('2026-09-28T00:00:00.000Z');
const input=()=>({...structuredClone(approved),evidenceHash,analysisHash,now:reviewTime});
const check=(value=input())=>reviewIntelligence(value);
// Replay at the recorded approval time; tests must not extend the real cache lifetime.
const live=()=>check().forecast;
let serviceVersion=0;
const freshForecastService=()=>import(`../dist/data/intelligence-service.js?human-close=${++serviceVersion}`);
const prices=()=>({generatedAt:reviewTime.toISOString(),source:'APIZero',provinces:Object.fromEntries(provinces.map(({name})=>[name,{province:name,diesel0Price:8.29,unit:'元/升',updatedAt:'2026-09-26',sourceStatus:'LIVE'}]))});

test('human close 01: exact frozen hashes and actual user approval pass every gate',()=>{
 assert.equal(evidenceHash,'0b79cc9e03e3d6291052b20865c5ccd2186bc0a2df70517b78bbb11138abad61');
 assert.equal(analysisHash,'110a25cef206a54637f8cc5e619ad1b019a1ab3b0052f099845d26d763103a5d');
 assert.equal(approved.humanReview.reviewer,'USER_APPROVED_REVIEW');assert.equal(approved.humanReview.status,'APPROVED');assert.equal(approved.humanReview.kind,'HUMAN');
 const r=check();for(const field of ['gate','evidenceGate','groundingGate','humanReviewGate']) assert.equal(r[field],'PASS');
 assert.deepEqual(r.issues,[]);assert.equal(r.forecast.direction,'SIDEWAYS');assert.equal(r.forecast.validUntil,expiry.toISOString());assert.equal(validateIntelligenceCache(r.forecast,{now:reviewTime}).status,'LIVE');
});
test('human close 02: changed evidence bytes invalidate approval instead of rebinding it',()=>{
 const f=input();f.evidenceHash=hashText(raw.evidence+'\n');assert.notEqual(f.evidenceHash,evidenceHash);
 const r=check(f);assert.equal(r.forecast.status,'UNAVAILABLE');assert.ok(r.humanIssues.includes('HUMAN_REVIEW_INVALID_OR_UNBOUND'));
});
test('human close 03: changed analysis bytes invalidate approval',()=>{
 const f=input();f.analysisHash=hashText(raw.analysis+'\n');assert.notEqual(f.analysisHash,analysisHash);assert.ok(check(f).humanIssues.includes('HUMAN_REVIEW_INVALID_OR_UNBOUND'));
});
test('human close 04: approval earlier than analysis generation fails',()=>{
 const f=input();f.humanReview.reviewedAt=new Date(Date.parse(f.analysis.generatedAt)-1).toISOString();assert.equal(check(f).gate,'FAIL');assert.ok(check(f).humanIssues.includes('HUMAN_REVIEW_INVALID_OR_UNBOUND'));
});
test('human close 05: snapshot expires at validUntil in gate, contract and active service',async context=>{
 const f=input();f.now=expiry;assert.equal(check(f).forecast.status,'UNAVAILABLE');
 assert.equal(validateIntelligenceCache(live(),{now:new Date(+expiry-1)}).status,'LIVE');assert.equal(validateIntelligenceCache(live(),{now:expiry}).status,'UNAVAILABLE');
 context.mock.timers.enable({apis:['Date'],now:reviewTime});context.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify(live())));
 const service=await freshForecastService();assert.equal((await service.getForecast()).status,'LIVE');
 context.mock.timers.setTime(+expiry);assert.equal((await service.getForecast()).status,'UNAVAILABLE');
});
test('human close 06: omitting any one of the ten human checks fails',()=>{
 for(const key of REVIEW_CHECKS){const f=input();delete f.humanReview.checks[key];assert.equal(check(f).gate,'FAIL',key);assert.ok(check(f).humanIssues.includes('HUMAN_REVIEW_INVALID_OR_UNBOUND'),key);}
});
test('human close 07: empty reviewer fails',()=>{
 const f=input();f.humanReview.reviewer='';assert.equal(check(f).forecast.status,'UNAVAILABLE');assert.ok(check(f).humanIssues.includes('HUMAN_REVIEW_INVALID_OR_UNBOUND'));
});
test('human close 08: approved history includes original inputs and refuses overwrite',async()=>{
 const root=await mkdtemp(join(tmpdir(),'ayu-human-review-test-'));
 try {await mkdir(join(root,'intelligence'));for(const [key,file]of Object.entries(names))await writeFile(join(root,`intelligence/${file}.json`),raw[key]);
 const result=await saveIntelligenceRun({root,now:reviewTime});assert.equal(result.gate,'PASS');const before=await readFile(join(root,result.historyFile),'utf8');
 await assert.rejects(saveIntelligenceRun({root,now:reviewTime}),{code:'EEXIST'});assert.equal(await readFile(join(root,result.historyFile),'utf8'),before);
 const s=JSON.parse(before);assert.deepEqual(s.humanReview,approved.humanReview);assert.deepEqual(s.evidence,approved.evidence);assert.deepEqual(s.analysis,approved.analysis);assert.equal(s.rawInputHashes.evidence,evidenceHash);assert.equal(s.rawInputHashes.analysis,analysisHash);assert.equal(s.review.validUntil,expiry.toISOString());assert.equal(s.sourceUrls.length,8);
 } finally {await rm(root,{recursive:true,force:true});}
});
test('human close 09: live forecast and independent 31-province price service both work',async context=>{
 context.mock.timers.enable({apis:['Date'],now:reviewTime});const p=prices();
 context.mock.method(globalThis,'fetch',async url=>new Response(JSON.stringify(String(url).endsWith('/forecast-cache.json')?live():p)));
 assert.equal(validatePublicData(p,{startedAt:p.generatedAt,now:reviewTime}).gate,'PASS');
 assert.equal((await (await freshForecastService()).getForecast()).status,'LIVE');assert.equal((await getProvinceFuelData('福建',{refresh:true})).status,'LIVE');
});
test('human close 10: all eleven coastal price selections still work alongside active forecast',async context=>{
 context.mock.timers.enable({apis:['Date'],now:reviewTime});context.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify(prices())));
 assert.deepEqual(coastalProvinces.map(s=>s.name),['福建','浙江','山东','广东','辽宁','海南','江苏','河北','天津','上海','广西']);
 for(const p of coastalProvinces)assert.equal((await getProvinceFuelData(p.name,{refresh:true})).status,'LIVE',p.name);
});
test('human close 11: ton conversion keeps 0.84 reference density',()=>{
 const p=getPriceDisplay(8.29);assert.equal(p.dieselDensityKgPerLiter,0.84);assert.equal(p.estimatedPricePerTon,9869);assert.equal(getPriceDisplay(8.36).estimatedPricePerTon,9952);
});
test('human close 12: active forecast cannot hide price failure or weaken price publication gate',async context=>{
 context.mock.timers.enable({apis:['Date'],now:reviewTime});
 context.mock.method(globalThis,'fetch',async url=>String(url).endsWith('/forecast-cache.json')?new Response(JSON.stringify(live())):new Response('unavailable',{status:503}));
 assert.equal((await (await freshForecastService()).getForecast()).status,'LIVE');assert.equal((await getProvinceFuelData('福建',{refresh:true})).status,'UNAVAILABLE');
 const invalid=prices();invalid.provinces['福建'].diesel0Price=null;assert.equal(validatePublicData(invalid,{startedAt:invalid.generatedAt,now:reviewTime}).gate,'FAIL');
});
