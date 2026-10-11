import { validTimestamp } from './validation.js';
import { acceptedEvidenceGate, ACCEPTED_EVIDENCE_CONTRACT } from './accepted-evidence-contract.js';
import { canonicalJson } from './intelligence-v2-contract.js';

export const DOMESTIC_FUEL_FORECAST_CONTRACT='DOMESTIC_FUEL_FORECAST_CONTRACT_V1';
export const DOMESTIC_FUEL_TARGET='CHINA_DOMESTIC_REFINED_OIL_ADJUSTMENT';
export const DOMESTIC_FUEL_HORIZON='NEXT_7_DAYS';
export const DOMESTIC_DIRECTIONS=['UP','DOWN','HOLD_OR_NO_ADJUSTMENT'];
export const DOMESTIC_PRIMARY_EVIDENCE_FIELDS=['evidenceId','eventKey','role','direction','directionScope','strength','freshness','relevance','kind','windowId','text','sourceName','sourceUrl','publishedAt','checkedAt','contentHash','verified'];
export const DOMESTIC_FUEL_ARTIFACT_PATH='data/domestic-fuel-forecast.json';
export const DOMESTIC_PROMPT_VERSION='qwen-domestic-fuel-v1-integer-1pct';
const hash=value=>/^[a-f0-9]{64}$/.test(value??'');
const text=(value,max)=>typeof value==='string'&&value.trim().length>0&&Array.from(value).length<=max&&!/[<>\u0000-\u001f]/.test(value);
const fields=['schemaVersion','target','horizon','horizonStartAt','horizonEndAt','probabilityType','probabilities','direction','confidence','reason','primaryEvidence','acceptedEvidence','acceptedEvidenceRevision','forecastId','evidenceRevision','evidenceProof','generatedAt','validUntil','publishedAt'];

// FLAT is a storage code only in this new target; legacy FLAT is never reinterpreted.
export function domesticDirectionFor(percentages) {
  if(percentages.FLAT>=percentages.UP&&percentages.FLAT>=percentages.DOWN)return 'HOLD_OR_NO_ADJUSTMENT';
  return percentages.UP>percentages.DOWN?'UP':percentages.DOWN>percentages.UP?'DOWN':null;
}

export const domesticForecastContent=forecast=>Object.fromEntries(Object.entries(forecast??{}).filter(([key])=>!['forecastId','publishedAt'].includes(key)));
const hashFor=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonicalJson(value)))),b=>b.toString(16).padStart(2,'0')).join('');

