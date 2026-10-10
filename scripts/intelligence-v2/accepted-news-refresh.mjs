import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { acceptedEvidenceGate } from '../../dist/data/accepted-evidence-contract.js';
import { canonicalJson, coreEvidenceGate, coreMarketSignals } from '../../dist/data/intelligence-v2-contract.js';
import { buildAcceptedEvidence, recomputeEligibility } from './accepted-evidence.mjs';
import { evidenceHashFor } from './history.mjs';

export const ACCEPTED_EVIDENCE_PATH='data/accepted-evidence.json';
export const EVIDENCE_WORKFLOW='Intelligence V2 evidence collection only';

export function verifyAcceptedCollection(collection,{now=new Date()}={}) {
  const {collectionHash,...value}=collection??{};
  if(acceptedEvidenceGate(collection,{now}).gate!=='PASS'||evidenceHashFor(value)!==collectionHash)throw new Error('ACCEPTED_EVIDENCE_INTEGRITY_FAILED');
  return collection;
}

export async function readAcceptedCollection(root,{now=new Date()}={}) {
  try{return verifyAcceptedCollection(JSON.parse(await readFile(resolve(root,ACCEPTED_EVIDENCE_PATH),'utf8')),{now});}
  catch(error){if(error.code==='ENOENT')return null;throw error;}
}

// Previous display admission cannot mark new material as already consumed by a Forecast.
export async function runAcceptedNewsRefresh({pack,previous=[],currentCache=null,now=new Date(),onAcceptedEvidence=async()=>{}}={}) {
  const oldPack=currentCache?.evidencePack;
  const consumed=[...(oldPack?.newsDocuments??[]).map(d=>({id:d.documentId,contentHash:d.articleContentHash,eventKey:d.eventKey??d.documentId})),
    ...(oldPack?.externalAnalystSignals??[]).map(s=>({id:s.evidenceId,eventKey:s.eventKey}))];
  const decisions=(pack.newsDocuments??[]).map(document=>({evidenceId:document.documentId,...recomputeEligibility({pack,document,previous:consumed,now})}));
  if(pack.externalAnalystSignals?.length)decisions.push({evidenceId:'EXTERNAL_SIGNALS',...recomputeEligibility({pack,externalSignals:pack.externalAnalystSignals,previous:consumed,now})});
  const core=coreEvidenceGate(pack,{now});
  const fingerprint=s=>canonicalJson({eventKey:s.eventKey,impact:s.impact,fact:s.fact,observation:s.observation});
  const changedCore=core.gate==='PASS'?coreMarketSignals(pack).filter(s=>!coreMarketSignals(oldPack).some(old=>old.id===s.id&&fingerprint(old)===fingerprint(s))):[];
  const materialEvidenceIds=[...changedCore.map(s=>s.id),...decisions.filter(d=>d.eligible).map(d=>d.evidenceId)];
  const triggerDecision={contract:'RECOMPUTE_ELIGIBILITY_V2',eligible:core.gate==='PASS'&&materialEvidenceIds.length>0,
    reason:core.gate!=='PASS'?'CORE_INVALID':materialEvidenceIds.length?'MATERIAL_NEW_EVIDENCE':'NO_MATERIAL_NEW_EVIDENCE',
    materialEvidenceIds,comparedForecastHash:currentCache?evidenceHashFor({...currentCache,status:'LIVE'}):null};
  const {collectionHash:oldHash,...value}=buildAcceptedEvidence({pack,previous,now});
  const collection={...value,forecastTrigger:triggerDecision};
  const acceptedCollection={...collection,collectionHash:evidenceHashFor(collection)};
  verifyAcceptedCollection(acceptedCollection,{now});
  await onAcceptedEvidence(acceptedCollection);
  return {acceptedCollection,triggerDecision,decisions,coreGate:core.gate,realQwenCalls:0};
}
