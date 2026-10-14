import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { normalizeDomesticBridgeSignalPackage, prepareDomesticBridgeRequest, validateDomesticBridgeRequest } from '../scripts/intelligence-v2/domestic-bridge-intake.mjs';
import { validateExternalAnalystSignalPackage } from '../scripts/intelligence-v2/external-analyst-signals.mjs';
import { publicationEarliestMs } from '../dist/data/external-analyst-contract.js';
import { acceptedEvidenceGate } from '../dist/data/accepted-evidence-contract.js';
import { buildDomesticBridgeCards, buildDomesticBridgeInput } from '../scripts/intelligence-v2/domestic-bridge-input.mjs';
import { buildAcceptedEvidence } from '../scripts/intelligence-v2/accepted-evidence.mjs';
import { publishBridgeCards, runDomesticBridgeRequest } from '../scripts/fuel-domestic-test-bridge.mjs';
import { domesticFixture } from './fixtures/domestic-fuel-fixtures.mjs';
import { evidenceHashFor } from '../scripts/intelligence-v2/history.mjs';

const now=new Date('2026-10-14T13:30:00.000Z');
const packageValue=()=>({schemaVersion:'AYU_EXTERNAL_ANALYST_SIGNAL_V1',generatedAt:'2026-10-14T17:05:30+08:00',signals:[{
  eventKey:'iea-october-diesel-deficit-outlook-2026-10-14',category:'DISTILLATE_FUNDAMENTALS',source:'国际能源署（IEA）',
  eventAt:null,publishedAt:null,sourcePublishedDate:'2026-10-14',title:'IEA警告全球柴油供应紧张或延续至2027年',
  summary:'IEA最新月报显示，9月全球柴油出口同比减少约70万桶/日，预计10月炼厂检修将加剧库存下降。俄罗斯放宽柴油出口限制难以弥补实际炼油产能不足。',
  sourceUrl:'https://www.iea.org/reports/oil-market-report-october-2026',kind:'OUTLOOK',direction:'UP',strength:'HIGH',confirmation:'CONDITIONAL',
  reason:'国际柴油供应紧张可能通过亚洲成品油市场向国内调价输入传导；这不等于国内必然上调。',
}]});
const normalize=p=>normalizeDomesticBridgeSignalPackage(p,{now});
const request=p=>prepareDomesticBridgeRequest({signalPackage:p,mode:'REFRESH_CURRENT',now}).request;
const precise=()=>{const p=packageValue();delete p.signals[0].sourcePublishedDate;p.signals[0].publishedAt='2026-10-14T09:30:00+08:00';return p;};
const emptyPack=()=>({generatedAt:now.toISOString(),signals:[],newsDocuments:[]});
const receipt=r=>({sourceUrl:`https://raw.githubusercontent.com/Zhyquan/ayu-fuel-lab/${'b'.repeat(40)}/data/domestic-test-bridge/latest-request.json`,
  contentHash:evidenceHashFor(r),checkedAt:now.toISOString(),commit:'b'.repeat(40)});
const require=createRequire(import.meta.url);
const consumerRoot=resolve(process.env.FUEL_TEST_CONSUMER_ROOT,'cloudfunctions/paymentDomain');
const consumer=require(resolve(consumerRoot,'fuel-news.js'));

