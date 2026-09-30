import { createHash } from 'node:crypto';
import { publicUrl, canonicalJson } from '../../dist/data/intelligence-v2-contract.js';
import { parseNewsMaterial } from './news-material.mjs';
import { verifyNewsArticle } from './news-event-rules.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const fail = code => { throw new Error(code); };
export const SOURCE_ADAPTERS = Object.freeze([
  {name:'BusinessRecorder',supports:url=>/^https:\/\/www\.brecorder\.com\/news\/\d+(?:\/[^?#]*)?$/.test(url),parse:parseNewsMaterial},
  {name:'ReutersDirect',supports:url=>new URL(url).hostname==='www.reuters.com',parse:null},
  {name:'EIA',supports:url=>['www.eia.gov','ir.eia.gov'].includes(new URL(url).hostname),parse:null},
]);

export async function resolveNewsUrl(sourceUrl,{fetchImpl=fetch,now=new Date(),timeoutMs=15000,loadHtml}={}) {
  if(typeof sourceUrl!=='string'||sourceUrl.length>2048||/\s/.test(sourceUrl)||!publicUrl(sourceUrl))fail('HTTPS_URL_INVALID');
  const adapter=SOURCE_ADAPTERS.find(item=>item.supports(sourceUrl));
  if(!adapter?.parse)fail('SOURCE_UNSUPPORTED');
  let html;
  if(loadHtml)html=await loadHtml(sourceUrl);
  else {
    let response;
    try {response=await fetchImpl(sourceUrl,{redirect:'error',signal:AbortSignal.timeout(timeoutMs),headers:{'User-Agent':'AyuFuelLabEvidence/2.0 (https://github.com/Zhyquan/ayu-fuel-lab)'}});}
    catch {fail('SOURCE_FETCH_UNAVAILABLE');}
    if(!response.ok)fail(`SOURCE_HTTP_${response.status}`);
    if(response.url&&response.url!==sourceUrl)fail('SOURCE_REDIRECT_REJECTED');
    if(Number(response.headers.get('content-length'))>1000000||!response.body)fail('SOURCE_CONTENT_INVALID');
    html='';let bytes=0;const decoder=new TextDecoder();
    for await(const chunk of response.body){bytes+=chunk.byteLength;if(bytes>1000000)fail('SOURCE_TOO_LARGE');html+=decoder.decode(chunk,{stream:true});}
    html+=decoder.decode();
  }
  if(typeof html!=='string'||Buffer.byteLength(html)>1000000)fail('SOURCE_CONTENT_INVALID');
  const fetchedAt=new Date(now).toISOString(), document=adapter.parse(html,sourceUrl,fetchedAt);
  let legacySignal=null,legacyRuleDisposition=null;
  try{legacySignal=verifyNewsArticle(html,sourceUrl,fetchedAt);document.eventKey=legacySignal.eventKey;}
  catch(error){legacyRuleDisposition=/^[A-Z0-9_]+$/.test(error.message)?error.message:'NO_SUPPORTED_EVENT_RULE';}
  return {document,legacySignal,legacyRuleDisposition,adapter:adapter.name,rawContentHash:hash(html),
    checks:['HTTPS_URL_VALID','SOURCE_SUPPORTED','FETCH_SUCCESS','SOURCE_IDENTITY_VALID','PUBLISHED_AT_VALID','FRESHNESS_PASS','CONTENT_PRESENT','CONTENT_HASH_VALID']};
}

export function deduplicateNewsDocuments(documents) {
  const accepted=[],excluded=[],seen=new Map();
  for(const document of documents) {
    const keys=[['DOCUMENT',document.documentId],['SYNDICATED_CONTENT',`${document.originalSource}:${document.articleContentHash}`],
      ['NEWS_CONTEXT',`${document.originalSource}:${hash(canonicalJson(document.segments.map(s=>s.text)))}`],
      ...(document.eventKey?[['EVENT',document.eventKey]]:[])];
    const duplicate=keys.find(([kind,key])=>seen.has(`${kind}:${key}`));
    if(duplicate){excluded.push({documentId:document.documentId,reason:`DUPLICATE_${duplicate[0]}`,duplicateOf:seen.get(duplicate.join(':'))});continue;}
    accepted.push(document);for(const [kind,key]of keys)seen.set(`${kind}:${key}`,document.documentId);
  }
  return {documents:accepted,excluded};
}
