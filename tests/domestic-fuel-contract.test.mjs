import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { domesticFixture, DOMESTIC_FIXTURE_NAMES, DOMESTIC_FIXTURE_NOW } from './fixtures/domestic-fuel-fixtures.mjs';
import { projectDomesticInput, domesticInputGate, domesticAnalysisSchema, validateDomesticAnalysis, normalizeDomesticForecast, createDomesticQwenRequest, runDomesticForecast, domesticMaterialComparison } from '../scripts/intelligence-v2/domestic-fuel.mjs';
import { domesticForecastGate, domesticForecastStructureGate, domesticForecastContent, domesticProviderAuditGate } from '../dist/data/domestic-fuel-contract.js';
import { createQwenProvider, QWEN_MODEL, qwenSchemaCompatibilityGate } from '../scripts/intelligence-v2/qwen-provider.mjs';
import { evidenceHashFor } from '../scripts/intelligence-v2/history.mjs';
import { acceptedEvidenceGate } from '../dist/data/accepted-evidence-contract.js';
import { buildAcceptedEvidence } from '../scripts/intelligence-v2/accepted-evidence.mjs';
import { resolveNewsUrl } from '../scripts/intelligence-v2/source-adapters.mjs';
import { bridgeHtml, bridgeUrl } from './fixtures/bridge-scenario.mjs';
import { loadReplayFixture } from '../scripts/intelligence-v2/replay.mjs';

const rehash=forecast=>({...forecast,forecastId:evidenceHashFor(domesticForecastContent(forecast))});
const options=(fixture,fetchImpl)=>({mock:true,environment:{DASHSCOPE_API_KEY:'test'},fetchImpl,clock:()=>fixture.now,maxTransportRetries:0,maxExternalRequests:1});
const response=analysis=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(analysis)}}],usage:{prompt_tokens:123,completion_tokens:45}}));

for(const [name,direction]of [['CASE_UP_DOMESTIC','UP'],['CASE_DOWN_DOMESTIC','DOWN'],['CASE_HOLD','HOLD_OR_NO_ADJUSTMENT']])test(`${name}: existing production provider dispatches the domestic target using injected HTTP only`,async()=>{
  const f=await domesticFixture(name),before=JSON.stringify(f.input);let calls=0;
  const result=await runDomesticForecast({input:f.input,now:f.now,providerOptions:options(f,async(_url,request)=>{
    calls++;const body=JSON.parse(request.body);
    assert.equal(body.model,QWEN_MODEL);assert.equal(body.response_format.json_schema.name,'DOMESTIC_FUEL_ANALYSIS_V1');
    assert.equal(body.messages[0].content.includes('你判断的是未来7天中国大陆'),true);
    assert.equal(body.messages[0].content.includes('UP>DOWN为UP'),false);
    return response(f.analysis);
  })});
  assert.equal(result.gate.gate,'PASS');assert.equal(result.forecast.direction,direction);assert.equal(calls,1);
  assert.equal(Object.values(result.forecast.probabilities).reduce((a,b)=>a+b,0),1);
  assert.equal(result.providerAudit.actualExternalRequestCount,1);assert.equal(result.providerAudit.mock,true);
  assert.equal(result.providerAudit.inputPackHash,result.forecast.evidenceRevision);assert.equal(result.forecast.publishedAt,null);
  assert.equal((await domesticForecastGate(result.forecast,{now:f.now,requirePublished:true,evidencePack:f.input})).gate,'FAIL');
  assert.equal(JSON.stringify(f.input),before); // A mock demonstrates transport/control flow, never sensitivity.
});

test('international-only input cannot be turned into domestic direction or a fabricated HOLD',async()=>{
  const f=await domesticFixture('CASE_INTERNATIONAL_ONLY');let calls=0;
  assert.equal(domesticInputGate(f.input,{now:f.now}).gate,'FAIL');assert.throws(()=>createDomesticQwenRequest(f.input),/DOMESTIC_POLICY_INSUFFICIENT/);
  const result=await runDomesticForecast({input:f.input,now:f.now,providerOptions:options(f,async()=>{calls++;throw new Error('MUST_NOT_CALL');})});
  assert.equal(result.gate.gate,'FAIL');assert.equal(result.forecast,null);assert.equal(result.providerAudit,null);assert.equal(calls,0);
});

