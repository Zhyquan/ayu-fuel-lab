import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { domesticFixture } from './fixtures/domestic-fuel-fixtures.mjs';
import { runFuelTestTrigger, reserveFuelTestOpportunity, TEST_ENV, CORE_SHA, CONSUMER_SHA, AUTHORIZATION, TRIGGER_NAME, FUNCTION_NAME } from '../scripts/fuel-domestic-test-runtime.mjs';
import { recheckDomesticSources } from '../scripts/fuel-domestic-test-input.mjs';
import { nativePublicationDatabase } from '../scripts/fuel-domestic-test-native.mjs';

const digest=x=>createHash('sha256').update(x).digest('hex');
const binding={environment:TEST_ENV,coreSha:CORE_SHA,consumerSha:CONSUMER_SHA,authorization:AUTHORIZATION,maxTotalModelCalls:1,version:'1',functionName:FUNCTION_NAME};
const event={Type:'Timer',TriggerName:TRIGGER_NAME},context={function_version:'1',request_id:'fixture-timer-request',namespace:TEST_ENV,function_name:FUNCTION_NAME};
const response=analysis=>new Response(JSON.stringify({id:'chatcmpl-runtime-fixture',choices:[{finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(analysis)}}],usage:{prompt_tokens:123,completion_tokens:45}}));

function memoryDatabase() {
  const rows=new Map();let queue=Promise.resolve();
  const collection=name=>({doc:id=>({get:async()=>({data:rows.has(`${name}/${id}`)?structuredClone(rows.get(`${name}/${id}`)):null}),
    set:async data=>{rows.set(`${name}/${id}`,structuredClone(data));}})});
  return {rows,collection,runTransaction:callback=>{const result=queue.then(()=>callback({collection}));queue=result.catch(()=>{});return result;}};
}

async function scenario(name='CASE_DOWN_DOMESTIC') {
  const f=await domesticFixture(name),db=memoryDatabase(),calls=[],saved=[],published=[],audits=[];
  const config={event,context,binding,now:()=>f.now,loadInput:async()=>f.input,loadCurrent:async()=>({evidencePack:f.input}),
    claim:request=>reserveFuelTestOpportunity(db,request,context.request_id),
    providerOptions:{mock:true,environment:{DASHSCOPE_API_KEY:'test'},clock:()=>f.now,fetchImpl:async()=>{calls.push('HTTP');return response(f.analysis);}},
    onAudit:async audit=>audits.push(audit),saveArtifact:async value=>{saved.push(value);return value;},
    publish:async value=>{published.push(value);return {forecastHash:value.bundle.forecast.forecastId};}};
  return {f,db,calls,saved,published,audits,config};
}

for(const name of ['CASE_UP_DOMESTIC','CASE_DOWN_DOMESTIC','CASE_HOLD'])test(`${name}: timer uses the frozen Core provider then automatic accepted delivery`,async()=>{
  const s=await scenario(name),result=await runFuelTestTrigger(s.config);
  assert.equal(result.status,'DELIVERED');assert.equal(result.receipt.triggerType,'PERIODIC_FALLBACK');
  assert.equal(result.receipt.sourceCommit,CORE_SHA);assert.equal(result.receipt.kind,'RUNTIME_ACCEPTED_ARTIFACT');
  assert.equal(result.receipt.sourceArtifactHash,digest(s.saved[0].bytes));assert.equal(s.published.length,1);
  assert.equal(s.calls.length,1);assert.equal(s.audits[0].configuredTransportRetries,0);assert.equal(s.audits[0].maxExternalRequests,1);
  assert.equal(s.published[0].bundle.forecast.publishedAt,null);assert.ok(result.reasonLength<=180);
});

test('actual changed material uses the existing material comparison; checking again is not novelty',async()=>{
  const s=await scenario(),previous=structuredClone(s.f.input);previous.evidence[0].text+='旧版本';
  const result=await runFuelTestTrigger({...s.config,loadCurrent:async()=>({evidencePack:previous})});
  assert.equal(result.receipt.triggerType,'MATERIAL_EVIDENCE');
});

