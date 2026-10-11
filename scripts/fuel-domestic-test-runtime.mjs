import { createHash } from 'node:crypto';
import { domesticInputGate, domesticMaterialComparison, runDomesticForecast } from './intelligence-v2/domestic-fuel.mjs';
import { evidenceHashFor } from './intelligence-v2/history.mjs';

export const TEST_ENV='yuzhang-test-d6gft53cbc849114f';
export const CORE_SHA='a141f106336714eb6790091fcd4b420b7abcfc1c';
export const CONSUMER_SHA='1d9857b3a9c590db50c4c91b038c82c7a0fbb1dc';
export const AUTHORIZATION='FUEL_REFLIGHT_FINAL_RUNTIME_CLOSURE_20261011_ONE_TEST_CALL';
export const TRIGGER_NAME='fuel-domestic-test-reflight-20261011';
export const FUNCTION_NAME='yuzhangFuelDomesticTestProducer';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=code=>{throw Object.assign(new Error(code),{code});};
export async function readTestDocument(doc) {
  try {const response=await doc.get();return Array.isArray(response?.data)?response.data[0]??null:response?.data??null;}
  catch(error) {if(['DATABASE_DOCUMENT_NOT_EXIST','DOCUMENT_NOT_FOUND',-502001].includes(error?.code)||error?.errCode===-502001)return null;throw error;}
}

export function assertFuelTestTrigger(event,context,binding) {
  if(event?.Type!=='Timer'||event.TriggerName!==TRIGGER_NAME||binding?.environment!==TEST_ENV||
    binding.coreSha!==CORE_SHA||binding.consumerSha!==CONSUMER_SHA||binding.authorization!==AUTHORIZATION||
    binding.functionName!==FUNCTION_NAME||context?.function_name!==FUNCTION_NAME||context.namespace!==TEST_ENV||
    binding.maxTotalModelCalls!==1||binding.version!==String(context.function_version))fail('FUEL_TEST_TRIGGER_NOT_AUTHORIZED');
}

// Test registration only. Core/Consumer business code and the Official budget are untouched.
export async function runFuelTestTrigger({event,context,binding,loadInput,loadCurrent,claim,saveArtifact,publish,
  acceptedCollection=null,providerOptions={},onAudit=async()=>{},now=()=>new Date()}={}) {
  assertFuelTestTrigger(event,context,binding);
  const startedAt=now().toISOString(),input=await loadInput(),time=now();
  const gate=domesticInputGate(input,{now:time});
  if(gate.gate!=='PASS')return {status:'INPUT_REJECTED',gate,modelCalls:0,startedAt};
  const previous=await loadCurrent(),material=domesticMaterialComparison(input,previous?.evidencePack,{now:time});
  // The first registered timer tick is the explicitly authorized Test proof, not a fabricated material event.
  const triggerType=material.eligible?'MATERIAL_EVIDENCE':'PERIODIC_FALLBACK';
  const reservation=await claim({authorization:AUTHORIZATION,triggerType,startedAt,input});
  if(!reservation.claimed)return {status:'TEST_AUTHORIZATION_ALREADY_CONSUMED',modelCalls:0,startedAt};
  let result,audit=null;
  try {
    result=await runDomesticForecast({input,acceptedCollection,now:time,requestId:reservation.requestId,testAttemptId:AUTHORIZATION,
      providerOptions:{...providerOptions,maxTransportRetries:0,maxExternalRequests:1,
        onAudit:async value=>{audit=value;await onAudit(value);}}});
  } catch(error) {
    // A claimed opportunity is never released after an unknown/failed request.
    const code=error.validationCode??error.code??error.message;
    return {status:'GENERATION_REJECTED',code:/^[A-Z0-9_]+$/.test(code)?code:'FUEL_TEST_GENERATION_FAILED',startedAt,
      modelCalls:audit?.actualExternalRequestCount??0,providerAudit:audit};
  }
  if(result.gate.gate!=='PASS')return {status:'FORECAST_REJECTED',gate:result.gate,startedAt,modelCalls:1};
  const bundle={forecast:result.forecast,evidencePack:result.evidencePack,providerAudit:result.providerAudit};
  const bytes=Buffer.from(JSON.stringify(bundle,null,2)+'\n'),sourceArtifactHash=digest(bytes),acceptedAt=now().toISOString();
  const receipt={kind:'RUNTIME_ACCEPTED_ARTIFACT',environment:TEST_ENV,coreSha:CORE_SHA,consumerSha:CONSUMER_SHA,
    sourceCommit:CORE_SHA,sourceArtifactHash,forecastId:bundle.forecast.forecastId,evidenceRevision:bundle.forecast.evidenceRevision,
    authorization:AUTHORIZATION,requestId:reservation.requestId,triggerType,startedAt,acceptedAt,
    sourceCommitMeaning:'FROZEN_CORE_CODE_COMMIT_NOT_A_GENERATED_ARTIFACT_GIT_COMMIT'};
  const stored=await saveArtifact({bytes,receipt});
  if(!Buffer.isBuffer(stored.bytes)||digest(stored.bytes)!==sourceArtifactHash||
    JSON.stringify(stored.receipt)!==JSON.stringify(receipt))fail('FUEL_TEST_IMMUTABLE_ARTIFACT_MISMATCH');
  const publishedAt=now().toISOString(),delivery=await publish({bundle:JSON.parse(stored.bytes),receipt:stored.receipt});
  return {status:'DELIVERED',modelCalls:1,startedAt,acceptedAt,publishedAt,deliveredAt:now().toISOString(),receipt,
    forecastId:bundle.forecast.forecastId,providerResponseId:bundle.providerAudit.providerResponseId,
    probabilities:bundle.forecast.probabilities,reasonLength:Array.from(bundle.forecast.reason).length,delivery};
}

export async function reserveFuelTestOpportunity(db,request,requestId) {
  if(request.authorization!==AUTHORIZATION||typeof requestId!=='string'||!requestId)fail('FUEL_TEST_RESERVATION_INVALID');
  const id='fuelTestDomesticRuntimeAuthorization20261011';
  return db.runTransaction(async tx=>{
    const doc=tx.collection('yuzhang_fuel_forecasts').doc(id),existing=await readTestDocument(doc);
    if(existing)return {claimed:false};
    await doc.set({authorization:AUTHORIZATION,status:'RESERVED',maxTotalModelCalls:1,requestId,triggerType:request.triggerType,
      startedAt:request.startedAt,inputContract:request.input.schemaVersion,evidenceRevision:evidenceHashFor(request.input)});
    return {claimed:true,requestId};
  });
}
