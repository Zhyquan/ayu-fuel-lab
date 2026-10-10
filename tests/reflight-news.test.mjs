import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { acceptedEvidenceGate } from '../dist/data/accepted-evidence-contract.js';
import { coreEvidenceGate, validateForecastCache, forecastGate, admittedNewsDocuments } from '../dist/data/intelligence-v2-contract.js';
import { publicEvidenceGate } from '../dist/data/public-evidence.js';
import { collectEvidence } from '../scripts/intelligence-v2/collect.mjs';
import { runManualBridge } from '../scripts/intelligence-v2/manual-bridge.mjs';
import { runAcceptedNewsRefresh, verifyAcceptedCollection, EVIDENCE_WORKFLOW, ACCEPTED_EVIDENCE_PATH } from '../scripts/intelligence-v2/accepted-news-refresh.mjs';
import { acceptedChangesAllowed } from '../scripts/intelligence-v2/commit-accepted-evidence.mjs';
import { triggerAdmission, inferenceAdmission, reservationName } from '../scripts/intelligence-v2/trigger-reliability.mjs';
import { bridgeHtml, bridgeUrl } from './fixtures/bridge-scenario.mjs';
import { resolveNewsUrl } from '../scripts/intelligence-v2/source-adapters.mjs';
import { loadReplayFixture, replayOutput, replayCandidate } from '../scripts/intelligence-v2/replay.mjs';

const fixture=await loadReplayFixture(),now=new Date(fixture.now);
const core=()=>({...structuredClone(fixture.pack),newsDocuments:[],coverageMode:'LIMITED'});
const forecast=async pack=>({...await replayCandidate(pack,replayOutput(pack),now),evidencePack:pack});
const article=async(body,id='999000')=>(await resolveNewsUrl(bridgeUrl.replace('999000',id),{now,fetchImpl:async()=>new Response(bridgeHtml({body}))})).document;
const lowBody='Synthetic commentary: diesel traders reviewed an ordinary energy market session. This report has no new directional supply observation and no confirmed outage.';
const materialBody='Synthetic material fixture: diesel inventories decreased in a controlled supply test. These invented observations are used only for isolated pipeline verification.';

test('automatic LOW cards publish independently while an unchanged Forecast consumes no model call',async()=>{
  const baseline=core(),currentCache=await forecast(baseline),document=await article(lowBody),received=[];
  const result=await runAcceptedNewsRefresh({pack:{...baseline,newsDocuments:[document],coverageMode:'NORMAL'},currentCache,now,onAcceptedEvidence:async c=>received.push(c)});
  assert.equal(result.triggerDecision.eligible,false);assert.equal(result.realQwenCalls,0);
  assert.equal(received.length,1);assert.equal(received[0].acceptedEvidence[0].displayEligible,true);
  assert.equal(received[0].acceptedEvidence[0].forecastInfluence,'LOW');assert.equal(received[0].acceptedEvidence[0].forecastHash,null);
  assert.equal(acceptedEvidenceGate(received[0],{now}).gate,'PASS');assert.equal(verifyAcceptedCollection(received[0],{now}),received[0]);
  const tampered=structuredClone(received[0]);tampered.acceptedEvidence[0].summary+='修改';
  assert.throws(()=>verifyAcceptedCollection(tampered,{now}),/ACCEPTED_EVIDENCE_INTEGRITY_FAILED/);
});

test('display acceptance does not pretend material was consumed by the last Forecast',async()=>{
  const baseline=core(),currentCache=await forecast(baseline),document=await article(materialBody);
  const pack={...baseline,newsDocuments:[document],coverageMode:'NORMAL'};
  const first=await runAcceptedNewsRefresh({pack,currentCache,now});
  assert.equal(first.triggerDecision.eligible,true);assert.deepEqual(first.triggerDecision.materialEvidenceIds,[document.documentId]);
  const retry=await runAcceptedNewsRefresh({pack,currentCache,previous:first.acceptedCollection.acceptedEvidence,now});
  assert.equal(retry.triggerDecision.eligible,true);assert.equal(retry.acceptedCollection.acceptedEvidence.length,1);
  const consumed=await forecast(pack),after=await runAcceptedNewsRefresh({pack,currentCache:consumed,previous:first.acceptedCollection.acceptedEvidence,now});
  assert.equal(after.triggerDecision.eligible,false);assert.equal(after.acceptedCollection.acceptedEvidence.length,1);
});

