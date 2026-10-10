import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACCEPTED_EVIDENCE_PATH, verifyAcceptedCollection } from './accepted-news-refresh.mjs';
import { replaceCurrentForecast } from './manual-bridge.mjs';

const fail=code=>{throw new Error(code);};
export function acceptedChangesAllowed(records) {
  if(!records.length||records.some(r=>r.path!==ACCEPTED_EVIDENCE_PATH||!['??',' M','M ','A ','AM','MM'].includes(r.status)))fail('ACCEPTED_EVIDENCE_CHANGE_NOT_ALLOWED');
  return records.map(r=>r.path);
}

async function main() {
  if(process.env.GITHUB_ACTIONS!=='true'||process.env.GITHUB_REF!=='refs/heads/main'||process.env.GITHUB_REPOSITORY!=='Zhyquan/ayu-fuel-lab')fail('ACCEPTED_EVIDENCE_COMMIT_NOT_AUTHORIZED');
  const root=fileURLToPath(new URL('../../',import.meta.url)),sourceCommit=process.env.GITHUB_SHA;
  if(!/^[a-f0-9]{40}$/.test(sourceCommit??''))fail('ACCEPTED_EVIDENCE_SOURCE_REQUIRED');
  const collection=verifyAcceptedCollection(JSON.parse(await readFile(resolve(root,process.env.ACCEPTED_EVIDENCE_STAGE_PATH??'.work/manual-bridge/accepted-evidence.json'),'utf8')));
  if(Date.now()-Date.parse(collection.generatedAt)>=86400000)fail('ACCEPTED_EVIDENCE_STAGE_EXPIRED');
  const token=process.env.GITHUB_TOKEN;if(!token)fail('GITHUB_TOKEN_REQUIRED');
  const env={...process.env,GIT_CONFIG_COUNT:'1',GIT_CONFIG_KEY_0:'http.https://github.com/.extraheader',GIT_CONFIG_VALUE_0:`AUTHORIZATION: basic ${Buffer.from(['x-access-token',token].join(':')).toString('base64')}`};
  const git=args=>{try{return execFileSync('git',args,{cwd:root,env,encoding:'utf8',stdio:['ignore','pipe','pipe']});}catch{fail('ACCEPTED_EVIDENCE_GIT_OPERATION_FAILED');}};
  const unmoved=()=>{
    git(['fetch','origin','main']);
    if(git(['rev-parse','HEAD']).trim()!==sourceCommit||git(['rev-parse','origin/main']).trim()!==sourceCommit)fail('ACCEPTED_EVIDENCE_MAIN_MOVED');
  };
  unmoved();if(git(['status','--porcelain']).trim())fail('ACCEPTED_EVIDENCE_CHECKOUT_DIRTY');
  await replaceCurrentForecast(resolve(root,ACCEPTED_EVIDENCE_PATH),collection);
  const records=git(['status','--porcelain=v1','-z','--untracked-files=all']).split('\0').filter(Boolean).map(row=>({status:row.slice(0,2),path:row.slice(3)}));
  if(!records.length){console.log(JSON.stringify({status:'ACCEPTED_EVIDENCE_UNCHANGED'}));return;}
  const paths=acceptedChangesAllowed(records);
  execFileSync(process.execPath,['scripts/scan-public-files.mjs'],{cwd:root,stdio:['ignore','pipe','pipe']});
  unmoved();git(['add','--force','--',...paths]);
  git(['-c','user.name=github-actions[bot]','-c','user.email=41898282+github-actions[bot]@users.noreply.github.com','commit','-m',`data: Accepted Fuel evidence ${collection.collectionHash.slice(0,12)}`]);
  git(['push','origin','HEAD:refs/heads/main']);
  console.log(JSON.stringify({status:'ACCEPTED_EVIDENCE_COMMITTED',collectionHash:collection.collectionHash}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(/^[A-Z0-9_]+$/.test(error.message)?error.message:'ACCEPTED_EVIDENCE_COMMIT_FAILED');process.exitCode=1;});
