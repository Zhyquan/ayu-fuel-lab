import { validTimestamp } from './validation.js';

export const EXTERNAL_SIGNAL_CONTRACT='AYU_EXTERNAL_ANALYST_SIGNAL_V1';
export const EXTERNAL_CATEGORIES=['INTERNATIONAL_DIESEL','CRUDE','DISTILLATE_FUNDAMENTALS','OPEC_MAJOR_PRODUCERS','SUPPLY_DISRUPTION','SHIPPING','DEMAND_MACRO'];
export const EXTERNAL_SIGNAL_FIELDS=['eventKey','category','source','eventAt','publishedAt','title','summary','sourceUrl','kind','direction','strength','confirmation','reason'];
const fail=code=>{throw new Error(code);};
const cleanText=(value,max)=>typeof value==='string'&&value===value.trim()&&value.length>0&&Array.from(value).length<=max&&!/[\u0000-\u001f<>]/.test(value);
export const exactExternalKeys=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');

// Navigation/provenance only. No fetch, DNS lookup or source verification occurs here.
export function canonicalSourceUrl(value) {
  if(typeof value!=='string'||value.length>2048||/\s/.test(value))fail('EXTERNAL_URL_INVALID');
  let url;try{url=new URL(value);}catch{fail('EXTERNAL_URL_INVALID');}
  const host=url.hostname.toLowerCase();
  if(url.protocol!=='https:'||url.username||url.password||url.port||!host.includes('.')||host.endsWith('.')||
    /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host)||host.includes(':')||
    /^\d+\.\d+\.\d+\.\d+$/.test(host))fail('EXTERNAL_URL_INVALID');
  url.hash='';
  for(const key of [...url.searchParams.keys()]) {
    if(/^utm_(?:source|medium|campaign|content|term|id)$/i.test(key)||/^(?:fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igshid)$/i.test(key))url.searchParams.delete(key);
    else fail('EXTERNAL_URL_QUERY_UNSAFE');
  }
  return url.href;
}

export function externalSignalFailure(signal,{now=new Date(),normalized=false}={}) {
  if(!exactExternalKeys(signal,normalized?[...EXTERNAL_SIGNAL_FIELDS,'evidenceId','provenance']:EXTERNAL_SIGNAL_FIELDS))return 'EXTERNAL_SIGNAL_FIELDS_INVALID';
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(signal.eventKey)||signal.eventKey.length<3||signal.eventKey.length>120)return 'EXTERNAL_EVENT_KEY_INVALID';
  if(!EXTERNAL_CATEGORIES.includes(signal.category))return 'EXTERNAL_CATEGORY_INVALID';
  if(!cleanText(signal.source,48))return 'EXTERNAL_SOURCE_INVALID';
  if(!cleanText(signal.title,30)||!/[\u3400-\u9fff]/.test(signal.title))return 'EXTERNAL_TITLE_INVALID';
  if(!cleanText(signal.summary,90)||!/[\u3400-\u9fff]/.test(signal.summary))return 'EXTERNAL_SUMMARY_INVALID';
  if(!cleanText(signal.reason,240))return 'EXTERNAL_REASON_INVALID';
  if(!['FACT','RISK','OUTLOOK','CLAIM'].includes(signal.kind)||!['UP','DOWN','NEUTRAL'].includes(signal.direction)||
    !['LOW','MEDIUM','HIGH'].includes(signal.strength)||!['CONFIRMED','CONDITIONAL','UNCONFIRMED'].includes(signal.confirmation))return 'EXTERNAL_ENUM_INVALID';
  if((signal.confirmation==='CONFIRMED'&&signal.kind==='CLAIM')||(signal.confirmation==='CONDITIONAL'&&signal.kind==='FACT')||
    (signal.confirmation==='UNCONFIRMED'&&(signal.kind!=='CLAIM'||signal.strength==='HIGH')))return 'EXTERNAL_CONFIRMATION_INVALID';
  if(!validTimestamp(signal.publishedAt)||(signal.eventAt!==null&&!validTimestamp(signal.eventAt)))return 'EXTERNAL_TIME_INVALID';
  const time=+new Date(now),published=Date.parse(signal.publishedAt),event=signal.eventAt===null?published:Date.parse(signal.eventAt);
  if(published>time||event>time)return 'EXTERNAL_TIME_FUTURE';
  if(time-event>72*3600000)return 'EXTERNAL_SIGNAL_STALE';
  if(signal.sourceUrl!==null) {
    let canonical;try{canonical=canonicalSourceUrl(signal.sourceUrl);}catch(error){return error.message;}
    if(normalized&&canonical!==signal.sourceUrl)return 'EXTERNAL_URL_NOT_CANONICAL';
    const domains={reuters:'reuters.com',eia:'eia.gov',iea:'iea.org',opec:'opec.org',ap:'apnews.com'};
    const domain=domains[signal.source.toLowerCase()],host=new URL(canonical).hostname;
    if(domain&&host!==domain&&!host.endsWith(`.${domain}`))return 'EXTERNAL_SOURCE_URL_MISMATCH';
  }
  if(normalized&&(!/^external-[a-f0-9]{12}$/.test(signal.evidenceId)||signal.provenance!==(signal.sourceUrl===null?'EXTERNAL_ANALYST_NO_URL':'EXTERNAL_ANALYST_WITH_URL')))return 'EXTERNAL_IDENTITY_INVALID';
  return null;
}

export function externalSignalsGate(pack,{now=new Date()}={}) {
  const signals=pack?.externalAnalystSignals;
  if(signals===undefined)return {gate:'PASS',errors:[],signals:[]};
  const errors=[];
  if(!Array.isArray(signals)||signals.length>6)errors.push('EXTERNAL_SIGNAL_COUNT_INVALID');
  for(const signal of Array.isArray(signals)?signals:[]) {
    const error=externalSignalFailure(signal,{now,normalized:true});if(error)errors.push(error);
  }
  if(Array.isArray(signals)&&(new Set(signals.map(s=>s?.eventKey)).size!==signals.length||new Set(signals.map(s=>s?.evidenceId)).size!==signals.length))errors.push('EXTERNAL_DUPLICATE_EVENT');
  return {gate:errors.length?'FAIL':'PASS',errors,signals:errors.length?[]:signals??[]};
}

export const evidenceEventKey=(pack,id)=>pack.signals?.find(s=>s.id===id)?.eventKey??
  pack.externalAnalystSignals?.find(s=>s.evidenceId===id)?.eventKey??
  pack.newsDocuments?.find(d=>d.segments?.some(s=>`${d.documentId}:${s.segmentId}`===id))?.eventKey??
  (typeof id==='string'&&id.includes(':')?id.split(':')[0]:id);
