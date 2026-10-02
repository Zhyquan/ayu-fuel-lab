import { externalSignalsGate, evidenceEventKey } from '../../dist/data/external-analyst-contract.js';
import { externalEvidenceId } from './external-analyst-signals.mjs';
import { PROMPT_VERSION as EXTERNAL_PROMPT_VERSION, SYSTEM_PROMPT as EXTERNAL_SYSTEM_PROMPT } from './prompts/qwen-forecast-external-v1.mjs';
import { readFile } from 'node:fs/promises';
import { DAY, CORE_FORECAST_CONTRACT, INTELLIGENCE_V2_SOURCE, NEWS_ASSESSMENT_CONTRACT, NEWS_INPUT_CONTRACT, PROBABILITY_TYPE, admittedNewsDocuments, canonicalJson, coreEvidenceGate, coreMarketSignals, forecastGate, newsEnrichmentGate, primaryDirectionFor } from '../../dist/data/intelligence-v2-contract.js';
import { evidenceHashFor } from './history.mjs';
import { PROMPT_VERSION, SYSTEM_PROMPT } from './prompts/qwen-forecast-v1.mjs';
import { PROMPT_VERSION as NEWS_PROMPT_VERSION, SYSTEM_PROMPT as NEWS_SYSTEM_PROMPT } from './prompts/qwen-forecast-core-v1.mjs';
import { createHash } from 'node:crypto';

export const QWEN_MODEL = 'qwen3.8-flash';
export const DEFAULT_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
export const MAX_PROVIDER_CALLS_PER_RUN = 1;
export const MAX_TRANSPORT_RETRIES = 2;
export const MAX_INPUT_BYTES = 65536;
const schema = JSON.parse(await readFile(new URL('../../QWEN_FORECAST_SCHEMA.json',import.meta.url),'utf8'));
const fail = code => { throw new Error(code); };
const reasonFail = (validationCode,fieldName,reasonIndex) => {
  const error=new Error('QWEN_REASON_INVALID');
  Object.assign(error,{validationCode,fieldName,...(reasonIndex===undefined?{}:{reasonIndex})});
  throw error;
};
const exactKeys = (value,keys) => value && typeof value==='object' && !Array.isArray(value) && Object.keys(value).sort().join(',')===[...keys].sort().join(',');
export const QWEN_SCHEMA_KEYWORDS=Object.freeze(['type','properties','required','items','enum','description','title','additionalProperties']);

export function qwenSchemaCompatibilityGate(input) {
  const allowed=new Set(QWEN_SCHEMA_KEYWORDS), errors=[];
  const walk=(node,path='schema')=>{
    if(!node||typeof node!=='object'||Array.isArray(node)){errors.push(`${path}:INVALID_SCHEMA_NODE`);return;}
    for(const key of Object.keys(node))if(!allowed.has(key))errors.push(`${path}:${key}`);
    if(node.properties!==undefined) {
      if(!node.properties||typeof node.properties!=='object'||Array.isArray(node.properties))errors.push(`${path}.properties:INVALID_PROPERTY_MAP`);
      else for(const [name,child]of Object.entries(node.properties))walk(child,`${path}.properties.${name}`);
    }
    if(node.items!==undefined)walk(node.items,`${path}.items`);
  };
  walk(input);
  return {gate:errors.length?'FAIL':'PASS',errors};
}

