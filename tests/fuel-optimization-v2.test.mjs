import test from 'node:test';
import assert from 'node:assert/strict';
import { loadReplayFixture, replayOutput } from '../scripts/intelligence-v2/replay.mjs';
import { buildAcceptedEvidence, recomputeEligibility } from '../scripts/intelligence-v2/accepted-evidence.mjs';
import { bridgeScenario, bridgeHtml } from './fixtures/bridge-scenario.mjs';
import { externalScenario, externalPackage } from './fixtures/external-signal-scenario.mjs';
const fixture=await loadReplayFixture();
const ordinary=bridgeHtml({body:'Synthetic fixture: oil and diesel traders reviewed seasonal fuel demand and routine energy market operations across several regions. No new supply policy was announced.'});

test('verified ordinary low-materiality article remains visible without model or Forecast mutation',async()=>{
 const s=bridgeScenario(fixture,replayOutput,{html:ordinary}), delivered=[];
 const result=await s.run({mode:'REFRESH_CURRENT',onAcceptedEvidence:async c=>delivered.push(c)});
 assert.equal(result.status,'ACCEPTED_NO_RECOMPUTE');assert.equal(s.counts.model,0);
 assert.equal(result.currentForecastUpdated,false);assert.equal(result.snapshot,undefined);
 const card=delivered[0].acceptedEvidence.find(e=>e.id==='br-999000');
 assert.equal(card.displayEligible,true);assert.equal(card.policy,'ACCEPTED_LOW_INFLUENCE');
 assert.equal(card.relationship,'RELATED_ONLY');assert.equal(card.forecastHash,null);
 assert.equal(card.influenceBasis,'TRIGGER_PREASSESSMENT_ONLY');
 assert.ok(!JSON.stringify(card).includes('Synthetic fixture:'));assert.ok(!('segments' in card));
});

test('material article recomputes once, remains visible even if not a forecast reason',async()=>{
 const s=bridgeScenario(fixture,replayOutput), delivered=[];
 const result=await s.run({mode:'REFRESH_CURRENT',onAcceptedEvidence:async c=>delivered.push(c)});
 assert.equal(result.status,'CURRENT_READY',result.failureCode);assert.equal(s.counts.model,1);
 assert.equal(result.recomputeEligibility.eligible,true);assert.equal(result.newsUsedInReasons,false);
 assert.equal(delivered.length,2);assert.equal(delivered.at(-1).acceptedEvidence.find(e=>e.id==='br-999000').relationship,'RELATED_ONLY');
});

test('model failure does not erase already delivered accepted news',async()=>{
 const s=bridgeScenario(fixture,replayOutput,{mutateOutput:o=>o.probabilities.DOWN=99}),delivered=[];
 const r=await s.run({mode:'REFRESH_CURRENT',onAcceptedEvidence:async c=>delivered.push(c)});
 assert.equal(r.status,'REJECTED');assert.equal(s.counts.model,1);assert.equal(delivered.length,1);
 assert.ok(delivered[0].acceptedEvidence.some(e=>e.id==='br-999000'));
});

test('external LOW accepted signal does not call model or claim independently read original news',async()=>{
 const value=externalPackage(fixture.now);value.signals[0].strength='LOW';
 const s=externalScenario(fixture,{packageValue:value}),r=await s.run({mode:'REFRESH_CURRENT'});
 assert.equal(r.status,'ACCEPTED_NO_RECOMPUTE');assert.equal(s.counts.model,0);
 const row=r.acceptedCollection.acceptedEvidence.find(e=>e.influenceBasis==='EXTERNAL_ANALYST');
 assert.ok(row);assert.equal(row.forecastInfluence,'LOW');assert.equal(row.displayEligible,true);
 assert.equal(r.recomputeEligibility.checks.sourceTrust,'EXTERNAL_ANALYST');
});

test('dynamic collection has more than six items across accepted input batches, with dedup and expiry',()=>{
 let previous=[];
 for(let i=0;i<4;i++) {
  const pack=structuredClone(fixture.pack);
  pack.newsDocuments=pack.newsDocuments.map((d,j)=>({...d,documentId:`br-${800000+i*10+j}`,sourceUrl:`https://www.brecorder.com/news/${800000+i*10+j}/synthetic`,articleContentHash:String(i*10+j+1).padStart(64,'0')}));
  previous=buildAcceptedEvidence({pack,previous,now:new Date(fixture.now)}).acceptedEvidence;
 }
 assert.ok(previous.length>6);assert.ok(previous.every(e=>e.displayEligible));
 const repeat=buildAcceptedEvidence({pack:fixture.pack,previous:[...previous,...previous],now:new Date(fixture.now)});
 assert.equal(new Set(repeat.acceptedEvidence.map(e=>e.id)).size,repeat.acceptedEvidence.length);
});

test('invalid core, stale source and duplicate event cannot make a recompute eligible',()=>{
 const pack=structuredClone(fixture.pack),document=pack.newsDocuments[0];
 assert.equal(recomputeEligibility({pack,document,now:new Date('2027-01-01')}).eligible,false);
 assert.equal(recomputeEligibility({pack,document,previous:[{id:document.documentId}],now:new Date(fixture.now)}).eligible,false);
 pack.signals=pack.signals.filter(s=>s.id!=='market-diesel');
 assert.throws(()=>buildAcceptedEvidence({pack,now:new Date(fixture.now)}),/CORE_INVALID/);
});

test('consumer gate rejects extra article body, unsafe URL, invalid dates and forged priority',async()=>{
 const {acceptedEvidenceGate}=await import('../dist/data/accepted-evidence-contract.js');
 const original=buildAcceptedEvidence({pack:fixture.pack,now:new Date(fixture.now)});
 for(const mutate of [e=>e.rawArticle='untrusted body',e=>e.sourceUrl='javascript:alert(1)',e=>e.publishedAt='2099-01-01T00:00:00Z',e=>e.displayPriority=Infinity,e=>e.relationship='OFFICIAL_FACT']) {
  const c=structuredClone(original);mutate(c.acceptedEvidence[0]);assert.equal(acceptedEvidenceGate(c,{now:new Date(fixture.now)}).gate,'FAIL');
 }
 assert.equal(acceptedEvidenceGate(original,{now:new Date('2026-10-04')}).acceptedEvidence.length,0);
});

test('same fresh article in collection is not a prior published acceptance or a second event',async()=>{
 const s=bridgeScenario(fixture,replayOutput);const {resolveNewsUrl}=await import('../scripts/intelligence-v2/source-adapters.mjs');
 const document=(await resolveNewsUrl(s.options.newsUrl,{...s.options.resolveOptions,now:new Date(fixture.now)})).document;
 const overlapping=bridgeScenario(fixture,replayOutput,{pack:{...fixture.pack,newsDocuments:[...fixture.pack.newsDocuments,document]}});
 const r=await overlapping.run({mode:'REFRESH_CURRENT'});
 assert.equal(r.status,'CURRENT_READY');assert.equal(r.snapshot.evidencePack.newsDocuments.filter(d=>d.documentId===document.documentId).length,1);
});
