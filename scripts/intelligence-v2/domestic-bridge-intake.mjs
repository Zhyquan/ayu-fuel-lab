import { externalSignalFields, exactExternalKeys } from '../../dist/data/external-analyst-contract.js';
import { canonicalJson } from '../../dist/data/intelligence-v2-contract.js';
import { validDate, validTimestamp } from '../../dist/data/validation.js';
import { validateExternalAnalystSignalPackage } from './external-analyst-signals.mjs';
import { evidenceHashFor } from './history.mjs';

export const DOMESTIC_BRIDGE_REQUEST_CONTRACT='AYU_DOMESTIC_TEST_BRIDGE_REQUEST_V1';
export const DOMESTIC_BRIDGE_REQUEST_PATH='data/domestic-test-bridge/latest-request.json';
export const DOMESTIC_BRIDGE_TARGET='CHINA_DOMESTIC_REFINED_OIL_ADJUSTMENT';
export const DOMESTIC_BRIDGE_TRIGGER='EXPLICIT_BRIDGE_TEST_REFRESH';
const keys=['schemaVersion','target','environment','triggerKind','requestId','packageHash','requestedAt','expiresAt','signalPackage'];
const fail=code=>{throw new Error(code);};
const clock=now=>{const time=new Date(now);if(!Number.isFinite(+time))fail('DOMESTIC_BRIDGE_CLOCK_INVALID');return time;};

export function normalizeDomesticBridgeSignalPackage(input,{now=new Date()}={}) {
  let value=input;
  if(typeof input==='string') {
    if(Buffer.byteLength(input)>16384)fail('EXTERNAL_PACKAGE_TOO_LARGE');
    try{value=JSON.parse(input);}catch{fail('EXTERNAL_JSON_INVALID');}
  }
  value=structuredClone(value);
  for(const signal of Array.isArray(value?.signals)?value.signals:[]) {
    if(validDate(signal?.publishedAt)&&!Object.hasOwn(signal,'sourcePublishedDate')) {
      signal.sourcePublishedDate=signal.publishedAt;
      signal.publishedAt=null;
    }
    if(typeof signal?.sourceUrl==='string') {
      const wrapped=signal.sourceUrl.match(/^\[[^\[\]\r\n]+\]\((https:\/\/[^\s()]+)\)$/);
      if(wrapped)signal.sourceUrl=wrapped[1];
    }
  }
  const normalized=validateExternalAnalystSignalPackage(value,{now:clock(now)});
  return {schemaVersion:normalized.schemaVersion,generatedAt:normalized.generatedAt,
    signals:normalized.signals.map(signal=>Object.fromEntries(externalSignalFields(signal).map(key=>[key,signal[key]])))};
}

export function domesticBridgeRequestId(signalPackage) {
  return evidenceHashFor({schemaVersion:signalPackage.schemaVersion,
    signals:[...signalPackage.signals].sort((a,b)=>a.eventKey<b.eventKey?-1:a.eventKey>b.eventKey?1:0)});
}

export function validateDomesticBridgeRequest(input,{now=new Date()}={}) {
  const time=clock(now);
  if(!exactExternalKeys(input,keys)||input.schemaVersion!==DOMESTIC_BRIDGE_REQUEST_CONTRACT)fail('DOMESTIC_BRIDGE_REQUEST_SCHEMA_INVALID');
  if(input.target!==DOMESTIC_BRIDGE_TARGET||input.environment!=='Test'||input.triggerKind!==DOMESTIC_BRIDGE_TRIGGER)fail('DOMESTIC_BRIDGE_REQUEST_TARGET_INVALID');
  if(!validTimestamp(input.requestedAt)||!validTimestamp(input.expiresAt))fail('DOMESTIC_BRIDGE_REQUEST_TIME_INVALID');
  if(Date.parse(input.requestedAt)>+time)fail('DOMESTIC_BRIDGE_REQUEST_TIME_FUTURE');
  if(+time>=Date.parse(input.expiresAt))fail('DOMESTIC_BRIDGE_REQUEST_EXPIRED');
  const signalPackage=normalizeDomesticBridgeSignalPackage(input.signalPackage,{now:time});
  if(canonicalJson(signalPackage)!==canonicalJson(input.signalPackage))fail('DOMESTIC_BRIDGE_PACKAGE_NOT_CANONICAL');
  if(Date.parse(input.requestedAt)<Date.parse(signalPackage.generatedAt)||input.expiresAt!==new Date(Date.parse(signalPackage.generatedAt)+86400000).toISOString())fail('DOMESTIC_BRIDGE_REQUEST_TIME_INVALID');
  if(input.packageHash!==evidenceHashFor(signalPackage)||input.requestId!==domesticBridgeRequestId(signalPackage))fail('DOMESTIC_BRIDGE_REQUEST_HASH_MISMATCH');
  return structuredClone(input);
}

export function prepareDomesticBridgeRequest({signalPackage,intakeType='CHATGPT_SIGNAL_PACKAGE',mode='VERIFY_ONLY',now=new Date(),previousRequest=null}={}) {
  const time=clock(now);
  if(intakeType!=='CHATGPT_SIGNAL_PACKAGE')fail('DOMESTIC_BRIDGE_SIGNAL_PACKAGE_REQUIRED');
  if(!['VERIFY_ONLY','REFRESH_CURRENT'].includes(mode))fail('DOMESTIC_BRIDGE_MODE_INVALID');
  const normalized=normalizeDomesticBridgeSignalPackage(signalPackage,{now:time});
  const requestId=domesticBridgeRequestId(normalized),packageHash=evidenceHashFor(normalized);
  if(mode==='VERIFY_ONLY')return {status:'VERIFIED',noQwen:true,requestId,packageHash,deduplicated:false,request:null};
  if(previousRequest!==null) {
    if(Date.parse(previousRequest?.requestedAt)>+time)fail('DOMESTIC_BRIDGE_REQUEST_TIME_FUTURE');
    const previous=validateDomesticBridgeRequest(previousRequest,{now:previousRequest?.requestedAt});
    if(previous.requestId===requestId)return {status:'QUEUED',noQwen:true,requestId,packageHash:previous.packageHash,deduplicated:true,request:previous};
  }
  const request={schemaVersion:DOMESTIC_BRIDGE_REQUEST_CONTRACT,target:DOMESTIC_BRIDGE_TARGET,environment:'Test',triggerKind:DOMESTIC_BRIDGE_TRIGGER,
    requestId,packageHash,requestedAt:time.toISOString(),expiresAt:new Date(Date.parse(normalized.generatedAt)+86400000).toISOString(),signalPackage:normalized};
  validateDomesticBridgeRequest(request,{now:time});
  return {status:'QUEUED',noQwen:true,requestId,packageHash,deduplicated:false,request};
}
