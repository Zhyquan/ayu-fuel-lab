import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { domesticFixture } from './fixtures/domestic-fuel-fixtures.mjs';
import { loadReplayFixture } from '../scripts/intelligence-v2/replay.mjs';
import { projectDomesticInput, domesticInputGate, domesticAnalysisSchema, validateDomesticAnalysis, createDomesticQwenRequest, runDomesticForecast } from '../scripts/intelligence-v2/domestic-fuel.mjs';
import { evidenceHashFor } from '../scripts/intelligence-v2/history.mjs';

const fixture=async()=>{
  const base=await loadReplayFixture(),f=await domesticFixture('CASE_UP_DOMESTIC',{now:new Date(base.now)});
  f.input=projectDomesticInput({pack:base.pack,policy:f.input.policy,adjustmentWindow:f.input.adjustmentWindow,domesticEvidence:f.input.evidence.filter(e=>e.directionScope==='DOMESTIC_ADJUSTMENT'),evidenceProof:f.input.evidenceProof,now:f.now});
  return f;
};
const attempt=async(f,{responseId='chatcmpl-synthetic-diagnostic',content=JSON.stringify(f.analysis),status=200,testAttemptId='phase3-up-diagnostic-01',requestId=null}={})=>{
  let audit,result,error,calls=0,request;
  try {result=await runDomesticForecast({input:f.input,now:f.now,testAttemptId,requestId,providerOptions:{mock:true,environment:{DASHSCOPE_API_KEY:'test'},clock:()=>f.now,maxTransportRetries:0,maxExternalRequests:1,
    fetchImpl:async(_url,options)=>{calls++;request=JSON.parse(options.body);return new Response(JSON.stringify({id:responseId,choices:[{finish_reason:'stop',message:{role:'assistant',content}}],usage:{prompt_tokens:123,completion_tokens:45}}),{status});},
    onAudit:value=>{audit=value;}}});}catch(value){error=value;}
  return {audit,result,error,calls,request};
};
const failures=[
  ['non-array',f=>f.analysis.primaryEvidenceIds='synthetic-domestic-pricing','PRIMARY_EVIDENCE_SCHEMA_INVALID','PRIMARY_IDS_ARE_ARRAY','primaryEvidenceIds',null],
  ['empty',f=>f.analysis.primaryEvidenceIds=[],'PRIMARY_EVIDENCE_COUNT_INVALID','PRIMARY_COUNT_ONE_TO_THREE','primaryEvidenceIds',null],
  ['over count',f=>f.analysis.primaryEvidenceIds=['a','b','c','d'],'PRIMARY_EVIDENCE_COUNT_INVALID','PRIMARY_COUNT_ONE_TO_THREE','primaryEvidenceIds',null],
  ['duplicate',f=>f.analysis.primaryEvidenceIds=['synthetic-domestic-pricing','synthetic-domestic-pricing'],'PRIMARY_EVIDENCE_DUPLICATE_ID','UNIQUE_PRIMARY_IDS','primaryEvidenceIds',1],
  ['non-string item',f=>f.analysis.primaryEvidenceIds=[{evidenceId:'synthetic-domestic-pricing'}],'PRIMARY_EVIDENCE_SCHEMA_INVALID','PRIMARY_ID_IS_NONEMPTY_STRING','primaryEvidenceIds',0],
  ['unknown ID',f=>f.analysis.primaryEvidenceIds=['outside-pack'],'PRIMARY_EVIDENCE_NOT_FOUND','PRIMARY_ID_EXISTS_IN_FROZEN_INPUT','primaryEvidenceIds',0],
  ['international input ID',f=>f.analysis.primaryEvidenceIds=[f.input.evidence[0].evidenceId],'PRIMARY_EVIDENCE_NOT_DOMESTIC_RELEVANT','MEMBER_OF_ACCEPTED_DOMESTIC_DIRECT_SET','primaryEvidenceIds',0],
  ['news input ID',f=>f.analysis.primaryEvidenceIds=[f.input.relatedNews[0].evidenceId],'PRIMARY_EVIDENCE_NOT_DOMESTIC_RELEVANT','MEMBER_OF_ACCEPTED_DOMESTIC_DIRECT_SET','primaryEvidenceIds',0],
  ['policy receipt outside primary set',f=>f.analysis.primaryEvidenceIds=[f.input.policy.evidenceId],'PRIMARY_EVIDENCE_NOT_ACCEPTED','MEMBER_OF_ACCEPTED_DOMESTIC_DIRECT_SET','primaryEvidenceIds',0],
  ['missing output key',f=>delete f.analysis.primaryEvidenceIds,'DOMESTIC_ANALYSIS_FIELDS_INVALID','EXACT_MODEL_OUTPUT_FIELDS','$',null,'DOMESTIC_ANALYSIS_SCHEMA_INVALID'],
  ['wrong target',f=>f.analysis.target='INTERNATIONAL_DIESEL','DOMESTIC_ANALYSIS_TARGET_INVALID','EXACT_DOMESTIC_TARGET','target',null,'DOMESTIC_ANALYSIS_SCHEMA_INVALID'],
  ['wrong probability type',f=>f.analysis.probabilities.UP='70','DOMESTIC_PROBABILITY_VALUE_INVALID','INTEGER_ZERO_TO_100','probabilities.UP',null,'DOMESTIC_PROBABILITIES_INVALID'],
  ['unsupported direction',f=>f.analysis.probabilities={UP:10,DOWN:70,FLAT:20},'PRIMARY_EVIDENCE_DIRECTION_MISMATCH','PRIMARY_SUPPORTS_PREDICTED_DIRECTION','primaryEvidenceIds',null,'DOMESTIC_DIRECTION_UNSUPPORTED'],
  ['repeated event',f=>{const row=structuredClone(f.input.evidence.find(e=>e.evidenceId==='synthetic-domestic-pricing'));row.evidenceId='synthetic-second-pricing';f.input.evidence.push(row);f.analysis.primaryEvidenceIds=['synthetic-domestic-pricing',row.evidenceId];},'PRIMARY_EVIDENCE_DUPLICATE_EVENT','UNIQUE_PRIMARY_EVENTS','primaryEvidenceIds',1,'DOMESTIC_DIRECTION_UNSUPPORTED'],
];
for(const [name,modify,code,invariant,field,index,legacy='DOMESTIC_PRIMARY_EVIDENCE_INVALID']of failures)test(`domestic production-shape rejection remains closed with exact diagnosis: ${name}`,async()=>{
  const f=await fixture();modify(f);assert.equal(domesticInputGate(f.input,{now:f.now}).gate,'PASS');
  assert.throws(()=>validateDomesticAnalysis(f.analysis,f.input,{now:f.now}),e=>e.message===legacy&&e.validationCode===code&&e.validationSubtype===code&&e.validationInvariant===invariant&&e.fieldName===field&&e.reasonIndex===index);
  const {audit,error,calls}=await attempt(f);
  assert.equal(error.message,legacy);assert.equal(calls,1);assert.equal(audit.status,'FAILED');assert.equal(audit.attemptCount,1);
  assert.equal(audit.validationCode,code);assert.equal(audit.legacyValidationCode,legacy);assert.equal(audit.validationSubtype,code);assert.equal(audit.validationInvariant,invariant);assert.equal(audit.fieldName,field);assert.equal(audit.reasonIndex,index);
  assert.equal(audit.testAttemptId,'phase3-up-diagnostic-01');assert.equal(audit.requestId,audit.testAttemptId);assert.equal(audit.providerResponseId,'chatcmpl-synthetic-diagnostic');
  assert.equal(audit.evidenceRevision,evidenceHashFor(f.input));assert.equal(audit.candidateId,evidenceHashFor({inputPackHash:audit.inputPackHash,outputHash:audit.outputHash}));assert.equal(audit.candidateIdType,'AUDIT_ONLY_NOT_FORECAST_ID');assert.equal(audit.candidateNotCreatedReason,null);
  assert.deepEqual(audit.allowedPrimaryEvidenceIds,domesticInputGate(f.input,{now:f.now}).primaryEvidenceIds);
  for(const id of audit.allowedPrimaryEvidenceIds)assert.equal(audit.inputEvidenceRoles.find(row=>row.evidenceId===id).acceptedPrimary,true);
  assert.equal(audit.outputStructure.primaryEvidenceIds.type,Array.isArray(f.analysis.primaryEvidenceIds)?'ARRAY':f.analysis.primaryEvidenceIds===undefined?'UNDEFINED':'STRING');
  if(Array.isArray(f.analysis.primaryEvidenceIds))assert.equal(audit.outputStructure.primaryEvidenceIds.count,f.analysis.primaryEvidenceIds.length);
  const serialized=JSON.stringify(audit);assert.doesNotMatch(serialized,/Authorization|Bearer|DASHSCOPE_API_KEY|"content"|"segments"/);assert.equal(serialized.includes(f.analysis.reason),false);
  for(const row of f.input.relatedNews)for(const segment of row.document.segments)assert.equal(serialized.includes(segment.text),false);
});

