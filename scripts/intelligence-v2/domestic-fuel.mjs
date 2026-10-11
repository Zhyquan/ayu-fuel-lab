import { canonicalJson, coreEvidenceGate, admittedNewsDocuments, newsDocumentFailure } from '../../dist/data/intelligence-v2-contract.js';
import { validTimestamp } from '../../dist/data/validation.js';
import { DOMESTIC_FUEL_FORECAST_CONTRACT, DOMESTIC_FUEL_TARGET, DOMESTIC_FUEL_HORIZON, DOMESTIC_PRIMARY_EVIDENCE_FIELDS, domesticDirectionFor, domesticForecastGate } from '../../dist/data/domestic-fuel-contract.js';
import { evidenceHashFor } from './history.mjs';
import { verifyAcceptedCollection } from './accepted-news-refresh.mjs';
import { QWEN_MODEL, createQwenProvider, qwenSchemaCompatibilityGate } from './qwen-provider.mjs';
import { PROMPT_VERSION, SYSTEM_PROMPT } from './prompts/qwen-domestic-fuel-v1.mjs';

export const DOMESTIC_FUEL_INPUT_CONTRACT='DOMESTIC_FUEL_INPUT_V1';
export const EVIDENCE_ROLES=['INTERNATIONAL_PRICE_INPUT','DOMESTIC_PRICING_SIGNAL','FX_INPUT','INVENTORY_INPUT','REFINERY_SUPPLY_INPUT','GEOPOLITICAL_INPUT','OFFICIAL_POLICY_OR_ADJUSTMENT','RELATED_LOW_IMPACT'];
const INPUT_FIELDS=['schemaVersion','target','horizon','horizonStartAt','horizonEndAt','evidenceProof','policy','adjustmentWindow','evidence','relatedNews','missingRoles'];
const RECEIPT_FIELDS=['evidenceId','sourceName','sourceUrl','publishedAt','checkedAt','contentHash','verified'];
const POLICY_FIELDS=[...RECEIPT_FIELDS,'cycleWorkingDays','minAdjustmentYuanPerTonne','floorUsdPerBarrel','ceilingUsdPerBarrel','temporaryControl'];
const WINDOW_FIELDS=[...RECEIPT_FIELDS,'windowId','pricingWindowStartAt','pricingWindowEndAt','nextAdjustmentAt'];
const NEWS_DOCUMENT_FIELDS=['documentId','sourceUrl','publisher','originalSource','authorName','publishedAt','publishedAtPrecision','fetchedAt','articleContentHash','headline','segments'];
const RELATED_NEWS_FIELDS=['evidenceId','role','direction','directionScope','strength','freshness','relevance','document'];
const fail=code=>{throw new Error(code);};
const hash=value=>/^[a-f0-9]{64}$/.test(value??'');
const text=(value,max)=>typeof value==='string'&&value.trim().length>0&&Array.from(value).length<=max&&!/[<>\u0000-\u001f]/.test(value);
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join()===[...keys].sort().join();
const sourceValid=(value,now,official=false)=>{
  let url;try{url=new URL(value?.sourceUrl);}catch{return false;}
  return url.protocol==='https:'&&!url.username&&!url.password&&!url.hash&&!url.search&&(!official||url.hostname==='www.ndrc.gov.cn'||url.hostname==='zfxxgk.ndrc.gov.cn'||(official==='WINDOW'&&url.hostname==='cx.sinopecsales.com'&&value.sourceName==='Sinopec'))&&
    value.verified===true&&hash(value.contentHash)&&validTimestamp(value.publishedAt)&&validTimestamp(value.checkedAt)&&Date.parse(value.publishedAt)<=Date.parse(value.checkedAt)&&Date.parse(value.checkedAt)<=+now&&+now-Date.parse(value.checkedAt)<86400000;
};

