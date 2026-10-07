import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { analysisSchema, projectEvidence, reasonSelectionHints, validateAnalysis } from '../scripts/intelligence-v2/qwen-provider.mjs';
import { loadReplayFixture, replayOutput, replayCandidate } from '../scripts/intelligence-v2/replay.mjs';
import { coreForecastGate, validateForecastCache } from '../dist/data/intelligence-v2-contract.js';
import { publicEvidenceGate } from '../dist/data/public-evidence.js';
import { externalPackage, externalScenario } from './fixtures/external-signal-scenario.mjs';

test('constructed old same-event counterexample is excluded before inference, not repaired after output',async()=>{
  const old=JSON.parse(await readFile(new URL('./fixtures/old-event-pool-counterexample.json',import.meta.url),'utf8'));
  assert.equal(old.fixtureKind,'CONSTRUCTED_DUPLICATE_EVENT_COUNTEREXAMPLE_NOT_ORIGINAL_QWEN_RESPONSE');
  assert.equal(old.baseSha,'7c5612b5d35b35995998b53541421fe303bfbad9');
  assert.notEqual(old.evidence[0].id,old.evidence[1].id);
  assert.equal(old.evidence[0].eventKey,old.evidence[1].eventKey);
  for(const id of old.value.upReasonEvidenceIds)assert.ok(old.schema.upReasonEvidenceIds.items.enum.includes(id));
  assert.deepEqual(old.validation,{code:'REASON_DUPLICATE_EVENT',fieldName:'upReasonEvidenceIds',reasonIndex:1});
  const f=await loadReplayFixture(),schema=analysisSchema(f.pack),before=structuredClone(old.value);
  assert.ok(schema.properties.upReasonEvidenceIds.items.enum.includes('eia-stocks'));
  assert.ok(!schema.properties.upReasonEvidenceIds.items.enum.includes('eia-production'));
  assert.throws(()=>validateAnalysis(old.value,f.pack),e=>e.validationCode===old.validation.code&&e.reasonIndex===1);
  assert.deepEqual(old.value,before);
  const value={...structuredClone(old.value),upReasonEvidenceIds:['eia-stocks','market-brent']};
  const candidate=await replayCandidate(f.pack,value,f.now);
  assert.equal(coreForecastGate(candidate,f.pack,{now:new Date(f.now)}).gate,'PASS');
  assert.equal(publicEvidenceGate({forecast:candidate,evidencePack:f.pack},{now:new Date(f.now)}).gate,'PASS');
  assert.deepEqual(candidate.probabilities,old.value.probabilities);
});

test('one real representative per directional event retains every measurement and assessment',async()=>{
  const f=await loadReplayFixture(),before=structuredClone(f.pack),groups=reasonSelectionHints(f.pack),schema=analysisSchema(f.pack);
  for(const direction of ['UP','DOWN']) {
    const ids=groups[direction].map(g=>g.reasonEvidenceId);
    assert.deepEqual(schema.properties[direction==='UP'?'upReasonEvidenceIds':'downReasonEvidenceIds'].items.enum,ids);
    assert.equal(new Set(groups[direction].map(g=>g.eventKey)).size,ids.length);
    for(const group of groups[direction]) {
      const related=f.pack.signals.filter(s=>s.impact===direction&&s.eventKey===group.eventKey);
      assert.deepEqual(group.relatedEvidenceIds,related.map(s=>s.id));
      assert.ok(related.some(s=>s.id===group.reasonEvidenceId));
    }
  }
  assert.deepEqual(groups.UP.map(g=>g.reasonEvidenceId),['market-brent','eia-stocks']);
  const reordered=structuredClone(f.pack);reordered.signals.reverse();
  assert.equal(reasonSelectionHints(reordered).UP.find(g=>g.eventKey.startsWith('daily-spot')).reasonEvidenceId,'market-brent');
  assert.deepEqual(projectEvidence(f.pack).signals.map(s=>s.id),f.pack.signals.map(s=>s.id));
  assert.deepEqual(schema.properties.strengthAssessments.items.properties.evidenceId.enum,f.pack.signals.map(s=>s.id));
  assert.deepEqual(f.pack,before);
  // Existing importance selects the representative; these are synthetic variants, not real measurements.
  f.pack.signals.find(s=>s.id==='eia-stocks').importance='LOW';
  f.pack.signals.find(s=>s.id==='eia-production').importance='HIGH';
  assert.equal(reasonSelectionHints(f.pack).UP.find(g=>g.eventKey.startsWith('eia-weekly')).reasonEvidenceId,'eia-production');
  assert.doesNotThrow(()=>validateAnalysis(replayOutput(f.pack),f.pack));
});

