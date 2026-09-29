import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, evidenceGate, forecastGate } from '../../dist/data/intelligence-v2-contract.js';
import { publicEvidenceGate } from '../../dist/data/public-evidence.js';
import { chinaDate } from '../../dist/data/validation.js';
import { readOfficialIndex, INDEX_PATH } from './official-daily.mjs';

export const GENERATED_PATHS=[
  'CURRENT_EVIDENCE_V2.json','CURRENT_FORECAST_CANDIDATE_V2.json','FORECAST_GATE_V2_RESULT.json',
  'intelligence-v2/current-evidence.json','intelligence-v2/pending-intelligence-pack.json',
  'intelligence-v2/EVIDENCE_GATE_RESULT.json','intelligence-v2/provider-run.json',
  INDEX_PATH,'dist/data/forecast-cache.json',
];
const historyPattern=/^data\/forecast-history-v2\/\d{4}-\d{2}-\d{2}T[\d.\-]+Z-[a-f0-9]{12}\.json$/;
const fail=code=>{throw new Error(code);};
export function validateGeneratedChanges(records,newHistoryPath) {
  if(!records.length)fail('OFFICIAL_NO_GENERATED_CHANGES');
  for(const {path,status}of records) {
    if(!GENERATED_PATHS.includes(path)&&!(historyPattern.test(path)&&path===newHistoryPath))fail('OFFICIAL_PATH_NOT_ALLOWED');
    if(status.includes('D')||status.includes('R')||status.includes('C')||!['??',' M','M ','A ','AM','MM'].includes(status))fail('OFFICIAL_CHANGE_NOT_ALLOWED');
    if(historyPattern.test(path)&&!['??','A '].includes(status))fail('OFFICIAL_HISTORY_IS_IMMUTABLE');
  }
  return records.map(r=>r.path);
}
export function validateIndexAppend(before,after,{sourceCommit,now=new Date()}={}) {
  if(canonicalJson(before.legacyHistory)!==canonicalJson(after.legacyHistory)||before.schemaVersion!==after.schemaVersion||after.entries.length!==before.entries.length+1||canonicalJson(before.entries)!==canonicalJson(after.entries.slice(0,-1)))fail('OFFICIAL_INDEX_NOT_APPEND_ONLY');
  const entry=after.entries.at(-1);
  if(entry.forecastDate!==chinaDate(now)||entry.sourceCommit!==sourceCommit)fail('OFFICIAL_DAILY_IDENTITY_MISMATCH');
  return entry;
}
export async function verifyGenerated(root,before,{sourceCommit,now=new Date()}={}) {
  const read=async path=>JSON.parse(await readFile(resolve(root,path),'utf8'));
  const after=await readOfficialIndex(root), entry=validateIndexAppend(before,after,{sourceCommit,now});
  const pack=await read('CURRENT_EVIDENCE_V2.json'), candidate=await read('CURRENT_FORECAST_CANDIDATE_V2.json');
  const snapshot={...candidate,evidencePack:pack};
  if(canonicalJson(await read('intelligence-v2/current-evidence.json'))!==canonicalJson(pack))fail('OFFICIAL_EVIDENCE_MISMATCH');
  const pending=await read('intelligence-v2/pending-intelligence-pack.json');
  if(pending.evidenceGate?.gate!=='PASS'||canonicalJson(pending.evidencePack)!==canonicalJson(pack))fail('OFFICIAL_EVIDENCE_MISMATCH');
  if(evidenceGate(pack,{now}).gate!=='PASS'||(await read('intelligence-v2/EVIDENCE_GATE_RESULT.json')).gate!=='PASS'||forecastGate(candidate,pack,{now,expectedEvidenceHash:entry.evidenceHash}).gate!=='PASS'||publicEvidenceGate({forecast:candidate,evidencePack:pack},{now}).gate!=='PASS'||(await read('FORECAST_GATE_V2_RESULT.json')).gate!=='PASS')fail('OFFICIAL_GENERATED_GATE_FAILED');
  if(canonicalJson(await read('dist/data/forecast-cache.json'))!==canonicalJson(snapshot)||canonicalJson(await read(`data/forecast-history-v2/${entry.historyFile}`))!==canonicalJson(snapshot))fail('OFFICIAL_CACHE_HISTORY_MISMATCH');
  const audit=await read('intelligence-v2/provider-run.json');
  if(audit.mock!==false||audit.status!=='OK'||audit.provider!=='QWEN'||audit.model!=='qwen3.8-flash'||audit.semanticCallCount!==1||audit.attemptCount<1||audit.attemptCount>3||audit.requestCompletedAt<candidate.generatedAt)fail('OFFICIAL_PROVIDER_AUDIT_INVALID');
  return entry;
}
export function requireUnmovedMain(git,sourceCommit) {
  git(['fetch','origin','main']);
  if(git(['rev-parse','HEAD']).trim()!==sourceCommit)fail('OFFICIAL_CHECKOUT_CHANGED');
  if(git(['rev-parse','refs/remotes/origin/main']).trim()!==sourceCommit) {
    // Never reuse generated evidence on a changed source tree, even when pull succeeds.
    try{git(['pull','--ff-only','origin','main']);}catch{}
    fail('OFFICIAL_MAIN_MOVED_RETRY_NEXT_RUN');
  }
}
export function parseStatus(output) {
  const records=output.split('\0').filter(Boolean).map(row=>({status:row.slice(0,2),path:row.slice(3)}));
  if(records.some(r=>!r.path||r.status.includes('R')||r.status.includes('C')))fail('OFFICIAL_CHANGE_NOT_ALLOWED');
  return records;
}
async function main() {
  if(process.env.GITHUB_ACTIONS!=='true'||process.env.GITHUB_REF!=='refs/heads/main'||process.env.GITHUB_REPOSITORY!=='Zhyquan/ayu-fuel-lab'||process.env.QWEN_API_ACTIVATION_AUTHORIZED!=='1')fail('OFFICIAL_COMMIT_NOT_AUTHORIZED');
  const token=process.env.GITHUB_TOKEN;if(!token)fail('GITHUB_TOKEN_REQUIRED');
  const root=fileURLToPath(new URL('../../',import.meta.url)), sourceCommit=process.env.GITHUB_SHA;
  // The token exists only in this final subprocess environment, never in a URL or git config file.
  const env={...process.env,GIT_CONFIG_COUNT:'1',GIT_CONFIG_KEY_0:'http.https://github.com/.extraheader',GIT_CONFIG_VALUE_0:`AUTHORIZATION: basic ${Buffer.from(['x-access-token',token].join(':')).toString('base64')}`};
  const git=args=>{try{return execFileSync('git',args,{cwd:root,env,encoding:'utf8',stdio:['ignore','pipe','pipe']});}catch{fail('OFFICIAL_GIT_OPERATION_FAILED');}};
  const before=JSON.parse(git(['show',`${sourceCommit}:${INDEX_PATH}`]));
  const entry=await verifyGenerated(root,before,{sourceCommit});
  requireUnmovedMain(git,sourceCommit);
  const historyPath=`data/forecast-history-v2/${entry.historyFile}`;
  const records=parseStatus(git(['status','--porcelain=v1','-z','--untracked-files=all']));
  const paths=validateGeneratedChanges(records,historyPath);
  if(!paths.includes(INDEX_PATH)||!paths.includes(historyPath))fail('OFFICIAL_REQUIRED_GENERATED_FILE_MISSING');
  // The public cache is ignored by the original repo; add only this validated file explicitly.
  git(['add','--force','--',...paths,'dist/data/forecast-cache.json']);
  validateGeneratedChanges(parseStatus(git(['status','--porcelain=v1','-z','--untracked-files=all'])),historyPath);
  requireUnmovedMain(git,sourceCommit);
  git(['-c','user.name=github-actions[bot]','-c','user.email=41898282+github-actions[bot]@users.noreply.github.com','commit','-m',`data: Official Daily ${entry.forecastDate} ${entry.forecastId.slice(0,12)}`]);
  // A later main movement is rejected by the normal fast-forward push. Never force.
  git(['push','origin','HEAD:refs/heads/main']);
  console.log(JSON.stringify({status:'OFFICIAL_DAILY_PUSHED',commit:git(['rev-parse','HEAD']).trim(),forecastId:entry.forecastId}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(/^[A-Z0-9_]+$/.test(error.message)?error.message:'OFFICIAL_COMMIT_FAILED');process.exitCode=1;});
