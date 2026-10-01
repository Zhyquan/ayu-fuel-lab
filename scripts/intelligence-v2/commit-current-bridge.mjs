import { execFileSync } from 'node:child_process';
import { readFile, writeFile, copyFile, appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CURRENT_CACHE_PATH, CURRENT_ORIGIN_PATH, verifyCurrentPublication } from './current-publication.mjs';
import { replaceCurrentForecast, bridgeSummary } from './manual-bridge.mjs';

const fail=code=>{throw new Error(code);};
export function currentChangesAllowed(records) {
  const paths=[CURRENT_CACHE_PATH,CURRENT_ORIGIN_PATH];
  if(!records.length||records.some(r=>!paths.includes(r.path)||!['??',' M','M ','A ','AM','MM'].includes(r.status)))fail('CURRENT_CHANGE_NOT_ALLOWED');
  return records.map(r=>r.path);
}
async function main() {
  if(process.env.QWEN_API_ACTIVATED!=='true'||process.env.GITHUB_ACTIONS!=='true'||
    process.env.GITHUB_REF!=='refs/heads/main'||process.env.GITHUB_REPOSITORY!=='Zhyquan/ayu-fuel-lab')fail('CURRENT_COMMIT_NOT_AUTHORIZED');
  const root=fileURLToPath(new URL('../../',import.meta.url)), directory=resolve(root,'.work/manual-bridge');
  const snapshot=JSON.parse(await readFile(resolve(directory,'snapshot.json'),'utf8'));
  const origin=JSON.parse(await readFile(resolve(directory,'origin.json'),'utf8'));
  const token=process.env.GITHUB_TOKEN;if(!token)fail('GITHUB_TOKEN_REQUIRED');
  const env={...process.env,GIT_CONFIG_COUNT:'1',GIT_CONFIG_KEY_0:'http.https://github.com/.extraheader',GIT_CONFIG_VALUE_0:`AUTHORIZATION: basic ${Buffer.from(['x-access-token',token].join(':')).toString('base64')}`};
  const git=args=>{try{return execFileSync('git',args,{cwd:root,env,encoding:'utf8',stdio:['ignore','pipe','pipe']});}catch{fail('CURRENT_GIT_OPERATION_FAILED');}};
  const unmoved=()=>{
    git(['fetch','origin','main']);
    if(origin.sourceCommit!==process.env.GITHUB_SHA||origin.runId!==process.env.GITHUB_RUN_ID||git(['rev-parse','HEAD']).trim()!==origin.sourceCommit||
      git(['rev-parse','origin/main']).trim()!==origin.sourceCommit)fail('CURRENT_MAIN_MOVED');
  };
  unmoved();if(git(['status','--porcelain']).trim())fail('CURRENT_CHECKOUT_DIRTY');
  // Only Current files may change. Official history/index and reservations have no write path.
  await replaceCurrentForecast(resolve(root,CURRENT_CACHE_PATH),snapshot);
  await copyFile(resolve(directory,'origin.json'),resolve(root,CURRENT_ORIGIN_PATH));
  await verifyCurrentPublication(root,origin);
  const records=git(['status','--porcelain=v1','-z','--untracked-files=all']).split('\0').filter(Boolean).map(row=>({status:row.slice(0,2),path:row.slice(3)}));
  const paths=currentChangesAllowed(records);
  execFileSync(process.execPath,['scripts/scan-public-files.mjs'],{cwd:root,stdio:['ignore','pipe','pipe']});
  unmoved();git(['add','--force','--',...paths]);
  git(['-c','user.name=github-actions[bot]','-c','user.email=41898282+github-actions[bot]@users.noreply.github.com','commit','-m',`data: Current Forecast ${origin.forecastHash.slice(0,12)}`]);
  git(['push','origin','HEAD:refs/heads/main']);
  const result=JSON.parse(await readFile(resolve(directory,'result.json'),'utf8'));result.currentForecastUpdated=true;result.status='CURRENT_UPDATED';
  await writeFile(resolve(directory,'result.json'),JSON.stringify(result,null,2)+'\n');
  await appendFile(process.env.GITHUB_STEP_SUMMARY,bridgeSummary(result));
  console.log(JSON.stringify({status:result.status,forecastHash:origin.forecastHash,commit:git(['rev-parse','HEAD']).trim()}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(async error=>{
  const code=/^[A-Z0-9_]+$/.test(error.message)?error.message:'CURRENT_COMMIT_FAILED';
  if(process.env.GITHUB_STEP_SUMMARY) {
    try {
      const path=fileURLToPath(new URL('../../.work/manual-bridge/result.json',import.meta.url)),result=JSON.parse(await readFile(path,'utf8'));
      result.status='REJECTED';result.failureCode=code;
      await writeFile(path,JSON.stringify(result,null,2)+'\n');await appendFile(process.env.GITHUB_STEP_SUMMARY,bridgeSummary(result));
    }catch{}
  }
  console.error(code);process.exitCode=1;
});