test('schema/prompt restrict primary reasons to verified domestic evidence without legacy pools',async()=>{
  const f=await domesticFixture('CASE_HOLD'),schema=domesticAnalysisSchema(f.input),request=createDomesticQwenRequest(f.input);
  assert.equal(qwenSchemaCompatibilityGate(schema).gate,'PASS');assert.deepEqual(schema.properties.primaryEvidenceIds.items.enum,['synthetic-domestic-pricing']);
  assert.equal(schema.properties.upReasonEvidenceIds,undefined);assert.equal(request.evidenceRevision,evidenceHashFor(f.input));
  assert.throws(()=>validateDomesticAnalysis({...f.analysis,primaryEvidenceIds:['market-brent']},f.input),/DOMESTIC_PRIMARY_EVIDENCE_INVALID/);
  assert.throws(()=>validateDomesticAnalysis({...f.analysis,probabilities:{UP:80,DOWN:10,FLAT:10}},f.input),/DOMESTIC_DIRECTION_UNSUPPORTED/);
  assert.throws(()=>validateDomesticAnalysis({...f.analysis,probabilities:{UP:45,DOWN:45,FLAT:10}},f.input),/DOMESTIC_DIRECTION_AMBIGUOUS/);
});

test('domestic probabilities reject coercion, decimals, extra keys and non-unit sums',async()=>{
  const f=await domesticFixture('CASE_UP_DOMESTIC'),forecast=await normalizeDomesticForecast({input:f.input,analysis:f.analysis,now:f.now});
  for(const probabilities of [{UP:'0.7',DOWN:.1,HOLD_OR_NO_ADJUSTMENT:.2},{UP:true,DOWN:false,HOLD_OR_NO_ADJUSTMENT:false},{UP:.705,DOWN:.095,HOLD_OR_NO_ADJUSTMENT:.2},{UP:.7,DOWN:.2,HOLD_OR_NO_ADJUSTMENT:.2},{UP:.7,DOWN:.1,HOLD_OR_NO_ADJUSTMENT:.2,FLAT:0}]) {
    const bad=rehash({...forecast,probabilities});assert.equal((await domesticForecastGate(bad,{now:f.now})).gate,'FAIL');
  }
  for(const probabilities of [{UP:'70',DOWN:10,FLAT:20},{UP:70.5,DOWN:9.5,FLAT:20},{UP:70,DOWN:10,FLAT:30}])assert.throws(()=>validateDomesticAnalysis({...f.analysis,probabilities},f.input),/DOMESTIC_PROBABILITIES_INVALID/);
});

test('trusted seven-day horizon grounds duration wording without allowing invented pricing numbers',async()=>{
  const f=await domesticFixture('CASE_UP_DOMESTIC');
  for(const reason of ['未来7天，国内计价信号支持上调。','接下来 7 天，国内计价信号支持上调。','今后7日，国内计价信号支持上调。'])assert.equal(validateDomesticAnalysis({...f.analysis,reason},f.input).direction,'UP');
  for(const reason of ['未来8天，国内计价信号支持上调。','未来7天，预计上调7元每吨。','未来7天，预计上调999元每吨。'])assert.throws(()=>validateDomesticAnalysis({...f.analysis,reason},f.input),/DOMESTIC_REASON_NEW_NUMBER/);
});

test('primary provenance and identities are frozen; publisher timestamp is a separate receipt',async()=>{
  const f=await domesticFixture('CASE_UP_DOMESTIC'),forecast=await normalizeDomesticForecast({input:f.input,analysis:f.analysis,now:f.now});
  const readNow=new Date(+f.now+1000),published={...forecast,publishedAt:readNow.toISOString()};
  assert.equal(published.forecastId,evidenceHashFor(domesticForecastContent(published)));
  assert.equal(domesticForecastStructureGate(published,{now:readNow}).gate,'PASS');
  assert.equal((await domesticForecastGate({...forecast,reason:'被修改'}, {now:f.now})).errors.includes('DOMESTIC_FORECAST_HASH_MISMATCH'),true);
  const changedInput=structuredClone(f.input);changedInput.policy.temporaryControl='ACTIVE';
  assert.equal((await domesticForecastGate(forecast,{now:f.now,evidencePack:changedInput})).gate,'FAIL');
  for(const mutate of [e=>e.extra='uncontracted',e=>e.sourceUrl='http://example.com',e=>e.checkedAt='invalid',e=>e.contentHash='forged',e=>e.directionScope='INPUT_ONLY',e=>e.text='changed source copy']) {
    const bad=structuredClone(forecast);mutate(bad.primaryEvidence[0]);
    assert.equal((await domesticForecastGate(rehash(bad),{now:f.now,evidencePack:f.input})).gate,'FAIL');
  }
});

