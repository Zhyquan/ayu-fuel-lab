import { createHash } from 'node:crypto';
import { collectEvidence } from './intelligence-v2/collect.mjs';
import { projectDomesticInput, domesticInputGate } from './intelligence-v2/domestic-fuel.mjs';
import { coreEvidenceGate } from '../dist/data/intelligence-v2-contract.js';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const plain=s=>s.replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();
const fail=code=>{throw Object.assign(new Error(code),{code});};
function articleDiv(html,className,id=null) {
  const matches=[...html.matchAll(/<div\b[^>]*>/gi)].filter(token=>{
    const classes=token[0].match(/\bclass\s*=\s*["']([^"']*)["']/i)?.[1]?.split(/\s+/)??[];
    return classes.includes(className)&&(!id||token[0].match(/\bid\s*=\s*["']([^"']*)["']/i)?.[1]===id);
  });
  if(matches.length!==1)fail('FUEL_TEST_PRICING_BODY_MISSING');
  const start=matches[0].index+matches[0][0].length,tail=html.slice(start);let depth=1;
  for(const token of tail.matchAll(/<\/?div\b[^>]*>/gi)) {
    depth+=/^<\/div/i.test(token[0])?-1:1;
    if(depth===0)return tail.slice(0,token.index);
  }
  fail('FUEL_TEST_PRICING_BODY_MISSING');
}

// This calendar's toDay widget is not an adjustment date. Bind every other byte
// to the reviewed receipt and continue checking the calendar image separately.
function matchesCalendarReceipt(source,bytes,now) {
  if(source.sourceId!=='calendar'||source.sourceUrl!=='https://cx.sinopecsales.com/yjkqiantai/core/toCalendar'||
    !/^\d{4}-\d{2}-\d{2}$/.test(source.frozenUiDay??''))return false;
  const [year,month,day]=source.frozenUiDay.split('-').map(Number);
  if(new Date(Date.UTC(year,month-1,day)).toISOString().slice(0,10)!==source.frozenUiDay)return false;
  const html=bytes.toString('utf8'),matches=[...html.matchAll(/\btoDay:\s*"(\d{4}\\u5E74\d{1,2}\\u6708\d{1,2}\\u65E5)"/g)];
  if(matches.length!==1)return false;
  const displayed=JSON.parse(`"${matches[0][1]}"`);
  const today=new Date(+new Date(now)+8*3600000).toISOString().slice(0,10).split('-').map(Number);
  if(displayed!==`${today[0]}年${today[1]}月${today[2]}日`)return false;
  const frozen=`${year}\\u5E74${month}\\u6708${day}\\u65E5`;
  const canonical=html.replace(matches[0][0],matches[0][0].replace(matches[0][1],frozen));
  return digest(canonical)===source.contentHash;
}

