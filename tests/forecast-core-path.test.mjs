import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { coreEvidenceGate, coreForecastGate, newsEnrichmentGate, canonicalJson } from '../dist/data/intelligence-v2-contract.js';
import { publicEvidenceGate } from '../dist/data/public-evidence.js';
import { publicEvidenceMarkup } from '../dist/data/public-evidence-view.js';
import { forecastMarkup } from '../dist/data/intelligence-v2-view.js';
import { readForecast } from '../dist/data/intelligence-v2-service.js';
import { createQwenProvider, projectEvidence, validateAnalysis, analysisSchema, qwenSchemaCompatibilityGate } from '../scripts/intelligence-v2/qwen-provider.mjs';
import { evidenceHashFor } from '../scripts/intelligence-v2/history.mjs';
import { runForecast } from '../scripts/intelligence-v2/run.mjs';
import { runOfficialDaily, INDEX_PATH, PROVIDER_AUDIT_PATH } from '../scripts/intelligence-v2/official-daily.mjs';
import { verifyGenerated } from '../scripts/intelligence-v2/commit-official-daily.mjs';
import { dailyDeliveryReady } from '../scripts/intelligence-v2/pages-delivery-ready.mjs';
import { loadReplayFixture, replayOutput, replayCandidate, replayProviderOptions, runReplay, runContractFuzz } from '../scripts/intelligence-v2/replay.mjs';

const fixture=await loadReplayFixture(),now=new Date(fixture.now);
const setup=()=>({pack:structuredClone(fixture.pack),now});

for(const [name,change,code] of [
  ['empty assessments',v=>{v.newsAssessments=[];},null],
  ['unknown news evidence',v=>{v.newsAssessments[0].evidenceId='br-000000:s1-000000000000';},'NEWS_EVIDENCE_ID_UNKNOWN'],
  ['invalid title',v=>{v.newsAssessments[0].title='';},'NEWS_TITLE_INVALID'],
  ['invented summary number',v=>{v.newsAssessments[0].summary='柴油供应变化99%。';},'NEWS_NEW_NUMBER'],
  ['duplicate document', (v,p)=>{v.newsAssessments.push({...v.newsAssessments[0],evidenceId:`${p.newsDocuments[0].documentId}:${p.newsDocuments[0].segments[1].segmentId}`});},'NEWS_DUPLICATE_DOCUMENT'],
  ['all news invalid',v=>{for(const a of v.newsAssessments)a.title='';},'NEWS_TITLE_INVALID'],
  ['malformed news array',v=>{v.newsAssessments={bad:true};},'NEWS_ASSESSMENTS_INVALID'],
  ['missing optional field',v=>{delete v.newsAssessments;},'NEWS_ASSESSMENTS_INVALID'],
  ['conditional FACT',(v,p)=>{v.newsAssessments[0].evidenceId=`${p.newsDocuments[0].documentId}:${p.newsDocuments[0].segments[2].segmentId}`;v.newsAssessments[0].kind='FACT';},'NEWS_FACT_FROM_CONDITIONAL_SEGMENT'],
  ['forged model source',v=>{v.newsAssessments[0].sourceUrl='https://example.com/forged';},'NEWS_ASSESSMENT_FIELDS_INVALID'],
])test(`core forecast survives optional news: ${name}`,async()=>{
  const {pack}=setup(),value=replayOutput(pack,{newsCount:1});change(value,pack);
  if(name!=='empty assessments')value.mainReasonEvidenceIds.push(`${pack.newsDocuments[0].documentId}:${pack.newsDocuments[0].segments[0].segmentId}`);
  const frozen=canonicalJson(pack),p=structuredClone(value.probabilities);
  assert.doesNotThrow(()=>validateAnalysis(value,pack));
  const news=newsEnrichmentGate(value,pack);
  if(code){assert.equal(news.gate,'FAIL');assert.ok(news.errors.includes(code));}
  const candidate=await replayCandidate(pack,value,now);
  assert.equal(coreForecastGate(candidate,pack,{now,expectedEvidenceHash:evidenceHashFor(pack)}).gate,'PASS');
  assert.deepEqual(candidate.probabilities,p);assert.equal(canonicalJson(pack),frozen);
  assert.equal(candidate.coverageMode,code?'LIMITED':'NORMAL');
  const cache={...candidate,evidencePack:pack};
  const readback=await readForecast({now,fetchImpl:async()=>new Response(JSON.stringify(cache))});
  assert.equal(readback.status,'LIVE');assert.equal(publicEvidenceGate({forecast:candidate,evidencePack:pack},{now}).gate,'PASS');
  const html=forecastMarkup(readback,{now})+publicEvidenceMarkup(readback,{now});
  assert.match(html,/偏涨/);assert.match(html,/35%/);assert.match(html,/25%/);assert.match(html,/40%/);assert.match(html,/查看来源/);
  assert.doesNotMatch(html,/系统失败|暂时无法展示/);
  if(name==='all news invalid'||name==='invalid title'||name==='invented summary number')assert.equal(candidate.newsAssessments.length,0);
});

