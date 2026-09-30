import { validateExternalAnalystSignalPackage, mergeExternalSignals } from './external-analyst-signals.mjs';
import { writeFile, rename, unlink } from 'node:fs/promises';
import { admittedNewsDocuments, coreEvidenceGate, forecastGate, newsEnrichmentGate, NEWS_INPUT_CONTRACT } from '../../dist/data/intelligence-v2-contract.js';
import { publicEvidenceGate } from '../../dist/data/public-evidence.js';
import { resolveNewsUrl, deduplicateNewsDocuments } from './source-adapters.mjs';
import { collectEvidence } from './collect.mjs';
import { runForecast } from './run.mjs';
import { evidenceHashFor } from './history.mjs';

const fail = code => { throw new Error(code); };
export function mergeBridgeEvidence(pack,document) {
  if(pack.inputContractVersion!==NEWS_INPUT_CONTRACT)fail('NEWS_INPUT_CONTRACT_REQUIRED');
  const auto=admittedNewsDocuments(pack), dedup=deduplicateNewsDocuments([...auto.documents,document]);
  const duplicate=dedup.excluded.find(item=>item.documentId===document.documentId);
  if(duplicate)return {duplicate,pack:null};
  const documents=[document,...dedup.documents.filter(d=>d.documentId!==document.documentId)];
  const excluded=documents.slice(6).map(d=>({documentId:d.documentId,reason:'NEWS_INPUT_LIMIT'}));
  const newsDocuments=documents.slice(0,6);
  return {duplicate:null,pack:{...structuredClone(pack),newsDocuments,coverageMode:auto.errors.length?'LIMITED':'NORMAL',
    exclusions:[...(pack.exclusions??[]),...dedup.excluded,...excluded]}};
}

export async function replaceCurrentForecast(path,snapshot,{write=writeFile,move=rename}={}) {
  const temporary=`${path}.${process.pid}.tmp`;
  try{await write(temporary,JSON.stringify(snapshot,null,2)+'\n',{flag:'wx'});await move(temporary,path);}
  finally{await unlink(temporary).catch(()=>{});}
}

export async function runManualBridge({newsUrl,signalPackage,intakeType='NEWS_URL',mode='VERIFY_ONLY',resolveOptions={},collect=collectEvidence,clock=()=>new Date(),
  currentCache=null,autoEvidence=null,providerOptions={},refreshAuthorized=false,cachePath,persist=false,writeOptions}={}) {
  const result={status:'REJECTED',mode,intakeType,sourceUrl:null,source:null,publishedAt:null,publishedAtPrecision:null,freshness:'NOT_CHECKED',
    duplicate:'NOT_CHECKED',evidenceAdmission:'NOT_ADMITTED',qwenCalled:false,coreForecastGate:'NOT_RUN',newsEnrichmentGate:'NOT_RUN',
    newsUsedInReasons:false,publicCard:false,currentForecastUpdated:false,failureCode:null};
  try {
    if(!['VERIFY_ONLY','REFRESH_CURRENT'].includes(mode))fail('BRIDGE_MODE_INVALID');
    if(mode==='REFRESH_CURRENT'&&!refreshAuthorized)fail('BRIDGE_REFRESH_NOT_AUTHORIZED');
    if(!['NEWS_URL','CHATGPT_SIGNAL_PACKAGE'].includes(intakeType))fail('BRIDGE_INTAKE_INVALID');
    let document=null, normalized=null;
    if(intakeType==='CHATGPT_SIGNAL_PACKAGE') {
      normalized=validateExternalAnalystSignalPackage(signalPackage,{now:clock()});
      Object.assign(result,{signalCount:normalized.signals.length,freshSignals:normalized.signals.length,sourceUrlPresent:normalized.signals.filter(s=>s.sourceUrl!==null).length,freshness:'PASS'});
    } else {
      const resolved=await resolveNewsUrl(newsUrl,{...resolveOptions,now:clock()});document=resolved.document;
      Object.assign(result,{sourceUrl:document.sourceUrl,source:document.originalSource,publishedAt:document.publishedAt,publishedAtPrecision:document.publishedAtPrecision,
        freshness:'PASS',verificationChecks:resolved.checks,documentId:document.documentId,articleContentHash:document.articleContentHash});
    }
    const collected=await collect({now:clock(),coreOnly:intakeType==='CHATGPT_SIGNAL_PACKAGE'});
    const core=coreEvidenceGate(collected.pack,{now:clock()});
    result.coreEvidenceGate=core.gate;result.coreEvidenceErrors=core.errors;
    result.coreFetchFailures=(collected.pack.fetchLog??[]).filter(f=>f.status==='FAILED').map(f=>({url:f.url,reason:f.reason}));
    if(core.gate!=='PASS')fail('CORE_EVIDENCE_GATE_FAILED');
    let pack;
    if(normalized) {
      const merged=mergeExternalSignals(collected.pack,normalized,{currentCache,autoEvidence,now:clock()});
      pack=merged.pack;result.duplicateEvents=merged.duplicateEvents;result.excluded=merged.excluded;
    } else {
      // Previous accepted Current evidence also prevents repeated manual submissions.
      if(currentCache?.evidencePack?.newsDocuments?.length) {
        const previous=deduplicateNewsDocuments([...currentCache.evidencePack.newsDocuments,document]);
        if(previous.excluded.some(d=>d.documentId===document.documentId)){result.duplicate='DUPLICATE';fail('BRIDGE_DUPLICATE_ONLY');}
      }
      const merged=mergeBridgeEvidence(collected.pack,document);
      if(merged.duplicate){result.duplicate='DUPLICATE';fail('BRIDGE_DUPLICATE_ONLY');}
      pack=merged.pack;result.verificationChecks.push('NOT_DUPLICATE');
    }
    result.duplicate='NOT_DUPLICATE';
    if(coreEvidenceGate(pack,{now:clock()}).gate!=='PASS')fail('CORE_EVIDENCE_GATE_FAILED');
    result.evidenceAdmission='PASS';result.coverageMode=coreEvidenceGate(pack,{now:clock()}).coverageMode;
    result.inputShape={signals:pack.signals.length,newsDocuments:pack.newsDocuments.length,...(normalized?{externalAnalystSignals:pack.externalAnalystSignals.length}:{})};
    if(mode==='VERIFY_ONLY'){result.status='READY_FOR_REFORECAST';return result;}
    // Existing provider/prompt/schema and nonpersisting runner; never enter the Official writer.
    const analysis=await runForecast({pack,provider:'QWEN',providerOptions:{...providerOptions,activationAuthorized:true,maxTransportRetries:0,maxExternalRequests:1,onAudit:async audit=>{
      result.qwenCalled=Boolean(audit.attemptCount);result.providerAudit=audit;await providerOptions.onAudit?.(audit);
    }},now:clock(),persist:false});
    result.qwenCalled=Boolean(analysis.providerAudit?.attemptCount);
    result.coreForecastGate=analysis.gate.gate;
    if(analysis.gate.gate!=='PASS')fail('CORE_FORECAST_GATE_FAILED');
    const {candidate,evidencePack}=analysis;
    if(forecastGate(candidate,evidencePack,{now:clock(),expectedEvidenceHash:evidenceHashFor(evidencePack)}).gate!=='PASS')fail('CORE_FORECAST_GATE_FAILED');
    const news=newsEnrichmentGate(candidate,evidencePack,{mode:'FORECAST'});
    result.newsEnrichmentGate=analysis.providerAudit?.newsEnrichment?.gate??news.gate;
    const cards=publicEvidenceGate({forecast:candidate,evidencePack},{now:clock()});
    result.publicEvidenceGate=cards.gate;
    if(cards.gate!=='PASS')fail('PUBLIC_EVIDENCE_GATE_FAILED');
    const selected=[...candidate.mainReasons,...candidate.counterReasons].filter(r=>normalized?pack.externalAnalystSignals.some(s=>s.evidenceId===r.evidenceId):r.documentId===document.documentId);
    result.newsUsedInReasons=selected.length>0;
    result.publicCard=cards.cards.some(card=>selected.some(ref=>ref.evidenceId===card.evidenceId));
    if(selected.some(ref=>!cards.cards.some(card=>card.evidenceId===ref.evidenceId)))fail('BRIDGE_PUBLIC_CARD_MISSING');
    const snapshot={...candidate,evidencePack};
    if(persist){if(!cachePath)fail('CURRENT_CACHE_PATH_REQUIRED');await replaceCurrentForecast(cachePath,snapshot,writeOptions);result.currentForecastUpdated=true;}
    return {...result,status:'CURRENT_READY',snapshot,providerAudit:analysis.providerAudit};
  } catch(error) {
    result.failureCode=/^[A-Z0-9_]{1,80}$/.test(error.message)?error.message:'BRIDGE_FAILED';
    return result;
  }
}