test('Bridge material already displayed remains eligible until the Current Forecast consumes it',async()=>{
  const baseline=core(),currentCache=await forecast(baseline),document=await article(materialBody);
  const shown=await runAcceptedNewsRefresh({pack:{...baseline,newsDocuments:[document],coverageMode:'NORMAL'},currentCache,now});
  const result=await runManualBridge({newsUrl:bridgeUrl,mode:'VERIFY_ONLY',clock:()=>now,currentCache,
    acceptedEvidence:shown.acceptedCollection.acceptedEvidence,collect:async()=>({pack:baseline}),
    resolveOptions:{fetchImpl:async()=>new Response(bridgeHtml({body:materialBody}))}});
  assert.equal(result.status,'READY_FOR_REFORECAST');assert.equal(result.qwenCalled,false);
  assert.equal(result.recomputeEligibility.eligible,true);assert.equal(result.acceptedCollection.acceptedEvidence.length,1);
});

test('a real structural measurement change can trigger; checkedAt alone cannot',async()=>{
  const baseline=core(),currentCache=await forecast(baseline),same=structuredClone(baseline);
  same.signals[0].checkedAt=new Date(+now-1000).toISOString();
  assert.equal((await runAcceptedNewsRefresh({pack:same,currentCache,now})).triggerDecision.eligible,false);
  const changed=structuredClone(baseline);changed.signals[0].observation.price+=1;
  const result=await runAcceptedNewsRefresh({pack:changed,currentCache,now});
  assert.equal(result.triggerDecision.eligible,true);assert.deepEqual(result.triggerDecision.materialEvidenceIds,[changed.signals[0].id]);
});

test('routine mention of OPEC does not manufacture a material trigger',async()=>{
  const baseline=core(),currentCache=await forecast(baseline);
  const document=await article('Synthetic oil market review: traders discuss OPEC in an ordinary market session. This commentary contains no new production decision or supply measurement.');
  const result=await runAcceptedNewsRefresh({pack:{...baseline,newsDocuments:[document],coverageMode:'NORMAL'},currentCache,now});
  assert.equal(result.triggerDecision.eligible,false);assert.equal(result.acceptedCollection.acceptedEvidence.length,1);
});

test('failed sources retain verified news receipts with original frozen times until fetch expiry',async()=>{
  const document=await article(materialBody),previousPack={...core(),newsDocuments:[document],coverageMode:'NORMAL',fetchLog:[{url:document.sourceUrl,status:'OK',checkedAt:document.fetchedAt,bodySha256:'a'.repeat(64)}]};
  const fetchImpl=async()=>{throw new Error('SYNTHETIC_SOURCE_FAILURE');};
  const failed=await collectEvidence({fetchImpl,now:new Date(+now+3600000),previousPack});
  assert.equal(failed.gate.gate,'FAIL');assert.equal(failed.pack.coverageMode,'LIMITED');assert.deepEqual(failed.pack.newsDocuments,[document]);
  assert.equal(failed.pack.retainedDocuments[0].sourceReadMethod,'PREVIOUS_VERIFIED_COLLECTION');
  assert.ok(failed.pack.fetchLog.every(f=>f.status==='FAILED'));
  const admitted=await runAcceptedNewsRefresh({pack:failed.pack,now:new Date(+now+3600000)});
  assert.equal(admitted.triggerDecision.reason,'CORE_INVALID');assert.equal(admitted.acceptedCollection.acceptedEvidence.length,1);
  const next=await collectEvidence({fetchImpl,now:new Date(+now+7200000),previousPack:failed.pack});
  assert.deepEqual(next.pack.newsDocuments,[document]);
  const expired=await collectEvidence({fetchImpl,now:new Date(+now+86400000),previousPack});
  assert.equal(expired.pack.newsDocuments.length,0);
  const unverified={...previousPack,fetchLog:[]};
  assert.equal((await collectEvidence({fetchImpl,now,previousPack:unverified})).pack.newsDocuments.length,0);
});

