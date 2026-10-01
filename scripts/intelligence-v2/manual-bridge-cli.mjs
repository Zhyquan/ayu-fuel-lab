import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runManualBridge, bridgeSummary } from './manual-bridge.mjs';
import { currentPublication, CURRENT_CACHE_PATH } from './current-publication.mjs';
import { readForecast } from '../../dist/data/intelligence-v2-service.js';

const root=fileURLToPath(new URL('../../',import.meta.url)), directory=resolve(root,'.work/manual-bridge');
const mode=process.env.BRIDGE_MODE??'REFRESH_CURRENT';
const authorized=process.env.QWEN_API_ACTIVATED==='true'&&
  process.env.GITHUB_ACTIONS==='true'&&process.env.GITHUB_REF==='refs/heads/main'&&process.env.GITHUB_REPOSITORY==='Zhyquan/ayu-fuel-lab';
await mkdir(directory,{recursive:true});
let currentCache=null;
try {
  const raw=await readFile(resolve(root,CURRENT_CACHE_PATH),'utf8');
  const checked=await readForecast({fetchImpl:async()=>new Response(raw)});
  if(['LIVE','STALE'].includes(checked.status))currentCache=checked;
}catch{}
let autoEvidence=null;
try{autoEvidence=JSON.parse(await readFile(resolve(root,'CURRENT_EVIDENCE_V2.json'),'utf8'));}catch{}
const result=await runManualBridge({newsUrl:process.env.BRIDGE_NEWS_URL,signalPackage:process.env.BRIDGE_SIGNAL_PACKAGE,intakeType:process.env.BRIDGE_INTAKE_TYPE??'CHATGPT_SIGNAL_PACKAGE',mode,currentCache,autoEvidence,activationAuthorized:authorized});
let ready=false;
try {
  if(mode==='REFRESH_CURRENT'&&result.status==='CURRENT_READY') {
    const origin=await currentPublication(result.snapshot,result.providerAudit,{sourceCommit:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID});
    result.forecastId=origin.forecastHash;
    await writeFile(resolve(directory,'snapshot.json'),JSON.stringify(result.snapshot,null,2)+'\n');
    await writeFile(resolve(directory,'origin.json'),JSON.stringify(origin,null,2)+'\n');
    ready=true;
  }
}catch(error){result.status='REJECTED';result.failureCode=/^[A-Z0-9_]+$/.test(error.message)?error.message:'CURRENT_STAGING_FAILED';}
const {snapshot,providerAudit,...safe}=result;
if(providerAudit)safe.providerMetrics={
  ...Object.fromEntries(['provider','model','status','configuredTransportRetries','maxExternalRequests','actualExternalRequestCount','attemptCount','httpStatus','validationCode'].map(key=>[key,providerAudit[key]??null])),
  inputTokens:providerAudit.usage?.input_tokens??null,outputTokens:providerAudit.usage?.output_tokens??null,
};
await writeFile(resolve(directory,'result.json'),JSON.stringify(safe,null,2)+'\n');
if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,bridgeSummary(safe));
if(process.env.GITHUB_OUTPUT)await appendFile(process.env.GITHUB_OUTPUT,`ready=${ready}\n`);
console.log(JSON.stringify(safe));