test('legal domestic output keeps the same probabilities and prompt while preserving safe identities',async()=>{
  const f=await fixture(),{audit,result,error,calls,request}=await attempt(f,{requestId:'explicit-request-01'});
  assert.equal(error,undefined);assert.equal(calls,1);assert.equal(result.gate.gate,'PASS');assert.deepEqual(result.forecast.probabilities,{UP:.7,DOWN:.1,HOLD_OR_NO_ADJUSTMENT:.2});
  assert.equal(audit.requestId,'explicit-request-01');assert.equal(audit.testAttemptId,'phase3-up-diagnostic-01');assert.deepEqual(audit.selectedPrimaryEvidenceIds,f.analysis.primaryEvidenceIds);
  assert.equal(audit.inputEvidenceRoles.some(row=>row.role==='UNASSESSED_NEWS_INPUT'&&row.acceptedPrimary===false),true);
  assert.equal(audit.outputHash,createHash('sha256').update(JSON.stringify(f.analysis)).digest('hex'));assert.notEqual(audit.candidateId,result.forecast.forecastId);
  assert.deepEqual(audit.outputStructure.probabilities.UP,{type:'NUMBER',value:70});assert.equal(audit.outputStructure.reason.characterCount,Array.from(f.analysis.reason).length);
  assert.equal(request.messages[0].content.includes('你判断的是未来7天中国大陆'),true);assert.equal(request.response_format.json_schema.name,'DOMESTIC_FUEL_ANALYSIS_V1');
});

