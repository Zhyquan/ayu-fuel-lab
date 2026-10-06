import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadReplayFixture, replayOutput, replayCandidate } from '../scripts/intelligence-v2/replay.mjs';
import { analysisSchema, projectEvidence, projectReasonPools, validateAnalysis, qwenSchemaCompatibilityGate, REASON_CONTRACT_VERSION } from '../scripts/intelligence-v2/qwen-provider.mjs';
import { coreEvidenceGate, coreForecastGate, newsEnrichmentGate, primaryDirectionFor, validateForecastCache } from '../dist/data/intelligence-v2-contract.js';
import { externalPackage, externalScenario } from './fixtures/external-signal-scenario.mjs';
import { publicEvidenceGate } from '../dist/data/public-evidence.js';

test('frozen pre-patch constructed counterexample records the old schema/validator gap, not the original answer',async()=>{
  const old=JSON.parse(await readFile(new URL('./fixtures/old-direction-contract-counterexample.json',import.meta.url),'utf8'));
  assert.equal(old.fixtureKind,'CONSTRUCTED_COUNTEREXAMPLE_NOT_ORIGINAL_QWEN_RESPONSE');
  assert.equal(old.baseSha,'9c1bc31319be8d98bd2a1794bbf6e08531ac0bea');
  assert.equal(old.knownImpact,'DOWN');assert.equal(old.knownId,old.value.mainReasonEvidenceIds[0]);
  assert.ok(old.value.probabilities.UP>old.value.probabilities.DOWN);
  for(const key of ['mainReasonEvidenceIds','counterReasonEvidenceIds']) {
    assert.deepEqual(old.schema.properties[key].items,old.schema.properties.mainReasonEvidenceIds.items);
    for(const id of old.value[key])assert.ok(old.schema.properties[key].items.enum.includes(id));
  }
  assert.deepEqual(old.validation,{code:'REASON_DIRECTION_MISMATCH',fieldName:'mainReasonEvidenceIds',reasonIndex:0});
  const f=await loadReplayFixture();assert.throws(()=>validateAnalysis(old.value,f.pack),/QWEN_SCHEMA_INVALID/);
});

test('V2 schema partitions known UP/DOWN IDs and excludes NEUTRAL and news from both pools',async()=>{
  const f=await loadReplayFixture();f.pack.signals.find(s=>s.id==='eia-production').impact='NEUTRAL';
  const schema=analysisSchema(f.pack);
  assert.equal(qwenSchemaCompatibilityGate(schema).gate,'PASS');assert.equal(schema.additionalProperties,false);
  assert.ok(!Object.hasOwn(schema.properties,'mainReasonEvidenceIds'));assert.ok(!Object.hasOwn(schema.properties,'counterReasonEvidenceIds'));
  for(const [field,direction]of [['upReasonEvidenceIds','UP'],['downReasonEvidenceIds','DOWN']]) {
    assert.deepEqual(schema.properties[field].items.enum,f.pack.signals.filter(s=>s.impact===direction).map(s=>s.id));
    assert.ok(!schema.properties[field].items.enum.includes('eia-production'));
    assert.ok(schema.properties[field].items.enum.every(id=>!id.includes(':')));
  }
  assert.ok(!schema.properties.upReasonEvidenceIds.items.enum.includes('market-diesel'));
  assert.ok(!schema.properties.downReasonEvidenceIds.items.enum.includes('market-brent'));
  const value=replayOutput(f.pack);assert.doesNotThrow(()=>validateAnalysis(value,f.pack));
  for(const field of ['upReasonEvidenceIds','downReasonEvidenceIds']) {
    const wrong=structuredClone(value);wrong[field]=['eia-production'];
    assert.throws(()=>validateAnalysis(wrong,f.pack),e=>e.validationCode==='REASON_NEUTRAL_SIGNAL');
  }
});