// The caller supplies verified policy/window receipts; this adapter never fetches or guesses them.
export function projectDomesticInput({pack,policy=null,adjustmentWindow=null,domesticEvidence=[],evidenceProof,now=new Date()}={}) {
  if(coreEvidenceGate(pack,{now}).gate!=='PASS')fail('DOMESTIC_MARKET_INPUT_INVALID');
  const roleFor=s=>s.category==='CRUDE'||s.category==='INTERNATIONAL_DIESEL'?'INTERNATIONAL_PRICE_INPUT':s.category==='DISTILLATE_FUNDAMENTALS'?s.id==='eia-stocks'?'INVENTORY_INPUT':'REFINERY_SUPPLY_INPUT':s.category==='SUPPLY_DISRUPTION'?'GEOPOLITICAL_INPUT':'RELATED_LOW_IMPACT';
  const evidence=pack.signals.map(s=>({evidenceId:s.id,eventKey:s.eventKey,role:roleFor(s),direction:s.impact,directionScope:'INPUT_ONLY',strength:s.importance,freshness:'CURRENT',relevance:'INDIRECT',kind:s.kind,
    windowId:null,text:s.fact,sourceName:s.sourceOrganization,sourceUrl:s.sourceUrl,publishedAt:s.publishedAt,checkedAt:s.checkedAt,contentHash:evidenceHashFor(s),verified:true}));
  for(const s of domesticEvidence)evidence.push(structuredClone(s));
  const start=new Date(now).toISOString(),end=new Date(+now+7*86400000).toISOString();
  if(adjustmentWindow&&Date.parse(adjustmentWindow.nextAdjustmentAt)>Date.parse(end))evidence.push({evidenceId:adjustmentWindow.evidenceId,eventKey:adjustmentWindow.windowId,role:'OFFICIAL_POLICY_OR_ADJUSTMENT',direction:'HOLD_OR_NO_ADJUSTMENT',directionScope:'DOMESTIC_ADJUSTMENT',strength:'HIGH',freshness:'CURRENT',relevance:'DIRECT',kind:'FACT',windowId:adjustmentWindow.windowId,text:'已核验下一有效调价窗口位于未来7天之外；这支持区间内维持或不调整，临时政策变化仍有不确定性。',...Object.fromEntries(['sourceName','sourceUrl','publishedAt','checkedAt','contentHash','verified'].map(k=>[k,adjustmentWindow[k]]))});
  const relatedNews=admittedNewsDocuments(pack,{now}).documents.map(d=>({evidenceId:d.documentId,role:'UNASSESSED_NEWS_INPUT',direction:'UNASSESSED',directionScope:'INPUT_ONLY',strength:'UNASSESSED',freshness:'CURRENT',relevance:'RELATED',
    document:{...Object.fromEntries(NEWS_DOCUMENT_FIELDS.filter(k=>k!=='segments').map(k=>[k,d[k]])),segments:d.segments.map(s=>({segmentId:s.segmentId,text:s.text}))}}));
  return {schemaVersion:DOMESTIC_FUEL_INPUT_CONTRACT,target:DOMESTIC_FUEL_TARGET,horizon:DOMESTIC_FUEL_HORIZON,horizonStartAt:start,horizonEndAt:end,evidenceProof,
    policy:structuredClone(policy),adjustmentWindow:structuredClone(adjustmentWindow),evidence,relatedNews,missingRoles:EVIDENCE_ROLES.filter(role=>!evidence.some(e=>e.role===role)&&!(role==='OFFICIAL_POLICY_OR_ADJUSTMENT'&&policy))};
}