test('observed duplicate selection stays rejected; one allowed ID is sufficient without padding',async()=>{
  const f=await fixture();f.analysis.probabilities={UP:85,DOWN:5,FLAT:10};f.analysis.primaryEvidenceIds=['synthetic-domestic-pricing','synthetic-domestic-pricing'];
  const rejected=await attempt(f);assert.equal(rejected.error.message,'DOMESTIC_PRIMARY_EVIDENCE_INVALID');assert.equal(rejected.audit.validationCode,'PRIMARY_EVIDENCE_DUPLICATE_ID');assert.equal(rejected.audit.reasonIndex,1);
  assert.deepEqual(rejected.audit.selectedPrimaryEvidenceIds,f.analysis.primaryEvidenceIds);assert.equal(rejected.result,undefined);assert.equal(rejected.calls,1);
  f.analysis.primaryEvidenceIds=['synthetic-domestic-pricing'];const accepted=await attempt(f);
  assert.equal(accepted.error,undefined);assert.equal(accepted.result.gate.gate,'PASS');assert.deepEqual(accepted.result.forecast.probabilities,{UP:.85,DOWN:.05,HOLD_OR_NO_ADJUSTMENT:.1});assert.equal(accepted.result.forecast.primaryEvidence.length,1);assert.equal(accepted.calls,1);
  for(const {request}of [rejected,accepted]) {
    const prompt=request.messages[0].content;
    assert.equal(prompt.includes(JSON.stringify(['synthetic-domestic-pricing'])),true);assert.match(prompt,/最多选择 1 个/);assert.match(prompt,/互不重复/);assert.match(prompt,/不得重复同一 ID/);assert.match(prompt,/只有1个可选 ID 时必须仅选这1个/);assert.match(prompt,/未列入此集合的 ID 不得作为额外 primary/);
    assert.deepEqual(request.response_format.json_schema.schema,domesticAnalysisSchema(f.input));
  }
});