for(const [field,id,index]of [['upReasonEvidenceIds','market-diesel',0],['downReasonEvidenceIds','market-brent',0],['upReasonEvidenceIds','market-diesel',2]])
test(`wrong-direction ID is excluded by schema and still rejected locally: ${field}/${index}`,async()=>{
  const f=await loadReplayFixture(),value=replayOutput(f.pack),schema=analysisSchema(f.pack);
  assert.ok(!schema.properties[field].items.enum.includes(id));
  value[field]=index?[...value[field],id]:[id];
  assert.throws(()=>validateAnalysis(value,f.pack),e=>e.validationCode==='REASON_DIRECTION_MISMATCH'&&e.fieldName===field&&e.reasonIndex===index);
});

for(const probabilities of [{DOWN:21,FLAT:16,UP:63},{DOWN:63,FLAT:16,UP:21},{DOWN:40,FLAT:20,UP:40}])
test(`known-direction pools project deterministically without probability repair: ${JSON.stringify(probabilities)}`,async()=>{
  const f=await loadReplayFixture(),value=replayOutput(f.pack,{probabilities}),original=structuredClone(value),roles=projectReasonPools(value);
  const primary=primaryDirectionFor(probabilities),up=primary==='UP';
  assert.deepEqual(roles.mainReasonEvidenceIds,(up?value.upReasonEvidenceIds:value.downReasonEvidenceIds).slice(0,3));
  assert.deepEqual(roles.counterReasonEvidenceIds,(up?value.downReasonEvidenceIds:value.upReasonEvidenceIds).slice(0,2));
  const candidate=await replayCandidate(f.pack,value,f.now);
  assert.equal(candidate.primaryDirection,primary);assert.deepEqual(candidate.probabilities,probabilities);assert.deepEqual(value,original);
  assert.deepEqual(candidate.mainReasons.map(r=>r.evidenceId),roles.mainReasonEvidenceIds);
  assert.deepEqual(candidate.counterReasons.map(r=>r.evidenceId),roles.counterReasonEvidenceIds);
  assert.equal(coreForecastGate(candidate,f.pack,{now:new Date(f.now)}).gate,'PASS');
  for(const key of ['upReasonEvidenceIds','downReasonEvidenceIds','newsReasonEvidenceIds'])assert.ok(!Object.hasOwn(candidate,key));
  for(const version of ['qwen-forecast-core-v1-integer-1pct','qwen-forecast-core-v1-integer-1pct-reason-selection-v1',candidate.promptVersion])
    assert.equal(validateForecastCache({...candidate,promptVersion:version,evidencePack:f.pack},{now:new Date(f.now)}).status,'LIVE');
  const bad=structuredClone(candidate);bad.mainReasons[0]=bad.counterReasons[0];
  assert.equal(coreForecastGate(bad,f.pack,{now:new Date(f.now)}).gate,'FAIL');
  assert.equal(REASON_CONTRACT_VERSION,'direction-pools-v2');
});

test('priority projection validates the entire pool first, then retains at most 3 main / 2 counter',async()=>{
  const f=await loadReplayFixture();
  // Explicit synthetic independent event; not an assertion about an actual EIA release.
  f.pack.signals.find(s=>s.id==='eia-refinery-inputs').eventKey='synthetic-independent-refinery';
  assert.equal(coreEvidenceGate(f.pack,{now:new Date(f.now)}).gate,'PASS');
  for(const probabilities of [{DOWN:21,FLAT:16,UP:63},{DOWN:63,FLAT:16,UP:21}]) {
    const value=replayOutput(f.pack,{probabilities});value.upReasonEvidenceIds=['eia-refinery-inputs','market-brent','eia-stocks'];
    const candidate=await replayCandidate(f.pack,value,f.now);
    const selected=candidate.primaryDirection==='UP'?candidate.mainReasons:candidate.counterReasons;
    assert.deepEqual(selected.map(r=>r.evidenceId),value.upReasonEvidenceIds.slice(0,candidate.primaryDirection==='UP'?3:2));
    assert.ok(candidate.mainReasons.length<=3&&candidate.counterReasons.length<=2);
    const wrong=structuredClone(value);wrong.upReasonEvidenceIds[2]='market-diesel';
    assert.throws(()=>validateAnalysis(wrong,f.pack),e=>e.validationCode==='REASON_DIRECTION_MISMATCH'&&e.reasonIndex===2);
    const overflow=structuredClone(value);overflow.upReasonEvidenceIds.push('market-wti');
    assert.throws(()=>validateAnalysis(overflow,f.pack),e=>e.validationCode==='REASON_COUNT_INVALID');
  }
});

