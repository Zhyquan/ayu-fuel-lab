import test from 'node:test';
import assert from 'node:assert/strict';
import { loadReplayFixture, replayOutput } from '../scripts/intelligence-v2/replay.mjs';
import { bridgeScenario, bridgeHtml, bridgeUrl } from './fixtures/bridge-scenario.mjs';
import { externalPackage, externalScenario } from './fixtures/external-signal-scenario.mjs';
import { buildAcceptedEvidence } from '../scripts/intelligence-v2/accepted-evidence.mjs';
import { acceptedEvidenceGate } from '../dist/data/accepted-evidence-contract.js';
import { resolveNewsUrl } from '../scripts/intelligence-v2/source-adapters.mjs';
import { currentHash } from '../scripts/intelligence-v2/current-publication.mjs';

const fixture=await loadReplayFixture(),now=new Date(fixture.now);
const core=()=>({...structuredClone(fixture.pack),newsDocuments:[],coverageMode:'LIMITED'});
const lowBody='Synthetic low-influence fixture: diesel traders discuss a routine energy market review. This commentary has no new supply observation and makes no directional conclusion.';
const low=()=>bridgeScenario(fixture,replayOutput,{pack:core(),html:bridgeHtml({body:lowBody})});

test('LOW article is display eligible in free verification without model or delivery',async()=>{
  const s=low();let callbacks=0;
  const result=await s.run({onAcceptedEvidence:async()=>{callbacks++;}});
  assert.equal(result.status,'ACCEPTED_NO_RECOMPUTE');
  assert.equal(result.recomputeEligibility.reason,'LOW_MATERIALITY');
  assert.equal(result.recomputeEligibility.eligible,false);
  assert.equal(result.evidenceAdmission,'PASS');assert.equal(result.actualExternalRequestCount,0);
  assert.deepEqual(s.counts,{source:1,collect:1,model:0});assert.equal(callbacks,0);
  const row=result.acceptedCollection.acceptedEvidence[0];
  assert.equal(row.displayEligible,true);assert.equal(row.forecastInfluence,'LOW');
  assert.equal(row.influenceBasis,'TRIGGER_PREASSESSMENT_ONLY');
  assert.equal(row.policy,'ACCEPTED_LOW_INFLUENCE');assert.equal(row.relationship,'RELATED_ONLY');
  assert.equal(row.forecastHash,null);assert.equal(acceptedEvidenceGate(result.acceptedCollection,{now}).gate,'PASS');
});

test('LOW refresh delivers accepted material once after admission with zero model requests',async()=>{
  const s=low(),received=[];
  const result=await s.run({mode:'REFRESH_CURRENT',onAcceptedEvidence:async collection=>{
    assert.equal(s.counts.collect,1);assert.equal(s.counts.model,0);
    assert.equal(acceptedEvidenceGate(collection,{now}).gate,'PASS');received.push(collection);
  }});
  assert.equal(result.status,'ACCEPTED_NO_RECOMPUTE');assert.equal(result.currentForecastUpdated,false);
  assert.equal(received.length,1);assert.deepEqual(received[0],result.acceptedCollection);
  assert.equal(result.qwenCalled,false);assert.equal(result.actualExternalRequestCount,0);
});

test('LOW neutral analyst input stays display eligible without becoming a directional reason',async()=>{
  const p=externalPackage(fixture.now);Object.assign(p.signals[0],{direction:'NEUTRAL',strength:'LOW'});
  const s=externalScenario(fixture,{pack:core(),packageValue:p}),received=[];
  const result=await s.run({mode:'REFRESH_CURRENT',onAcceptedEvidence:async c=>received.push(c)});
  assert.equal(result.status,'ACCEPTED_NO_RECOMPUTE');assert.equal(result.recomputeEligibility.reason,'LOW_MATERIALITY');
  assert.equal(s.counts.model,0);assert.equal(received.length,1);
  const row=result.acceptedCollection.acceptedEvidence[0];
  assert.equal(row.direction,'NEUTRAL');assert.equal(row.displayEligible,true);
  assert.equal(row.influenceBasis,'EXTERNAL_ANALYST');assert.equal(row.policy,'ACCEPTED_LOW_INFLUENCE');
  assert.equal(row.forecastHash,null);assert.ok(!('snapshot' in result));
});