test('Sinopec window is admitted under its own receipt; unknown policy/window never gets guessed',async()=>{
  const f=await domesticFixture('CASE_UP_DOMESTIC');assert.equal(domesticInputGate(f.input,{now:f.now}).gate,'PASS');
  for(const mutate of [i=>i.adjustmentWindow=null,i=>i.policy=null,i=>i.policy.temporaryControl='UNKNOWN',i=>i.adjustmentWindow.sourceName='NDRC',i=>i.evidence[0].directionScope='DOMESTIC_ADJUSTMENT']) {
    const bad=structuredClone(f.input);mutate(bad);assert.equal(domesticInputGate(bad,{now:f.now}).gate,'FAIL');
  }
});

test('policy/window/FX change the input identity and material decision; checkedAt-only refresh does not',async()=>{
  const f=await domesticFixture('CASE_UP_DOMESTIC'),same=structuredClone(f.input),later=new Date(+f.now+1000);
  for(const r of [same.policy,same.adjustmentWindow,...same.evidence])r.checkedAt=later.toISOString();
  assert.equal(domesticMaterialComparison(same,f.input,{now:later}).eligible,false);
  const fx={...f.input.evidence[0],evidenceId:'synthetic-fx',eventKey:'synthetic-fx',role:'FX_INPUT',direction:'UP',text:'合成汇率：每1美元兑换7元人民币。'};
  for(const mutate of [i=>i.policy.temporaryControl='ACTIVE',i=>i.adjustmentWindow.nextAdjustmentAt=new Date(+f.now+4*86400000).toISOString(),i=>i.evidence.push(fx)]) {
    const changed=structuredClone(f.input);mutate(changed);
    assert.notEqual(evidenceHashFor(changed),evidenceHashFor(f.input));assert.equal(domesticMaterialComparison(changed,f.input,{now:f.now}).eligible,true);
  }
});

test('admitted news remains unassessed input and cannot become a domestic primary reason',async()=>{
  const base=await loadReplayFixture(),f=await domesticFixture('CASE_UP_DOMESTIC',{now:new Date(base.now)}),documentsBefore=JSON.stringify(base.pack.newsDocuments);
  const input=projectDomesticInput({pack:base.pack,policy:f.input.policy,adjustmentWindow:f.input.adjustmentWindow,domesticEvidence:f.input.evidence.filter(e=>e.directionScope==='DOMESTIC_ADJUSTMENT'),evidenceProof:f.input.evidenceProof,now:f.now});
  assert.equal(domesticInputGate(input,{now:f.now}).gate,'PASS');assert.equal(input.relatedNews.length,3);
  for(const row of input.relatedNews) {
    assert.deepEqual([row.role,row.direction,row.strength,row.directionScope],['UNASSESSED_NEWS_INPUT','UNASSESSED','UNASSESSED','INPUT_ONLY']);
    assert.equal(row.document.articleContentHash,base.pack.newsDocuments.find(d=>d.documentId===row.evidenceId).articleContentHash);
  }
  assert.equal(input.missingRoles.includes('RELATED_LOW_IMPACT'),true);
  assert.throws(()=>validateDomesticAnalysis({...f.analysis,primaryEvidenceIds:[input.relatedNews[0].evidenceId]},input),/DOMESTIC_PRIMARY_EVIDENCE_INVALID/);
  assert.equal(JSON.stringify(base.pack.newsDocuments),documentsBefore);
});

test('forged related news is rejected before any model request',async()=>{
  const base=await loadReplayFixture(),f=await domesticFixture('CASE_UP_DOMESTIC',{now:new Date(base.now)});
  const input=projectDomesticInput({pack:base.pack,policy:f.input.policy,adjustmentWindow:f.input.adjustmentWindow,domesticEvidence:f.input.evidence.filter(e=>e.directionScope==='DOMESTIC_ADJUSTMENT'),evidenceProof:f.input.evidenceProof,now:f.now});
  for(const mutate of [i=>i.relatedNews=[{evidenceId:'forged-domestic-news',role:'OFFICIAL_POLICY_OR_ADJUSTMENT',direction:'DOWN',strength:'HIGH',sourceUrl:'http://invalid.example',publishedAt:'invalid',contentHash:'invalid',segments:[{text:'未核验新闻：本轮已确认大幅下调国内汽柴油零售价。'}]}],
    i=>i.relatedNews[0].document.sourceUrl='http://invalid.example',i=>i.relatedNews[0].document.publishedAt=new Date(+f.now+1000).toISOString(),i=>i.relatedNews[0].document.segments[0].extra='uncontracted',i=>i.relatedNews[0].evidenceId='wrong-document',i=>i.relatedNews[0].strength='HIGH']) {
    const bad=structuredClone(input);mutate(bad);let calls=0;
    assert.equal(domesticInputGate(bad,{now:f.now}).errors.includes('DOMESTIC_RELATED_NEWS_INVALID'),true);
    assert.throws(()=>createDomesticQwenRequest(bad),/DOMESTIC_RELATED_NEWS_INVALID/);
    const result=await runDomesticForecast({input:bad,now:f.now,providerOptions:options(f,async()=>{calls++;return response(f.analysis);})});
    assert.equal(result.gate.gate,'FAIL');assert.equal(calls,0);assert.equal(result.forecast,null);
  }
});