test('an empty directional universe is constrained to the empty array, without widening its ID enum',async()=>{
  const f=await loadReplayFixture();for(const signal of f.pack.signals)signal.impact='UP';
  const schema=analysisSchema(f.pack);assert.deepEqual(schema.properties.downReasonEvidenceIds.enum,[[]]);
  assert.equal(qwenSchemaCompatibilityGate(schema).gate,'PASS');
  const value=replayOutput(f.pack);assert.deepEqual(value.downReasonEvidenceIds,[]);
  assert.doesNotThrow(()=>validateAnalysis(value,f.pack));
  const candidate=await replayCandidate(f.pack,value,f.now);assert.deepEqual(candidate.counterReasons,[]);
  value.downReasonEvidenceIds=['market-diesel'];assert.throws(()=>validateAnalysis(value,f.pack),e=>e.validationCode==='REASON_DIRECTION_MISMATCH');
});

for(const direction of ['UP','DOWN','NEUTRAL'])test(`External frozen direction has the same schema/local restriction: ${direction}`,async()=>{
  const f=await loadReplayFixture(),p=externalPackage(f.now);p.signals[0].direction=direction;
  const scenario=externalScenario(f,{packageValue:p,role:null}),result=await scenario.run({mode:'REFRESH_CURRENT'});
  assert.equal(result.status,'CURRENT_READY');
  const pack=result.snapshot.evidencePack,id=pack.externalAnalystSignals[0].evidenceId,schema=analysisSchema(pack);
  for(const [field,impact]of [['upReasonEvidenceIds','UP'],['downReasonEvidenceIds','DOWN']]) {
    assert.equal(schema.properties[field].items.enum.includes(id),direction===impact);
    if(direction!==impact){const value=replayOutput(pack);value[field].push(id);assert.throws(()=>validateAnalysis(value,pack),e=>['REASON_DIRECTION_MISMATCH','REASON_NEUTRAL_SIGNAL'].includes(e.validationCode));}
  }
});

test('news roles use validated assessment impact; LOW assessments remain independently available',async()=>{
  const f=await loadReplayFixture();
  for(const direction of ['UP','DOWN','NEUTRAL']) {
    const value=replayOutput(f.pack,{newsCount:1,strength:'LOW'}),id=value.newsAssessments[0].evidenceId;
    value.newsAssessments[0].impact=direction;
    const unselected=await replayCandidate(f.pack,value,f.now);assert.equal(unselected.newsAssessments[0].strength,'LOW');
    assert.ok(![...unselected.mainReasons,...unselected.counterReasons].some(r=>r.evidenceId===id));
    value.newsReasonEvidenceIds=[id];
    const candidate=await replayCandidate(f.pack,value,f.now),cards=publicEvidenceGate({forecast:candidate,evidencePack:f.pack},{now:new Date(f.now)});
    assert.equal(cards.gate,'PASS');assert.equal(candidate.newsAssessments.length,1);
    assert.equal(cards.cards.some(c=>c.evidenceId===id),direction!=='NEUTRAL');
    if(direction!=='NEUTRAL')assert.ok((direction==='UP'?candidate.mainReasons:candidate.counterReasons).some(r=>r.evidenceId===id));
    const malformed=structuredClone(value);malformed.newsAssessments[0].title='';
    const core=await replayCandidate(f.pack,malformed,f.now);assert.equal(coreForecastGate(core,f.pack,{now:new Date(f.now)}).gate,'PASS');
    assert.ok(![...core.mainReasons,...core.counterReasons].some(r=>r.evidenceId===id));
  }
});

