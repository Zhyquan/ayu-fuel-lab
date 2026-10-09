import { canonicalSourceUrl } from './external-analyst-contract.js';
import { validTimestamp } from './validation.js';
export const ACCEPTED_EVIDENCE_CONTRACT='FUEL_ACCEPTED_EVIDENCE_V2';
const text=(v,max)=>typeof v==='string'&&v.trim().length>0&&Array.from(v).length<=max&&!/[<>\u0000-\u001f]/.test(v);
const hash=v=>/^[a-f0-9]{64}$/.test(v??'');
const fields=['id','evidenceId','eventKey','title','summary','source','sourceName','publisher','sourceUrl','publishedAt','date','publishedAtPrecision','type','relevance','forecastInfluence','influenceBasis','displayEligible','displayPriority','policy','contentHash','inputHash','relationship','forecastHash','direction','directionLabel'];
// Integrity (collectionHash + publisher/source receipt) must additionally be checked server-side.
export function acceptedEvidenceGate(collection,{now=new Date()}={}) {
 const errors=[],rows=collection?.acceptedEvidence;
 if(collection?.schemaVersion!==ACCEPTED_EVIDENCE_CONTRACT||!validTimestamp(collection?.generatedAt)||Date.parse(collection.generatedAt)>+now||!hash(collection?.inputHash)||!hash(collection?.collectionHash)||!Array.isArray(rows))return {gate:'FAIL',errors:['COLLECTION_SCHEMA_INVALID'],acceptedEvidence:[]};
 if(new TextEncoder().encode(JSON.stringify(rows)).length>65536)errors.push('COLLECTION_TOO_LARGE');
 const seen=new Set();
 for(const e of rows){
  let urlOK=e?.sourceUrl===null&&e?.influenceBasis==='EXTERNAL_ANALYST';
  try{urlOK ||= canonicalSourceUrl(e?.sourceUrl)===e?.sourceUrl;}catch{}
  if(!e||Object.keys(e).sort().join()!==[...fields].sort().join()||!text(e.id,150)||!text(e.evidenceId,150)||!text(e.eventKey,150)||!text(e.title,30)||!text(e.summary,90)||!text(e.source,48)||!text(e.sourceName,60)||!text(e.publisher,48)||!urlOK||
   !validTimestamp(e.publishedAt)||Date.parse(e.publishedAt)>Date.parse(collection.generatedAt)||e.date!==e.publishedAt.slice(0,10)||!['SECOND','DATE_ONLY'].includes(e.publishedAtPrecision)||!hash(e.contentHash)||!hash(e.inputHash)||
   !['FACT','RISK','OUTLOOK','CLAIM','REPORT'].includes(e.type)||!text(e.relevance,40)||!['LOW','MEDIUM','HIGH'].includes(e.forecastInfluence)||!['MODEL_ASSESSMENT','TRIGGER_PREASSESSMENT_ONLY','EXTERNAL_ANALYST'].includes(e.influenceBasis)||e.displayEligible!==true||!Number.isSafeInteger(e.displayPriority)||e.displayPriority<0||e.displayPriority>100||
   !['ACCEPTED_LOW_INFLUENCE','ACCEPTED_MATERIAL','FORECAST_PRIMARY_EVIDENCE'].includes(e.policy)||!['RELATED_ONLY','FORECAST_REASON'].includes(e.relationship)||!['UP','DOWN','NEUTRAL'].includes(e.direction)||!text(e.directionLabel,20)||
   (e.relationship==='FORECAST_REASON'?(!hash(e.forecastHash)||e.policy!=='FORECAST_PRIMARY_EVIDENCE'):e.forecastHash!==null))errors.push('ACCEPTED_ROW_INVALID');
  if(seen.has(e?.id))errors.push('ACCEPTED_ID_DUPLICATE');seen.add(e?.id);
 }
 return {gate:errors.length?'FAIL':'PASS',errors,acceptedEvidence:errors.length?[]:rows.filter(e=>+now-Date.parse(e.publishedAt)<=72*3600000)};
}
