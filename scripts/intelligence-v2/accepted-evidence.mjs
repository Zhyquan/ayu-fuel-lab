import { ACCEPTED_EVIDENCE_CONTRACT, acceptedEvidenceGate } from '../../dist/data/accepted-evidence-contract.js';
import { admittedNewsDocuments, coreEvidenceGate, newsEnrichmentGate } from '../../dist/data/intelligence-v2-contract.js';
import { publicEvidenceGate } from '../../dist/data/public-evidence.js';
import { externalSignalsGate } from '../../dist/data/external-analyst-contract.js';
import { deduplicateNewsDocuments } from './source-adapters.mjs';
import { evidenceHashFor } from './history.mjs';

export { ACCEPTED_EVIDENCE_CONTRACT };
const horizon = 72 * 3600000;
// Admission/trigger classification, not a prediction or a claim that an event has occurred.
function topic(document) {
  const text = document.segments.map(s => s.text).join(' ');
  if (/\b(?:diesel|distillate|gasoil)\b/i.test(text) && /\b(?:stocks?|inventor|reserves?)\w*/i.test(text))
    return { title:'柴油库存相关报道', summary:'报道涉及柴油库存与供应情况。', material:/\b(?:release|draw|declin|increas|decreas|agrees?)\w*/i.test(text) };
  if (/\b(?:pipeline|refinery|oil exports?|oil terminal)\b/i.test(text) && /\b(?:halted|suspended|restarted|resumed|shutdown)\b/i.test(text))
    return { title:'油品供应设施相关报道', summary:'报道涉及油品供应设施的运行情况。', material:true };
  if (/\b(?:OPEC|production cuts?|output cuts?)\b/i.test(text))
    return { title:'产油政策相关报道', summary:'报道涉及产油政策与市场供应。', material:true };
  return { title:'能源市场相关报道', summary:'报道涉及能源市场动态，可查看原始来源。', material:false };
}

export function recomputeEligibility({ pack, document, externalSignals = [], previous = [], now = new Date() }) {
  const core = coreEvidenceGate(pack,{now});
  const docs = admittedNewsDocuments({...pack,generatedAt:new Date(now).toISOString()}).documents;
  const valid = document && docs.find(d => d.documentId===document.documentId);
  const external = externalSignalsGate({...pack,externalAnalystSignals:externalSignals},{now});
  const fresh = !document || (valid && +now-Date.parse(valid.publishedAt)<=horizon);
  const duplicate = document ? previous.some(e => e.id===document.documentId || e.contentHash===document.articleContentHash || (document.eventKey && e.eventKey===document.eventKey))
    : externalSignals.length>0 && externalSignals.every(s=>previous.some(e=>e.eventKey===s.eventKey));
  const trusted = document ? Boolean(valid) : external.gate==='PASS' && external.signals.length>0;
  const material = document ? Boolean(valid && topic(valid).material)
    : external.gate==='PASS' && external.signals.some(s=>s.strength!=='LOW' && s.confirmation!=='UNCONFIRMED' && !previous.some(e=>e.eventKey===s.eventKey));
  const eligible = core.gate==='PASS' && Boolean(fresh) && trusted && !duplicate && material;
  return {contract:'RECOMPUTE_ELIGIBILITY_V2',eligible,checks:{core:core.gate,fresh:Boolean(fresh),sourceTrust:trusted?(document?'BODY_VERIFIED':'EXTERNAL_ANALYST'):'REJECTED',relevant:trusted,novel:!duplicate,material},
    reason:core.gate!=='PASS'?'CORE_INVALID':!fresh?'STALE':!trusted?'NOT_ADMITTED':duplicate?'DUPLICATE':!material?'LOW_MATERIALITY':'MATERIAL_NEW_EVIDENCE'};
}