export function analysisSchema(pack) {
  const result=structuredClone(schema), newsContract=pack.inputContractVersion===NEWS_INPUT_CONTRACT;
  const externalEvents=new Set((pack.externalAnalystSignals??[]).map(s=>s.eventKey));
  const documents=newsContract?admittedNewsDocuments(pack).documents.filter(d=>!externalEvents.has(d.eventKey)):[];
  const signals=newsContract?coreMarketSignals(pack):pack.signals;
  const external=pack.externalAnalystSignals??[];
  const ids=[...signals.map(s=>s.id),...external.map(s=>s.evidenceId),...documents.flatMap(d=>d.segments.map(s=>`${d.documentId}:${s.segmentId}`))];
  for (const key of ['mainReasonEvidenceIds','counterReasonEvidenceIds']) result.properties[key].items={type:'string',enum:ids};
  const assessments=result.properties.strengthAssessments;
  assessments.items.properties.evidenceId={type:'string',enum:ids};
  if(newsContract) {
    assessments.items.properties.evidenceId={type:'string',enum:signals.map(s=>s.id)};
    const properties={evidenceId:{type:'string',enum:documents.flatMap(d=>d.segments.map(s=>`${d.documentId}:${s.segmentId}`))},impact:{type:'string',enum:['UP','DOWN','NEUTRAL']},kind:{type:'string',enum:['FACT','RISK','OUTLOOK','CLAIM']},title:{type:'string'},summary:{type:'string'},strength:{type:'string',enum:['LOW','MEDIUM','HIGH']}};
    if(!documents.length)delete properties.evidenceId.enum;
    result.properties.newsAssessments={type:'array',items:{type:'object',additionalProperties:false,required:Object.keys(properties),properties}};
    result.required.push('newsAssessments');
  }
  if(qwenSchemaCompatibilityGate(result).gate!=='PASS')fail('QWEN_SCHEMA_COMPATIBILITY_FAILED');
  return result;
}
export function validateAnalysis(value,pack) {
  const newsContract=pack.inputContractVersion===NEWS_INPUT_CONTRACT;
  const keys=['probabilities','mainReasonEvidenceIds','counterReasonEvidenceIds','strengthAssessments'];
  if(newsContract&&Object.hasOwn(value??{},'newsAssessments'))keys.push('newsAssessments');
  if(!exactKeys(value,keys)||!exactKeys(value.probabilities,['DOWN','FLAT','UP']))fail('QWEN_SCHEMA_INVALID');
  const p=value.probabilities;
  if(Object.values(p).some(n=>!Number.isInteger(n)||n<0||n>100)||p.DOWN+p.FLAT+p.UP!==100)fail('QWEN_PROBABILITIES_INVALID');
  const signals=newsContract?coreMarketSignals(pack):pack.signals;
  const byId=new Map(signals.map(s=>[s.id,s])), primary=primaryDirectionFor(p), refs=[];
  const external=externalSignalsGate(pack,{now:new Date(pack.generatedAt)});
  if(external.gate!=='PASS')fail(external.errors[0]);
  const externalById=new Map(external.signals.map(s=>[s.evidenceId,s]));
  const structural=ids=>Array.isArray(ids)?ids.filter(id=>!newsContract||typeof id!=='string'||(!/^br-\d+:/.test(id)&&!externalById.has(id))):ids;
  for(const [key,min,max,opposite] of [['mainReasonEvidenceIds',1,3,false],['counterReasonEvidenceIds',0,2,true]]) {
    const ids=structural(value[key]);
    if(!Array.isArray(ids))reasonFail('REASON_LIST_INVALID',key);
    if(ids.length<min||ids.length>max)reasonFail('REASON_COUNT_INVALID',key);
    const duplicate=ids.findIndex((id,index)=>ids.indexOf(id)!==index);
    if(duplicate!==-1)reasonFail('REASON_DUPLICATE_ID',key,value[key].lastIndexOf(ids[duplicate]));
    const events=new Set();
    for(const id of ids) {
      const signal=byId.get(id);
      const index=value[key].indexOf(id);
      if(!signal)reasonFail('REASON_UNKNOWN_ID',key,index);
      if(refs.includes(id))reasonFail('REASON_REUSED_ID',key,index);
      if(signal.impact==='NEUTRAL')reasonFail('REASON_NEUTRAL_SIGNAL',key,index);
      if((signal.impact===primary)===opposite)reasonFail('REASON_DIRECTION_MISMATCH',key,index);
      if(events.has(signal.eventKey))reasonFail('REASON_DUPLICATE_EVENT',key,index);
      refs.push(id);events.add(signal.eventKey);
    }
  }
  if(signals.some(s=>s.impact!==primary&&s.impact!=='NEUTRAL')&&!structural(value.counterReasonEvidenceIds).length)fail('QWEN_COUNTER_REQUIRED');
  const allReasons=[...value.mainReasonEvidenceIds,...value.counterReasonEvidenceIds];
  for(const [key,opposite]of [['mainReasonEvidenceIds',false],['counterReasonEvidenceIds',true]]) {
    if(value[key].filter(id=>byId.has(id)||externalById.has(id)).length>(opposite?2:3))reasonFail('REASON_COUNT_INVALID',key);
    for(const id of value[key]) {
      const signal=externalById.get(id);if(!signal)continue;
      if(signal.direction==='NEUTRAL'||(signal.direction===primary)===opposite)fail('QWEN_EXTERNAL_REASON_DIRECTION_INVALID');
      if(allReasons.filter(ref=>evidenceEventKey(pack,ref)===signal.eventKey).length>1)fail('DUPLICATE_REASON_EVENT');
    }
  }
  if(external.signals.some(s=>s.direction!==primary&&s.direction!=='NEUTRAL')&&!value.counterReasonEvidenceIds.length)fail('QWEN_COUNTER_REQUIRED');
  const assessments=value.strengthAssessments, signalIds=new Set(signals.map(s=>s.id));
  if(!Array.isArray(assessments)||assessments.length!==signalIds.size||new Set(assessments.map(s=>s?.evidenceId)).size!==signalIds.size||
    assessments.some(s=>!exactKeys(s,['evidenceId','strength'])||!signalIds.has(s.evidenceId)||!['LOW','MEDIUM','HIGH'].includes(s.strength)))fail('QWEN_ASSESSMENTS_INVALID');
  return structuredClone(value);
}
export function projectEvidence(pack) {
  const pick=(value,keys)=>Object.fromEntries(keys.filter(key=>value?.[key]!==undefined).map(key=>[key,value[key]]));
  const signals=pack.inputContractVersion===NEWS_INPUT_CONTRACT?coreMarketSignals(pack):pack.signals;
  const external=pack.externalAnalystSignals??[], externalEvents=new Set(external.map(s=>s.eventKey));
  const signalIds=new Set([...signals.map(s=>s.id),...external.map(s=>s.evidenceId)]);
  const signalFields=['id','category','eventKey','measurementKey','headline','fact','displayText','impact','importance','kind','eventDate','publishedAt','publishedAtPrecision','sourceName','sourceOrganization','sourceUrl','sourceTier','releaseDate','nextReleaseAt','eventAt','policyValidUntil','provenanceNote'];
  const context=pick(pack.recentMarketContext,['status','asOf','windowStart','role','reason']);
  context.series=(pack.recentMarketContext.series??[]).map(s=>pick(s,['name','firstPrice','lastPrice','direction','sourceUrl']));
  return {forecastHorizonDays:pack.forecastHorizonDays,generatedAt:pack.generatedAt,
    ...(pack.inputContractVersion===NEWS_INPUT_CONTRACT?{inputContractVersion:NEWS_INPUT_CONTRACT,coverageMode:coreEvidenceGate(pack,{now:new Date(pack.generatedAt)}).coverageMode,
      newsDocuments:admittedNewsDocuments(pack).documents.filter(d=>!externalEvents.has(d.eventKey)).map(d=>pick(d,['documentId','sourceUrl','publisher','originalSource','authorName','publishedAt','publishedAtPrecision','fetchedAt','articleContentHash','headline','segments'])),
      missingSources:(pack.fetchLog??[]).filter(f=>f.status==='FAILED').map(f=>({url:f.url,reason:f.reason}))}:{}),
    ...(external.length?{externalAnalystSignals:external.map(s=>pick(s,['evidenceId','eventKey','category','source','publishedAt','kind','direction','strength','confirmation','reason','title','summary']))}:{}),
    signals:signals.map(s=>({...pick(s,signalFields),...(s.observation?{observation:pick(s.observation,['name','price','unit','change1dPercent'])}:{})})),
    eventGroups:(pack.eventGroups??[]).map(g=>({...pick(g,['eventKey','weightingRule']),evidenceIds:g.evidenceIds.filter(id=>signalIds.has(id))})).filter(g=>g.evidenceIds.length),
    categoryChecks:pack.categoryChecks.map(c=>pick(c,['category','status','reason','checkedAt','sourceUrls'])),
    recentMarketContext:context,conflicts:(pack.conflicts??[]).map(c=>pick(c,['category','evidenceIds','severity','description','reason']))};
}
function endpoint(base) {
  let url;try { url=new URL(base); } catch { fail('QWEN_BASE_URL_INVALID'); }
  if (url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.port || !(url.hostname==='dashscope.aliyuncs.com'||/^[a-z0-9-]+\.cn-beijing\.maas\.aliyuncs\.com$/.test(url.hostname)) || url.pathname.replace(/\/$/,'')!=='/compatible-mode/v1') fail('QWEN_BASE_URL_INVALID');
  return `${url.origin}/compatible-mode/v1/chat/completions`;
}
async function boundedText(response) {
  let result='', bytes=0;const decoder=new TextDecoder();
  if (!response.body) fail('QWEN_RESPONSE_INVALID');
  for await (const chunk of response.body) {bytes+=chunk.byteLength;if(bytes>65536) fail('QWEN_RESPONSE_TOO_LARGE');result+=decoder.decode(chunk,{stream:true});}
  return result+decoder.decode();
}
export function createQwenProvider(options={}) {
  const maxTransportRetries=options.maxTransportRetries===undefined?MAX_TRANSPORT_RETRIES:options.maxTransportRetries;
  const maxExternalRequests=options.maxExternalRequests===undefined?MAX_TRANSPORT_RETRIES+1:options.maxExternalRequests;
  if(!Number.isInteger(maxTransportRetries)||maxTransportRetries<0||maxTransportRetries>MAX_TRANSPORT_RETRIES)fail('QWEN_TRANSPORT_RETRIES_INVALID');
  if(!Number.isInteger(maxExternalRequests)||maxExternalRequests<1||maxExternalRequests>MAX_TRANSPORT_RETRIES+1)fail('QWEN_EXTERNAL_REQUEST_LIMIT_INVALID');
  const environment=options.environment??process.env, clock=options.clock??(()=>new Date()), wait=options.wait??(ms=>new Promise(r=>setTimeout(r,ms)));
  const transport=options.fetchImpl??globalThis.fetch;
  const mock=options.mock===true && typeof options.fetchImpl==='function' && options.fetchImpl!==globalThis.fetch;
  let used=false, lastRun=null;
  return {name:'QWEN',get lastRun(){return lastRun?structuredClone(lastRun):null;},
    async generateForecast({evidencePack,evidenceHash,now=clock()}) {
      if(used)fail('QWEN_RUN_CALL_BUDGET_EXCEEDED');used=true;
      const pack=structuredClone(evidencePack);
      if(coreEvidenceGate(pack,{now}).gate!=='PASS')fail('EVIDENCE_GATE_FAILED');
      const external=externalSignalsGate(pack,{now});
      if(external.gate!=='PASS')fail(external.errors[0]);
      if(external.signals.some(s=>s.evidenceId!==externalEvidenceId(s.eventKey)))fail('EXTERNAL_IDENTITY_INVALID');
      if(evidenceHashFor(pack)!==evidenceHash)fail('EVIDENCE_HASH_MISMATCH');
      const key=environment.DASHSCOPE_API_KEY;
      if(typeof key!=='string'||!key.trim())fail('DASHSCOPE_API_KEY_REQUIRED');
      if(!mock&&options.activationAuthorized!==true)fail('QWEN_API_ACTIVATION_NEEDS_USER_AUTHORIZATION');
      const url=endpoint(environment.DASHSCOPE_BASE_URL||DEFAULT_BASE_URL);
      const input=canonicalJson(projectEvidence(pack));
      const inputPackHash=createHash('sha256').update(input).digest('hex');
      const newsContract=pack.inputContractVersion===NEWS_INPUT_CONTRACT;
      const promptVersion=external.signals.length?EXTERNAL_PROMPT_VERSION:newsContract?NEWS_PROMPT_VERSION:PROMPT_VERSION;
      const systemPrompt=external.signals.length?EXTERNAL_SYSTEM_PROMPT:newsContract?NEWS_SYSTEM_PROMPT:SYSTEM_PROMPT;
      const body=JSON.stringify({model:QWEN_MODEL,stream:false,enable_thinking:false,max_tokens:2048,
        messages:[{role:'system',content:systemPrompt},{role:'user',content:`Frozen Evidence Pack (${evidenceHash}); model input hash ${inputPackHash}\n${input}`}],
        response_format:{type:'json_schema',json_schema:{name:'QWEN_ANALYSIS_OUTPUT',strict:true,schema:analysisSchema(pack)}}});
      if(Buffer.byteLength(body)>MAX_INPUT_BYTES)fail('QWEN_PAYLOAD_TOO_LARGE');
      lastRun={provider:'QWEN',model:QWEN_MODEL,promptVersion,inputPackHash,evidenceHash,requestStartedAt:new Date(clock()).toISOString(),requestCompletedAt:null,semanticCallCount:MAX_PROVIDER_CALLS_PER_RUN,configuredTransportRetries:maxTransportRetries,maxExternalRequests,actualExternalRequestCount:0,attemptCount:0,httpStatus:null,httpStatuses:[],inputPayloadBytes:Buffer.byteLength(body),usage:{input_tokens:null,output_tokens:null},status:'FAILED',mock};
      try {
        let response;
        for(let attempt=0;attempt<=maxTransportRetries;attempt++) {
          lastRun.attemptCount++;response=null;
          if(lastRun.actualExternalRequestCount>=maxExternalRequests)fail('QWEN_EXTERNAL_REQUEST_BUDGET_EXCEEDED');
          lastRun.actualExternalRequestCount++;
          try {response=await transport(url,{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body,signal:AbortSignal.timeout(options.timeoutMs??30000)});}
          catch {response=null;}
          const status=response?.status??null;lastRun.httpStatus=status;lastRun.httpStatuses.push(status);
          if(response?.ok)break;
          if(response && status!==429 && !(status>=500&&status<=599))fail('QWEN_HTTP_REJECTED');
          if(attempt===maxTransportRetries)fail('QWEN_TRANSPORT_FAILED');
          await wait(250*2**attempt);
        }
        let envelope;try {envelope=JSON.parse(await boundedText(response));}catch{fail('QWEN_RESPONSE_INVALID');}
        if(!envelope||typeof envelope!=='object'||Array.isArray(envelope))fail('QWEN_RESPONSE_INVALID');
        for(const [target,source]of [['input_tokens','prompt_tokens'],['output_tokens','completion_tokens']]) {const n=envelope.usage?.[source];if(Number.isSafeInteger(n)&&n>=0)lastRun.usage[target]=n;}
        const choice=envelope.choices?.[0];
        if(envelope.choices?.length!==1||choice.finish_reason!=='stop'||choice.message?.role!=='assistant'||choice.message.refusal||choice.message.tool_calls||typeof choice.message.content!=='string')fail('QWEN_RESPONSE_INVALID');
        lastRun.outputHash=createHash('sha256').update(choice.message.content).digest('hex');
        let analysis;try{analysis=JSON.parse(choice.message.content);}catch{fail('QWEN_SCHEMA_INVALID');}
        validateAnalysis(analysis,pack);
        const news=newsContract?newsEnrichmentGate(analysis,pack,{mode:'MODEL'}):null;
        if(news)lastRun.newsEnrichment={gate:news.gate,acceptedCount:news.newsAssessments.length,droppedCount:Math.max(0,(Array.isArray(analysis.newsAssessments)?analysis.newsAssessments.length:0)-news.newsAssessments.length),codes:[...new Set(news.errors)],diagnostics:news.diagnostics};
        const generatedAt=new Date(clock()).toISOString();
        const byId=new Map((newsContract?coreMarketSignals(pack):pack.signals).map(s=>[s.id,s]));
        const newsAssessments=news?.newsAssessments??[];
        const externalById=new Map(external.signals.map(s=>[s.evidenceId,s]));
        const newsById=new Map(newsAssessments.map(a=>[a.evidenceId,a]));
        const reason=id=>byId.has(id)?{evidenceId:id,text:byId.get(id).displayText}:externalById.has(id)?{evidenceId:id,text:externalById.get(id).title}:{evidenceId:id,text:newsById.get(id).title,documentId:newsById.get(id).documentId,segmentId:newsById.get(id).segmentId};
        const selected=(ids,allowedNews)=>[...new Set(ids)].filter(id=>byId.has(id)||externalById.has(id)||allowedNews?.includes(id));
        const candidate={source:INTELLIGENCE_V2_SOURCE,status:'LIVE',probabilityType:PROBABILITY_TYPE,forecastHorizonDays:7,provider:'QWEN',generatedAt,validUntil:new Date(Date.parse(generatedAt)+DAY).toISOString(),evidenceHash,
          probabilities:analysis.probabilities,primaryDirection:primaryDirectionFor(analysis.probabilities),mainReasons:selected(analysis.mainReasonEvidenceIds,news?.mainReasonEvidenceIds).map(reason),counterReasons:selected(analysis.counterReasonEvidenceIds,news?.counterReasonEvidenceIds).map(reason),
          signalAssessments:analysis.strengthAssessments.map(({evidenceId,strength})=>({evidenceId,impact:byId.get(evidenceId).impact,kind:byId.get(evidenceId).kind,strength})),
          ...(newsContract?{inputContractVersion:NEWS_INPUT_CONTRACT,forecastContract:CORE_FORECAST_CONTRACT,newsAssessmentContract:NEWS_ASSESSMENT_CONTRACT,promptVersion,inputPackHash,coverageMode:news.coverageMode,newsAssessments}:{}),
        };
        if(forecastGate(candidate,pack,{now:new Date(clock()),expectedEvidenceHash:evidenceHash}).gate!=='PASS')fail('FORECAST_GATE_FAILED');
        lastRun.status='OK';return candidate;
      } catch(error) {
        if(/^[A-Z0-9_]+$/.test(error?.message??'')){
          lastRun.validationStage='CORE_FORECAST';lastRun.validationCode=error.validationCode??error.message;
          if(error.validationCode){lastRun.legacyValidationCode=error.message;lastRun.fieldName=error.fieldName;if(error.reasonIndex!==undefined)lastRun.reasonIndex=error.reasonIndex;}
        }
        throw error;
      } finally {lastRun.requestCompletedAt=new Date(clock()).toISOString();await options.onAudit?.(structuredClone(lastRun));}
    },
  };
}