const escape = value => String(value??'—').replace(/[\r\n|`<>]/g,' ');
export function bridgeSummary(result) {
  if(result.intakeType==='CHATGPT_SIGNAL_PACKAGE')return `## 情报桥结果\n\n| 项目 | 结果 |\n| --- | --- |\n${[
    ['结果',result.status],['Intake','ChatGPT Signal Package'],['Signals',result.signalCount??0],['Fresh signals',result.freshSignals??0],['Duplicate events',result.duplicateEvents??'NOT_CHECKED'],
    ['Source URL present',`${result.sourceUrlPresent??0}/${result.signalCount??0}`],['Core Evidence',result.coreEvidenceGate??'NOT_RUN'],
    ['Core failure details',(result.coreEvidenceErrors??[]).join(', ')||'—'],['Ready for reforecast',result.status==='READY_FOR_REFORECAST'?'YES':'NO'],['Mode',result.mode],['Qwen Called',result.qwenCalled?'YES':'NO'],
    ['Current Forecast Updated',result.currentForecastUpdated?'YES':'NO'],['Failure Code',result.failureCode],
  ].map(([label,value])=>`| ${label} | ${escape(value)} |`).join('\n')}\n`;
  const date=result.publishedAtPrecision==='DATE_ONLY'?result.publishedAt?.slice(0,10):result.publishedAt;
  return `## 情报桥结果\n\n| 项目 | 结果 |\n| --- | --- |\n${[
    ['结果',result.status],['URL',result.sourceUrl??'未接纳，不展示原值'],['Source',result.source],['Published At',date],['Freshness',result.freshness],
    ['Duplicate',result.duplicate],['Evidence Admission',result.evidenceAdmission],['Mode',result.mode],['Qwen Called',result.qwenCalled],
    ['Core Forecast Gate',result.coreForecastGate],['News Enrichment Gate',result.newsEnrichmentGate],['News Used In Reasons',result.newsUsedInReasons],
    ['Public Card',result.publicCard],['Current Forecast Updated',result.currentForecastUpdated],['Failure Code',result.failureCode],
  ].map(([label,value])=>`| ${label} | ${escape(value)} |`).join('\n')}\n`;
}