export function domesticForecastStructureGate(forecast,{now=new Date(),requirePublished=false,evidencePack=null}={}) {
  const errors=[],p=forecast?.probabilities;
  if(!Number.isFinite(+new Date(now))||!forecast||Object.keys(forecast).sort().join()!==[...fields].sort().join()||
    forecast.schemaVersion!==DOMESTIC_FUEL_FORECAST_CONTRACT||forecast.target!==DOMESTIC_FUEL_TARGET||forecast.horizon!==DOMESTIC_FUEL_HORIZON)errors.push('DOMESTIC_TARGET_CONTRACT_INVALID');
  const percentages=p&&Object.keys(p).sort().join()===[...DOMESTIC_DIRECTIONS].sort().join()&&Object.values(p).every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1)?{UP:p.UP*100,DOWN:p.DOWN*100,FLAT:p.HOLD_OR_NO_ADJUSTMENT*100}:null;
  if(!percentages||Object.values(percentages).some(v=>!Number.isFinite(v)||v<0||v>100||Math.abs(v-Math.round(v))>1e-8)||
    Math.round(percentages.UP)+Math.round(percentages.DOWN)+Math.round(percentages.FLAT)!==100||Math.abs(Object.values(p).reduce((a,b)=>a+b,0)-1)>1e-12)errors.push('DOMESTIC_PROBABILITIES_INVALID');
  if(!percentages||!DOMESTIC_DIRECTIONS.includes(forecast?.direction)||forecast.direction!==domesticDirectionFor(percentages))errors.push('DOMESTIC_DIRECTION_INVALID');
  if(forecast?.probabilityType!=='AI_SUBJECTIVE_ESTIMATE'||!['LOW','MEDIUM','HIGH'].includes(forecast?.confidence)||!text(forecast?.reason,180))errors.push('DOMESTIC_ANALYSIS_INVALID');
  if(!['REAL_VERIFIED_EVIDENCE','SYNTHETIC_SEMANTIC_TEST'].includes(forecast?.evidenceProof)||!hash(forecast?.forecastId)||!hash(forecast?.evidenceRevision)||!hash(forecast?.acceptedEvidenceRevision))errors.push('DOMESTIC_IDENTITY_INVALID');
  if(!['horizonStartAt','horizonEndAt','generatedAt','validUntil'].every(k=>validTimestamp(forecast?.[k]))||
    Date.parse(forecast?.horizonEndAt)-Date.parse(forecast?.horizonStartAt)!==7*86400000||Date.parse(forecast?.horizonStartAt)>Date.parse(forecast?.generatedAt)||
    Date.parse(forecast?.generatedAt)>+new Date(now)||Date.parse(forecast?.validUntil)-Date.parse(forecast?.generatedAt)!==86400000)errors.push('DOMESTIC_TIME_INVALID');
  if(forecast?.publishedAt!==null&&(!validTimestamp(forecast?.publishedAt)||Date.parse(forecast.publishedAt)<Date.parse(forecast.generatedAt)||Date.parse(forecast.publishedAt)>+new Date(now)))errors.push('DOMESTIC_PUBLICATION_TIME_INVALID');
  if(requirePublished&&(forecast?.publishedAt===null||forecast?.evidenceProof!=='REAL_VERIFIED_EVIDENCE'))errors.push('DOMESTIC_NOT_PUBLISHABLE');
  if(evidencePack&&(evidencePack.target!==DOMESTIC_FUEL_TARGET||evidencePack.evidenceProof!==forecast?.evidenceProof))errors.push('DOMESTIC_EVIDENCE_REVISION_MISMATCH');
  const sourceValid=e=>{
    let url;try{url=new URL(e?.sourceUrl);}catch{return false;}
    return url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&!url.hash&&e.verified===true&&hash(e.contentHash)&&text(e.sourceName,48)&&text(e.eventKey,150)&&text(e.windowId,150)&&text(e.text,1500)&&
      validTimestamp(e.publishedAt)&&validTimestamp(e.checkedAt)&&Date.parse(e.publishedAt)<=Date.parse(e.checkedAt)&&Date.parse(e.checkedAt)<=Date.parse(forecast.generatedAt)&&Date.parse(forecast.generatedAt)-Date.parse(e.checkedAt)<86400000;
  };
  const primary=forecast?.primaryEvidence;
  if(!Array.isArray(primary)||!primary.length||primary.length>3||new Set(primary.map(e=>e?.evidenceId)).size!==primary.length||
    !primary.some(e=>e?.directionScope==='DOMESTIC_ADJUSTMENT'&&e.direction===forecast?.direction)||
    primary.some(e=>!e||Object.keys(e).sort().join()!==[...DOMESTIC_PRIMARY_EVIDENCE_FIELDS].sort().join()||!sourceValid(e)||!text(e.evidenceId,150)||!['DOMESTIC_PRICING_SIGNAL','OFFICIAL_POLICY_OR_ADJUSTMENT'].includes(e.role)||
      e.directionScope!=='DOMESTIC_ADJUSTMENT'||!DOMESTIC_DIRECTIONS.includes(e.direction)||!['MEDIUM','HIGH'].includes(e.strength)||e.freshness!=='CURRENT'||e.relevance!=='DIRECT'||!['FACT','ESTIMATE','RISK'].includes(e.kind)||
      (evidencePack&&!evidencePack.evidence?.some(original=>canonicalJson(original)===canonicalJson(e)))))errors.push('DOMESTIC_PRIMARY_EVIDENCE_INVALID');
  if(acceptedEvidenceGate({schemaVersion:ACCEPTED_EVIDENCE_CONTRACT,generatedAt:forecast?.generatedAt,inputHash:forecast?.evidenceRevision,collectionHash:forecast?.acceptedEvidenceRevision,acceptedEvidence:forecast?.acceptedEvidence},{now:new Date(forecast?.generatedAt)}).gate!=='PASS')errors.push('DOMESTIC_ACCEPTED_EVIDENCE_INVALID');
  return {gate:errors.length?'FAIL':'PASS',errors,status:errors.length?'UNAVAILABLE':forecast.publishedAt===null?'UNPUBLISHED':+new Date(now)>=Date.parse(forecast.validUntil)?'STALE':'LIVE'};
}

export async function domesticForecastGate(forecast,options={}) {
  const checked=domesticForecastStructureGate(forecast,options),errors=[...checked.errors];
  if(hash(forecast?.forecastId)&&await hashFor(domesticForecastContent(forecast))!==forecast.forecastId)errors.push('DOMESTIC_FORECAST_HASH_MISMATCH');
  if(options.evidencePack&&await hashFor(options.evidencePack)!==forecast?.evidenceRevision)errors.push('DOMESTIC_EVIDENCE_REVISION_MISMATCH');
  return {...checked,gate:errors.length?'FAIL':'PASS',errors,status:errors.length?'UNAVAILABLE':checked.status};
}

export function domesticProviderAuditGate(forecast,audit) {
  const errors=[];
  if(audit?.provider!=='QWEN'||audit.model!=='qwen3.8-flash'||audit.promptVersion!==DOMESTIC_PROMPT_VERSION||audit.status!=='OK'||audit.mock!==false||audit.semanticCallCount!==1||audit.httpStatus!==200||
    !Number.isInteger(audit.configuredTransportRetries)||audit.configuredTransportRetries<0||audit.configuredTransportRetries>2||!Number.isInteger(audit.maxExternalRequests)||audit.maxExternalRequests<1||audit.maxExternalRequests>3||
    !Number.isInteger(audit.actualExternalRequestCount)||audit.actualExternalRequestCount<1||audit.actualExternalRequestCount>audit.maxExternalRequests||audit.actualExternalRequestCount>audit.configuredTransportRetries+1||audit.attemptCount!==audit.actualExternalRequestCount||
    audit.inputPackHash!==forecast.evidenceRevision||audit.evidenceHash!==forecast.evidenceRevision||!hash(audit.outputHash)||!validTimestamp(audit.requestStartedAt)||!validTimestamp(audit.requestCompletedAt)||
    Date.parse(audit.requestStartedAt)>Date.parse(forecast.generatedAt)||Date.parse(audit.requestCompletedAt)<Date.parse(forecast.generatedAt))errors.push('DOMESTIC_PROVIDER_AUDIT_INVALID');
  return {gate:errors.length?'FAIL':'PASS',errors};
}