test('two concurrent timer runs and next-day ticks cannot consume the one Test authorization twice',async()=>{
  const s=await scenario(),results=await Promise.all([runFuelTestTrigger(s.config),runFuelTestTrigger(s.config)]);
  assert.deepEqual(results.map(r=>r.status).sort(),['DELIVERED','TEST_AUTHORIZATION_ALREADY_CONSUMED']);assert.equal(s.calls.length,1);
  const later=await runFuelTestTrigger(s.config);assert.equal(later.modelCalls,0);assert.equal(s.calls.length,1);
});

test('claimed model failure preserves the opportunity and never publishes or retries',async()=>{
  const s=await scenario();s.config.providerOptions.fetchImpl=async()=>{s.calls.push('HTTP');return new Response('{}',{status:503});};
  const first=await runFuelTestTrigger(s.config),second=await runFuelTestTrigger(s.config);
  assert.equal(first.status,'GENERATION_REJECTED');assert.equal(first.modelCalls,1);assert.equal(first.code,'QWEN_TRANSPORT_FAILED');
  assert.equal(second.status,'TEST_AUTHORIZATION_ALREADY_CONSUMED');assert.equal(s.calls.length,1);assert.equal(s.published.length,0);assert.equal(s.saved.length,0);
});

test('invalid Core input does not reserve or call; the existing LKG is untouched',async()=>{
  const s=await scenario();s.f.input.policy=null;
  const result=await runFuelTestTrigger(s.config);assert.equal(result.status,'INPUT_REJECTED');assert.equal(s.db.rows.size,0);
  assert.equal(s.calls.length,0);assert.equal(s.published.length,0);
});

test('immutable byte mismatch cannot publish the candidate',async()=>{
  const s=await scenario();s.config.saveArtifact=async value=>({...value,bytes:Buffer.from('{}')});
  await assert.rejects(()=>runFuelTestTrigger(s.config),/FUEL_TEST_IMMUTABLE_ARTIFACT_MISMATCH/);assert.equal(s.published.length,0);
});

for(const mutate of [c=>c.event={Type:'HTTP'},c=>c.event={...event,userInfo:{syntheticIdentity:true}},c=>c.binding={...binding,environment:'not-test'},c=>c.binding={...binding,coreSha:'0'.repeat(40)},
  c=>c.binding={...binding,consumerSha:'0'.repeat(40)},c=>c.binding={...binding,maxTotalModelCalls:2},c=>c.context={...context,function_version:'2'},
  c=>c.context={...context,namespace:'not-test'},c=>c.context={...context,function_name:'another-function'}])test('untrusted trigger or changed binding fails before any model request',async()=>{
  const s=await scenario();mutate(s.config);await assert.rejects(()=>runFuelTestTrigger(s.config),/FUEL_TEST_TRIGGER_NOT_AUTHORIZED/);assert.equal(s.calls.length,0);
});

test('native publication wrapper exposes no news, payment, price, entitlement or Production writes',async()=>{
  const native=memoryDatabase(),receipt={forecastId:'fixture-forecast',sourceCommit:CORE_SHA,sourceArtifactHash:'a'.repeat(64)};
  const db=nativePublicationDatabase(native,receipt);
  for(const [name,id] of [['other','currentFuelForecast'],['yuzhang_fuel_forecasts','currentFuelNews'],['yuzhang_fuel_forecasts','currentFuelPrices']])
    assert.throws(()=>db.collection(name).doc(id),/FUEL_TEST_PUBLICATION_SCOPE_INVALID/);
  await assert.rejects(()=>db.runTransaction(tx=>tx.collection('yuzhang_fuel_forecasts').doc('currentFuelForecast').set({data:{sourceCommit:'forged'}})),/FUEL_TEST_PUBLICATION_SCOPE_INVALID/);
});