test('a valid news card remains when another optional news card is dropped',async()=>{
  const {pack}=setup(),value=replayOutput(pack,{newsCount:3});value.newsAssessments[1].summary='编造99%变化。';
  value.mainReasonEvidenceIds.push(value.newsAssessments[0].evidenceId);
  value.counterReasonEvidenceIds.push(value.newsAssessments[1].evidenceId);
  const candidate=await replayCandidate(pack,value,now);
  assert.equal(candidate.newsAssessments.length,2);assert.equal(candidate.counterReasons.length,1);assert.equal(candidate.coverageMode,'LIMITED');
  const cards=publicEvidenceGate({forecast:candidate,evidencePack:pack},{now}).cards;
  assert.ok(cards.some(c=>c.evidenceId===value.newsAssessments[0].evidenceId));
  assert.ok(!cards.some(c=>c.evidenceId===value.newsAssessments[1].evidenceId));
});

test('post-generation optional news corruption cannot block core browser readback or project unsafe cards',async()=>{
  const {pack}=setup(),value=replayOutput(pack,{newsCount:1});value.mainReasonEvidenceIds.push(value.newsAssessments[0].evidenceId);
  const candidate=await replayCandidate(pack,value,now),id=value.newsAssessments[0].evidenceId;
  for(const mutate of [c=>{c.newsAssessments[0].sourceUrl='https://example.com/forged';},c=>{c.newsAssessments[0].title='';},c=>{c.mainReasons.find(r=>r.evidenceId===id).text='伪造标题';}]){
    const c=structuredClone(candidate);mutate(c);
    assert.equal(coreForecastGate(c,pack,{now}).gate,'PASS');assert.equal(newsEnrichmentGate(c,pack,{mode:'FORECAST'}).gate,'FAIL');
    const cache={...c,evidencePack:pack};assert.equal((await readForecast({now,fetchImpl:async()=>new Response(JSON.stringify(cache))})).status,'LIVE');
    assert.ok(!publicEvidenceGate({forecast:c,evidencePack:pack},{now}).cards.some(card=>card.evidenceId===id));
  }
});

test('an excluded duplicate document cannot overwrite the admitted original source in public projection',async()=>{
  const {pack}=setup(),value=replayOutput(pack,{newsCount:1});value.mainReasonEvidenceIds.push(value.newsAssessments[0].evidenceId);
  pack.newsDocuments.push({...structuredClone(pack.newsDocuments[0]),sourceUrl:'https://example.com/forged'});
  const candidate=await replayCandidate(pack,value,now);
  assert.equal(candidate.coverageMode,'LIMITED');assert.equal(coreForecastGate(candidate,pack,{now}).gate,'PASS');
  const card=publicEvidenceGate({forecast:candidate,evidencePack:pack},{now}).cards.find(c=>c.evidenceId===value.newsAssessments[0].evidenceId);
  assert.equal(card.sourceUrl,pack.newsDocuments[0].sourceUrl);
});