// This related-news collection is independent of the bounded model context and reason list.
// No article body or external analyst reason text is included in its consumer projection.
export function buildAcceptedEvidence({pack,forecast=null,previous=[],now=new Date()}={}) {
  if(coreEvidenceGate(pack,{now}).gate!=='PASS')throw new Error('ACCEPTED_EVIDENCE_CORE_INVALID');
  const inputHash=evidenceHashFor(pack);
  const admitted=admittedNewsDocuments({...pack,generatedAt:new Date(now).toISOString()});
  const {documents,excluded}=deduplicateNewsDocuments(admitted.documents);
  const enrichment=forecast?newsEnrichmentGate(forecast,pack,{mode:'FORECAST'}):null;
  const cards=forecast?publicEvidenceGate({forecast,evidencePack:pack},{now}).cards:[];
  const refs=new Set(forecast?[...forecast.mainReasons,...forecast.counterReasons].map(r=>r.evidenceId):[]);
  const entries=documents.filter(d=>+now-Date.parse(d.publishedAt)<=horizon).map(d=>{
    const assessment=enrichment?.newsAssessments.find(a=>a.documentId===d.documentId);
    const primary=assessment && refs.has(assessment.evidenceId), copy=topic(d);
    const influence=assessment?.strength??'LOW';
    const policy=primary?'FORECAST_PRIMARY_EVIDENCE':copy.material?'ACCEPTED_MATERIAL':'ACCEPTED_LOW_INFLUENCE';
    return {id:d.documentId,evidenceId:assessment?.evidenceId??d.documentId,eventKey:d.eventKey??d.documentId,
      title:assessment?.title??copy.title,summary:assessment?.summary??copy.summary,
      source:d.originalSource,sourceName:d.originalSource,publisher:d.publisher,sourceUrl:d.sourceUrl,
      publishedAt:d.publishedAt,date:d.publishedAt.slice(0,10),publishedAtPrecision:d.publishedAtPrecision,
      type:assessment?.kind??'REPORT',relevance:'ENERGY_MARKET',forecastInfluence:influence,
      influenceBasis:assessment?'MODEL_ASSESSMENT':'TRIGGER_PREASSESSMENT_ONLY',displayEligible:true,
      displayPriority:primary?100:copy.material?70:30,policy,contentHash:d.articleContentHash,inputHash,
      relationship:primary?'FORECAST_REASON':'RELATED_ONLY',forecastHash:primary?evidenceHashFor({...forecast,evidencePack:pack}):null,
      direction:assessment?.impact??'NEUTRAL',directionLabel:primary?cards.find(c=>c.evidenceId===assessment.evidenceId)?.directionLabel??'相关情报':'相关情报'};
  });
  const external=externalSignalsGate(pack,{now});
  if(external.gate!=='PASS')throw new Error('ACCEPTED_EXTERNAL_INVALID');
  for(const signal of external.signals) {
    const primary=refs.has(signal.evidenceId), material=signal.strength!=='LOW' && signal.confirmation!=='UNCONFIRMED';
    entries.push({id:signal.evidenceId,evidenceId:signal.evidenceId,eventKey:signal.eventKey,title:signal.title,summary:signal.summary,
      source:signal.source,sourceName:`外部分析 · ${signal.source}`,publisher:signal.source,sourceUrl:signal.sourceUrl,
      publishedAt:signal.publishedAt,date:signal.publishedAt.slice(0,10),publishedAtPrecision:'SECOND',type:signal.kind,relevance:signal.category,
      forecastInfluence:signal.strength,influenceBasis:'EXTERNAL_ANALYST',displayEligible:true,displayPriority:primary?100:material?70:30,
      policy:primary?'FORECAST_PRIMARY_EVIDENCE':material?'ACCEPTED_MATERIAL':'ACCEPTED_LOW_INFLUENCE',
      contentHash:evidenceHashFor(signal),inputHash,relationship:primary?'FORECAST_REASON':'RELATED_ONLY',
      forecastHash:primary?evidenceHashFor({...forecast,evidencePack:pack}):null,direction:signal.direction,directionLabel:primary?cards.find(c=>c.evidenceId===signal.evidenceId)?.directionLabel??'外部分析':'相关分析'});
  }
  // Existing accepted rows come only from the trusted publisher receipt, never model output.
  const fresh=previous.filter(e=>e.displayEligible===true && Date.parse(e.publishedAt)<=+now && +now-Date.parse(e.publishedAt)<=horizon);
  const merged=new Map(fresh.map(e=>[e.id,{...e,relationship:'RELATED_ONLY',forecastHash:null,policy:e.policy==='FORECAST_PRIMARY_EVIDENCE'?'ACCEPTED_MATERIAL':e.policy,displayPriority:Math.min(e.displayPriority,70)}]));
  for(const entry of entries)merged.set(entry.id,entry);
  const seen=new Set(), acceptedEvidence=[...merged.values()].sort((a,b)=>b.displayPriority-a.displayPriority||b.publishedAt.localeCompare(a.publishedAt)||a.id.localeCompare(b.id)).filter(e=>{
    const key=`${e.source}:${e.contentHash}`,event=e.eventKey;
    if(seen.has(key)||seen.has(event))return false;seen.add(key);seen.add(event);return true;
  });
  // A payload byte budget bounds storage/transport without hardcoding a UI card count.
  while(Buffer.byteLength(JSON.stringify(acceptedEvidence))>65536)acceptedEvidence.pop();
  const value={schemaVersion:ACCEPTED_EVIDENCE_CONTRACT,generatedAt:new Date(now).toISOString(),inputHash,acceptedEvidence,
    exclusions:[...admitted.errors.map(reason=>({reason})),...excluded]};
  const collection={...value,collectionHash:evidenceHashFor(value)};
  if(acceptedEvidenceGate(collection,{now}).gate!=='PASS')throw new Error('ACCEPTED_EVIDENCE_PROJECTION_INVALID');
  return collection;
}