// Recheck the already reviewed sources/field bindings; never discover or infer a new domestic estimate/window.
export async function recheckDomesticSources(seed,{fetchImpl=fetch,now=()=>new Date()}={}) {
  const receipts=[];
  for(const source of seed.sources) {
    const response=await fetchImpl(source.sourceUrl,{signal:AbortSignal.timeout(20000)});
    if(response.status!==200)fail('FUEL_TEST_SOURCE_HTTP_FAILED');
    if(response.url&&response.url!==source.sourceUrl)fail('FUEL_TEST_SOURCE_REDIRECT_REJECTED');
    const bytes=Buffer.from(await response.arrayBuffer());
    if(bytes.length>2*1024*1024)fail('FUEL_TEST_SOURCE_TOO_LARGE');
    const contentHash=digest(bytes),checkedAt=now().toISOString();
    let uiOnlyChange=false;
    if(source.kind==='FROZEN_OFFICIAL_RECEIPT') {
      if(contentHash!==source.contentHash) {
        uiOnlyChange=matchesCalendarReceipt(source,bytes,new Date(checkedAt));
        if(!uiOnlyChange)fail('FUEL_TEST_OFFICIAL_SOURCE_CHANGED');
      }
    } else if(source.kind==='VERIFIED_PRICING_PARAGRAPH') {
      const html=bytes.toString('utf8').replace(/<!--[\s\S]*?-->/g,'').replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi,'');
      const article=articleDiv(html,'xqbox'),header=articleDiv(article,'xq-head');
      const body=articleDiv(articleDiv(article,'xqwrap'),'xq-content','content');
      const paragraphs=[...body.matchAll(/<p\b[^>]*>[\s\S]*?<\/p>/gi)].map(m=>plain(m[0]));
      const matching=paragraphs.filter(p=>p.includes(source.paragraphAnchor));
      const timestamps=[...header.matchAll(/<span\b[^>]*>[\s\S]*?<\/span>/gi)]
        .map(m=>plain(m[0]).match(/^发布时间\s*[：:]\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2})(?:\s|$)/)?.[1]).filter(Boolean);
      if(matching.length!==1||digest(matching[0])!==source.paragraphTextHash||
        timestamps.length!==1||timestamps[0]!==source.publisherTimestampText)fail('FUEL_TEST_PRICING_BINDING_CHANGED');
    } else fail('FUEL_TEST_SOURCE_KIND_UNKNOWN');
    receipts.push({sourceId:source.sourceId,sourceUrl:source.sourceUrl,contentHash,checkedAt,
      ...(uiOnlyChange?{uiOnlyChange:true,frozenContentHash:source.contentHash}:{})});
  }
  const copy=structuredClone(seed),receipt=id=>receipts.find(r=>r.sourceId===id),completed=ids=>ids.map(id=>receipt(id).checkedAt).sort().at(-1);
  copy.policy.checkedAt=completed(copy.policySourceIds);
  copy.adjustmentWindow.checkedAt=completed(copy.windowSourceIds);
  for(const evidence of copy.domesticEvidence) {
    if(evidence.evidenceId===copy.pricingEvidenceId) {
      evidence.checkedAt=receipt(copy.pricingSourceId).checkedAt;evidence.contentHash=receipt(copy.pricingSourceId).contentHash;
    } else evidence.checkedAt=copy.policy.checkedAt;
  }
  return {policy:copy.policy,adjustmentWindow:copy.adjustmentWindow,domesticEvidence:copy.domesticEvidence,receipts};
}

export function buildFreshDomesticInput({pack,verified,now=new Date()}={}) {
  const marketGate=coreEvidenceGate(pack,{now});
  if(marketGate.gate!=='PASS')throw Object.assign(new Error('DOMESTIC_MARKET_INPUT_INVALID'),{
    code:'DOMESTIC_MARKET_INPUT_INVALID',validationStage:'DOMESTIC_MARKET_INPUT',
    validationSubtype:marketGate.errors[0],gateErrors:marketGate.errors});
  const input=projectDomesticInput({pack,policy:verified.policy,adjustmentWindow:verified.adjustmentWindow,
    domesticEvidence:verified.domesticEvidence,evidenceProof:'REAL_VERIFIED_EVIDENCE',now});
  const gate=domesticInputGate(input,{now});
  if(gate.gate!=='PASS')fail(gate.errors[0]);
  return input;
}

export async function loadFreshDomesticInput(seed,{fetchImpl=fetch,now=()=>new Date(),onMarketInput=async()=>{}}={}) {
  const verified=await recheckDomesticSources(seed,{fetchImpl,now});
  const {pack}=await collectEvidence({fetchImpl,now:now(),coreOnly:true});
  const validatedAt=now();
  // Retain this actual model-before input privately, including rejects; no article bodies or model output.
  await onMarketInput({pack,gate:coreEvidenceGate(pack,{now:validatedAt}),validatedAt:validatedAt.toISOString(),sourceReceipts:verified.receipts});
  const input=buildFreshDomesticInput({pack,verified,now:validatedAt});
  return {input,sourceReceipts:verified.receipts};
}
