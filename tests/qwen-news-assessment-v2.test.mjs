import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseNewsMaterial } from '../scripts/intelligence-v2/news-material.mjs';
import { analysisSchema, createQwenProvider, projectEvidence, qwenSchemaCompatibilityGate, validateAnalysis } from '../scripts/intelligence-v2/qwen-provider.mjs';
import { evidenceHashFor } from '../scripts/intelligence-v2/history.mjs';
import { evidenceGate, forecastGate, newsSegmentFor, newsEnrichmentGate } from '../dist/data/intelligence-v2-contract.js';
import { publicEvidenceGate } from '../dist/data/public-evidence.js';
import { fixture, fakeOptions, response } from './fixtures/qwen-fixture.mjs';

const at='2026-09-29T11:20:00.000Z';
const paragraphs=[
  'Oil and diesel supply tightened by 4% during the reported week as refiners adjusted operations and buyers reviewed fuel inventories.',
  'Diesel buyers reported slower deliveries while tanker availability and refinery schedules remained important for the fuel market.',
  'Crude and diesel market participants could see demand and supply risks without confirming a new disruption today.',
];
const document=(id,author,paragraphsForArticle=paragraphs)=>{
  const url=`https://www.brecorder.com/news/${id}/diesel-market-review`;
  const html=`<script type="application/ld+json">${JSON.stringify({'@type':'NewsArticle',headline:'Diesel market review',publisher:{name:'Business Recorder'},author:[{name:author}],datePublished:'2026-09-29T10:00:00Z'})}</script><div class="story__content">${paragraphsForArticle.map(p=>`<p>${p}</p>`).join('')}</div>`;
  return parseNewsMaterial(html,url,at);
};
const setup=()=>{
  const {pack}=fixture(at);
  pack.inputContractVersion='NEWS_MATERIAL_V1';
  pack.signals=pack.signals.filter(s=>s.sourceOrganization==='EIA');
  pack.newsDocuments=[document('987654','Reuters'),document('987655','Business Recorder'),document('987656','Reuters')];
  pack.coverageMode='NORMAL';
  return {pack,now:new Date(at),evidenceHash:evidenceHashFor(pack)};
};
const modelOutput=(pack,selected=pack.newsDocuments[0].segments[0])=>{
  const evidenceId=`${pack.newsDocuments[0].documentId}:${selected.segmentId}`;
  return {probabilities:{DOWN:35,FLAT:25,UP:40},upReasonEvidenceIds:['eia-stocks'],newsReasonEvidenceIds:[evidenceId],downReasonEvidenceIds:['market-diesel'],
    strengthAssessments:pack.signals.map(s=>({evidenceId:s.id,strength:'MEDIUM'})),
    newsAssessments:[{evidenceId,impact:'UP',kind:'RISK',title:'柴油供应收紧4%',summary:'报道提到柴油供应收紧4%。',strength:'MEDIUM'}]};
};

