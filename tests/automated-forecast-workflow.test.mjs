import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { validateGeneratedChanges, validateIndexAppend, requireUnmovedMain, parseStatus, verifyGenerated } from '../scripts/intelligence-v2/commit-official-daily.mjs';
import { runOfficialDaily, atomicJson, INDEX_PATH } from '../scripts/intelligence-v2/official-daily.mjs';
import { fixture, fakeOptions } from './fixtures/qwen-fixture.mjs';
import { dailyDeliveryReady } from '../scripts/intelligence-v2/pages-delivery-ready.mjs';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const historyPath='data/forecast-history-v2/2026-09-28T11-20-00.000Z-abcdef123456.json';
test('commit whitelist admits new daily files and rejects all code, old history and outcome mutations',()=>{
  assert.deepEqual(validateGeneratedChanges([{status:'??',path:historyPath},{status:' M',path:INDEX_PATH}],historyPath),[historyPath,INDEX_PATH]);
  for(const path of ['dist/index.html','dist/styles.css','package.json','tests/example.test.mjs','.github/workflows/update-and-deploy.yml','scripts/intelligence-v2/provider.mjs','data/forecast-history-v2/old.outcome.json','unexpected.txt']) {
    assert.throws(()=>validateGeneratedChanges([{status:' M',path}],historyPath),/OFFICIAL_PATH_NOT_ALLOWED/);
  }
  assert.throws(()=>validateGeneratedChanges([{status:' M',path:historyPath}],historyPath),/OFFICIAL_HISTORY_IS_IMMUTABLE/);
  assert.throws(()=>validateGeneratedChanges([{status:' D',path:INDEX_PATH}],historyPath),/OFFICIAL_CHANGE_NOT_ALLOWED/);
  assert.deepEqual(parseStatus(' M CURRENT_EVIDENCE_V2.json\0?? '+historyPath+'\0'),[{status:' M',path:'CURRENT_EVIDENCE_V2.json'},{status:'??',path:historyPath}]);
  assert.throws(()=>parseStatus('R  old.json\0new.json\0'),/OFFICIAL_CHANGE_NOT_ALLOWED/);
});
test('index accepts exactly one append, preserves earlier official and legacy role assignments',()=>{
  const before={schemaVersion:1,entries:[{forecastId:'old'}],legacyHistory:[{role:'ROLE_UNCONFIRMED'}]}, after=structuredClone(before);
  const sourceCommit='d'.repeat(40), now=new Date('2026-09-28T11:20:00Z');
  after.entries.push({forecastDate:'2026-09-28',sourceCommit});
  assert.equal(validateIndexAppend(before,after,{sourceCommit,now}).forecastDate,'2026-09-28');
  for(const modify of [v=>v.entries[0].forecastId='changed',v=>v.entries.push({}),v=>v.legacyHistory[0].role='OFFICIAL_DAILY',v=>v.entries[1].forecastDate='2026-09-27']) {
    const bad=structuredClone(after);modify(bad);assert.throws(()=>validateIndexAppend(before,bad,{sourceCommit,now}),/OFFICIAL_INDEX_NOT_APPEND_ONLY|OFFICIAL_DAILY_IDENTITY_MISMATCH/);
  }
});
test('main movement triggers ff-only pull and fails closed; unchanged main is accepted',()=>{
  const source='a'.repeat(40), commands=[];
  const git=args=>{commands.push(args);if(args[0]==='rev-parse')return args[1]==='HEAD'?source:'b'.repeat(40);if(args[0]==='pull')throw new Error('dirty or diverged');return '';};
  assert.throws(()=>requireUnmovedMain(git,source),/OFFICIAL_MAIN_MOVED_RETRY_NEXT_RUN/);
  assert.deepEqual(commands.at(-1),['pull','--ff-only','origin','main']);assert.equal(commands.some(c=>c.some(a=>a==='--force'||a==='-f')),false);
  requireUnmovedMain(args=>args[0]==='rev-parse'?source:'',source);
  assert.throws(()=>requireUnmovedMain(args=>args[0]==='rev-parse'?'c'.repeat(40):'',source),/OFFICIAL_CHECKOUT_CHANGED/);
});
test('real local Git push rejects concurrent movement without overwriting main',async t=>{
  const root=await mkdtemp(join(tmpdir(),'official-git-test-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const remote=join(root,'remote.git'), first=join(root,'first'), second=join(root,'second');
  const git=(cwd,args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']});
  git(root,['init','--bare',remote]);git(root,['clone',remote,first]);
  for(const cwd of [first]){git(cwd,['config','user.name','Test']);git(cwd,['config','user.email','test@example.com']);}
  git(first,['checkout','-b','main']);await writeFile(join(first,'baseline.txt'),'baseline');git(first,['add','.']);git(first,['commit','-m','baseline']);git(first,['push','origin','main']);
  git(root,['clone','--branch','main',remote,second]);git(second,['config','user.name','Test']);git(second,['config','user.email','test@example.com']);
  await writeFile(join(first,'forecast.txt'),'forecast');git(first,['add','.']);git(first,['commit','-m','forecast']);
  await writeFile(join(second,'source.txt'),'new source');git(second,['add','.']);git(second,['commit','-m','source']);git(second,['push','origin','main']);
  const accepted=git(second,['rev-parse','HEAD']).trim();assert.throws(()=>git(first,['push','origin','HEAD:refs/heads/main']));
  assert.equal(git(root,['--git-dir',remote,'rev-parse','main']).trim(),accepted);
});
test('scheduled workflow has fresh collection, fixed budgets, no secret in dry run and controlled write permission',async()=>{
  const workflow=await read('.github/workflows/intelligence-v2-official-daily.yml');
  assert.match(workflow,/cron: '5 0 \* \* \*'/);assert.match(workflow,/group: intelligence-v2-official-daily/);assert.match(workflow,/cancel-in-progress: false/);
  assert.match(workflow,/node-version: '22'/);assert.match(workflow,/default: DRY_RUN/);assert.match(workflow,/contents: write/);
  const dry=workflow.split('  dry-run:')[1].split('  official-daily:')[0];assert.doesNotMatch(dry,/secrets\.|DASHSCOPE|collect|commit|push|deploy/);
  const names=['Full regression before collection','Unique Official Daily preflight','Activation and secret presence only','Start this run fresh evidence collection','Independently collect and gate current public evidence','Evidence Gate before any model request','Qwen structured inference','Full regression on generated data','Public scan before publication','Whitelist, latest main check'];
  let previous=0;for(const name of names){const at=workflow.indexOf(name);assert.ok(at>previous,name);previous=at;}
  assert.match(workflow,/ref: main/);assert.match(workflow,/persist-credentials: false/);
  assert.doesNotMatch(workflow,/permissions:\s*\n\s*(?:actions|issues|packages|pull-requests): write|PAT|codex exec|download-artifact|--force|--force-with-lease/);
  assert.equal((workflow.match(/secrets\.DASHSCOPE_API_KEY/g)??[]).length,2);
  const evidence=await read('.github/workflows/intelligence-v2-evidence.yml');
  assert.match(evidence,/30 18,23,5,10 \* \* \*/);assert.doesNotMatch(evidence,/secrets\.|DASHSCOPE|run:.*(?:commit|push|deploy|official)/);
});
test('scheduled generate without activation or key stops before network and leaves repo files untouched',()=>{
  assert.throws(()=>execFileSync(process.execPath,['scripts/intelligence-v2/official-daily.mjs','generate'],{cwd:new URL('../',import.meta.url),env:{...process.env,DASHSCOPE_API_KEY:'',QWEN_API_ACTIVATION_AUTHORIZED:'0',GITHUB_ACTIONS:'true',GITHUB_REF:'refs/heads/main',GITHUB_REPOSITORY:'Zhyquan/ayu-fuel-lab'},stdio:['ignore','pipe','pipe']}),e=>e.stderr.toString().trim()==='QWEN_API_ACTIVATION_NEEDS_USER_AUTHORIZATION');
});
test('generated commit verifier rejects a mock audit and accepts only consistent gated production metadata',async t=>{
  const root=await mkdtemp(join(tmpdir(),'official-verify-test-'));t.after(()=>rm(root,{recursive:true,force:true}));
  for(const d of ['data/forecast-history-v2','intelligence-v2','dist/data'])await mkdir(join(root,d),{recursive:true});
  const before={schemaVersion:1,entries:[],legacyHistory:[]};await atomicJson(join(root,INDEX_PATH),before);
  const f=fixture(), sourceCommit='d'.repeat(40);
  await atomicJson(join(root,'CURRENT_EVIDENCE_V2.json'),f.pack);await atomicJson(join(root,'intelligence-v2/current-evidence.json'),f.pack);
  await atomicJson(join(root,'intelligence-v2/pending-intelligence-pack.json'),{evidencePack:f.pack,evidenceGate:{gate:'PASS'}});
  await atomicJson(join(root,'intelligence-v2/EVIDENCE_GATE_RESULT.json'),{gate:'PASS'});
  await runOfficialDaily({root,pack:f.pack,sourceCommit,clock:()=>f.now,providerOptions:fakeOptions(f.pack)});
  await assert.rejects(verifyGenerated(root,before,{sourceCommit,now:f.now}),/OFFICIAL_PROVIDER_AUDIT_INVALID/);
  const path=join(root,'intelligence-v2/provider-run.json'), audit=JSON.parse(await readFile(path,'utf8'));audit.mock=false;await atomicJson(path,audit);
  assert.equal((await verifyGenerated(root,before,{sourceCommit,now:f.now})).forecastDate,'2026-09-28');
  await atomicJson(join(root,'dist/data/forecast-cache.json'),{status:'UNAVAILABLE'});
  await assert.rejects(verifyGenerated(root,before,{sourceCommit,now:f.now}),/OFFICIAL_CACHE_HISTORY_MISMATCH/);
});
test('commit helper does not persist credentials or force push and has no wildcard staging',async()=>{
  const code=await read('scripts/intelligence-v2/commit-official-daily.mjs');
  assert.match(code,/GIT_CONFIG_VALUE_0/);assert.match(code,/HEAD:refs\/heads\/main/);
  assert.doesNotMatch(code,/push[^\n]*(?:--force|-f['"])|git\(\['add','\.'|git\(\['add','-A'/);
  assert.match(code,/OFFICIAL_PATH_NOT_ALLOWED/);
});
test('Pages workflow_run trusts only main success, consumes no workflow artifacts and preserves price gates',async()=>{
  const workflow=await read('.github/workflows/update-and-deploy.yml');
  assert.match(workflow,/workflow_run:\s*\n\s*workflows: \[Intelligence V2 official daily forecast\]/);
  assert.match(workflow,/branches: \[main\]\s*\n\s*types: \[completed\]/);
  assert.match(workflow,/workflow_run\.conclusion == 'success'/);assert.match(workflow,/head_repository\.full_name == 'Zhyquan\/ayu-fuel-lab'/);
  assert.match(workflow,/needs\.daily-delivery\.outputs\.ready == 'true'/);
  assert.match(workflow,/Recheck daily identity after build checkout/);
  assert.match(workflow,/run: npm run update/);assert.match(workflow,/run: npm run gate/);assert.match(workflow,/actions\/deploy-pages@/);
  assert.doesNotMatch(workflow,/download-artifact|secrets\.DASHSCOPE|intelligence:v2:official -- generate/);
});
test('Pages delivery accepts only this fresh Official Daily commit; dry, repeats, drift and expiry cannot deploy',async t=>{
  const root=await mkdtemp(join(tmpdir(),'official-delivery-test-'));t.after(()=>rm(root,{recursive:true,force:true}));
  for(const d of ['data/forecast-history-v2','intelligence-v2','dist/data'])await mkdir(join(root,d),{recursive:true});
  await atomicJson(join(root,INDEX_PATH),{schemaVersion:1,entries:[],legacyHistory:[]});
  const f=fixture(), sourceCommit='d'.repeat(40);
  for(const p of ['CURRENT_EVIDENCE_V2.json','intelligence-v2/current-evidence.json'])await atomicJson(join(root,p),f.pack);
  await atomicJson(join(root,'intelligence-v2/pending-intelligence-pack.json'),{evidencePack:f.pack,evidenceGate:{gate:'PASS'}});
  await atomicJson(join(root,'intelligence-v2/EVIDENCE_GATE_RESULT.json'),{gate:'PASS'});
  const {entry}=await runOfficialDaily({root,pack:f.pack,sourceCommit,clock:()=>f.now,providerOptions:fakeOptions(f.pack)});
  const auditPath=join(root,'intelligence-v2/provider-run.json'), audit=JSON.parse(await readFile(auditPath,'utf8'));audit.mock=false;await atomicJson(auditPath,audit);
  const input={root,triggerHeadSha:sourceCommit,runCreatedAt:'2026-09-28T11:19:00Z',commitSubject:`data: Official Daily ${entry.forecastDate} ${entry.forecastId.slice(0,12)}`,now:f.now};
  assert.equal((await dailyDeliveryReady(input)).ready,true);
  for(const extra of [{triggerHeadSha:'c'.repeat(40)},{runCreatedAt:'2026-09-28T11:22:00Z'},{commitSubject:'source update'},{now:new Date('2026-09-29T11:20:00Z')}])assert.equal((await dailyDeliveryReady({...input,...extra})).ready,false);
});