for(const [name,change,code]of [
  ['missing collection',v=>{delete v.newsReasonEvidenceIds;},'NEWS_REASON_COLLECTION_INVALID'],
  ['non-array collection',v=>{v.newsReasonEvidenceIds='invalid';},'NEWS_REASON_COLLECTION_INVALID'],
  ['overflow collection',v=>{v.newsReasonEvidenceIds=Array(4).fill(v.newsAssessments[0].evidenceId);},'NEWS_REASON_COLLECTION_INVALID'],
  ['unknown identity',v=>{v.newsReasonEvidenceIds=['br-999999:s1-000000000000'];},'NEWS_REASON_NOT_ASSESSED'],
  ['duplicate identity',v=>{v.newsReasonEvidenceIds=Array(2).fill(v.newsAssessments[0].evidenceId);},'NEWS_REASON_DUPLICATE_EVENT'],
])test(`invalid optional news reasons fail their Gate, retain assessments, and cannot kill Core: ${name}`,async()=>{
  const f=await loadReplayFixture(),value=replayOutput(f.pack,{newsCount:1,strength:'LOW'});change(value);
  assert.doesNotThrow(()=>validateAnalysis(value,f.pack));
  const news=newsEnrichmentGate({...value,...projectReasonPools(value)},f.pack);
  assert.equal(news.gate,'FAIL');assert.ok(news.errors.includes(code));assert.equal(news.newsAssessments.length,1);
  const candidate=await replayCandidate(f.pack,value,f.now);
  assert.equal(candidate.coverageMode,'LIMITED');assert.equal(candidate.newsAssessments[0].strength,'LOW');
  assert.equal(coreForecastGate(candidate,f.pack,{now:new Date(f.now)}).gate,'PASS');
  const ids=[...candidate.mainReasons,...candidate.counterReasons].map(r=>r.evidenceId);
  assert.equal(new Set(ids).size,ids.length);assert.ok(!ids.includes('br-999999:s1-000000000000'));
});

test('six structured signals and four synthetic news documents replay the latest production input shape',async()=>{
  const f=await loadReplayFixture(),extra=structuredClone(f.pack.newsDocuments[0]);
  // Shape only: not the lost answer or a reconstruction of the actual news packet.
  extra.documentId='br-987657';extra.sourceUrl='https://www.brecorder.com/news/987657/synthetic-direction-contract-fixture';
  f.pack.newsDocuments.push(extra);
  const input=projectEvidence(f.pack),evidence=coreEvidenceGate(f.pack,{now:new Date(f.now)});
  assert.equal(input.signals.length,6);assert.equal(input.newsDocuments.length,4);
  assert.equal(evidence.gate,'PASS');assert.equal(evidence.coverageMode,'NORMAL');
  const value=replayOutput(f.pack,{probabilities:{DOWN:63,FLAT:16,UP:21},newsCount:3});
  value.newsReasonEvidenceIds=[value.newsAssessments[0].evidenceId];
  assert.equal(qwenSchemaCompatibilityGate(analysisSchema(f.pack)).gate,'PASS');
  const candidate=await replayCandidate(f.pack,value,f.now);
  assert.equal(coreForecastGate(candidate,f.pack,{now:new Date(f.now)}).gate,'PASS');
  assert.equal(publicEvidenceGate({forecast:candidate,evidencePack:f.pack},{now:new Date(f.now)}).gate,'PASS');
  assert.deepEqual(candidate.probabilities,value.probabilities);assert.equal(candidate.coverageMode,'NORMAL');
});