test('production-shaped 6 signals, 3 articles, 3 segments each pass the V2 Forecast, public and schema contracts',async()=>{
  const f=setup(), value=modelOutput(f.pack), newsId=value.newsAssessments[0].evidenceId;
  const gate=evidenceGate(f.pack,{now:f.now});
  assert.equal(f.pack.signals.length,6);assert.equal(f.pack.newsDocuments.length,3);
  assert.ok(f.pack.newsDocuments.every(d=>d.segments.length===3));
  assert.equal(gate.gate,'PASS');assert.equal(gate.coverageMode,'NORMAL');assert.equal(gate.independentSourceCount,3);
  const schema=analysisSchema(f.pack), item=schema.properties.newsAssessments.items;
  assert.equal(qwenSchemaCompatibilityGate(schema).gate,'PASS');
  assert.equal(item.additionalProperties,false);
  assert.deepEqual(Object.keys(item.properties),['evidenceId','impact','kind','title','summary','strength']);
  assert.deepEqual(item.required,Object.keys(item.properties));
  assert.equal(item.properties.evidenceId.enum.length,9);
  assert.ok(item.properties.evidenceId.enum.includes(newsId));
  assert.equal(projectEvidence(f.pack).newsDocuments.length,3);
  let requestCount=0;
  const provider=createQwenProvider(fakeOptions(f.pack,{clock:()=>f.now,fetchImpl:async()=>{requestCount++;return response(value);}}));
  const candidate=await provider.generateForecast({evidencePack:f.pack,evidenceHash:f.evidenceHash,now:f.now});
  assert.equal(requestCount,1);assert.equal(candidate.promptVersion,'qwen-forecast-core-v1-integer-1pct-direction-pools-v2');
  assert.equal(candidate.newsAssessmentContract,'NEWS_ASSESSMENT_V2');
  const selected=newsSegmentFor(f.pack,newsId);
  assert.equal(candidate.newsAssessments[0].documentId,selected.document.documentId);
  assert.equal(candidate.newsAssessments[0].segmentId,selected.segment.segmentId);
  for(const field of ['sourceUrl','publisher','originalSource','publishedAt'])assert.equal(candidate.newsAssessments[0][field],selected.document[field]);
  assert.equal(candidate.newsAssessments[0].quote,undefined);
  assert.equal(forecastGate(candidate,f.pack,{now:f.now,expectedEvidenceHash:f.evidenceHash}).gate,'PASS');
  const publicCards=publicEvidenceGate({forecast:candidate,evidencePack:f.pack},{now:f.now});
  assert.equal(publicCards.gate,'PASS');
  const directory=await mkdtemp(join(tmpdir(),'qwen-v2-replay-'));
  try {
    await mkdir(join(directory,'scripts'));await mkdir(join(directory,'dist/data'),{recursive:true});
    await writeFile(join(directory,'scripts/scan-public-files.mjs'),await readFile(new URL('../scripts/scan-public-files.mjs',import.meta.url),'utf8'));
    await writeFile(join(directory,'dist/data/forecast-cache.json'),JSON.stringify({...candidate,evidencePack:f.pack,cards:publicCards.cards}));
    const scan=spawnSync(process.execPath,[join(directory,'scripts/scan-public-files.mjs')],{cwd:directory,encoding:'utf8',env:{}});
    assert.equal(scan.status,0,scan.stdout);assert.equal(JSON.parse(scan.stdout).gate,'PASS');
  } finally {await rm(directory,{recursive:true,force:true});}
  const altered=structuredClone(candidate);altered.newsAssessments[0].sourceUrl='https://example.com/forged';
  assert.equal(forecastGate(altered,f.pack,{now:f.now}).gate,'PASS');
  assert.equal(newsEnrichmentGate(altered,f.pack,{mode:'FORECAST'}).gate,'FAIL');
  assert.ok(!publicEvidenceGate({forecast:altered,evidencePack:f.pack},{now:f.now}).cards.some(c=>c.evidenceId===newsId));
});

test('no news assessment is valid when the model uses only structural reasons despite normal input coverage',async()=>{
  const f=setup(), value=modelOutput(f.pack);value.newsAssessments=[];value.newsReasonEvidenceIds=[];value.upReasonEvidenceIds=['eia-stocks'];
  const candidate=await createQwenProvider(fakeOptions(f.pack,{clock:()=>f.now,fetchImpl:async()=>response(value)})).generateForecast({evidencePack:f.pack,evidenceHash:f.evidenceHash,now:f.now});
  assert.equal(candidate.coverageMode,'NORMAL');assert.deepEqual(candidate.newsAssessments,[]);
  assert.equal(forecastGate(candidate,f.pack,{now:f.now}).gate,'PASS');
  assert.equal(publicEvidenceGate({forecast:candidate,evidencePack:f.pack},{now:f.now}).gate,'PASS');
});

test('V2 validator reports precise safe codes for field, identity, uniqueness, number, conditional and reason failures',()=>{
  const f=setup(), base=modelOutput(f.pack);
  const second=f.pack.newsDocuments[0].segments[1], secondId=`${f.pack.newsDocuments[0].documentId}:${second.segmentId}`;
  for(const [change,code] of [
    [v=>{delete v.newsAssessments;},'NEWS_ASSESSMENTS_INVALID'],
    [v=>v.newsAssessments.push(...Array(3).fill({...v.newsAssessments[0]})),'NEWS_ASSESSMENT_TOO_MANY'],
    [v=>{v.newsAssessments[0].evidenceId='br-999999:s1-000000000000';},'NEWS_EVIDENCE_ID_UNKNOWN'],
    [v=>{v.newsAssessments.push({...v.newsAssessments[0],evidenceId:secondId,title:'柴油交付进展',summary:'报道提到柴油交付进展。'});},'NEWS_DUPLICATE_DOCUMENT'],
    [v=>{v.newsAssessments[0].documentId='br-987654';},'NEWS_ASSESSMENT_FIELDS_INVALID'],
    [v=>{v.newsAssessments[0].segmentId='s1-unknown';},'NEWS_ASSESSMENT_FIELDS_INVALID'],
    [v=>{v.newsAssessments[0].quote='copied';},'NEWS_ASSESSMENT_FIELDS_INVALID'],
    [v=>{v.newsAssessments[0].sourceUrl='https://example.com/forged';},'NEWS_ASSESSMENT_FIELDS_INVALID'],
    [v=>{v.newsAssessments[0].title='';},'NEWS_TITLE_INVALID'],
    [v=>{v.newsAssessments[0].title='柴'.repeat(25);},'NEWS_TITLE_INVALID'],
    [v=>{v.newsAssessments[0].summary='';},'NEWS_SUMMARY_INVALID'],
    [v=>{v.newsAssessments[0].summary='油'.repeat(61);},'NEWS_SUMMARY_INVALID'],
    [v=>{v.newsAssessments[0].title='柴油供应收紧99%';},'NEWS_NEW_NUMBER'],
    [v=>{v.newsAssessments[0].summary='柴油供应收紧99%。';},'NEWS_NEW_NUMBER'],
    [v=>{v.newsAssessments[0].kind='FACT';v.newsAssessments[0].evidenceId=`${f.pack.newsDocuments[2].documentId}:${f.pack.newsDocuments[2].segments[2].segmentId}`;v.newsAssessments[0].title='柴油市场前景';v.newsAssessments[0].summary='报道讨论柴油市场前景。';},'NEWS_FACT_FROM_CONDITIONAL_SEGMENT'],
    [v=>{v.newsAssessments=[];},'NEWS_REASON_NOT_ASSESSED'],
    [v=>{v.newsReasonEvidenceIds.push(v.newsAssessments[0].evidenceId);},'NEWS_REASON_DUPLICATE_EVENT'],
  ]){
    const value=structuredClone(base);change(value);
    assert.doesNotThrow(()=>validateAnalysis(value,f.pack));
    assert.ok(newsEnrichmentGate(value,f.pack).errors.includes(code),code);
  }
  assert.equal(validateAnalysis(base,f.pack).newsAssessments[0].documentId,undefined);
  const structural=structuredClone(base);structural.newsAssessments=[];structural.upReasonEvidenceIds=['eia-stocks'];
  assert.doesNotThrow(()=>validateAnalysis(structural,f.pack));
});