for(const [name,mutate]of [
  ['failed news channels',p=>{p.newsDocuments=[];}],
  ['unread or malformed news',p=>{p.newsDocuments=[null,{documentId:'br-987654',segments:{}}];}],
  ['forged news author',p=>{p.newsDocuments[0].authorName='Unverified';}],
  ['future news date',p=>{p.newsDocuments[0].publishedAt='2026-10-01T03:00:00Z';}],
  ['advertisement segment',p=>{p.newsDocuments[0].segments[0].text='ADVERTISEMENT: synthetic oil promotion text only.';}],
])test(`valid core with ${name} stays available and transparently LIMITED`,async()=>{
  const {pack}=setup();mutate(pack);pack.coverageMode='NORMAL';
  const gate=coreEvidenceGate(pack,{now});assert.equal(gate.gate,'PASS');assert.equal(gate.coverageMode,'LIMITED');
  const input=projectEvidence(pack);assert.equal(input.signals.length,6);
  const value=replayOutput({...pack,newsDocuments:[]}),candidate=await replayCandidate(pack,value,now);
  assert.equal(candidate.coverageMode,'LIMITED');assert.equal(coreForecastGate(candidate,pack,{now}).gate,'PASS');
  assert.equal(publicEvidenceGate({forecast:candidate,evidencePack:pack},{now}).gate,'PASS');
});

test('unknown or duplicate news reasons are dropped without replacing structured reasons',async()=>{
  const {pack}=setup(),value=replayOutput(pack,{newsCount:1});
  value.mainReasonEvidenceIds.push(value.newsAssessments[0].evidenceId,value.newsAssessments[0].evidenceId,'br-999999:s1-000000000000');
  const candidate=await replayCandidate(pack,value,now);
  assert.equal(coreForecastGate(candidate,pack,{now}).gate,'PASS');assert.equal(candidate.mainReasons.length,3);
  assert.equal(candidate.coverageMode,'LIMITED');
  const invalid=structuredClone(value);invalid.mainReasonEvidenceIds=invalid.mainReasonEvidenceIds.filter(id=>id.includes(':'));
  assert.throws(()=>validateAnalysis(invalid,pack),/QWEN_REASON_INVALID/);
});

test('tampered frozen evidence is rejected before fake transport and browser hash readback rejects it',async()=>{
  const {pack}=setup(),value=replayOutput(pack),provider=createQwenProvider(replayProviderOptions(value,now));
  await assert.rejects(provider.generateForecast({evidencePack:pack,evidenceHash:'0'.repeat(64),now}),/EVIDENCE_HASH_MISMATCH/);
  assert.equal(provider.lastRun,null);
  const candidate=await replayCandidate(pack,value,now);pack.signals[0].fact+=' synthetic tampering';
  assert.equal((await readForecast({now,fetchImpl:async()=>new Response(JSON.stringify({...candidate,evidencePack:pack}))})).reason,'EVIDENCE_HASH_MISMATCH');
});