test('one-shot semantic Test options do not retry failed injected transport or enable unknown activation',async()=>{
  const f=await domesticFixture('CASE_UP_DOMESTIC');let calls=0;const failed=options(f,async()=>{calls++;return new Response('fixture failure',{status:500});});
  await assert.rejects(()=>runDomesticForecast({input:f.input,now:f.now,providerOptions:failed}),/QWEN_TRANSPORT_FAILED/);assert.equal(calls,1);
  const provider=createQwenProvider({...failed,mock:false});
  await assert.rejects(()=>provider.generateForecast({evidencePack:f.input,evidenceHash:evidenceHashFor(f.input),now:f.now}),/QWEN_API_ACTIVATION_NEEDS_USER_AUTHORIZATION/);assert.equal(calls,1);
});

test('domestic LKG keeps frozen primary/news validation and becomes STALE only at own expiry',async()=>{
  const base=await loadReplayFixture(),f=await domesticFixture('CASE_HOLD',{now:new Date(base.now)});
  const publication=new Date(+f.now-71*3600000).toISOString();
  const document=(await resolveNewsUrl(bridgeUrl,{now:f.now,fetchImpl:async()=>new Response(bridgeHtml({date:publication,body:'Synthetic fixture: ordinary diesel market commentary discusses recent trading without a confirmed supply disruption. These observations exist only for controlled contract verification.'}))})).document;
  const accepted=buildAcceptedEvidence({pack:{...base.pack,newsDocuments:[document]},now:f.now});
  assert.equal(acceptedEvidenceGate(accepted,{now:f.now}).gate,'PASS');
  const forecast=await normalizeDomesticForecast({input:f.input,analysis:f.analysis,acceptedCollection:accepted,now:f.now});
  const published={...forecast,publishedAt:f.now.toISOString()};
  assert.equal((await domesticForecastGate(published,{now:new Date(+f.now+2*3600000),evidencePack:f.input})).status,'LIVE');
  assert.equal((await domesticForecastGate(published,{now:new Date(forecast.validUntil),evidencePack:f.input})).status,'STALE');
  assert.equal((await domesticForecastGate(published,{now:new Date(+f.now-1),evidencePack:f.input})).gate,'FAIL');
  assert.equal(forecast.acceptedEvidence[0].publishedAt,publication);
});

test('publication audit cannot bless mocks, another target/prompt, hash drift or extra requests',async()=>{
  const f=await domesticFixture('CASE_UP_DOMESTIC'),result=await runDomesticForecast({input:f.input,now:f.now,providerOptions:options(f,async()=>response(f.analysis))});
  assert.equal(domesticProviderAuditGate(result.forecast,result.providerAudit).gate,'FAIL');
  const audit={...result.providerAudit,mock:false};assert.equal(domesticProviderAuditGate(result.forecast,audit).gate,'PASS');
  for(const mutate of [a=>a.promptVersion='qwen-forecast-core-v1',a=>a.evidenceHash='a'.repeat(64),a=>a.actualExternalRequestCount=2,a=>a.outputHash='invalid',a=>a.requestStartedAt=new Date(+f.now+1).toISOString()]) {
    const bad=structuredClone(audit);mutate(bad);assert.equal(domesticProviderAuditGate(result.forecast,bad).gate,'FAIL');
  }
});

test('legacy public cache target/history and prompt still describe their original international forecast',async()=>{
  const cache=JSON.parse(await readFile(new URL('../dist/data/forecast-cache.json',import.meta.url),'utf8'));
  assert.equal(cache.target,undefined);assert.equal(cache.schemaVersion,undefined);
  const prompt=await readFile(new URL('../scripts/intelligence-v2/prompts/qwen-forecast-core-v1.mjs',import.meta.url),'utf8');
  assert.ok(prompt.includes('纽约港低硫柴油现货方向'));assert.equal(DOMESTIC_FIXTURE_NAMES.length,4);assert.ok(DOMESTIC_FIXTURE_NOW);
});