for(const [direction,role,body]of [
  ['UP','main','Synthetic material fixture: a diesel refinery halted output after a controlled maintenance incident. This is invented supply evidence for an isolated test.'],
  ['DOWN','counter','Synthetic material fixture: a diesel refinery resumed output after a controlled maintenance interval. This is invented supply evidence for an isolated test.'],
])test(`material ${direction} delivers before one injected model request then binds the normal reason`,async()=>{
  const s=bridgeScenario(fixture,replayOutput,{pack:core(),role,html:bridgeHtml({body})}),received=[];
  const result=await s.run({mode:'REFRESH_CURRENT',onAcceptedEvidence:async c=>{
    received.push({collection:c,modelCalls:s.counts.model});
  }});
  assert.equal(result.status,'CURRENT_READY',result.failureCode);assert.equal(result.recomputeEligibility.eligible,true);
  assert.equal(result.coreForecastGate,'PASS');assert.equal(result.publicEvidenceGate,'PASS');
  assert.equal(s.counts.model,1);assert.equal(result.providerAudit.mock,true);
  assert.deepEqual(received.map(r=>r.modelCalls),[0,1]);
  assert.equal(received[0].collection.acceptedEvidence[0].relationship,'RELATED_ONLY');
  const row=received[1].collection.acceptedEvidence[0];
  assert.equal(row.policy,'FORECAST_PRIMARY_EVIDENCE');assert.equal(row.relationship,'FORECAST_REASON');
  assert.equal(row.direction,direction);assert.equal(row.influenceBasis,'MODEL_ASSESSMENT');
  assert.equal(row.forecastHash,currentHash(result.snapshot));
});

test('a failed model preserves the accepted callback result and cannot update Current',async()=>{
  const s=bridgeScenario(fixture,replayOutput,{pack:core()}),received=[];
  const result=await s.run({mode:'REFRESH_CURRENT',onAcceptedEvidence:async c=>received.push(c),providerOptions:{
    ...s.options.providerOptions,fetchImpl:async()=>new Response('',{status:503}),
  }});
  assert.equal(result.status,'REJECTED');assert.equal(result.failureCode,'QWEN_TRANSPORT_FAILED');
  assert.equal(result.actualExternalRequestCount,1);assert.equal(result.currentForecastUpdated,false);
  assert.equal(received.length,1);assert.equal(acceptedEvidenceGate(received[0],{now}).gate,'PASS');
  assert.equal(received[0].acceptedEvidence[0].forecastHash,null);
});

test('accepted callback failure stops before model and before Current persistence',async()=>{
  const s=bridgeScenario(fixture,replayOutput,{pack:core()});
  const result=await s.run({mode:'REFRESH_CURRENT',onAcceptedEvidence:async()=>{throw new Error('SYNTHETIC_DELIVERY_FAILURE');}});
  assert.equal(result.failureCode,'SYNTHETIC_DELIVERY_FAILURE');assert.equal(s.counts.model,0);
  assert.equal(result.currentForecastUpdated,false);
});

test('previous Current duplicate remains rejected before collection, callback and model',async()=>{
  const document=(await resolveNewsUrl(bridgeUrl,{now,fetchImpl:async()=>new Response(bridgeHtml())})).document;
  const s=bridgeScenario(fixture,replayOutput,{pack:core()});let callbacks=0;
  const result=await s.run({mode:'REFRESH_CURRENT',currentCache:{evidencePack:{newsDocuments:[document]}},onAcceptedEvidence:async()=>{callbacks++;}});
  assert.equal(result.failureCode,'BRIDGE_DUPLICATE_ONLY');assert.equal(callbacks,0);
  assert.equal(s.counts.collect,0);assert.equal(s.counts.model,0);
});

