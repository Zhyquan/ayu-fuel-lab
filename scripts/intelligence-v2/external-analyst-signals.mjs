import { createHash } from 'node:crypto';
import { validTimestamp } from '../../dist/data/validation.js';
import { EXTERNAL_SIGNAL_CONTRACT, exactExternalKeys, externalSignalFailure, canonicalSourceUrl } from '../../dist/data/external-analyst-contract.js';
import { deduplicateNewsDocuments } from './source-adapters.mjs';
import { admittedNewsDocuments, signalFailure } from '../../dist/data/intelligence-v2-contract.js';
const fail=code=>{throw new Error(code);};
export const externalEvidenceId=eventKey=>`external-${createHash('sha256').update(eventKey).digest('hex').slice(0,12)}`;

export function validateExternalAnalystSignalPackage(input,{now=new Date()}={}) {
  let value=input;
  if(typeof input==='string') {
    if(Buffer.byteLength(input)>16384)fail('EXTERNAL_PACKAGE_TOO_LARGE');
    try{value=JSON.parse(input);}catch{fail('EXTERNAL_JSON_INVALID');}
  }
  if(!exactExternalKeys(value,['schemaVersion','generatedAt','signals'])||value.schemaVersion!==EXTERNAL_SIGNAL_CONTRACT)fail('EXTERNAL_SCHEMA_INVALID');
  if(!validTimestamp(value.generatedAt))fail('EXTERNAL_PACKAGE_TIME_INVALID');
  if(Date.parse(value.generatedAt)>+new Date(now))fail('EXTERNAL_PACKAGE_TIME_FUTURE');
  if(+new Date(now)-Date.parse(value.generatedAt)>=86400000)fail('EXTERNAL_PACKAGE_STALE');
  if(!Array.isArray(value.signals)||value.signals.length<1||value.signals.length>6)fail('EXTERNAL_SIGNAL_COUNT_INVALID');
  if(new Set(value.signals.map(s=>s?.eventKey)).size!==value.signals.length)fail('EXTERNAL_DUPLICATE_EVENT');
  const signals=value.signals.map(signal=>{
    const error=externalSignalFailure(signal,{now});if(error)fail(error);
    if(Date.parse(signal.publishedAt)>Date.parse(value.generatedAt)||(signal.eventAt!==null&&Date.parse(signal.eventAt)>Date.parse(value.generatedAt)))fail('EXTERNAL_TIME_AFTER_PACKAGE');
    const sourceUrl=signal.sourceUrl===null?null:canonicalSourceUrl(signal.sourceUrl);
    return {...signal,sourceUrl,evidenceId:externalEvidenceId(signal.eventKey),provenance:sourceUrl===null?'EXTERNAL_ANALYST_NO_URL':'EXTERNAL_ANALYST_WITH_URL'};
  });
  return {schemaVersion:EXTERNAL_SIGNAL_CONTRACT,generatedAt:value.generatedAt,signals};
}

export function mergeExternalSignals(pack,normalized,{currentCache,autoEvidence,now=new Date()}={}) {
  const previous=currentCache?.evidencePack?.externalAnalystSignals??[];
  const repeat=normalized.signals.filter(s=>previous.some(p=>p.eventKey===s.eventKey));
  if(repeat.length===normalized.signals.length)fail('BRIDGE_DUPLICATE_ONLY');
  const externalAnalystSignals=normalized.signals.filter(s=>!repeat.includes(s));
  const autoFresh=autoEvidence?.inputContractVersion==='NEWS_MATERIAL_V1'&&validTimestamp(autoEvidence.generatedAt)&&Date.parse(autoEvidence.generatedAt)<=+new Date(now)&&+new Date(now)-Date.parse(autoEvidence.generatedAt)<86400000;
  const autoDocuments=autoFresh?admittedNewsDocuments({...pack,generatedAt:new Date(now).toISOString(),newsDocuments:autoEvidence.newsDocuments}).documents:[];
  const autoSignals=autoFresh?(autoEvidence.signals??[]).filter(s=>!signalFailure(s,now)):[];
  const dedup=deduplicateNewsDocuments([...admittedNewsDocuments(pack).documents,...autoDocuments]);
  const documents=dedup.documents.slice(0,6).map(document=>{
    const external=externalAnalystSignals.find(s=>s.eventKey===document.eventKey||(s.sourceUrl!==null&&s.sourceUrl===document.sourceUrl));
    return external?{...document,eventKey:external.eventKey}:document;
  });
  const overlaps=externalAnalystSignals.filter(s=>documents.some(d=>d.eventKey===s.eventKey)||[...pack.signals,...autoSignals].some(a=>a.eventKey===s.eventKey));
  for(const s of overlaps) {
    const opposing=[...pack.signals,...autoSignals].find(a=>a.eventKey===s.eventKey&&a.impact!==s.direction&&a.impact!=='NEUTRAL'&&s.direction!=='NEUTRAL');
    if(opposing)fail('EXTERNAL_AUTO_EVENT_CONFLICT');
  }
  const groups=new Map();
  for(const item of [...pack.signals.map(s=>({eventKey:s.eventKey,id:s.id})),...documents.flatMap(d=>d.segments.map(s=>({eventKey:d.eventKey??d.documentId,id:`${d.documentId}:${s.segmentId}`}))),...externalAnalystSignals.map(s=>({eventKey:s.eventKey,id:s.evidenceId}))]) {
    const group=groups.get(item.eventKey)??{eventKey:item.eventKey,evidenceIds:[],weightingRule:'ONE_EVENT_NOT_ARTICLE_COUNT'};
    group.evidenceIds.push(item.id);groups.set(item.eventKey,group);
  }
  return {pack:{...structuredClone(pack),newsDocuments:documents,coverageMode:documents.length?pack.coverageMode==='NORMAL'||autoDocuments.length?'NORMAL':'LIMITED':'LIMITED',externalAnalystSignals,eventGroups:[...groups.values()],exclusions:[...(pack.exclusions??[]),...dedup.excluded]},
    duplicateEvents:overlaps.length+repeat.length,excluded:[...repeat.map(s=>({evidenceId:s.evidenceId,reason:'EXTERNAL_PREVIOUS_EVENT'})),...dedup.excluded]};
}