test('precise historical input keeps its exact fields, timestamp, ID and package bytes',()=>{
  const p=precise(),normalized=normalize(p);assert.deepEqual(normalized,p);
  const r=request(p);assert.deepEqual(validateDomesticBridgeRequest(r,{now}),r);
  assert.equal(Object.hasOwn(r.signalPackage.signals[0],'sourcePublishedDate'),false);
});
test('source date and null event are admitted without manufacturing any publication instant',()=>{
  const p=packageValue();assert.deepEqual(normalize(p),p);
  assert.equal(validateExternalAnalystSignalPackage(p,{now}).signals[0].publishedAt,null);
  assert.equal(request(p).signalPackage.signals[0].sourcePublishedDate,'2026-10-14');
});
test('raw YYYY-MM-DD Bridge publication is normalized to the explicit date-only union',()=>{
  const p=packageValue();delete p.signals[0].sourcePublishedDate;p.signals[0].publishedAt='2026-10-14';
  const normalized=normalize(p);assert.equal(normalized.signals[0].publishedAt,null);
  assert.equal(normalized.signals[0].sourcePublishedDate,'2026-10-14');
  assert.equal(p.signals[0].publishedAt,'2026-10-14');
});
for(const [label,change,code]of [
  ['invalid calendar',s=>s.sourcePublishedDate='2026-02-30','EXTERNAL_TIME_INVALID'],
  ['invalid date format',s=>s.sourcePublishedDate='2026/10/14','EXTERNAL_TIME_INVALID'],
  ['future date',s=>s.sourcePublishedDate='2026-10-15','EXTERNAL_TIME_FUTURE'],
  ['missing date',s=>delete s.sourcePublishedDate,'EXTERNAL_TIME_INVALID'],
  ['missing publication field',s=>delete s.publishedAt,'EXTERNAL_SIGNAL_FIELDS_INVALID'],
  ['both date and exact timestamp',s=>s.publishedAt='2026-10-14T09:30:00+08:00','EXTERNAL_TIME_INVALID'],
  ['invalid event date',s=>s.eventAt='2026-10-14','EXTERNAL_TIME_INVALID'],
  ['future event',s=>s.eventAt='2026-10-15T00:00:00+08:00','EXTERNAL_TIME_FUTURE'],
  ['old source with recent event',s=>{s.sourcePublishedDate='2026-10-11';s.eventAt=now.toISOString();},'EXTERNAL_SIGNAL_STALE'],
  ['unknown field',s=>s.discoveredAt=now.toISOString(),'EXTERNAL_SIGNAL_FIELDS_INVALID'],
])test(`date contract rejects ${label}`,()=>{const p=packageValue();change(p.signals[0]);assert.throws(()=>normalize(p),new RegExp(code));});
test('date freshness uses the earliest possible boundary with an unchanged 72-hour limit',()=>{
  const p=packageValue(),earliest=publicationEarliestMs(p.signals[0]);
  assert.equal(earliest,Date.parse('2026-10-13T10:00:00Z'));
  p.generatedAt=new Date(earliest+72*3600000-1000).toISOString();
  assert.doesNotThrow(()=>validateExternalAnalystSignalPackage(p,{now:new Date(earliest+72*3600000)}));
  assert.throws(()=>validateExternalAnalystSignalPackage(p,{now:new Date(earliest+72*3600000+1)}),/EXTERNAL_SIGNAL_STALE/);
  assert.equal(p.signals[0].publishedAt,null);
});
test('source civil date after package creation is rejected',()=>{
  const p=packageValue();p.generatedAt='2026-10-13T23:59:59+08:00';
  assert.throws(()=>normalize(p),/EXTERNAL_TIME_AFTER_PACKAGE/);
});
test('date-only source produces a valid card with the same source, summary and exact date',()=>{
  const r=request(packageValue()),{collection}=buildDomesticBridgeCards({pack:emptyPack(),request:r,now});
  const card=collection.acceptedEvidence[0];
  assert.equal(card.publishedAt,null);assert.equal(card.date,'2026-10-14');assert.equal(card.publishedAtPrecision,'DATE_ONLY');
  assert.equal(card.directionLabel,'利涨');assert.equal(card.forecastInfluence,'HIGH');
  assert.equal(card.summary,r.signalPackage.signals[0].summary);assert.equal(card.sourceUrl,r.signalPackage.signals[0].sourceUrl);
  assert.equal(acceptedEvidenceGate(collection,{now}).gate,'PASS');assert.equal(consumer.checkCollection(collection,+now),true);
});
test('date-only card survives accumulation and expires by the same conservative read-time rule',()=>{
  const first=buildDomesticBridgeCards({pack:emptyPack(),request:request(packageValue()),now}).collection;
  const later=new Date(+now+1000),next=buildDomesticBridgeCards({pack:{...emptyPack(),generatedAt:later.toISOString()},request:request(packageValue()),previous:first.acceptedEvidence,now:later}).collection;
  assert.equal(next.acceptedEvidence.length,1);assert.equal(next.acceptedEvidence[0].publishedAt,null);
  const expired=new Date(publicationEarliestMs(first.acceptedEvidence[0])+72*3600000+1);
  assert.deepEqual(acceptedEvidenceGate(first,{now:expired}).acceptedEvidence,[]);
});
test('mixed date/exact cards sort by actual source date without replacing unknown times',()=>{
  const p=packageValue(),exact=precise().signals[0];exact.eventKey='iea-prior-day-controlled-fixture';exact.publishedAt='2026-10-13T17:00:00+08:00';
  p.signals.push(exact);const c=buildDomesticBridgeCards({pack:emptyPack(),request:request(p),now}).collection;
  assert.deepEqual(c.acceptedEvidence.map(e=>e.date),['2026-10-14','2026-10-13']);assert.equal(c.acceptedEvidence[0].publishedAt,null);
});
test('historical precise cards preserve instant ordering across source timezones',()=>{
  const p=precise(),second=structuredClone(p.signals[0]);
  p.signals[0].publishedAt='2026-10-14T00:30:00+08:00';second.publishedAt='2026-10-13T23:30:00Z';second.eventKey='precise-timezone-controlled-fixture';p.signals.push(second);
  const c=buildDomesticBridgeCards({pack:emptyPack(),request:request(p),now}).collection;
  assert.deepEqual(c.acceptedEvidence.map(e=>e.eventKey),[second.eventKey,p.signals[0].eventKey]);
});
test('mixed accepted-evidence sorting is deterministic for every input permutation',()=>{
  const p=packageValue(),a=precise().signals[0],b=precise().signals[0];
  a.eventKey='controlled-timezone-order-a';a.publishedAt='2026-10-13T23:30:00+14:00';
  b.eventKey='controlled-timezone-order-b';b.publishedAt='2026-10-13T10:30:00Z';
  const signals=[a,b,p.signals[0]];let expected;
  for(const order of [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]]) {
    const normalized=validateExternalAnalystSignalPackage({...p,signals:order.map(i=>signals[i])},{now});
    const c=buildAcceptedEvidence({pack:{...emptyPack(),externalAnalystSignals:normalized.signals},now});
    const keys=c.acceptedEvidence.map(e=>e.eventKey);
    expected??=keys;assert.deepEqual(keys,expected);
  }
});
for(const basis of ['MODEL_ASSESSMENT','TRIGGER_PREASSESSMENT_ONLY'])test(`date-only Bridge support does not broaden ${basis} publication admission`,()=>{
  const c=buildDomesticBridgeCards({pack:emptyPack(),request:request(packageValue()),now}).collection;
  c.acceptedEvidence[0].influenceBasis=basis;
  assert.equal(acceptedEvidenceGate(c,{now}).gate,'FAIL');
});
test('domestic model input labels the source date and keeps the analyst-document timestamp distinct',async()=>{
  const f=await domesticFixture('CASE_DOWN_DOMESTIC',{now}),r=request(packageValue());
  const input=buildDomesticBridgeInput({input:f.input,request:r,sourceReceipt:receipt(r),now}),e=input.evidence.at(-1);
  assert.match(e.text,/2026-10-14（仅日期）/);assert.equal(e.publishedAt,r.signalPackage.generatedAt);
  assert.equal(e.directionScope,'INPUT_ONLY');assert.equal(e.kind,'OUTLOOK');
  assert.deepEqual(input.evidence.slice(0,-1),f.input.evidence);
});
test('Test Bridge → Evidence → native card publisher → consumer read replay preserves LKG with zero model calls (memory only)',async()=>{
  const r=request(packageValue()),rows=new Map([['currentFuelForecast',{forecastId:'CONTROLLED_LKG'}]]);
  const native={collection:()=>({doc:id=>({get:async()=>({data:rows.get(id)??null}),set:async data=>rows.set(id,structuredClone(data))})})};
  native.runTransaction=fn=>fn(native);let models=0;
  const result=await runDomesticBridgeRequest({request:r,sourceReceipt:receipt(r),now:()=>now,
    loadInput:async()=>{throw Error('CONTROLLED_CORE_UNAVAILABLE');},
    publishCards:args=>publishBridgeCards({native,consumerRoot,...args,now:+now}),
    claim:async()=>{models++;throw Error('MODEL_FORBIDDEN');},providerOptions:{environment:{}}});
  assert.equal(result.status,'CARDS_DELIVERED_CORE_PENDING');assert.equal(result.modelCalls,0);assert.equal(models,0);
  const projection=consumer.projectAcceptedNews(rows.get('currentFuelNews'),+now,null);
  assert.equal(projection.acceptedEvidence[0].date,'2026-10-14');assert.equal(projection.acceptedEvidence[0].publishedAt,null);
  assert.deepEqual(rows.get('currentFuelForecast'),{forecastId:'CONTROLLED_LKG'});
});
test('Production signing and receiver bind the source date; altering it rejects without weakening signature checks',async()=>{
  const bridge=require(resolve(process.env.FUEL_PRODUCTION_BRIDGE_MODULE)),root=mkdtempSync(resolve(tmpdir(),'fuel-date-signature-'));
  symlinkSync(resolve('.'),resolve(root,'core'),'dir');
  const hash=require(resolve(process.env.FUEL_PRODUCTION_BRIDGE_MODULE,'../state.js')).hash,key=Buffer.alloc(32,7),runtime={environmentId:'healthgoal-d0g9k7xvq47f31e8f',functionName:bridge.CONTRACT.functionName,numericVersion:'3'};
  const environment={[bridge.CONTRACT.keyEnvironmentName]:key.toString('hex')};
  const control={kind:bridge.CONTRACT.schemaVersion,enabled:true,environmentId:runtime.environmentId,ingressIdentity:bridge.CONTRACT.ingressIdentity,
    bridgeContractHash:bridge.CONTRACT_HASH,runtimeIdentityHash:hash(runtime),keyId:hash('CONTROLLED_KEY_ID'),keyFingerprint:hash(key),
    privateInstallReceiptHash:hash('CONTROLLED_INSTALL'),solePublisherReceiptHash:hash('CONTROLLED_PUBLISHER'),masterBridgeAuthorizationReceiptHash:hash('CONTROLLED_AUTH')};
  try {
    for(const p of [precise(),packageValue()]) {
      const signed=await bridge.prepareRequest({root,signalPackage:p,control,runtime,environment,now});
      const normalized=await bridge.validateRequest({root,request:signed,control,runtime,environment,now});
      assert.equal(normalized.signals[0].publishedAt,p.signals[0].publishedAt);
      const repeated=await bridge.prepareRequest({root,signalPackage:p,control,runtime,environment,previousRequest:signed,now:new Date(+now+1000)});
      assert.deepEqual(repeated,signed);
      const tampered=structuredClone(signed);tampered.signalPackage.signals[0].sourcePublishedDate='2026-10-13';
      await assert.rejects(()=>bridge.validateRequest({root,request:tampered,control,runtime,environment,now}),/SIGNATURE_INVALID/);
    }
  } finally {rmSync(root,{recursive:true,force:true});}
});
