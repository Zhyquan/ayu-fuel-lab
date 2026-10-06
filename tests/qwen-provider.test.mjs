import test from 'node:test';
import assert from 'node:assert/strict';
import { createQwenProvider, validateAnalysis, analysisSchema, projectEvidence, qwenSchemaCompatibilityGate, QWEN_SCHEMA_KEYWORDS, MAX_TRANSPORT_RETRIES, MAX_PROVIDER_CALLS_PER_RUN } from '../scripts/intelligence-v2/qwen-provider.mjs';
import { evidenceHashFor } from '../scripts/intelligence-v2/history.mjs';
import { forecastGate, DAY } from '../dist/data/intelligence-v2-contract.js';
import { runForecast } from '../scripts/intelligence-v2/run.mjs';
import { fixture, analysis, response, fakeOptions, testTime } from './fixtures/qwen-fixture.mjs';

test('Qwen strict request and grounded candidate pass the existing Forecast and public evidence Gates',async()=>{
  const {pack,evidenceHash,now}=fixture();let request,url,audit;
  const clock=()=>new Date('2026-09-28T11:21:00Z');
  const options=fakeOptions(pack,{clock,fetchImpl:async(u,r)=>{url=u;request=r;return response(analysis(pack));},onAudit:async a=>{await Promise.resolve();audit=a;}});
  const provider=createQwenProvider(options);
  const candidate=await provider.generateForecast({evidencePack:pack,evidenceHash,now});
  assert.equal(url,'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions');
  const body=JSON.parse(request.body);
  assert.equal(body.model,'qwen3.8-flash');assert.equal(body.enable_thinking,false);assert.equal(body.stream,false);
  assert.equal(body.response_format.type,'json_schema');assert.equal(body.response_format.json_schema.strict,true);
  assert.equal(body.response_format.json_schema.schema.additionalProperties,false);
  assert.equal(body.max_tokens,undefined);
  assert.equal(request.redirect,'error');assert.equal(body.tools,undefined);assert.equal(body.enable_search,undefined);
  assert.equal(candidate.provider,'QWEN');assert.equal(candidate.source,'AYU_INTELLIGENCE_V2');assert.equal(candidate.primaryDirection,'UP');
  assert.equal(candidate.generatedAt,clock().toISOString());assert.equal(Date.parse(candidate.validUntil)-Date.parse(candidate.generatedAt),DAY);
  assert.equal(candidate.evidenceHash,evidenceHash);
  for(const ref of [...candidate.mainReasons,...candidate.counterReasons])assert.equal(ref.text,pack.signals.find(s=>s.id===ref.evidenceId).displayText);
  for(const a of candidate.signalAssessments){const s=pack.signals.find(s=>s.id===a.evidenceId);assert.equal(a.impact,s.impact);assert.equal(a.kind,s.kind);}
  assert.equal(forecastGate(candidate,pack,{now:clock(),expectedEvidenceHash:evidenceHash}).gate,'PASS');
  assert.equal(audit.status,'OK');assert.deepEqual(audit.usage,{input_tokens:100,output_tokens:50});assert.equal(audit.attemptCount,1);
  assert.doesNotMatch(JSON.stringify(audit),/Bearer|Authorization|DASHSCOPE_API_KEY|choices|content/);
  const result=await runForecast({pack,provider:'QWEN',providerOptions:options,now,persist:false});
  assert.equal(result.gate.gate,'PASS');assert.equal(result.publicEvidence.gate,'PASS');
});
test('missing key, unactivated native transport, failed Evidence and mismatched hash make zero requests',async()=>{
  for(const mode of ['key','activation','evidence','hash']) {
    const f=fixture();let calls=0;
    const options=fakeOptions(f.pack,{fetchImpl:async()=>{calls++;return response(analysis(f.pack));}});
    let error;
    if(mode==='key'){options.environment={};error='DASHSCOPE_API_KEY_REQUIRED';}
    if(mode==='activation'){options.mock=false;error='QWEN_API_ACTIVATION_NEEDS_USER_AUTHORIZATION';}
    if(mode==='evidence'){f.pack.signals=[];error='EVIDENCE_GATE_FAILED';}
    if(mode==='hash'){f.evidenceHash='a'.repeat(64);error='EVIDENCE_HASH_MISMATCH';}
    await assert.rejects(createQwenProvider(options).generateForecast({evidencePack:f.pack,evidenceHash:f.evidenceHash,now:f.now}),new RegExp(error));
    assert.equal(calls,0);
  }
});
for(const [name,modify,error]of [
  ['unknown ID',v=>v.upReasonEvidenceIds[0]='outside-pack','QWEN_REASON_INVALID'],
  ['empty ID',v=>v.upReasonEvidenceIds[0]='','QWEN_REASON_INVALID'],
  ['zero main reasons',v=>v.upReasonEvidenceIds=[],'QWEN_REASON_INVALID'],
  ['four main reasons',v=>v.upReasonEvidenceIds=['eia-stocks','market-brent','news-hormuz-40441609','eia-production'],'QWEN_REASON_INVALID'],
  ['three counter reasons',v=>v.downReasonEvidenceIds=['market-diesel','market-wti','market-diesel'],'QWEN_REASON_INVALID'],
  ['duplicate main IDs',v=>v.upReasonEvidenceIds=['eia-stocks','eia-stocks'],'QWEN_REASON_INVALID'],
  ['duplicate counter IDs',v=>v.downReasonEvidenceIds=['market-diesel','market-diesel'],'QWEN_REASON_INVALID'],
  ['bad sum',v=>v.probabilities.FLAT=30,'QWEN_PROBABILITIES_INVALID'],
  ['fractional probability',v=>{v.probabilities.UP=40.5;v.probabilities.DOWN=34.5;},'QWEN_PROBABILITIES_INVALID'],
  ['missing assessment',v=>v.strengthAssessments.pop(),'QWEN_ASSESSMENTS_INVALID'],
  ['duplicate assessment',v=>v.strengthAssessments[1]=v.strengthAssessments[0],'QWEN_ASSESSMENTS_INVALID'],
  ['extra assessment',v=>v.strengthAssessments.push({...v.strengthAssessments[0]}),'QWEN_ASSESSMENTS_INVALID'],
  ['missing counter',v=>v.downReasonEvidenceIds=[],'QWEN_COUNTER_REQUIRED'],
  ['reversed main reason',v=>v.upReasonEvidenceIds=['market-diesel'],'QWEN_REASON_INVALID'],
  ['correlated event voting',v=>v.upReasonEvidenceIds=['eia-stocks','eia-production'],'QWEN_REASON_INVALID'],
  ...['source','provider','generatedAt','validUntil','evidenceHash','primaryDirection','reasonText','sourceUrl'].map(key=>[key,v=>v[key]='invented','QWEN_SCHEMA_INVALID']),
  ['invented impact',v=>v.strengthAssessments[0].impact='DOWN','QWEN_ASSESSMENTS_INVALID'],
  ['invented kind',v=>v.strengthAssessments[0].kind='FACT','QWEN_ASSESSMENTS_INVALID'],
])test(`invalid model output fails without retry: ${name}`,async()=>{
  const f=fixture(), value=analysis(f.pack);modify(value);let calls=0;
  const provider=createQwenProvider(fakeOptions(f.pack,{fetchImpl:async()=>{calls++;return response(value);}}));
  await assert.rejects(provider.generateForecast({evidencePack:f.pack,evidenceHash:f.evidenceHash,now:f.now}),new RegExp(error));
  assert.equal(calls,1);assert.equal(provider.lastRun.status,'FAILED');assert.equal(provider.lastRun.usage.input_tokens,100);
});
test('transport failures, timeout, 429 and 5xx have at most two retries; 4xx is not retried',async()=>{
  for(const status of [500,429,'timeout',403]) {
    const f=fixture();let calls=0;const waits=[];
    const provider=createQwenProvider(fakeOptions(f.pack,{wait:async ms=>waits.push(ms),fetchImpl:async()=>{calls++;if(status==='timeout')throw new Error('timeout');return response(null,{status});}}));
    await assert.rejects(provider.generateForecast({evidencePack:f.pack,evidenceHash:f.evidenceHash,now:f.now}),/QWEN_TRANSPORT_FAILED|QWEN_HTTP_REJECTED/);
    assert.equal(calls,status===403?1:3);assert.equal(provider.lastRun.attemptCount,calls);assert.equal(provider.lastRun.httpStatuses.length,calls);
    assert.deepEqual(waits,status===403?[]:[250,500]);
  }
  assert.equal(MAX_TRANSPORT_RETRIES,2);assert.equal(MAX_PROVIDER_CALLS_PER_RUN,1);
});
test('transient 500 succeeds on second attempt; provider cannot infer again in the same run',async()=>{
  const f=fixture();let calls=0;
  const provider=createQwenProvider(fakeOptions(f.pack,{fetchImpl:async()=>++calls===1?response(null,{status:500}):response(analysis(f.pack))}));
  await provider.generateForecast({evidencePack:f.pack,evidenceHash:f.evidenceHash,now:f.now});
  assert.equal(calls,2);assert.equal(provider.lastRun.semanticCallCount,1);
  await assert.rejects(provider.generateForecast({evidencePack:f.pack,evidenceHash:f.evidenceHash,now:f.now}),/QWEN_RUN_CALL_BUDGET_EXCEEDED/);assert.equal(calls,2);
});
test('fences, truncation, oversized response and tool outputs fail without repair calls',async()=>{
  const f=fixture();
  for(const output of [{content:'not json'},{content:' '.repeat(70000)},{finish:'length'},{content:'{}'}]) {
    let calls=0;const provider=createQwenProvider(fakeOptions(f.pack,{fetchImpl:async()=>{calls++;return response(analysis(f.pack),output);}}));
    await assert.rejects(provider.generateForecast({evidencePack:f.pack,evidenceHash:f.evidenceHash,now:f.now}),/QWEN_RESPONSE_INVALID|QWEN_SCHEMA_INVALID/);assert.equal(calls,1);
  }
});
test('tie deterministically means DOWN; strength is the only model-supplied assessment field',async()=>{
  const f=fixture(), value=analysis(f.pack);
  value.probabilities={DOWN:40,FLAT:20,UP:40};
  const candidate=await createQwenProvider(fakeOptions(f.pack,{fetchImpl:async()=>response(value)})).generateForecast({evidencePack:f.pack,evidenceHash:f.evidenceHash,now:f.now});
  assert.equal(candidate.primaryDirection,'DOWN');assert.equal(candidate.generatedAt,testTime);
});
test('pack is frozen before transport; projected payload omits discovery, fetchLog and unrelated fields',async()=>{
  const f=fixture(), original=structuredClone(f.pack), expected=analysis(f.pack);
  f.pack.fetchLog=[{html:'PRIVATE_HTML'}];f.pack.discovery={candidates:['DISCOVERY_DUMP']};f.pack.research='OLD_RESEARCH';f.pack.signals[0].unrelated='PRIVATE_EXTRA';
  f.pack.categoryChecks[0].fetchLog='NESTED_LOG';f.pack.eventGroups[0].html='NESTED_HTML';f.pack.recentMarketContext.series[0].archive='OLD_ARCHIVE';
  const hash=evidenceHashFor(f.pack);
  const projection=JSON.stringify(projectEvidence(f.pack));assert.doesNotMatch(projection,/PRIVATE_HTML|DISCOVERY_DUMP|OLD_RESEARCH|PRIVATE_EXTRA|fetchLog|NESTED_LOG|NESTED_HTML|OLD_ARCHIVE/);
  const candidate=await createQwenProvider(fakeOptions(f.pack,{fetchImpl:async()=>{f.pack.signals[0].displayText='changed';return response(expected);}})).generateForecast({evidencePack:f.pack,evidenceHash:hash,now:f.now});
  assert.equal(candidate.mainReasons[0].text,original.signals.find(s=>s.id==='eia-stocks').displayText);assert.equal(candidate.evidenceHash,hash);
});
test('endpoint override only accepts Beijing official HTTPS; oversized input is rejected before fetch',async()=>{
  const f=fixture();let calls=0;
  for(const base of ['http://dashscope.aliyuncs.com/compatible-mode/v1','https://example.com/compatible-mode/v1','https://dashscope.aliyuncs.com/compatible-mode/v1?token=x']) {
    const options=fakeOptions(f.pack,{environment:{DASHSCOPE_API_KEY:'test',DASHSCOPE_BASE_URL:base},fetchImpl:async()=>{calls++;return response(analysis(f.pack));}});
    await assert.rejects(createQwenProvider(options).generateForecast({evidencePack:f.pack,evidenceHash:f.evidenceHash,now:f.now}),/QWEN_BASE_URL_INVALID/);
  }
  f.pack.signals[0].fact='a'.repeat(70000);
  await assert.rejects(createQwenProvider(fakeOptions(f.pack,{fetchImpl:async()=>{calls++;}})).generateForecast({evidencePack:f.pack,evidenceHash:evidenceHashFor(f.pack),now:f.now}),/QWEN_PAYLOAD_TOO_LARGE/);assert.equal(calls,0);
});
test('remote schema uses only documented-compatible keywords and keeps dynamic evidence enums',()=>{
  const {pack}=fixture(), schema=analysisSchema(pack);
  assert.deepEqual(schema.required,Object.keys(schema.properties));
  assert.deepEqual(schema.properties.upReasonEvidenceIds.items.enum,pack.signals.filter(s=>s.impact==='UP').map(s=>s.id));
  assert.deepEqual(schema.properties.downReasonEvidenceIds.items.enum,pack.signals.filter(s=>s.impact==='DOWN').map(s=>s.id));
  assert.deepEqual(schema.properties.strengthAssessments.items.properties.evidenceId.enum,pack.signals.map(s=>s.id));
  assert.equal(schema.additionalProperties,false);
  assert.equal(schema.properties.probabilities.additionalProperties,false);
  assert.equal(schema.properties.strengthAssessments.items.additionalProperties,false);
  assert.equal(qwenSchemaCompatibilityGate(schema).gate,'PASS');
  const forbidden=['uniqueItems','minItems','maxItems','minLength','pattern','format','minimum','maximum','multipleOf'];
  const serialized=JSON.stringify(schema);
  for(const keyword of forbidden)assert.doesNotMatch(serialized,new RegExp(`"${keyword}"\\s*:`));
  assert.deepEqual(validateAnalysis(analysis(pack),pack),analysis(pack));
});
test('schema compatibility allowlist recurses without treating property names or enum values as keywords',()=>{
  const valid={type:'object',properties:{pattern:{type:'string',enum:['minimum','uniqueItems']}},required:['pattern'],additionalProperties:false};
  assert.equal(qwenSchemaCompatibilityGate(valid).gate,'PASS');
  assert.deepEqual(QWEN_SCHEMA_KEYWORDS,['type','properties','required','items','enum','description','title','additionalProperties']);
  for(const [keyword,value]of [
    ['uniqueItems',true],['minItems',1],['maxItems',3],['minLength',1],['pattern','x'],['format','date'],
    ['minimum',5],['maximum',90],['multipleOf',5],
  ]) {
    const result=qwenSchemaCompatibilityGate({type:'array',items:{type:'string',[keyword]:value}});
    assert.equal(result.gate,'FAIL');assert.ok(result.errors.some(error=>error.endsWith(`:${keyword}`)));
  }
});

test('all Forecast prompts use the integer contract and retain subjective estimates',async()=>{
  for(const name of ['qwen-forecast-v1','qwen-forecast-core-v1','qwen-forecast-external-v1','qwen-forecast-news-v1','qwen-forecast-news-v2']) {
    const {SYSTEM_PROMPT,PROMPT_VERSION}=await import(`../scripts/intelligence-v2/prompts/${name}.mjs`);
    assert.match(SYSTEM_PROMPT,/0–100的整数/);assert.match(SYSTEM_PROMPT,/三项之和严格等于100/);
    assert.match(SYSTEM_PROMPT,/不要为了看起来更精确而人为制造小数或随机个位数/);
    assert.match(SYSTEM_PROMPT,/AI_SUBJECTIVE_ESTIMATE/);assert.match(PROMPT_VERSION,/-integer-1pct$/);
    assert.doesNotMatch(SYSTEM_PROMPT,/5整数倍|5[％%].*步长|5.*的倍数/);
  }
});
