import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { loadReplayFixture } from '../scripts/intelligence-v2/replay.mjs';
import { domesticFixture } from './fixtures/domestic-fuel-fixtures.mjs';
import { externalPackage } from './fixtures/external-signal-scenario.mjs';
import { prepareDomesticBridgeRequest } from '../scripts/intelligence-v2/domestic-bridge-intake.mjs';
import { runDomesticBridgeRequest, loadCommittedBridgeRequest, reserveDomesticBridge, publishBridgeCards } from '../scripts/fuel-domestic-test-bridge.mjs';
import { buildDomesticBridgeCards } from '../scripts/intelligence-v2/domestic-bridge-input.mjs';
const digest=x=>createHash('sha256').update(x).digest('hex'),replay=await loadReplayFixture(),time=new Date(replay.now);
function memory(){const rows=new Map();let queue=Promise.resolve();const collection=name=>({doc:id=>({get:async()=>({data:structuredClone(rows.get(name+'/'+id)||null)}),set:async data=>rows.set(name+'/'+id,structuredClone(data))})});return {rows,collection,runTransaction:cb=>{const r=queue.then(()=>cb({collection}));queue=r.catch(()=>{});return r;}};}
async function scenario({material=true}={}){
 const f=await domesticFixture('CASE_DOWN_DOMESTIC',{now:time}),signalPackage=externalPackage(replay.now);
 Object.assign(signalPackage.signals[0],material?{kind:'RISK',confirmation:'CONDITIONAL',strength:'MEDIUM'}:{kind:'CLAIM',confirmation:'UNCONFIRMED',strength:'MEDIUM'});
 const request=prepareDomesticBridgeRequest({signalPackage,mode:'REFRESH_CURRENT',now:time}).request;
 const sourceReceipt={sourceUrl:`https://raw.githubusercontent.com/Zhyquan/ayu-fuel-lab/${'a'.repeat(40)}/data/domestic-test-bridge/latest-request.json`,contentHash:digest(JSON.stringify(request)),checkedAt:time.toISOString(),commit:'a'.repeat(40)};
 const db=memory(),calls=[],cards=[],forecasts=[],audits=[];
 const config={request,sourceReceipt,now:()=>time,loadInput:async()=>({input:f.input,pack:replay.pack}),
  publishCards:async value=>{cards.push(value.collection);return {collection:value.collection};},
  claim:value=>reserveDomesticBridge(db,{...value,requestId:'synthetic-request-id'}),
  providerOptions:{mock:true,environment:{DASHSCOPE_API_KEY:'test'},clock:()=>time,fetchImpl:async(_,options)=>{calls.push(JSON.parse(options.body));return new Response(JSON.stringify({id:'chatcmpl-bridge-fixture',choices:[{finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(f.analysis)}}],usage:{prompt_tokens:111,completion_tokens:22}}));}},
  onAudit:async audit=>audits.push(audit),saveArtifact:async value=>value,publish:async value=>{forecasts.push(JSON.parse(value.stored.bytes));return {replayed:false};}};
 return {f,db,calls,cards,forecasts,audits,config};
}
test('material Bridge uses frozen domestic Core once, includes analyst input, delivers cards before generation',async()=>{
 const s=await scenario(),result=await runDomesticBridgeRequest(s.config);
 assert.equal(result.status,'DELIVERED',JSON.stringify({code:result.code,audit:result.providerAudit}));assert.equal(s.calls.length,1);assert.equal(s.forecasts.length,1);assert.equal(s.cards.length,1);
 assert.match(s.calls[0].messages[1].content,/引用报道原文未核验/);assert.equal(s.calls[0].tools,undefined);
 assert.equal(s.forecasts[0].forecast.target,'CHINA_DOMESTIC_REFINED_OIL_ADJUSTMENT');assert.equal(s.audits[0].maxExternalRequests,1);assert.equal(s.audits[0].configuredTransportRetries,0);
 assert.ok(s.forecasts[0].forecast.acceptedEvidence.some(e=>e.influenceBasis==='EXTERNAL_ANALYST'));assert.equal(result.receipt.triggerType,'EXPLICIT_BRIDGE_TEST_REFRESH');
});
test('unconfirmed LOW-materiality card is delivered without any market collection, reservation or model',async()=>{
 const s=await scenario({material:false});let loaded=0;s.config.loadInput=async()=>{loaded++;throw Error('must not collect');};
 const r=await runDomesticBridgeRequest(s.config);assert.equal(r.status,'CARDS_DELIVERED');assert.equal(loaded,0);assert.equal(s.calls.length,0);assert.equal(s.db.rows.size,0);assert.match(s.cards[0].acceptedEvidence[0].summary,/未核实：/);
});
test('a previously consumed event can still update a card but cannot consume another inference',async()=>{
 const s=await scenario(),event=s.config.request.signalPackage.signals[0].eventKey;
 const r=await runDomesticBridgeRequest({...s.config,consumedEvidence:[{eventKey:event}]});assert.equal(r.status,'CARDS_DELIVERED');assert.equal(r.eligibility.reason,'DUPLICATE');assert.equal(s.calls.length,0);assert.equal(s.db.rows.size,0);
});
test('Core fetch failure preserves published card and leaves generation pending without reservation',async()=>{
 const s=await scenario();s.config.loadInput=async()=>{throw Object.assign(Error('CORE_UNAVAILABLE'),{code:'CORE_UNAVAILABLE'});};
 const r=await runDomesticBridgeRequest(s.config);assert.equal(r.status,'CARDS_DELIVERED_CORE_PENDING');assert.equal(s.cards.length,1);assert.equal(s.calls.length,0);assert.equal(s.db.rows.size,0);
});
test('a malformed real-model-shaped output never replaces LKG or retries but leaves its card readable',async()=>{
 const s=await scenario();s.f.analysis.reason='';const r=await runDomesticBridgeRequest(s.config);assert.equal(r.status,'GENERATION_REJECTED');assert.equal(s.calls.length,1);assert.equal(s.cards.length,1);assert.equal(s.forecasts.length,0);
 const next=await runDomesticBridgeRequest(s.config);assert.equal(next.status,'REQUEST_ALREADY_CONSUMED');assert.equal(s.calls.length,1);
});
test('concurrent and repeated requests reserve exactly one domestic model opportunity',async()=>{
 const s=await scenario(),results=await Promise.all([runDomesticBridgeRequest(s.config),runDomesticBridgeRequest(s.config)]);
 assert.equal(results.filter(r=>r.status==='DELIVERED').length,1);assert.equal(s.calls.length,1);
 const next=await runDomesticBridgeRequest(s.config);assert.equal(next.modelCalls,0);assert.equal(s.calls.length,1);
});
test('reader pins the repository commit and exact bytes, not a media body or mutable branch',async()=>{
 const s=await scenario(),bytes=JSON.stringify(s.config.request,null,2)+'\n',urls=[];
 const result=await loadCommittedBridgeRequest({now:()=>time,fetchImpl:async url=>{urls.push(url);return new Response(url.includes('api.github.com')?JSON.stringify([{sha:'b'.repeat(40)}]):bytes);}});
 assert.equal(result.sourceReceipt.contentHash,digest(bytes));assert.match(result.sourceReceipt.sourceUrl,new RegExp('b'.repeat(40)));assert.equal(urls.length,2);assert.equal(result.request.requestId,s.config.request.requestId);
});
test('tampered committed request rejects before collection or inference',async()=>{
 const s=await scenario();s.config.request.packageHash='0'.repeat(64);
 await assert.rejects(()=>loadCommittedBridgeRequest({now:()=>time,fetchImpl:async url=>new Response(url.includes('api.github.com')?JSON.stringify([{sha:'b'.repeat(40)}]):JSON.stringify(s.config.request))}),/HASH_MISMATCH/);
});
test('native card delivery reuses original persisted bytes across clock changes',async()=>{
 const s=await scenario({material:false}),db=memory();
 const consumerRoot=resolve(process.env.FUEL_TEST_CONSUMER_ROOT,'cloudfunctions/paymentDomain');assert.ok(consumerRoot,'FROZEN_TEST_CONSUMER_REQUIRED');
 const first=buildDomesticBridgeCards({pack:replay.pack,request:s.config.request,now:time});
 const a=await publishBridgeCards({native:db,consumerRoot,collection:first.collection,request:s.config.request,sourceReceipt:s.config.sourceReceipt,now:+time});
 const later=new Date(+time+1000),second=buildDomesticBridgeCards({pack:replay.pack,request:s.config.request,now:later});
 const b=await publishBridgeCards({native:db,consumerRoot,collection:second.collection,request:s.config.request,sourceReceipt:s.config.sourceReceipt,now:+later});
 assert.equal(b.replayed,true);assert.equal(a.collection.collectionHash,b.collection.collectionHash);assert.equal(b.collection.generatedAt,time.toISOString());
 assert.equal(db.rows.size,2);assert.ok([...db.rows.keys()].every(k=>k.startsWith('yuzhang_fuel_forecasts/')));
});
test('pending request confirms its card in newer valid news without rolling the collection back',async()=>{
 const s=await scenario({material:false}),db=memory(),consumerRoot=resolve(process.env.FUEL_TEST_CONSUMER_ROOT,'cloudfunctions/paymentDomain');
 const first=buildDomesticBridgeCards({pack:replay.pack,request:s.config.request,now:time});
 await publishBridgeCards({native:db,consumerRoot,collection:first.collection,request:s.config.request,sourceReceipt:s.config.sourceReceipt,now:+time});
 const later=new Date(+time+1000),pkg=structuredClone(s.config.request.signalPackage);pkg.generatedAt=later.toISOString();pkg.signals[0].eventKey+='-new';
 const request=prepareDomesticBridgeRequest({signalPackage:pkg,mode:'REFRESH_CURRENT',now:later}).request;
 const next=buildDomesticBridgeCards({pack:replay.pack,request,previous:first.collection.acceptedEvidence,now:later});
 await publishBridgeCards({native:db,consumerRoot,collection:next.collection,request,sourceReceipt:s.config.sourceReceipt,now:+later});
 const retried=await publishBridgeCards({native:db,consumerRoot,collection:first.collection,request:s.config.request,sourceReceipt:s.config.sourceReceipt,now:+later+1000});
 assert.equal(retried.replayed,true);assert.equal(retried.collection.collectionHash,next.collection.collectionHash);assert.equal(retried.collection.acceptedEvidence.length,next.collection.acceptedEvidence.length);
});