test('independent news validation cannot admit malformed identity or authorize an invalid Core',async()=>{
  const document=await article(materialBody),pack={...core(),signals:[],newsDocuments:[document],coverageMode:'NORMAL'};
  assert.deepEqual(admittedNewsDocuments(pack).documents,[document]);assert.equal(coreEvidenceGate(pack,{now}).gate,'FAIL');
  for(const mutate of [d=>d.sourceUrl='https://example.com/news/999000',d=>d.originalSource='UNKNOWN',d=>d.fetchedAt='invalid',d=>d.segments[0].segmentId='forged']) {
    const bad=structuredClone(document);mutate(bad);assert.equal(admittedNewsDocuments({...pack,newsDocuments:[bad]}).documents.length,0);
  }
});

test('material evidence events use the same reservation and one daily Forecast admission',()=>{
  const event={workflow_run:{name:EVIDENCE_WORKFLOW,conclusion:'success',head_branch:'main',head_repository:{full_name:'Zhyquan/ayu-fuel-lab'},event:'schedule'}};
  const evidenceTrigger={contract:'RECOMPUTE_ELIGIBILITY_V2',eligible:true,reason:'MATERIAL_NEW_EVIDENCE',materialEvidenceIds:['market-brent']};
  const args={eventName:'workflow_run',event,repo:'Zhyquan/ayu-fuel-lab',ref:'refs/heads/main',now:new Date('2026-09-30T05:30:00Z')};
  assert.equal(triggerAdmission(args).eligible,false);assert.equal(triggerAdmission({...args,evidenceTrigger}).eligible,true);
  assert.equal(triggerAdmission({...args,event:{workflow_run:{...event.workflow_run,event:'workflow_dispatch'}},evidenceTrigger}).eligible,false);
  const date='2026-09-30',index={schemaVersion:1,entries:[],legacyHistory:[]},sourceCommit='a'.repeat(40),artifacts=[];
  let calls=0;for(let i=0;i<2;i++)if(inferenceAdmission({date,index,sourceCommit,latestCommit:sourceCommit,artifacts}).eligible){calls++;artifacts.push({name:reservationName(date),expired:false,workflow_run:{head_branch:'main'}});}
  assert.equal(calls,1);
});

test('accepted-news writer permits only its fixed Fuel artifact path',()=>{
  assert.deepEqual(acceptedChangesAllowed([{path:ACCEPTED_EVIDENCE_PATH,status:'??'}]),[ACCEPTED_EVIDENCE_PATH]);
  for(const path of ['dist/data/forecast-cache.json','data/forecast-history-v2/official-daily-index.json','intelligence-v2/provider-run.json','dist/app.js'])assert.throws(()=>acceptedChangesAllowed([{path,status:' M'}]),/ACCEPTED_EVIDENCE_CHANGE_NOT_ALLOWED/);
  assert.throws(()=>acceptedChangesAllowed([{path:ACCEPTED_EVIDENCE_PATH,status:' D'}]),/ACCEPTED_EVIDENCE_CHANGE_NOT_ALLOWED/);
});

test('source clocks cannot erase a valid judgment before its own expiry; future judgments remain invalid',async()=>{
  const cache=JSON.parse(await readFile(new URL('../data/forecast-history-v2/2026-09-28T11-17-34.176Z-66453209e4ab.json',import.meta.url),'utf8'));
  const sourceExpiry=new Date(Date.parse(cache.evidencePack.generatedAt)+86400000),{evidencePack,...candidate}=cache;
  assert.ok(+sourceExpiry<Date.parse(cache.validUntil));assert.equal(forecastGate(candidate,evidencePack,{now:sourceExpiry}).gate,'FAIL');
  assert.equal(validateForecastCache(cache,{now:sourceExpiry}).status,'LIVE');
  assert.equal(publicEvidenceGate({forecast:cache,evidencePack},{now:sourceExpiry}).gate,'PASS');
  assert.equal(validateForecastCache(cache,{now:new Date(cache.validUntil)}).status,'STALE');
  assert.equal(validateForecastCache(cache,{now:new Date(Date.parse(cache.generatedAt)-1)}).status,'UNAVAILABLE');
});