export function domesticInputGate(input,{now=new Date()}={}) {
  const errors=[],policy=input?.policy,window=input?.adjustmentWindow;
  if(!exact(input,INPUT_FIELDS)||input?.schemaVersion!==DOMESTIC_FUEL_INPUT_CONTRACT||input.target!==DOMESTIC_FUEL_TARGET||input.horizon!==DOMESTIC_FUEL_HORIZON||
    !['REAL_VERIFIED_EVIDENCE','SYNTHETIC_SEMANTIC_TEST'].includes(input.evidenceProof)||!validTimestamp(input.horizonStartAt)||!validTimestamp(input.horizonEndAt)||
    Date.parse(input.horizonEndAt)-Date.parse(input.horizonStartAt)!==7*86400000||Date.parse(input.horizonStartAt)>+now||+now-Date.parse(input.horizonStartAt)>=86400000||
    !Array.isArray(input.missingRoles)||new Set(input.missingRoles).size!==input.missingRoles.length||input.missingRoles.some(role=>!EVIDENCE_ROLES.includes(role)))errors.push('DOMESTIC_INPUT_CONTRACT_INVALID');
  if(!exact(policy,POLICY_FIELDS)||!sourceValid(policy,now,true)||!text(policy?.evidenceId,150)||policy.cycleWorkingDays!==10||policy.minAdjustmentYuanPerTonne!==50||policy.floorUsdPerBarrel!==40||policy.ceilingUsdPerBarrel!==130||!['NONE_CONFIRMED','ACTIVE'].includes(policy.temporaryControl))errors.push('DOMESTIC_POLICY_INSUFFICIENT');
  if(!exact(window,WINDOW_FIELDS)||!sourceValid(window,now,'WINDOW')||!text(window?.evidenceId,150)||!text(window?.windowId,150)||!validTimestamp(window?.pricingWindowStartAt)||!validTimestamp(window?.pricingWindowEndAt)||!validTimestamp(window?.nextAdjustmentAt)||
    Date.parse(window.pricingWindowStartAt)>=Date.parse(window.pricingWindowEndAt)||Date.parse(window.pricingWindowEndAt)>Date.parse(window.nextAdjustmentAt)||Date.parse(window.nextAdjustmentAt)<=Date.parse(input?.horizonStartAt))errors.push('DOMESTIC_WINDOW_INSUFFICIENT');
  const news=input?.relatedNews;
  if(!Array.isArray(news)||news.length>6||new Set(news.map(r=>r?.evidenceId)).size!==news.length||news.some(r=>!exact(r,RELATED_NEWS_FIELDS)||r.role!=='UNASSESSED_NEWS_INPUT'||r.direction!=='UNASSESSED'||r.strength!=='UNASSESSED'||r.directionScope!=='INPUT_ONLY'||r.freshness!=='CURRENT'||r.relevance!=='RELATED'||
    !exact(r.document,NEWS_DOCUMENT_FIELDS)||r.evidenceId!==r.document.documentId||newsDocumentFailure(r.document,{now})||!text(r.document.headline,500)||r.document.segments.some(s=>!exact(s,['segmentId','text']))))errors.push('DOMESTIC_RELATED_NEWS_INVALID');
  const rows=Array.isArray(input?.evidence)?input.evidence:[];
  if(!rows.length||rows.length>48||new Set(rows.map(e=>e?.evidenceId)).size!==rows.length||rows.some(e=>!exact(e,DOMESTIC_PRIMARY_EVIDENCE_FIELDS)||!sourceValid(e,now)||!text(e?.evidenceId,150)||!text(e?.eventKey,150)||!text(e?.text,1500)||!text(e?.sourceName,48)||!EVIDENCE_ROLES.includes(e.role)||
    !['UP','DOWN','HOLD_OR_NO_ADJUSTMENT','NEUTRAL'].includes(e.direction)||!['INPUT_ONLY','DOMESTIC_ADJUSTMENT'].includes(e.directionScope)||!['LOW','MEDIUM','HIGH'].includes(e.strength)||e.freshness!=='CURRENT'||!['FACT','ESTIMATE','RISK','OUTLOOK','CLAIM'].includes(e.kind)||!['DIRECT','INDIRECT','RELATED'].includes(e.relevance)||(e.directionScope==='INPUT_ONLY'&&e.relevance==='DIRECT')))errors.push('DOMESTIC_EVIDENCE_INVALID');
  const direct=rows.filter(e=>['DOMESTIC_PRICING_SIGNAL','OFFICIAL_POLICY_OR_ADJUSTMENT'].includes(e?.role)&&e.directionScope==='DOMESTIC_ADJUSTMENT'&&e.relevance==='DIRECT'&&e.windowId===window?.windowId&&e.strength!=='LOW');
  if(!direct.length)errors.push('DOMESTIC_PRICING_SUPPORT_INSUFFICIENT');
  if(direct.some(e=>!['FACT','ESTIMATE','RISK'].includes(e.kind)))errors.push('DOMESTIC_DIRECT_EVIDENCE_INVALID');
  if(rows.some(e=>e?.directionScope==='DOMESTIC_ADJUSTMENT'&&!direct.includes(e)))errors.push('INTERNATIONAL_INPUT_NOT_DOMESTIC_SUPPORT');
  return {gate:errors.length?'FAIL':'PASS',errors,primaryEvidenceIds:direct.map(e=>e.evidenceId)};
}