test('trusted accepted duplicate remains one display row and cannot trigger another model run',async()=>{
  const first=await low().run(),s=low();
  const result=await s.run({mode:'REFRESH_CURRENT',acceptedEvidence:first.acceptedCollection.acceptedEvidence});
  assert.equal(result.status,'ACCEPTED_NO_RECOMPUTE');assert.equal(result.recomputeEligibility.reason,'DUPLICATE');
  assert.equal(result.acceptedCollection.acceptedEvidence.length,1);assert.equal(s.counts.model,0);
});

test('syndicated copies collapse by source content instead of adding card count',async()=>{
  const document=(await resolveNewsUrl(bridgeUrl,{now,fetchImpl:async()=>new Response(bridgeHtml())})).document;
  const pack={...core(),newsDocuments:[document,{...document,documentId:'br-999001',sourceUrl:bridgeUrl.replace('999000','999001')}]};
  const collection=buildAcceptedEvidence({pack,now});
  assert.equal(collection.acceptedEvidence.length,1);
  assert.ok(collection.exclusions.some(e=>e.reason==='DUPLICATE_SYNDICATED_CONTENT'));
});

test('expired prior display rows are removed while fresh accepted rows retain the same identity',async()=>{
  const first=(await low().run()).acceptedCollection.acceptedEvidence[0];
  const oldDate=new Date(+now-73*3600000).toISOString();
  const expired={...first,publishedAt:oldDate,date:oldDate.slice(0,10)};
  const collection=buildAcceptedEvidence({pack:core(),previous:[expired],now});
  assert.deepEqual(collection.acceptedEvidence,[]);
  const fresh=buildAcceptedEvidence({pack:core(),previous:[first],now});
  assert.equal(fresh.acceptedEvidence[0].id,first.id);assert.equal(fresh.acceptedEvidence[0].contentHash,first.contentHash);
});

for(const [label,html,code]of [
  ['expired',bridgeHtml({date:'2026-09-20T04:00:00Z'}),'ARTICLE_PUBLICATION_TIME_UNVERIFIED'],
  ['irrelevant',bridgeHtml({body:'Synthetic sports fixture: football players discussed a recent game and a future match. The report only contains a tournament schedule and team scores.'}),'UNRELATED_MARKET_ARTICLE'],
  ['source identity',bridgeHtml({publisher:'SYNTHETIC UNTRUSTED SOURCE'}),'PUBLISHER_NOT_VERIFIED'],
])test(`${label} article fails before collection, accepted callback and model`,async()=>{
  const s=bridgeScenario(fixture,replayOutput,{pack:core(),html});let callbacks=0;
  const result=await s.run({mode:'REFRESH_CURRENT',onAcceptedEvidence:async()=>{callbacks++;}});
  assert.equal(result.failureCode,code);assert.equal(callbacks,0);assert.equal(s.counts.collect,0);assert.equal(s.counts.model,0);
  assert.ok(!('acceptedCollection' in result));
});

test('invalid core cannot produce or deliver an accepted collection',async()=>{
  const pack=core();pack.signals=pack.signals.filter(s=>s.id!=='market-diesel');
  const s=bridgeScenario(fixture,replayOutput,{pack});let callbacks=0;
  const result=await s.run({mode:'REFRESH_CURRENT',onAcceptedEvidence:async()=>{callbacks++;}});
  assert.equal(result.failureCode,'CORE_EVIDENCE_GATE_FAILED');assert.equal(callbacks,0);assert.equal(s.counts.model,0);
  assert.throws(()=>buildAcceptedEvidence({pack,now}),/ACCEPTED_EVIDENCE_CORE_INVALID/);
});

test('malformed trusted accumulation fails closed instead of exposing an invalid display row',async()=>{
  const row=(await low().run()).acceptedCollection.acceptedEvidence[0];
  assert.throws(()=>buildAcceptedEvidence({pack:core(),previous:[{...row,title:'<unsafe>'}],now}),/ACCEPTED_EVIDENCE_PROJECTION_INVALID/);
});
