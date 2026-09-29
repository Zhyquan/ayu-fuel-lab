import { execFileSync } from 'node:child_process';
import { writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validTimestamp } from '../../dist/data/validation.js';
import { readOfficialIndex } from './official-daily.mjs';
import { verifyGenerated } from './commit-official-daily.mjs';

export async function dailyDeliveryReady({root,triggerHeadSha,runCreatedAt,commitSubject,now=new Date()}) {
  try {
    if(!/^[a-f0-9]{40}$/.test(triggerHeadSha??'')||!validTimestamp(runCreatedAt))return {ready:false,reason:'INVALID_DAILY_TRIGGER'};
    const index=await readOfficialIndex(root), entry=index.entries.at(-1);
    if(!entry||entry.sourceCommit!==triggerHeadSha||Date.parse(entry.generatedAt)<Date.parse(runCreatedAt)||commitSubject!==`data: Official Daily ${entry.forecastDate} ${entry.forecastId.slice(0,12)}`)return {ready:false,reason:'NOT_THIS_OFFICIAL_DAILY_COMMIT'};
    await verifyGenerated(root,{...index,entries:index.entries.slice(0,-1)},{sourceCommit:triggerHeadSha,now});
    const audit=JSON.parse(await readFile(resolve(root,'intelligence-v2/provider-run.json'),'utf8'));
    if(Date.parse(audit.requestStartedAt)<Date.parse(runCreatedAt))return {ready:false,reason:'OLD_PROVIDER_AUDIT'};
    return {ready:true,reason:null,forecastId:entry.forecastId};
  }catch{return {ready:false,reason:'DAILY_DELIVERY_GATE_FAILED'};}
}
async function main() {
  const root=fileURLToPath(new URL('../../',import.meta.url));
  const commitSubject=execFileSync('git',['log','-1','--format=%s'],{cwd:root,encoding:'utf8'}).trim();
  const result=await dailyDeliveryReady({root,triggerHeadSha:process.env.OFFICIAL_TRIGGER_HEAD_SHA,runCreatedAt:process.env.OFFICIAL_TRIGGER_CREATED_AT,commitSubject});
  if(process.env.GITHUB_OUTPUT)await writeFile(process.env.GITHUB_OUTPUT,`ready=${result.ready}\n`,{flag:'a'});
  console.log(JSON.stringify(result));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{console.error('DAILY_DELIVERY_CHECK_FAILED');process.exitCode=1;});