test('primary selection hint uses the admitted ID set and caps selection at three without changing schema',async()=>{
  const f=await fixture(),row=f.input.evidence.find(e=>e.evidenceId==='synthetic-domestic-pricing');
  for(let n=1;n<=3;n++)f.input.evidence.push({...structuredClone(row),evidenceId:`synthetic-pricing-${n}`,eventKey:`synthetic-pricing-event-${n}`});
  const before=JSON.stringify(f.input),allowed=domesticInputGate(f.input,{now:f.now}).primaryEvidenceIds,request=createDomesticQwenRequest(f.input);
  assert.equal(allowed.length,4);assert.equal(request.body.messages[0].content.includes(JSON.stringify(allowed)),true);assert.match(request.body.messages[0].content,/最多选择 3 个/);
  assert.deepEqual(request.body.response_format.json_schema.schema,domesticAnalysisSchema(f.input));assert.equal(request.evidenceRevision,evidenceHashFor(f.input));assert.equal(JSON.stringify(f.input),before);
});

test('unknown ordinary IDs remain visible while credential-like identities and raw output are excluded',async()=>{
  const f=await fixture();f.analysis.primaryEvidenceIds=['outside-pack','Bearer_do-not-copy','test'];
  const {audit}=await attempt(f,{responseId:'api_key-do-not-copy',requestId:'Bearer_request-secret'});
  assert.deepEqual(audit.selectedPrimaryEvidenceIds,['outside-pack',null,null]);assert.deepEqual(audit.selectedPrimaryEvidenceIdRedactions,[{index:1,type:'STRING',reason:'SECRET_FORMAT'},{index:2,type:'STRING',reason:'SECRET_VALUE'}]);
  assert.equal(audit.providerResponseId,null);assert.equal(audit.providerResponseIdRedaction.reason,'SECRET_FORMAT');assert.equal(audit.requestId,null);
  assert.doesNotMatch(JSON.stringify(audit),/do-not-copy|Bearer|request-secret/);assert.equal(audit.validationCode,'PRIMARY_EVIDENCE_NOT_FOUND');
  const forged=await fixture();forged.analysis.reason='PRIVATE_RAW_OUTPUT';forged.analysis.PRIVATE_RESPONSE_KEY='PRIVATE_EXTRA_VALUE';forged.analysis.probabilities.UP='PRIVATE_PROBABILITY_VALUE';
  const result=await attempt(forged);assert.doesNotMatch(JSON.stringify(result.audit),/PRIVATE_RAW_OUTPUT|PRIVATE_RESPONSE_KEY|PRIVATE_EXTRA_VALUE|PRIVATE_PROBABILITY_VALUE/);
  assert.equal(result.audit.outputStructure.uncontractedFieldCount,1);assert.deepEqual(result.audit.outputStructure.probabilities.UP,{type:'STRING',value:null});
});

test('failed transport or JSON has no fabricated candidate and is not retried',async()=>{
  for(const [options,reason]of [[{status:500},'NO_SUCCESSFUL_PROVIDER_RESPONSE'],[{content:'invalid output JSON'},'INVALID_MODEL_OUTPUT_JSON']]) {
    const f=await fixture(),{audit,error,calls}=await attempt(f,options);assert.ok(error);assert.equal(calls,1);assert.equal(audit.candidateId,null);assert.equal(audit.candidateNotCreatedReason,reason);assert.equal(audit.outputStructure,null);assert.equal(audit.selectedPrimaryEvidenceIds,null);
  }
});
