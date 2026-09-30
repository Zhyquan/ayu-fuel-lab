import { readFile } from 'node:fs/promises';
import { DAY, INTELLIGENCE_V2_SOURCE, NEWS_ASSESSMENT_CONTRACT, NEWS_INPUT_CONTRACT, PROBABILITY_TYPE, canonicalJson, conditionalNewsSegment, evidenceGate, forecastGate, newsNumbersGrounded, newsSegmentFor, primaryDirectionFor } from '../../dist/data/intelligence-v2-contract.js';
import { evidenceHashFor } from './history.mjs';
import { PROMPT_VERSION, SYSTEM_PROMPT } from './prompts/qwen-forecast-v1.mjs';
import { PROMPT_VERSION as NEWS_PROMPT_VERSION, SYSTEM_PROMPT as NEWS_SYSTEM_PROMPT } from './prompts/qwen-forecast-news-v2.mjs';
import { createHash } from 'node:crypto';

export const QWEN_MODEL = 'qwen3.8-flash';
export const DEFAULT_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
export const MAX_PROVIDER_CALLS_PER_RUN = 1;
export const MAX_TRANSPORT_RETRIES = 2;
export const MAX_INPUT_BYTES = 65536;
const schema = JSON.parse(await readFile(new URL('../../QWEN_FORECAST_SCHEMA.json',import.meta.url),'utf8'));
const fail = code => { throw new Error(code); };
const newsFail = (code,assessmentIndex=null,fieldName=null) => { throw Object.assign(new Error(code),{validationStage:'NEWS_ASSESSMENT',validationCode:code,assessmentIndex,fieldName}); };
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
  const ids=[...pack.signals.map(s=>s.id),...(newsContract?pack.newsDocuments.flatMap(d=>d.segments.map(s=>`${d.documentId}:${s.segmentId}`)):[])];
  for (const key of ['mainReasonEvidenceIds','counterReasonEvidenceIds']) result.properties[key].items={type:'string',enum:ids};
  const assessments=result.properties.strengthAssessments;
  assessments.items.properties.evidenceId={type:'string',enum:ids};
  if(newsContract) {
    assessments.items.properties.evidenceId={type:'string',enum:pack.signals.map(s=>s.id)};
    const properties={evidenceId:{type:'string',enum:pack.newsDocuments.flatMap(d=>d.segments.map(s=>`${d.documentId}:${s.segmentId}`))},impact:{type:'string',enum:['UP','DOWN','NEUTRAL']},kind:{type:'string',enum:['FACT','RISK','OUTLOOK','CLAIM']},title:{type:'string'},summary:{type:'string'},strength:{type:'string',enum:['LOW','MEDIUM','HIGH']}};
    if(!pack.newsDocuments.length)delete properties.evidenceId.enum;
    result.properties.newsAssessments={type:'array',items:{type:'object',additionalProperties:false,required:Object.keys(properties),properties}};
    result.required.push('newsAssessments');
  }
  if(qwenSchemaCompatibilityGate(result).gate!=='PASS')fail('QWEN_SCHEMA_COMPATIBILITY_FAILED');
  return result;
}
export function validateAnalysis(value,pack) {
  const newsContract=pack.inputContractVersion===NEWS_INPUT_CONTRACT;
  if(newsContract&&(!value||!Object.hasOwn(value,'newsAssessments')||!Array.isArray(value.newsAssessments)))newsFail('NEWS_ASSESSMENTS_INVALID',null,'newsAssessments');
  if (!exactKeys(value,['probabilities','mainReasonEvidenceIds','counterReasonEvidenceIds','strengthAssessments',...(newsContract?['newsAssessments']:[])]) || !exactKeys(value.probabilities,['DOWN','FLAT','UP'])) fail('QWEN_SCHEMA_INVALID');
  const p=value.probabilities;
  if (Object.values(p).some(n=>!Number.isInteger(n)||n<5||n>90||n%5!==0) || p.DOWN+p.FLAT+p.UP!==100) fail('QWEN_PROBABILITIES_INVALID');
  const byId=new Map(pack.signals.map(s=>[s.id,s])), primary=primaryDirectionFor(p), refs=[];
  if(newsContract) {
    if(value.newsAssessments.length>3)newsFail('NEWS_ASSESSMENT_TOO_MANY',null,'newsAssessments');
    const seenDocuments=new Set();
    for(const [index,a] of value.newsAssessments.entries()) {
      const expected=['evidenceId','impact','kind','title','summary','strength'];
      if(!exactKeys(a,expected))newsFail('NEWS_ASSESSMENT_FIELDS_INVALID',index,a&&typeof a==='object'?Object.keys(a).find(key=>!expected.includes(key))??expected.find(key=>!Object.hasOwn(a,key)): 'newsAssessments');
      const selected=newsSegmentFor(pack,a.evidenceId);
      if(!selected)newsFail('NEWS_EVIDENCE_ID_UNKNOWN',index,'evidenceId');
      if(seenDocuments.has(selected.document.documentId))newsFail('NEWS_DUPLICATE_DOCUMENT',index,'evidenceId');
      seenDocuments.add(selected.document.documentId);
      if(!['UP','DOWN','NEUTRAL'].includes(a.impact))newsFail('NEWS_IMPACT_INVALID',index,'impact');
      if(!['FACT','RISK','OUTLOOK','CLAIM'].includes(a.kind))newsFail('NEWS_KIND_INVALID',index,'kind');
      if(!['LOW','MEDIUM','HIGH'].includes(a.strength))newsFail('NEWS_STRENGTH_INVALID',index,'strength');
      if(typeof a.title!=='string'||!a.title.trim()||Array.from(a.title).length>24||!/[\u3400-\u9fff]/.test(a.title))newsFail('NEWS_TITLE_INVALID',index,'title');
      if(typeof a.summary!=='string'||!a.summary.trim()||Array.from(a.summary).length>60||!/[\u3400-\u9fff]/.test(a.summary))newsFail('NEWS_SUMMARY_INVALID',index,'summary');
      if(!newsNumbersGrounded(a.title,selected.segment.text))newsFail('NEWS_NEW_NUMBER',index,'title');
      if(!newsNumbersGrounded(a.summary,selected.segment.text))newsFail('NEWS_NEW_NUMBER',index,'summary');
      if(a.kind==='FACT'&&conditionalNewsSegment(selected.segment.text))newsFail('NEWS_FACT_FROM_CONDITIONAL_SEGMENT',index,'kind');
      byId.set(a.evidenceId,{...a,eventKey:selected.document.documentId,displayText:a.title});
    }
  }
  const newsReasonDocuments=new Set();
  for (const [key,min,max,opposite] of [['mainReasonEvidenceIds',1,3,false],['counterReasonEvidenceIds',0,2,true]]) {
    const ids=value[key];
    if(newsContract&&Array.isArray(ids)&&ids.some((id,index)=>ids.indexOf(id)!==index&&newsSegmentFor(pack,id)))newsFail('NEWS_REASON_DUPLICATE_EVENT',null,key);
    if (!Array.isArray(ids)||ids.length<min||ids.length>max||new Set(ids).size!==ids.length) fail('QWEN_REASON_INVALID');
    const events=new Set();
    for (const id of ids) {
      const s=byId.get(id);
      const selected=newsContract?newsSegmentFor(pack,id):null;
      if(selected&&!s)newsFail('NEWS_REASON_NOT_ASSESSED',null,key);
      if(selected&&newsReasonDocuments.has(selected.document.documentId))newsFail('NEWS_REASON_DUPLICATE_EVENT',null,key);
      if (!s||refs.includes(id)||s.impact==='NEUTRAL'||(s.impact===primary)===opposite||events.has(s.eventKey)) fail('QWEN_REASON_INVALID');
      if(selected)newsReasonDocuments.add(selected.document.documentId);
      refs.push(id);events.add(s.eventKey);
    }
  }
  if ([...byId.values()].some(s=>s.impact!==primary&&s.impact!=='NEUTRAL')&&!value.counterReasonEvidenceIds.length) fail('QWEN_COUNTER_REQUIRED');
  const a=value.strengthAssessments;
  const signalIds=new Set(pack.signals.map(s=>s.id));
  if (!Array.isArray(a)||a.length!==signalIds.size||new Set(a.map(s=>s?.evidenceId)).size!==signalIds.size || a.some(s=>!exactKeys(s,['evidenceId','strength'])||!signalIds.has(s.evidenceId)||!['LOW','MEDIUM','HIGH'].includes(s.strength))) fail('QWEN_ASSESSMENTS_INVALID');
  return structuredClone(value);
}
export function projectEvidence(pack) {
  const pick=(value,keys)=>Object.fromEntries(keys.filter(key=>value?.[key]!==undefined).map(key=>[key,value[key]]));
  const signalFields=['id','category','eventKey','measurementKey','headline','fact','displayText','impact','importance','kind','eventDate','publishedAt','publishedAtPrecision','sourceName','sourceOrganization','sourceUrl','sourceTier','releaseDate','nextReleaseAt','eventAt','policyValidUntil','provenanceNote'];
  const context=pick(pack.recentMarketContext,['status','asOf','windowStart','role','reason']);
  context.series=(pack.recentMarketContext.series??[]).map(s=>pick(s,['name','firstPrice','lastPrice','direction','sourceUrl']));
  return {forecastHorizonDays:pack.forecastHorizonDays,generatedAt:pack.generatedAt,
    ...(pack.inputContractVersion===NEWS_INPUT_CONTRACT?{inputContractVersion:NEWS_INPUT_CONTRACT,coverageMode:pack.coverageMode,
      newsDocuments:pack.newsDocuments.map(d=>pick(d,['documentId','sourceUrl','publisher','originalSource','authorName','publishedAt','publishedAtPrecision','fetchedAt','articleContentHash','headline','segments'])),
      missingSources:pack.fetchLog.filter(f=>f.status==='FAILED').map(f=>({url:f.url,reason:f.reason}))}:{}),
    signals:pack.signals.map(s=>({...pick(s,signalFields),...(s.observation?{observation:pick(s.observation,['name','price','unit','change1dPercent'])}:{})})),
    eventGroups:(pack.eventGroups??[]).map(g=>pick(g,['eventKey','evidenceIds','weightingRule'])),
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
  const environment=options.environment??process.env, clock=options.clock??(()=>new Date()), wait=options.wait??(ms=>new Promise(r=>setTimeout(r,ms)));
  const transport=options.fetchImpl??globalThis.fetch;
  const mock=options.mock===true && typeof options.fetchImpl==='function' && options.fetchImpl!==globalThis.fetch;
  let used=false, lastRun=null;
  return {name:'QWEN',get lastRun(){return lastRun?structuredClone(lastRun):null;},
    async generateForecast({evidencePack,evidenceHash,now=clock()}) {
      if(used)fail('QWEN_RUN_CALL_BUDGET_EXCEEDED');used=true;
      const pack=structuredClone(evidencePack);
      if(evidenceGate(pack,{now}).gate!=='PASS')fail('EVIDENCE_GATE_FAILED');
      if(evidenceHashFor(pack)!==evidenceHash)fail('EVIDENCE_HASH_MISMATCH');
      const key=environment.DASHSCOPE_API_KEY;
      if(typeof key!=='string'||!key.trim())fail('DASHSCOPE_API_KEY_REQUIRED');
      if(!mock&&options.activationAuthorized!==true)fail('QWEN_API_ACTIVATION_NEEDS_USER_AUTHORIZATION');
      const url=endpoint(environment.DASHSCOPE_BASE_URL||DEFAULT_BASE_URL);
      const input=canonicalJson(projectEvidence(pack));
      const inputPackHash=createHash('sha256').update(input).digest('hex');
      const newsContract=pack.inputContractVersion===NEWS_INPUT_CONTRACT;
      const body=JSON.stringify({model:QWEN_MODEL,stream:false,enable_thinking:false,
        messages:[{role:'system',content:newsContract?NEWS_SYSTEM_PROMPT:SYSTEM_PROMPT},{role:'user',content:`Frozen Evidence Pack (${evidenceHash}); model input hash ${inputPackHash}\n${input}`}],
        response_format:{type:'json_schema',json_schema:{name:'QWEN_ANALYSIS_OUTPUT',strict:true,schema:analysisSchema(pack)}}});
      if(Buffer.byteLength(body)>MAX_INPUT_BYTES)fail('QWEN_PAYLOAD_TOO_LARGE');
      lastRun={provider:'QWEN',model:QWEN_MODEL,promptVersion:newsContract?NEWS_PROMPT_VERSION:PROMPT_VERSION,inputPackHash,evidenceHash,requestStartedAt:new Date(clock()).toISOString(),requestCompletedAt:null,semanticCallCount:MAX_PROVIDER_CALLS_PER_RUN,attemptCount:0,httpStatus:null,httpStatuses:[],inputPayloadBytes:Buffer.byteLength(body),usage:{input_tokens:null,output_tokens:null},status:'FAILED',mock};
      try {
        let response;
        for(let attempt=0;attempt<=MAX_TRANSPORT_RETRIES;attempt++) {
          lastRun.attemptCount++;response=null;
          try {response=await transport(url,{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body,signal:AbortSignal.timeout(options.timeoutMs??30000)});}
          catch {response=null;}
          const status=response?.status??null;lastRun.httpStatus=status;lastRun.httpStatuses.push(status);
          if(response?.ok)break;
          if(response && status!==429 && !(status>=500&&status<=599))fail('QWEN_HTTP_REJECTED');
          if(attempt===MAX_TRANSPORT_RETRIES)fail('QWEN_TRANSPORT_FAILED');
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
        const generatedAt=new Date(clock()).toISOString();
        const byId=new Map(pack.signals.map(s=>[s.id,s]));
        const newsAssessments=(analysis.newsAssessments??[]).map(a=>{
          const {document,segment}=newsSegmentFor(pack,a.evidenceId);
          return {...a,documentId:document.documentId,segmentId:segment.segmentId,sourceUrl:document.sourceUrl,publisher:document.publisher,originalSource:document.originalSource,publishedAt:document.publishedAt};
        });
        const newsById=new Map(newsAssessments.map(a=>[a.evidenceId,a]));
        const reason=id=>byId.has(id)?{evidenceId:id,text:byId.get(id).displayText}:{evidenceId:id,text:newsById.get(id).title,documentId:newsById.get(id).documentId,segmentId:newsById.get(id).segmentId};
        const candidate={source:INTELLIGENCE_V2_SOURCE,status:'LIVE',probabilityType:PROBABILITY_TYPE,forecastHorizonDays:7,provider:'QWEN',generatedAt,validUntil:new Date(Date.parse(generatedAt)+DAY).toISOString(),evidenceHash,
          probabilities:analysis.probabilities,primaryDirection:primaryDirectionFor(analysis.probabilities),mainReasons:analysis.mainReasonEvidenceIds.map(reason),counterReasons:analysis.counterReasonEvidenceIds.map(reason),
          signalAssessments:analysis.strengthAssessments.map(({evidenceId,strength})=>({evidenceId,impact:byId.get(evidenceId).impact,kind:byId.get(evidenceId).kind,strength})),
          ...(newsContract?{inputContractVersion:NEWS_INPUT_CONTRACT,newsAssessmentContract:NEWS_ASSESSMENT_CONTRACT,promptVersion:NEWS_PROMPT_VERSION,inputPackHash,coverageMode:pack.coverageMode,newsAssessments}:{}),
        };
        if(forecastGate(candidate,pack,{now:new Date(clock()),expectedEvidenceHash:evidenceHash}).gate!=='PASS')fail('FORECAST_GATE_FAILED');
        lastRun.status='OK';return candidate;
      } catch(error) {
        if(error?.validationStage==='NEWS_ASSESSMENT')for(const field of ['validationStage','validationCode','assessmentIndex','fieldName'])lastRun[field]=error[field];
        throw error;
      } finally {lastRun.requestCompletedAt=new Date(clock()).toISOString();await options.onAudit?.(structuredClone(lastRun));}
    },
  };
}