for(const probabilities of [{DOWN:21,FLAT:16,UP:63},{DOWN:63,FLAT:16,UP:21}])
test(`independent event representatives pass both role projections: ${JSON.stringify(probabilities)}`,async()=>{
  const f=await loadReplayFixture(),value=replayOutput(f.pack,{probabilities});
  assert.equal(value.upReasonEvidenceIds.length,2);
  const candidate=await replayCandidate(f.pack,value,f.now);
  assert.equal(coreForecastGate(candidate,f.pack,{now:new Date(f.now)}).gate,'PASS');
  assert.deepEqual(candidate.probabilities,probabilities);
  assert.equal(validateForecastCache({...candidate,evidencePack:f.pack},{now:new Date(f.now)}).status,'LIVE');
});

test('the existing contract permits opposite directional measurements from the same structured event',async()=>{
  const f=await loadReplayFixture(),value=replayOutput(f.pack);
  value.upReasonEvidenceIds=['market-brent'];value.downReasonEvidenceIds=['market-diesel'];
  assert.equal(f.pack.signals.find(s=>s.id==='market-brent').eventKey,f.pack.signals.find(s=>s.id==='market-diesel').eventKey);
  const candidate=await replayCandidate(f.pack,value,f.now);
  assert.equal(coreForecastGate(candidate,f.pack,{now:new Date(f.now)}).gate,'PASS');
});

for(const [name,modify,code,index]of [
  ['same event with distinct IDs',v=>{v.upReasonEvidenceIds=['eia-stocks','eia-production'];},'REASON_DUPLICATE_EVENT',1],
  ['duplicate in counter pool beyond final two',v=>{v.probabilities={DOWN:63,FLAT:16,UP:21};v.upReasonEvidenceIds=['market-brent','eia-stocks','eia-production'];},'REASON_DUPLICATE_EVENT',2],
  ['opposite lower-probability pool still checked',v=>{v.probabilities={DOWN:63,FLAT:16,UP:21};v.upReasonEvidenceIds=['eia-stocks','eia-production'];},'REASON_DUPLICATE_EVENT',1],
  ['single known non-representative',v=>{v.upReasonEvidenceIds=['eia-production'];},'REASON_NOT_IN_EVENT_POOL',0],
  ['mixed wrong direction',v=>{v.upReasonEvidenceIds=['eia-stocks','market-diesel'];},'REASON_DIRECTION_MISMATCH',1],
  ['unknown ID',v=>{v.upReasonEvidenceIds=['outside-pack'];},'REASON_UNKNOWN_ID',0],
  ['duplicate representative',v=>{v.upReasonEvidenceIds=['eia-stocks','eia-stocks'];},'REASON_DUPLICATE_ID',1],
  ['malformed ID',v=>{v.upReasonEvidenceIds=[null];},'REASON_MALFORMED_ID',0],
  ['missing pool',v=>{delete v.upReasonEvidenceIds;},'QWEN_SCHEMA_INVALID',undefined],
  ['wrong list format',v=>{v.upReasonEvidenceIds='eia-stocks';},'REASON_LIST_INVALID',undefined],
  ['empty main pool',v=>{v.upReasonEvidenceIds=[];},'REASON_COUNT_INVALID',undefined],
  ['overlong pool',v=>{v.upReasonEvidenceIds=['eia-stocks','market-wti','eia-production','market-brent'];},'REASON_COUNT_INVALID',undefined],
])test(`event-safe pools still reject ${name}`,async()=>{
  const f=await loadReplayFixture(),value=replayOutput(f.pack);modify(value);
  assert.throws(()=>validateAnalysis(value,f.pack),e=>(e.validationCode??e.message)===code&&e.reasonIndex===index);
});

test('external event aliases cannot crowd out structured reasons; independent external events remain selectable',async()=>{
  const f=await loadReplayFixture(),p=externalPackage(f.now),scenario=externalScenario(f,{packageValue:p,role:null});
  const result=await scenario.run({mode:'REFRESH_CURRENT'});
  assert.equal(result.status,'CURRENT_READY');
  const pack=result.snapshot.evidencePack,external=pack.externalAnalystSignals[0];
  assert.ok(analysisSchema(pack).properties.upReasonEvidenceIds.items.enum.includes(external.evidenceId));
  const structured=pack.signals.find(s=>s.id==='eia-stocks');
  external.eventKey=structured.eventKey;
  const group=reasonSelectionHints(pack).UP.find(g=>g.eventKey===structured.eventKey);
  assert.equal(group.reasonEvidenceId,structured.id);
  assert.ok(group.relatedEvidenceIds.includes(external.evidenceId));
  assert.ok(!analysisSchema(pack).properties.upReasonEvidenceIds.items.enum.includes(external.evidenceId));
});