test('the production run writer publishes core-only results to an isolated cache when all news fails',async()=>{
  const {pack}=setup(),value=replayOutput(pack,{newsCount:3});for(const a of value.newsAssessments)a.title='';
  const root=await mkdtemp(join(tmpdir(),'ayu-news-drop-delivery-'));
  try {
    for(const dir of ['intelligence-v2','dist/data','data/forecast-history-v2'])await mkdir(join(root,dir),{recursive:true});
    const sourceCommit='b'.repeat(40),before={schemaVersion:1,entries:[],legacyHistory:[]},evidenceGate=coreEvidenceGate(pack,{now});
    for(const [path,data]of [[INDEX_PATH,before],['CURRENT_EVIDENCE_V2.json',pack],['intelligence-v2/current-evidence.json',pack],['intelligence-v2/EVIDENCE_GATE_RESULT.json',evidenceGate],['intelligence-v2/pending-intelligence-pack.json',{evidenceGate,evidencePack:pack}]])await writeFile(join(root,path),JSON.stringify(data));
    const result=await runOfficialDaily({root,pack,sourceCommit,clock:()=>now,providerOptions:replayProviderOptions(value,now)});
    assert.equal(result.published,true);
    const cache=JSON.parse(await readFile(join(root,'dist/data/forecast-cache.json'),'utf8'));
    assert.equal(cache.coverageMode,'LIMITED');assert.equal(cache.newsAssessments.length,0);
    assert.equal((await readForecast({now,fetchImpl:async()=>new Response(JSON.stringify(cache))})).status,'LIVE');
    await assert.rejects(verifyGenerated(root,before,{sourceCommit,now}),/OFFICIAL_PROVIDER_AUDIT_INVALID/);
    // Only the audit shape is substituted in this disposable test tree, never production data.
    const audit=JSON.parse(await readFile(join(root,PROVIDER_AUDIT_PATH),'utf8'));await writeFile(join(root,PROVIDER_AUDIT_PATH),JSON.stringify({...audit,mock:false}));
    await verifyGenerated(root,before,{sourceCommit,now});
    assert.equal((await dailyDeliveryReady({root,triggerHeadSha:sourceCommit,runCreatedAt:fixture.now,now,commitSubject:`data: Official Daily ${result.entry.forecastDate} ${result.entry.forecastId.slice(0,12)}`})).ready,true);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('a card projection failure does not fail the production core runner and renders no empty/error card',async()=>{
  const {pack}=setup(),value=replayOutput(pack);value.mainReasonEvidenceIds=['market-wti'];
  pack.signals.find(s=>s.id==='market-wti').displayText='合成结构化标题'.repeat(5);
  pack.signals.find(s=>s.id==='market-diesel').displayText='合成结构化标题'.repeat(5);
  // Core source copy is valid, but exceeds the public card's shorter display bound.
  const result=await runForecast({pack,provider:'QWEN',now,providerOptions:replayProviderOptions(value,now),persist:false});
  assert.equal(result.gate.gate,'PASS');assert.equal(result.candidate.status,'LIVE');
  const cache={...result.candidate,evidencePack:pack};assert.match(forecastMarkup(cache,{now}),/偏涨/);
  assert.equal(result.publicEvidence.gate,'FAIL');
  assert.ok(result.publicEvidence.excluded.some(x=>x.reason==='NO_SAFE_PUBLIC_COPY'));
  assert.equal(publicEvidenceMarkup(cache,{now}),'');
  assert.doesNotMatch(publicEvidenceMarkup(cache,{now}),/暂时无法展示|系统失败/);
});

test('core structured schema and current replay fixture share the production validators',()=>{
  const {pack}=setup(),schema=analysisSchema(pack);assert.equal(qwenSchemaCompatibilityGate(schema).gate,'PASS');
  assert.equal(schema.additionalProperties,false);
  assert.equal(schema.properties.strengthAssessments.items.properties.evidenceId.enum.length,6);
  assert.ok(schema.properties.mainReasonEvidenceIds.items.enum.includes('market-diesel'));
  assert.deepEqual(Object.keys(schema.properties.newsAssessments.items.properties),['evidenceId','impact','kind','title','summary','strength']);
});

test('local end-to-end replay includes immutable history, Pages readback and the actual public scanner',async()=>{
  const result=await runReplay();assert.equal(result.gate,'PASS');assert.equal(result.realQwenCalls,0);assert.equal(result.mockAuditRejected,true);
});
test('fixed-seed contract suite covers 192 valid combinations and 25 invalid core cases',async()=>{
  const result=await runContractFuzz();assert.equal(result.gate,'PASS');assert.equal(result.legalCases,192);assert.equal(result.illegalCases,25);
  assert.deepEqual(result.coverage.mainCounts,[1,2,3]);assert.deepEqual(result.coverage.counterCounts,[0,1,2]);assert.equal(result.realQwenCalls,0);
});