export function domesticAnalysisSchema(input) {
  const gate=domesticInputGate(input,{now:new Date(input.horizonStartAt)});if(gate.gate!=='PASS')fail(gate.errors[0]);
  const integer={type:'integer',enum:Array.from({length:101},(_,i)=>i)};
  const properties={target:{type:'string',enum:[DOMESTIC_FUEL_TARGET]},horizon:{type:'string',enum:[DOMESTIC_FUEL_HORIZON]},
    probabilities:{type:'object',additionalProperties:false,required:['DOWN','FLAT','UP'],properties:{DOWN:integer,FLAT:integer,UP:integer}},confidence:{type:'string',enum:['LOW','MEDIUM','HIGH']},reason:{type:'string'},primaryEvidenceIds:{type:'array',items:{type:'string',enum:gate.primaryEvidenceIds}}};
  const schema={type:'object',additionalProperties:false,required:Object.keys(properties),properties};
  if(qwenSchemaCompatibilityGate(schema).gate!=='PASS')fail('DOMESTIC_SCHEMA_INCOMPATIBLE');return schema;
}

export function validateDomesticAnalysis(analysis,input,{now=new Date(input.horizonStartAt)}={}) {
  const gate=domesticInputGate(input,{now});if(gate.gate!=='PASS')fail(gate.errors[0]);
  if(!exact(analysis,['target','horizon','probabilities','confidence','reason','primaryEvidenceIds'])||analysis.target!==DOMESTIC_FUEL_TARGET||analysis.horizon!==DOMESTIC_FUEL_HORIZON||!exact(analysis.probabilities,['UP','DOWN','FLAT']))fail('DOMESTIC_ANALYSIS_SCHEMA_INVALID');
  const p=analysis.probabilities;if(Object.values(p).some(v=>!Number.isInteger(v)||v<0||v>100)||p.UP+p.DOWN+p.FLAT!==100)fail('DOMESTIC_PROBABILITIES_INVALID');
  const direction=domesticDirectionFor(p);if(!direction)fail('DOMESTIC_DIRECTION_AMBIGUOUS');
  const ids=analysis.primaryEvidenceIds;
  if(!Array.isArray(ids)||!ids.length||ids.length>3||new Set(ids).size!==ids.length||ids.some(id=>!gate.primaryEvidenceIds.includes(id)))fail('DOMESTIC_PRIMARY_EVIDENCE_INVALID');
  const selected=ids.map(id=>input.evidence.find(e=>e.evidenceId===id));
  if(!selected.some(e=>e.direction===direction)||new Set(selected.map(e=>e.eventKey)).size!==selected.length)fail('DOMESTIC_DIRECTION_UNSUPPORTED');
  if(!['LOW','MEDIUM','HIGH'].includes(analysis.confidence)||!text(analysis.reason,180)||!/[\u3400-\u9fff]/.test(analysis.reason))fail('DOMESTIC_REASON_INVALID');
  const source=[...selected.map(e=>e.text),canonicalJson(input.policy),canonicalJson(input.adjustmentWindow)].join(' '),numbers=new Set([...source.matchAll(/\d+(?:\.\d+)?/g)].map(m=>m[0]));
  const horizonDays=(Date.parse(input.horizonEndAt)-Date.parse(input.horizonStartAt))/86400000;
  const groundedReason=analysis.reason.replace(new RegExp(`(?:未来|接下来|今后)\\s*${horizonDays}\\s*(?:天|日)`,'g'),'');
  if([...groundedReason.matchAll(/\d+(?:\.\d+)?/g)].some(m=>!numbers.has(m[0])))fail('DOMESTIC_REASON_NEW_NUMBER');
  return {direction,primaryEvidence:selected};
}