const paragraph='截至10月9日，预计国内成品油下调290元/吨。';
function sourceSeed() {
  const official='reviewed-official-bytes';
  return {sources:[{sourceId:'official',sourceUrl:'https://www.ndrc.gov.cn/verified',kind:'FROZEN_OFFICIAL_RECEIPT',contentHash:digest(official)},
    {sourceId:'pricing',sourceUrl:'https://www.oilchem.net/verified',kind:'VERIFIED_PRICING_PARAGRAPH',paragraphAnchor:'截至10月9日',paragraphTextHash:digest(paragraph),publisherTimestampText:'2026-10-10 08:31'}],
    policy:{checkedAt:'old',publishedAt:'2016-01-13T07:33:08.000Z'},adjustmentWindow:{checkedAt:'old'},policySourceIds:['official'],windowSourceIds:['official'],
    pricingEvidenceId:'pricing-evidence',pricingSourceId:'pricing',domesticEvidence:[{evidenceId:'pricing-evidence',publishedAt:'2026-10-10T00:31:00.000Z',checkedAt:'old',contentHash:'old'}]};
}
const html=(text=paragraph)=>`<div class="div1 xqbox"><div class="xq-head"><span>发布时间：2026-10-10 08:31 &nbsp; 来源：隆众资讯</span></div><div class="xqwrap"><div class="xq-content" id="content"><p>${text}</p></div></div></div><div class="footer">nonce changed</div>`;

test('real source recheck retains publication/asOf; unrelated page bytes can change without inventing a new pricing observation',async()=>{
  const seed=sourceSeed(),now=new Date('2026-10-11T07:00:00.000Z');
  const verified=await recheckDomesticSources(seed,{now:()=>now,fetchImpl:async url=>new Response(url.includes('ndrc')?'reviewed-official-bytes':html())});
  assert.equal(verified.domesticEvidence[0].publishedAt,seed.domesticEvidence[0].publishedAt);
  assert.equal(verified.policy.publishedAt,seed.policy.publishedAt);assert.equal(verified.policy.checkedAt,now.toISOString());
  assert.equal(verified.domesticEvidence[0].contentHash,digest(html()));assert.equal(seed.policy.checkedAt,'old');
});

for(const body of [html('截至10月9日，预计国内成品油下调999元/吨。'),'<span>发布时间：2026-10-10 08:31</span><nav>'+paragraph+'</nav>',html().replace('2026-10-10 08:31','2026-10-11 08:31')])test('changed pricing fact/date or menu-only text cannot freshen a domestic receipt',async()=>{
  await assert.rejects(()=>recheckDomesticSources(sourceSeed(),{fetchImpl:async url=>new Response(url.includes('ndrc')?'reviewed-official-bytes':body)}),/FUEL_TEST_PRICING_/);
});

test('changed official policy/window bytes fail closed',async()=>{
  await assert.rejects(()=>recheckDomesticSources(sourceSeed(),{fetchImpl:async()=>new Response('changed official source')}),/FUEL_TEST_OFFICIAL_SOURCE_CHANGED/);
});

for(const body of [
  html('截至10月9日，预计国内成品油下调999元/吨。').replace('</div></div></div>',`</div></div><section><p>${paragraph}</p></section></div>`),
  html('截至10月9日，预计国内成品油下调999元/吨。').replace('<div class="xq-content"',`<!-- <div class="xq-content" id="content"><p>${paragraph}</p></div> --><div class="xq-content"`),
  html().replace('2026-10-10 08:31','2026-10-11 08:31').replace('<div class="xq-head">','<div class="xq-head"><!-- 发布时间：2026-10-10 08:31 -->'),
])test('review counterexample: moved/commented paragraph or commented old date cannot freshen a receipt',async()=>{
  await assert.rejects(()=>recheckDomesticSources(sourceSeed(),{fetchImpl:async url=>new Response(url.includes('ndrc')?'reviewed-official-bytes':body)}),/FUEL_TEST_PRICING_/);
});

test('multi-source policy/window checkedAt is their completed verification time',async()=>{
  const seed=sourceSeed();seed.policySourceIds=['official','pricing'];seed.windowSourceIds=['official','pricing'];
  let tick=0;
  const verified=await recheckDomesticSources(seed,{now:()=>new Date(1791702000000+(++tick)*1000),
    fetchImpl:async url=>new Response(url.includes('ndrc')?'reviewed-official-bytes':html())});
  assert.equal(verified.policy.checkedAt,verified.receipts[1].checkedAt);
  assert.equal(verified.adjustmentWindow.checkedAt,verified.receipts[1].checkedAt);
});
