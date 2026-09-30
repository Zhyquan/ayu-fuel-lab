import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { chinaDate, validDate } from '../../dist/data/validation.js';
import { INDEX_PATH, validateIndexShape } from './official-daily.mjs';

const repository='Zhyquan/ayu-fuel-lab';
const priceWorkflow='Update and deploy fuel references';
const root=fileURLToPath(new URL('../../',import.meta.url));
const fail=code=>{throw new Error(code);};
const chinaHour=now=>Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',hour:'2-digit',hourCycle:'h23'}).format(now));
export const reservationName=date=>`qwen-inference-reserved-${date}`;

export function triggerAdmission({eventName,event={},repo,ref,now=new Date()}) {
  if(repo!==repository||ref!=='refs/heads/main')return {eligible:false,reason:'UNTRUSTED_TRIGGER'};
  if(eventName==='workflow_run') {
    const run=event.workflow_run;
    if(run?.name!==priceWorkflow||run.conclusion!=='success'||run.head_branch!=='main'||run.head_repository?.full_name!==repository||run.event!=='schedule')return {eligible:false,reason:'PRICE_RUN_NOT_ELIGIBLE'};
  }else if(eventName==='workflow_dispatch') {
    if(event.inputs?.mode!=='OFFICIAL_DAILY')return {eligible:false,reason:'NOT_OFFICIAL_DISPATCH'};
  }else if(eventName!=='schedule')return {eligible:false,reason:'UNKNOWN_TRIGGER'};
  if(eventName!=='workflow_dispatch'&&chinaHour(now)<7)return {eligible:false,reason:'BEFORE_07_SHANGHAI'};
  return {eligible:true,forecastDate:chinaDate(now)};
}

export function inferenceAdmission({date,index,sourceCommit,latestCommit,artifacts=[]}) {
  validateIndexShape(index);
  if(index.entries.some(entry=>entry.forecastDate===date))return {eligible:false,reason:'OFFICIAL_DAILY_ALREADY_EXISTS'};
  if(sourceCommit!==latestCommit)fail('OFFICIAL_MAIN_MOVED_BEFORE_INFERENCE');
  if(artifacts.some(artifact=>artifact.name===reservationName(date)&&artifact.expired===false&&artifact.workflow_run?.head_branch==='main'))return {eligible:false,reason:'QWEN_INFERENCE_RESERVED_FOR_DATE'};
  return {eligible:true,reason:null};
}

export async function readReservations(date,{token,fetchImpl=fetch}={}) {
  if(!token)fail('ACTIONS_READ_TOKEN_REQUIRED');
  const url=`https://api.github.com/repos/${repository}/actions/artifacts?name=${encodeURIComponent(reservationName(date))}&per_page=100`;
  const response=await fetchImpl(url,{headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${token}`}});
  if(!response.ok)fail('INFERENCE_RESERVATION_LOOKUP_FAILED');
  const body=await response.json();
  if(!Array.isArray(body.artifacts))fail('INFERENCE_RESERVATION_LOOKUP_FAILED');
  return body.artifacts;
}

async function latestMain() {
  const git=args=>{try{return execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}catch{fail('OFFICIAL_MAIN_READ_FAILED');}};
  git(['fetch','origin','main']);
  const latestCommit=git(['rev-parse','refs/remotes/origin/main']);
  return {latestCommit,index:JSON.parse(git(['show',`${latestCommit}:${INDEX_PATH}`]))};
}

async function output(result) {
  if(process.env.GITHUB_OUTPUT)await appendFile(process.env.GITHUB_OUTPUT,`eligible=${result.eligible}\n`);
  console.log(JSON.stringify(result));
}

async function main() {
  const mode=process.argv[2];
  if(mode==='trigger') {
    const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,'utf8'));
    return output(triggerAdmission({eventName:process.env.GITHUB_EVENT_NAME,event,repo:process.env.GITHUB_REPOSITORY,ref:process.env.GITHUB_REF}));
  }
  const date=process.env.OFFICIAL_FORECAST_DATE;
  if(!validDate(date)||date!==chinaDate(new Date()))fail('OFFICIAL_DATE_INVALID');
  if(mode==='reserve') {
    const path=resolve(root,'.work/official-daily-reservation.json');
    await mkdir(resolve(root,'.work'),{recursive:true});
    await writeFile(path,JSON.stringify({forecastDate:date,runId:process.env.GITHUB_RUN_ID,runAttempt:process.env.GITHUB_RUN_ATTEMPT})+'\n',{flag:'wx'});
    console.log(JSON.stringify({status:'QWEN_INFERENCE_RESERVED_FOR_DATE',forecastDate:date}));return;
  }
  if(mode!=='late'&&mode!=='confirm')fail('OFFICIAL_TRIGGER_MODE_INVALID');
  const {latestCommit,index}=await latestMain();
  const artifacts=mode==='late'?await readReservations(date,{token:process.env.GITHUB_TOKEN}):[];
  return output(inferenceAdmission({date,index,sourceCommit:process.env.GITHUB_SHA,latestCommit,artifacts}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(/^[A-Z0-9_]+$/.test(error.message)?error.message:'OFFICIAL_TRIGGER_FAILED');process.exitCode=1;});
