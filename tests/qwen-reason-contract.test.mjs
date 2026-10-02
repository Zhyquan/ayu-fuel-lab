import test from 'node:test';
import assert from 'node:assert/strict';
import { createQwenProvider, validateAnalysis } from '../scripts/intelligence-v2/qwen-provider.mjs';
import { fixture, analysis, fakeOptions, response } from './fixtures/qwen-fixture.mjs';

for(const [name,change,code,field,index] of [
  ['list',v=>v.mainReasonEvidenceIds=null,'REASON_LIST_INVALID','mainReasonEvidenceIds',undefined],
  ['count',v=>v.mainReasonEvidenceIds=[],'REASON_COUNT_INVALID','mainReasonEvidenceIds',undefined],
  ['unknown',v=>v.mainReasonEvidenceIds=['outside-pack'],'REASON_UNKNOWN_ID','mainReasonEvidenceIds',0],
  ['duplicate ID',v=>v.mainReasonEvidenceIds=['eia-stocks','eia-stocks'],'REASON_DUPLICATE_ID','mainReasonEvidenceIds',1],
  ['duplicate event',v=>v.mainReasonEvidenceIds=['eia-stocks','eia-production'],'REASON_DUPLICATE_EVENT','mainReasonEvidenceIds',1],
  ['wrong main direction',v=>v.mainReasonEvidenceIds=['market-diesel'],'REASON_DIRECTION_MISMATCH','mainReasonEvidenceIds',0],
  ['wrong counter direction',v=>{v.mainReasonEvidenceIds=['eia-stocks'];v.counterReasonEvidenceIds=['market-brent'];},'REASON_DIRECTION_MISMATCH','counterReasonEvidenceIds',0],
  ['reused across arrays',v=>{v.mainReasonEvidenceIds=['eia-stocks'];v.counterReasonEvidenceIds=['eia-stocks'];},'REASON_REUSED_ID','counterReasonEvidenceIds',0],
])test(`first invalid reason is precise without changing rejection: ${name}`,async()=>{
  const f=fixture(),value=analysis(f.pack);change(value);let calls=0;
  assert.throws(()=>validateAnalysis(value,f.pack),error=>error.message==='QWEN_REASON_INVALID'&&error.validationCode===code&&error.fieldName===field&&error.reasonIndex===index);
  const provider=createQwenProvider(fakeOptions(f.pack,{maxTransportRetries:0,maxExternalRequests:1,fetchImpl:async()=>{calls++;return response(value);}}));
  await assert.rejects(provider.generateForecast({evidencePack:f.pack,evidenceHash:f.evidenceHash,now:f.now}),/QWEN_REASON_INVALID/);
  assert.equal(calls,1);assert.equal(provider.lastRun.validationCode,code);
  assert.equal(provider.lastRun.fieldName,field);assert.equal(provider.lastRun.reasonIndex,index);
  assert.equal(provider.lastRun.legacyValidationCode,'QWEN_REASON_INVALID');
  assert.doesNotMatch(JSON.stringify(provider.lastRun),/outside-pack|mainReasonEvidenceIds.*\[|Authorization|Bearer|"content"|"choices"/);
});

test('neutral signal remains forbidden and gives the exact field',()=>{
  const {pack}=fixture(),value=analysis(pack);pack.signals.find(s=>s.id==='market-wti').impact='NEUTRAL';value.mainReasonEvidenceIds=['market-wti'];
  assert.throws(()=>validateAnalysis(value,pack),error=>error.validationCode==='REASON_NEUTRAL_SIGNAL'&&error.fieldName==='mainReasonEvidenceIds'&&error.reasonIndex===0);
});

test('six homogeneous signals in two events need only two main reasons and no counter',()=>{
  const {pack}=fixture();pack.inputContractVersion='NEWS_MATERIAL_V1';pack.signals=pack.signals.filter(s=>s.sourceOrganization==='EIA');pack.newsDocuments=[];
  for(const s of pack.signals)s.impact='UP';
  for(const s of pack.signals.filter(s=>s.id.startsWith('market-')))s.eventKey='synthetic-daily-event';
  const value={probabilities:{DOWN:21,FLAT:16,UP:63},mainReasonEvidenceIds:['market-diesel','eia-stocks'],counterReasonEvidenceIds:[],strengthAssessments:pack.signals.map(s=>({evidenceId:s.id,strength:'MEDIUM'})),newsAssessments:[]};
  assert.equal(pack.signals.length,6);assert.deepEqual(validateAnalysis(value,pack),value);
  value.mainReasonEvidenceIds.push('market-brent');
  assert.throws(()=>validateAnalysis(value,pack),error=>error.validationCode==='REASON_DUPLICATE_EVENT'&&error.reasonIndex===2);
  value.mainReasonEvidenceIds=['market-diesel'];value.probabilities={DOWN:63,FLAT:16,UP:21};
  assert.throws(()=>validateAnalysis(value,pack),error=>error.validationCode==='REASON_DIRECTION_MISMATCH');
});

test('Core and inherited External prompt state the same existing reason contract',async()=>{
  for(const name of ['qwen-forecast-core-v1','qwen-forecast-external-v1']) {
    const {SYSTEM_PROMPT,PROMPT_VERSION}=await import(`../scripts/intelligence-v2/prompts/${name}.mjs`);
    assert.match(PROMPT_VERSION,/v1-integer-1pct$/);
    assert.match(SYSTEM_PROMPT,/UP概率大于DOWN时主方向为UP，否则为DOWN/);
    assert.match(SYSTEM_PROMPT,/每个主理由的signal\.impact必须等于主方向/);
    assert.match(SYSTEM_PROMPT,/每个反理由的signal\.impact必须等于相反方向/);
    assert.match(SYSTEM_PROMPT,/每个eventKey最多选择一个结构化signal/);
    assert.match(SYSTEM_PROMPT,/不要为通过校验硬改概率/);
  }
});
