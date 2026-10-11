import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { mkdtempSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { loadReplayFixture } from '../scripts/intelligence-v2/replay.mjs';
import { domesticFixture } from './fixtures/domestic-fuel-fixtures.mjs';
import { externalPackage } from './fixtures/external-signal-scenario.mjs';
import { prepareDomesticBridgeRequest } from '../scripts/intelligence-v2/domestic-bridge-intake.mjs';
import { runDomesticBridgeRequest, loadCommittedBridgeRequest, reserveDomesticBridge, publishBridgeCards, handleDomesticBridgeTimer, CARD_PROJECTION_VERSION } from '../scripts/fuel-domestic-test-bridge.mjs';
import { TEST_ENV, CORE_SHA, CONSUMER_SHA, AUTHORIZATION, TRIGGER_NAME, FUNCTION_NAME } from '../scripts/fuel-domestic-test-runtime.mjs';
import { evidenceHashFor } from '../scripts/intelligence-v2/history.mjs';
import { buildDomesticBridgeCards } from '../scripts/intelligence-v2/domestic-bridge-input.mjs';
const digest=x=>createHash('sha256').update(x).digest('hex'),replay=await loadReplayFixture(),time=new Date(replay.now);
function memory(){const rows=new Map();let queue=Promise.resolve();const writable=data=>assert.equal(Object.hasOwn(data,'_id'),false,'NATIVE_SDK_REJECTS_ID_WRITE');const collection=name=>({doc:id=>({get:async()=>({data:rows.has(name+'/'+id)?{...structuredClone(rows.get(name+'/'+id)),_id:id}:null}),set:async data=>{writable(data);rows.set(name+'/'+id,structuredClone(data));},update:async data=>{writable(data);rows.set(name+'/'+id,{...rows.get(name+'/'+id),...structuredClone(data)});}})});return {rows,collection,runTransaction:cb=>{const r=queue.then(()=>cb({collection}));queue=r.catch(()=>{});return r;}};}
async function scenario({material=true}={}){
 const f=await domesticFixture('CASE_DOWN_DOMESTIC',{now:time}),signalPackage=externalPackage(replay.now);
 Object.assign(signalPackage.signals[0],material?{kind:'RISK',confirmation:'CONDITIONAL',strength:'MEDIUM'}:{kind:'CLAIM',confirmation:'UNCONFIRMED',strength:'LOW'});
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
 const r=await runDomesticBridgeRequest(s.config);assert.equal(r.status,'CARDS_DELIVERED');assert.equal(loaded,0);assert.equal(s.calls.length,0);assert.equal(s.db.rows.size,0);assert.equal(s.cards[0].acceptedEvidence[0].summary,s.config.request.signalPackage.signals[0].summary);
});
test('MEDIUM directional unconfirmed analyst input is actually sent once, with no fabricated probability change',async()=>{
 const s=await scenario();Object.assign(s.config.request.signalPackage.signals[0],{kind:'CLAIM',confirmation:'UNCONFIRMED',direction:'DOWN'});
 s.config.request=prepareDomesticBridgeRequest({signalPackage:s.config.request.signalPackage,mode:'REFRESH_CURRENT',now:time}).request;
 const r=await runDomesticBridgeRequest(s.config);
 assert.equal(r.status,'DELIVERED');assert.equal(r.eligibility.reason,'MATERIAL_UNCONFIRMED_ANALYST_INPUT');
 assert.equal(s.calls.length,1);assert.match(s.calls[0].messages[1].content,/UNCONFIRMED/);
 assert.match(s.calls[0].messages[1].content,/引用报道原文未核验/);
 assert.equal(s.cards[0].acceptedEvidence[0].directionLabel,'利跌');
 assert.deepEqual(r.probabilities,{UP:s.f.analysis.probabilities.UP/100,DOWN:s.f.analysis.probabilities.DOWN/100,HOLD_OR_NO_ADJUSTMENT:s.f.analysis.probabilities.FLAT/100});
 assert.equal(s.forecasts[0].evidencePack.evidence.at(-1).directionScope,'INPUT_ONLY');
 assert.equal(s.forecasts[0].evidencePack.evidence.at(-1).kind,'CLAIM');
 assert.deepEqual(s.forecasts[0].forecast.primaryEvidence.map(e=>e.evidenceId),s.f.analysis.primaryEvidenceIds);
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
test('directional card upgrade creates a new immutable artifact and preserves legacy bytes',async()=>{
 const s=await scenario({material:false}),db=memory(),consumerRoot=resolve(process.env.FUEL_TEST_CONSUMER_ROOT,'cloudfunctions/paymentDomain');
 const first=buildDomesticBridgeCards({pack:replay.pack,request:s.config.request,now:time}),legacy=structuredClone(first.collection);
 legacy.acceptedEvidence[0].directionLabel='利涨（未确认）';const {collectionHash,...value}=legacy;legacy.collectionHash=evidenceHashFor(value);
 const oldId=`yuzhang_fuel_forecasts/fuelTestBridgeNewsArtifact-${s.config.request.requestId}-direction-v1`;
 const old={artifactBytesBase64:Buffer.from(JSON.stringify(legacy)).toString('base64'),receipt:{collectionHash:legacy.collectionHash}};
 db.rows.set(oldId,structuredClone(old));
 const result=await publishBridgeCards({native:db,consumerRoot,collection:first.collection,request:s.config.request,sourceReceipt:s.config.sourceReceipt,now:+time});
 assert.deepEqual(db.rows.get(oldId),old);assert.equal(result.collection.acceptedEvidence[0].directionLabel,'利涨');
 assert.equal(db.rows.get(oldId.replace(/direction-v1$/,'direction-v2')).receipt.cardProjectionVersion,CARD_PROJECTION_VERSION);
});

test('the production timer refreshes old card labels without resetting a consumed model reservation',async()=>{
 const s=await scenario(),root=mkdtempSync(resolve(tmpdir(),'fuel-bridge-terminal-'));
 const entry='// synthetic manifest fixture; no provider or market request\n';
 writeFileSync(resolve(root,'index.js'),entry);writeFileSync(resolve(root,'domestic-source-seed.json'),'{}');
 symlinkSync(resolve(process.env.FUEL_TEST_CONSUMER_ROOT,'cloudfunctions/paymentDomain'),resolve(root,'consumer'),'dir');
 writeFileSync(resolve(root,'runtime-manifest.json'),JSON.stringify({environment:TEST_ENV,coreSha:CORE_SHA,consumerSha:CONSUMER_SHA,authorization:AUTHORIZATION,
  functionName:FUNCTION_NAME,maxTotalModelCalls:1,version:'7',sourceSeedHash:'0'.repeat(64),files:[{path:'index.js',sha256:digest(entry)}]}));
 const options={event:{Type:'Timer',TriggerName:TRIGGER_NAME},context:{function_name:FUNCTION_NAME,namespace:TEST_ENV,function_version:'7',request_id:'synthetic-timer'},
  root,now:()=>time,providerEnvironment:{},fetchImpl:async url=>new Response(url.includes('api.github.com')?JSON.stringify([{sha:'a'.repeat(40)}]):JSON.stringify(s.config.request))};
 const intakeId=`yuzhang_fuel_forecasts/fuelDomesticBridgeIntake-${s.config.request.requestId}`;
 try {
  const legacy=memory();legacy.rows.set(intakeId,{status:'CARDS_DELIVERED'});
  await assert.rejects(()=>handleDomesticBridgeTimer({...options,native:legacy}),/FUEL_TEST_SOURCE_SEED_MISMATCH/);
  for(const intake of [{status:'DELIVERED',cardProjectionVersion:CARD_PROJECTION_VERSION},{status:'CARDS_DELIVERED',cardProjectionVersion:CARD_PROJECTION_VERSION}]) {
   const db=memory();db.rows.set(intakeId,intake);
   assert.equal((await handleDomesticBridgeTimer({...options,native:db})).status,'BRIDGE_INTAKE_ALREADY_DELIVERED');
  }
  for(const status of ['RESERVED','GENERATION_REJECTED','DELIVERED','UNKNOWN']) {
   const db=memory(),stateId=`yuzhang_fuel_forecasts/fuelDomesticBridge-${s.config.request.requestId}`;
   const intake={status:status==='DELIVERED'?'DELIVERED':'CARDS_DELIVERED',result:{forecastId:'previous-forecast'}};
   const state={status,providerAudit:{actualExternalRequestCount:1}},forecast={forecastHash:'previous-forecast',forecast:{acceptedEvidence:[]}};
   db.rows.set(intakeId,structuredClone(intake));db.rows.set(stateId,structuredClone(state));
   db.rows.set('yuzhang_fuel_forecasts/currentFuelForecast',structuredClone(forecast));
   assert.equal((await db.collection('yuzhang_fuel_forecasts').doc(intakeId.split('/')[1]).get()).data._id,intakeId.split('/')[1]);
   const result=await handleDomesticBridgeTimer({...options,native:db});
   assert.equal(result.status,status==='RESERVED'?'REQUEST_ALREADY_CONSUMED':'BRIDGE_CARDS_REFRESHED');assert.equal(result.modelCalls,0);
   assert.deepEqual(db.rows.get(stateId),state);assert.deepEqual(db.rows.get('yuzhang_fuel_forecasts/currentFuelForecast'),forecast);
   if(status!=='RESERVED') {
    assert.equal(db.rows.get(intakeId).cardProjectionVersion,CARD_PROJECTION_VERSION);assert.deepEqual(db.rows.get(intakeId).result,intake.result);
    assert.equal(db.rows.get('yuzhang_fuel_forecasts/currentFuelNews').collection.acceptedEvidence[0].directionLabel,'利涨');
    assert.equal((await handleDomesticBridgeTimer({...options,native:db})).status,'BRIDGE_INTAKE_ALREADY_DELIVERED');
   }
  }
 } finally {rmSync(root,{recursive:true,force:true});}
});
test('pending request confirms its card in newer valid news without rolling the collection back',async()=>{
 const s=await scenario({material:false}),db=memory(),consumerRoot=resolve(process.env.FUEL_TEST_CONSUMER_ROOT,'cloudfunctions/paymentDomain');
 const first=buildDomesticBridgeCards({pack:replay.pack,request:s.config.request,now:time});
 await publishBridgeCards({native:db,consumerRoot,collection:first.collection,request:s.config.request,sourceReceipt:s.config.sourceReceipt,now:+time});
 const later=new Date(+time+1000),pkg=structuredClone(s.config.request.signalPackage);pkg.generatedAt=later.toISOString();pkg.signals[0].eventKey+='-new';
 Object.assign(pkg.signals[0],{kind:'RISK',confirmation:'CONDITIONAL'});
 const request=prepareDomesticBridgeRequest({signalPackage:pkg,mode:'REFRESH_CURRENT',now:later}).request;
 const next=buildDomesticBridgeCards({pack:replay.pack,request,previous:first.collection.acceptedEvidence,now:later});
 assert.equal(next.collection.acceptedEvidence.find(e=>e.eventKey===s.config.request.signalPackage.signals[0].eventKey).directionLabel,'利涨');
 await publishBridgeCards({native:db,consumerRoot,collection:next.collection,request,sourceReceipt:s.config.sourceReceipt,now:+later});
 const retried=await publishBridgeCards({native:db,consumerRoot,collection:first.collection,request:s.config.request,sourceReceipt:s.config.sourceReceipt,now:+later+1000});
 assert.equal(retried.replayed,true);assert.equal(retried.collection.collectionHash,next.collection.collectionHash);assert.equal(retried.collection.acceptedEvidence.length,next.collection.acceptedEvidence.length);
});