test('old V1 news forecast remains readable without changing its historical contract',async()=>{
  const f=setup(), value=modelOutput(f.pack);
  const candidate=await createQwenProvider(fakeOptions(f.pack,{clock:()=>f.now,fetchImpl:async()=>response(value)})).generateForecast({evidencePack:f.pack,evidenceHash:f.evidenceHash,now:f.now});
  const old=structuredClone(candidate), a=old.newsAssessments[0], selected=newsSegmentFor(f.pack,a.evidenceId);
  delete old.forecastContract;delete old.newsAssessmentContract;old.promptVersion='qwen-forecast-news-v1';
  old.newsAssessments=[{documentId:a.documentId,segmentId:a.segmentId,evidenceId:a.evidenceId,impact:a.impact,kind:a.kind,title:a.title,summary:a.summary,quote:selected.segment.text,strength:a.strength}];
  for(const field of ['sourceUrl','publisher','originalSource','publishedAt'])delete old.newsAssessments[0][field];
  assert.equal(forecastGate(old,f.pack,{now:f.now}).gate,'PASS');
});

test('dropped news enrichment persists only safe diagnostics and output hash while the core provider succeeds',async()=>{
  const f=setup();
  const directory=await mkdtemp(join(tmpdir(),'qwen-news-v2-')),auditPath=join(directory,'provider-run.json');
  try {
    for(const [change,code,field] of [
      [v=>{v.newsAssessments[0].summary='编造99%的变化。';},'NEWS_NEW_NUMBER','summary'],
      [v=>{v.newsAssessments[0].evidenceId='br-999999:s1-000000000000';},'NEWS_EVIDENCE_ID_UNKNOWN','evidenceId'],
      [v=>{v.newsAssessments[0].quote='copied';},'NEWS_ASSESSMENT_FIELDS_INVALID','fields'],
    ]){
      const value=modelOutput(f.pack);change(value);
      const provider=createQwenProvider(fakeOptions(f.pack,{clock:()=>f.now,fetchImpl:async()=>response(value),onAudit:a=>writeFile(auditPath,JSON.stringify(a))}));
      const candidate=await provider.generateForecast({evidencePack:f.pack,evidenceHash:f.evidenceHash,now:f.now});
      assert.equal(forecastGate(candidate,f.pack,{now:f.now}).gate,'PASS');
      const saved=await readFile(auditPath,'utf8'),audit=JSON.parse(saved);
      assert.equal(audit.status,'OK');assert.equal(audit.newsEnrichment.gate,'FAIL');
      assert.ok(audit.newsEnrichment.diagnostics.some(d=>d.validationCode===code&&d.assessmentIndex===0&&d.fieldName===field));
      assert.match(audit.outputHash,/^[a-f0-9]{64}$/);assert.equal(audit.attemptCount,1);
      for(const forbidden of ['编造99%','Oil and diesel supply','Authorization','Bearer','DASHSCOPE_API_KEY','segment.text','choices'])assert.ok(!saved.includes(forbidden));
    }
  } finally {await rm(directory,{recursive:true,force:true});}
});
