import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createQwenProvider, validateAnalysis, projectEvidence, analysisSchema, reasonSelectionHints, REASON_CONTRACT_VERSION } from '../scripts/intelligence-v2/qwen-provider.mjs';
import { loadReplayFixture, replayOutput, replayProviderOptions, replayCandidate } from '../scripts/intelligence-v2/replay.mjs';
import { evidenceHashFor } from '../scripts/intelligence-v2/history.mjs';
import { runForecast } from '../scripts/intelligence-v2/run.mjs';
import { coreForecastGate, coreEvidenceGate } from '../dist/data/intelligence-v2-contract.js';
import { publicEvidenceGate } from '../dist/data/public-evidence.js';
import { forecastMarkup } from '../dist/data/intelligence-v2-view.js';

// Only the input SHAPE matches run 37253743267. Its original response/input were not retained.
const fixture=async()=>{const f=await loadReplayFixture();f.pack.newsDocuments=f.pack.newsDocuments.slice(0,1);return f;};
const failures=[
  ['unknown main identity',v=>v.mainReasonEvidenceIds=['outside-pack'],'REASON_UNKNOWN_ID','mainReasonEvidenceIds',0],
  ['unknown counter identity',v=>v.counterReasonEvidenceIds=['outside-pack'],'REASON_UNKNOWN_ID','counterReasonEvidenceIds',0],
  ['malformed identity',v=>v.mainReasonEvidenceIds=[{evidenceId:'eia-stocks'}],'REASON_MALFORMED_ID','mainReasonEvidenceIds',0],
  ['empty identity',v=>v.mainReasonEvidenceIds=[''],'REASON_MALFORMED_ID','mainReasonEvidenceIds',0],
  ['invalid list',v=>v.mainReasonEvidenceIds='eia-stocks','REASON_LIST_INVALID','mainReasonEvidenceIds',undefined],
  ['empty main list',v=>v.mainReasonEvidenceIds=[],'REASON_COUNT_INVALID','mainReasonEvidenceIds',undefined],
  ['too many main reasons',v=>v.mainReasonEvidenceIds=['eia-stocks','eia-production','market-wti','market-brent'],'REASON_COUNT_INVALID','mainReasonEvidenceIds',undefined],
  ['too many counter reasons',v=>v.counterReasonEvidenceIds=['market-diesel','market-diesel','market-diesel'],'REASON_COUNT_INVALID','counterReasonEvidenceIds',undefined],
  ['duplicate identity',v=>v.mainReasonEvidenceIds=['eia-stocks','eia-stocks'],'REASON_DUPLICATE_ID','mainReasonEvidenceIds',1],
  ['cross-array reuse',v=>v.counterReasonEvidenceIds=[v.mainReasonEvidenceIds[0]],'REASON_REUSED_ID','counterReasonEvidenceIds',0],
  ['wrong main direction',v=>v.mainReasonEvidenceIds=['market-diesel'],'REASON_DIRECTION_MISMATCH','mainReasonEvidenceIds',0],
  ['wrong counter direction',v=>v.counterReasonEvidenceIds=['market-brent'],'REASON_DIRECTION_MISMATCH','counterReasonEvidenceIds',0],
  ['repeated event',v=>v.mainReasonEvidenceIds=['eia-stocks','eia-production'],'REASON_DUPLICATE_EVENT','mainReasonEvidenceIds',1],
];
for(const [name,modify,code,field,index]of failures)test(`same-shape reason failure remains rejected with safe diagnosis: ${name}`,async()=>{
  const f=await fixture(),value=replayOutput(f.pack);modify(value);
  assert.throws(()=>validateAnalysis(value,f.pack),e=>e.message==='QWEN_REASON_INVALID'&&e.validationCode===code&&e.fieldName===field&&e.reasonIndex===index);
  let calls=0,audit;
  const options=replayProviderOptions(value,f.now),fakeFetch=options.fetchImpl;
  options.fetchImpl=async(...args)=>{calls++;return fakeFetch(...args);};options.onAudit=a=>{audit=a;};
  await assert.rejects(createQwenProvider(options).generateForecast({evidencePack:f.pack,evidenceHash:evidenceHashFor(f.pack),now:new Date(f.now)}),/QWEN_REASON_INVALID/);
  assert.equal(calls,1);assert.equal(audit.attemptCount,1);assert.equal(audit.status,'FAILED');
  assert.equal(audit.validationStage,'CORE_FORECAST');assert.equal(audit.validationCode,code);
  assert.equal(audit.legacyValidationCode,'QWEN_REASON_INVALID');assert.equal(audit.fieldName,field);assert.equal(audit.reasonIndex,index);
  assert.match(audit.outputHash,/^[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(audit),/Authorization|Bearer|DASHSCOPE_API_KEY|outside-pack|eia-stocks|strengthAssessments|newsDocuments|"content"/);
  for(const d of f.pack.newsDocuments)for(const s of d.segments)assert.ok(!JSON.stringify(audit).includes(s.text));
});

test('neutral signals are excluded from directional choices and retain a precise rejection',async()=>{
  const f=await fixture(),value=replayOutput(f.pack);f.pack.signals.find(s=>s.id==='eia-stocks').impact='NEUTRAL';value.mainReasonEvidenceIds=['eia-stocks'];
  assert.throws(()=>validateAnalysis(value,f.pack),e=>e.validationCode==='REASON_NEUTRAL_SIGNAL');
  assert.ok(!JSON.stringify(reasonSelectionHints(f.pack)).includes('eia-stocks'));
});

test('selection prompt mirrors existing IDs/direction/event rules without excluding optional news or changing the input',async()=>{
  const f=await fixture(),original=structuredClone(f.pack),projected=projectEvidence(f.pack),groups=reasonSelectionHints(f.pack);
  assert.equal(projected.signals.length,6);assert.equal(projected.newsDocuments.length,1);
  for(const direction of ['UP','DOWN']) {
    assert.equal(new Set(groups[direction].map(g=>g.eventKey)).size,groups[direction].length);
    for(const g of groups[direction])assert.deepEqual(g.chooseAtMostOneFrom,projected.signals.filter(s=>s.impact===direction&&s.eventKey===g.eventKey).map(s=>s.id));
  }
  let request;
  const value=replayOutput(f.pack,{newsCount:1});value.mainReasonEvidenceIds.push(value.newsAssessments[0].evidenceId);
  const options=replayProviderOptions(value,f.now),fakeFetch=options.fetchImpl;
  options.fetchImpl=async(u,r)=>{request=JSON.parse(r.body);return fakeFetch(u,r);};
  const candidate=await createQwenProvider(options).generateForecast({evidencePack:f.pack,evidenceHash:evidenceHashFor(f.pack),now:new Date(f.now)});
  const prompt=request.messages[0].content;
  assert.match(prompt,/otherwiseIncludingTie/);assert.ok(prompt.includes(JSON.stringify(groups.UP)));
  assert.match(prompt,/仅限制结构化signal理由/);assert.match(prompt,/不排除.*新闻或外部情报ID/);
  assert.match(prompt,/理由选择不改变新闻展示资格/);
  assert.equal(request.max_tokens,undefined);assert.equal(request.tools,undefined);
  assert.deepEqual(JSON.parse(request.messages[1].content.slice(request.messages[1].content.indexOf('\n')+1)),projected);
  assert.deepEqual(request.response_format.json_schema.schema,analysisSchema(f.pack));
  assert.ok(candidate.promptVersion.endsWith(`-${REASON_CONTRACT_VERSION}`));
  assert.ok(candidate.mainReasons.some(r=>r.evidenceId===value.newsAssessments[0].evidenceId));
  assert.equal(coreForecastGate(candidate,f.pack,{now:new Date(f.now)}).gate,'PASS');
  assert.equal(coreForecastGate({...candidate,promptVersion:'unapproved-reason-contract'},f.pack,{now:new Date(f.now)}).gate,'FAIL');
  assert.equal(publicEvidenceGate({forecast:candidate,evidencePack:f.pack},{now:new Date(f.now)}).gate,'PASS');
  assert.match(forecastMarkup({...candidate,evidencePack:f.pack},{now:new Date(f.now)}),/AI综合估计/);
  assert.deepEqual(f.pack,original);
});

test('unselected accepted news remains in the assessment collection; selection does not delete materials',async()=>{
  const f=await fixture(),value=replayOutput(f.pack,{newsCount:1});
  const candidate=await replayCandidate(f.pack,value,new Date(f.now));
  assert.equal(candidate.newsAssessments.length,1);
  assert.ok(!candidate.mainReasons.some(r=>r.evidenceId===value.newsAssessments[0].evidenceId));
  assert.equal(f.pack.newsDocuments.length,1);
});

test('legal UP, DOWN and tie reasons pass without probability repair; invalid output leaves cache/history intact',async()=>{
  const f=await fixture();assert.equal(coreEvidenceGate(f.pack,{now:new Date(f.now)}).gate,'PASS');
  for(const probabilities of [{DOWN:21,FLAT:16,UP:63},{DOWN:63,FLAT:16,UP:21},{DOWN:40,FLAT:20,UP:40}]) {
    const value=replayOutput(f.pack,{probabilities}),candidate=await replayCandidate(f.pack,value,new Date(f.now));
    assert.deepEqual(candidate.probabilities,probabilities);assert.equal(coreForecastGate(candidate,f.pack,{now:new Date(f.now)}).gate,'PASS');
  }
  const root=await mkdtemp(join(tmpdir(),'qwen-reason-lkg-'));
  try {
    const historyDirectory=join(root,'history'),cachePath=join(root,'cache.json');await mkdir(historyDirectory);
    const candidate=await replayCandidate(f.pack,replayOutput(f.pack),new Date(f.now));
    const prior=JSON.stringify({...candidate,evidencePack:f.pack});await writeFile(cachePath,prior);await writeFile(join(historyDirectory,'accepted.json'),prior);
    const value=replayOutput(f.pack);value.mainReasonEvidenceIds=['outside-pack'];
    let calls=0;const options=replayProviderOptions(value,f.now),fakeFetch=options.fetchImpl;options.fetchImpl=async(...args)=>{calls++;return fakeFetch(...args);};
    await assert.rejects(runForecast({pack:f.pack,provider:'QWEN',historyDirectory,cachePath,now:new Date(f.now),providerOptions:options}),/QWEN_REASON_INVALID/);
    assert.equal(calls,1);assert.equal(await readFile(cachePath,'utf8'),prior);
    assert.deepEqual(await readdir(historyDirectory),['accepted.json']);assert.equal(await readFile(join(historyDirectory,'accepted.json'),'utf8'),prior);
  }finally{await rm(root,{recursive:true,force:true});}
});
