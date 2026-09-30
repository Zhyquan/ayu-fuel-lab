import { mkdir, readFile, writeFile, rename, unlink, open } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chinaDate, validDate, validTimestamp } from '../../dist/data/validation.js';
import { canonicalJson, coreEvidenceGate } from '../../dist/data/intelligence-v2-contract.js';
import { evidenceHashFor, saveForecastSnapshot } from './history.mjs';
import { QWEN_MODEL } from './qwen-provider.mjs';
import { runForecast } from './run.mjs';
export const INDEX_PATH='data/forecast-history-v2/official-daily-index.json';
export const PROVIDER_AUDIT_PATH='intelligence-v2/provider-run.json';
export const hashFor=evidenceHashFor;
const fail=code=>{throw new Error(code);};
const read=async path=>JSON.parse(await readFile(path,'utf8'));
export async function atomicJson(path,value,{renameImpl=rename}={}) {
  const temporary=`${path}.${randomUUID()}.tmp`;
  try{await writeFile(temporary,JSON.stringify(value,null,2)+'\n',{flag:'wx'});await renameImpl(temporary,path);}
  finally{await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
}
export function validateIndexShape(index) {
  if(!index||index.schemaVersion!==1||!Array.isArray(index.entries)||!Array.isArray(index.legacyHistory)||new Set(index.entries.map(e=>e.forecastDate)).size!==index.entries.length)fail('OFFICIAL_INDEX_INVALID');
  for(const e of index.entries)if(e.role!=='OFFICIAL_DAILY'||!validDate(e.forecastDate)||!validTimestamp(e.generatedAt)||chinaDate(e.generatedAt)!==e.forecastDate||!/^[a-f0-9]{64}$/.test(e.forecastHash)||e.forecastId!==e.forecastHash||!/^[a-f0-9]{64}$/.test(e.evidenceHash)||!/^[a-f0-9]{40}$/.test(e.sourceCommit)||e.provider!=='QWEN'||e.model!==QWEN_MODEL||!/^\d{4}-\d{2}-\d{2}T[\d.\-]+Z-[a-f0-9]{12}\.json$/.test(e.historyFile)||(e.inputPackHash!==undefined&&(!/^[a-f0-9]{64}$/.test(e.inputPackHash)||!['NORMAL','LIMITED'].includes(e.coverageMode))))fail('OFFICIAL_INDEX_INVALID');
  for(const e of index.legacyHistory)if(e.role!=='ROLE_UNCONFIRMED'||e.historyFile!==basename(e.historyFile)||!/\.json$/.test(e.historyFile))fail('OFFICIAL_INDEX_INVALID');
  return index;
}
export async function readOfficialIndex(root) {
  const index=validateIndexShape(await read(resolve(root,INDEX_PATH)));
  for(const e of index.entries) {
    const snapshot=await read(resolve(root,'data/forecast-history-v2',e.historyFile));
    const {evidencePack,...candidate}=snapshot;
    if(hashFor(snapshot)!==e.forecastHash||hashFor(evidencePack)!==e.evidenceHash||candidate.evidenceHash!==e.evidenceHash||candidate.generatedAt!==e.generatedAt||candidate.provider!=='QWEN'||(e.inputPackHash!==undefined&&(candidate.inputPackHash!==e.inputPackHash||candidate.coverageMode!==e.coverageMode)))fail('OFFICIAL_HISTORY_INTEGRITY_FAILED');
  }
  return index;
}
export async function officialPreflight(root,now=new Date()) {
  const index=await readOfficialIndex(root), date=chinaDate(now);
  return {eligible:!index.entries.some(e=>e.forecastDate===date),forecastDate:date,reason:index.entries.some(e=>e.forecastDate===date)?'OFFICIAL_DAILY_ALREADY_EXISTS':null};
}
export async function runOfficialDaily({root,pack,sourceCommit,providerOptions={},clock=()=>new Date()}) {
  const started=clock(), preflight=await officialPreflight(root,started);
  if(!preflight.eligible)return {status:'OFFICIAL_DAILY_ALREADY_EXISTS',published:false};
  if(!/^[a-f0-9]{40}$/.test(sourceCommit??''))fail('OFFICIAL_SOURCE_COMMIT_REQUIRED');
  const directory=resolve(root,'data/forecast-history-v2');
  await mkdir(directory,{recursive:true});
  const lockPath=resolve(directory,'.official-daily.lock');
  let lock;try{lock=await open(lockPath,'wx');}catch(error){if(error.code==='EEXIST')fail('OFFICIAL_DAILY_RUN_BUSY');throw error;}
  try {
    const index=await readOfficialIndex(root);
    if(index.entries.some(e=>e.forecastDate===preflight.forecastDate))return {status:'OFFICIAL_DAILY_ALREADY_EXISTS',published:false};
    const frozen=structuredClone(pack);
    if(coreEvidenceGate(frozen,{now:clock()}).gate!=='PASS')fail('EVIDENCE_GATE_FAILED');
    const result=await runForecast({pack:frozen,provider:'QWEN',providerOptions:{...providerOptions,clock,onAudit:async audit=>atomicJson(resolve(root,PROVIDER_AUDIT_PATH),audit)},now:clock(),persist:false});
    if(result.gate.gate!=='PASS')fail('FORECAST_GATE_FAILED');
    if(chinaDate(result.candidate.generatedAt)!==preflight.forecastDate)fail('OFFICIAL_DAILY_DATE_CHANGED');
    const {path,snapshot}=await saveForecastSnapshot(directory,result.candidate,frozen,{now:clock()});
    const entry={forecastId:hashFor(snapshot),forecastDate:preflight.forecastDate,historyFile:basename(path),forecastHash:hashFor(snapshot),evidenceHash:result.candidate.evidenceHash,generatedAt:result.candidate.generatedAt,role:'OFFICIAL_DAILY',provider:'QWEN',model:QWEN_MODEL,sourceCommit,
      ...(result.candidate.inputPackHash?{inputPackHash:result.candidate.inputPackHash,coverageMode:result.candidate.coverageMode}:{}),
    };
    await atomicJson(resolve(root,'CURRENT_FORECAST_CANDIDATE_V2.json'),result.candidate);
    await atomicJson(resolve(root,'FORECAST_GATE_V2_RESULT.json'),result.gate);
    await atomicJson(resolve(root,'dist/data/forecast-cache.json'),snapshot);
    // Entries are append-only; the file is atomically replaced, never rewritten in place.
    await atomicJson(resolve(root,INDEX_PATH),{...index,entries:[...index.entries,entry]});
    return {status:'OFFICIAL_DAILY_SAVED',published:true,entry,providerAudit:result.providerAudit};
  }finally{await lock.close();await unlink(lockPath);}
}
async function main() {
  const root=fileURLToPath(new URL('../../',import.meta.url)), mode=process.argv[2]??'preflight';
  if(mode==='preflight') {
    const result=await officialPreflight(root);
    if(process.env.GITHUB_OUTPUT)await writeFile(process.env.GITHUB_OUTPUT,`eligible=${result.eligible}\nforecastDate=${result.forecastDate}\n`,{flag:'a'});
    console.log(JSON.stringify(result));return;
  }
  if(mode!=='generate')fail('OFFICIAL_DAILY_MODE_INVALID');
  if(process.env.QWEN_API_ACTIVATION_AUTHORIZED!=='1'||process.env.GITHUB_ACTIONS!=='true'||process.env.GITHUB_REF!=='refs/heads/main'||process.env.GITHUB_REPOSITORY!=='Zhyquan/ayu-fuel-lab')fail('QWEN_API_ACTIVATION_NEEDS_USER_AUTHORIZATION');
  const gate=await read(resolve(root,'intelligence-v2/EVIDENCE_GATE_RESULT.json'));
  if(gate.gate!=='PASS')fail('EVIDENCE_GATE_FAILED');
  const pack=await read(resolve(root,'CURRENT_EVIDENCE_V2.json'));
  if(canonicalJson(pack)!==canonicalJson(await read(resolve(root,'intelligence-v2/current-evidence.json')))||Date.parse(pack.generatedAt)<Date.parse(process.env.OFFICIAL_RUN_STARTED_AT)||!validTimestamp(process.env.OFFICIAL_RUN_STARTED_AT))fail('FRESH_EVIDENCE_REQUIRED');
  const result=await runOfficialDaily({root,pack,sourceCommit:process.env.GITHUB_SHA,providerOptions:{activationAuthorized:true}});
  console.log(JSON.stringify({status:result.status,forecastId:result.entry?.forecastId??null}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(/^[A-Z0-9_]+$/.test(error.message)?error.message:'OFFICIAL_DAILY_FAILED');process.exitCode=1;});