export async function normalizeDomesticForecast({analysis,input,acceptedCollection=null,now=new Date()}={}) {
  const checked=validateDomesticAnalysis(analysis,input,{now}),generatedAt=new Date(now).toISOString();
  if(acceptedCollection)verifyAcceptedCollection(acceptedCollection,{now});
  const value={schemaVersion:DOMESTIC_FUEL_FORECAST_CONTRACT,target:DOMESTIC_FUEL_TARGET,horizon:DOMESTIC_FUEL_HORIZON,horizonStartAt:input.horizonStartAt,horizonEndAt:input.horizonEndAt,probabilityType:'AI_SUBJECTIVE_ESTIMATE',
    probabilities:{UP:analysis.probabilities.UP/100,DOWN:analysis.probabilities.DOWN/100,HOLD_OR_NO_ADJUSTMENT:analysis.probabilities.FLAT/100},direction:checked.direction,confidence:analysis.confidence,reason:analysis.reason,
    primaryEvidence:structuredClone(checked.primaryEvidence),acceptedEvidence:structuredClone(acceptedCollection?.acceptedEvidence??[]),acceptedEvidenceRevision:acceptedCollection?.collectionHash??evidenceHashFor([]),
    evidenceRevision:evidenceHashFor(input),evidenceProof:input.evidenceProof,generatedAt,validUntil:new Date(+now+86400000).toISOString()};
  const forecast={...value,forecastId:evidenceHashFor(value),publishedAt:null};
  if((await domesticForecastGate(forecast,{now,evidencePack:input})).gate!=='PASS')fail('DOMESTIC_NORMALIZATION_INVALID');return forecast;
}

// Request construction only. Root owns authorization, the existing reservation and one-shot transport.
export function createDomesticQwenRequest(input) {
  const schema=domesticAnalysisSchema(input),evidenceRevision=evidenceHashFor(input),content=canonicalJson(input);
  const body={model:QWEN_MODEL,stream:false,enable_thinking:false,messages:[{role:'system',content:SYSTEM_PROMPT},{role:'user',content:`Frozen domestic input ${evidenceRevision}\n${content}`}],response_format:{type:'json_schema',json_schema:{name:'DOMESTIC_FUEL_ANALYSIS_V1',strict:true,schema}}};
  if(Buffer.byteLength(JSON.stringify(body))>65536)fail('DOMESTIC_PAYLOAD_TOO_LARGE');
  return {body,evidenceRevision,promptVersion:PROMPT_VERSION,inputPackHash:evidenceHashFor(input)};
}

// The explicit domestic dispatch uses the same provider transport; no legacy target relabeling.
export async function runDomesticForecast({input,acceptedCollection=null,providerOptions={},now=new Date()}={}) {
  const gate=domesticInputGate(input,{now});if(gate.gate!=='PASS')return {gate,forecast:null,providerAudit:null};
  const provider=createQwenProvider(providerOptions);
  const forecast=await provider.generateForecast({evidencePack:input,evidenceHash:evidenceHashFor(input),acceptedCollection,now});
  return {gate:await domesticForecastGate(forecast,{now:providerOptions.clock?.()??new Date(),evidencePack:input}),forecast,evidencePack:structuredClone(input),providerAudit:provider.lastRun};
}

export function domesticMaterialFingerprint(input) {
  const pick=(value,keys)=>Object.fromEntries(keys.map(k=>[k,value?.[k]??null]));
  return evidenceHashFor({policy:pick(input?.policy,['cycleWorkingDays','minAdjustmentYuanPerTonne','floorUsdPerBarrel','ceilingUsdPerBarrel','temporaryControl','contentHash']),
    adjustmentWindow:pick(input?.adjustmentWindow,['windowId','pricingWindowStartAt','pricingWindowEndAt','nextAdjustmentAt','contentHash']),
    windowInHorizon:Date.parse(input?.adjustmentWindow?.nextAdjustmentAt)<=Date.parse(input?.horizonEndAt)&&Date.parse(input?.adjustmentWindow?.nextAdjustmentAt)>Date.parse(input?.horizonStartAt),
    evidence:(input?.evidence??[]).filter(e=>e.role!=='RELATED_LOW_IMPACT').map(e=>pick(e,['evidenceId','eventKey','role','direction','directionScope','strength','relevance','kind','windowId','text'])).sort((a,b)=>a.evidenceId.localeCompare(b.evidenceId))});
}

export function domesticMaterialComparison(input,previousInput,{now=new Date()}={}) {
  const gate=domesticInputGate(input,{now});
  return {eligible:gate.gate==='PASS'&&domesticMaterialFingerprint(input)!==domesticMaterialFingerprint(previousInput),reason:gate.gate!=='PASS'?'DOMESTIC_INPUT_INSUFFICIENT':domesticMaterialFingerprint(input)===domesticMaterialFingerprint(previousInput)?'NO_MATERIAL_NEW_EVIDENCE':'MATERIAL_NEW_EVIDENCE'};
}
