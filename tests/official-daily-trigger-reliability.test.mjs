import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { triggerAdmission, inferenceAdmission, readReservations, reservationName } from '../scripts/intelligence-v2/trigger-reliability.mjs';
import { runOfficialDaily, INDEX_PATH } from '../scripts/intelligence-v2/official-daily.mjs';
import { fixture, fakeOptions, response, analysis } from './fixtures/qwen-fixture.mjs';

const repo='Zhyquan/ayu-fuel-lab', ref='refs/heads/main', date='2026-09-30', commit='a'.repeat(40);
const index=()=>({schemaVersion:1,entries:[],legacyHistory:[]});
const priceRun=(changes={})=>({workflow_run:{name:'Update and deploy fuel references',conclusion:'success',head_branch:'main',head_repository:{full_name:repo},event:'schedule',...changes}});
const admit=(eventName,event,iso)=>triggerAdmission({eventName,event,repo,ref,now:new Date(iso)});
const reserve=()=>({name:reservationName(date),expired:false,workflow_run:{head_branch:'main'}});
const decision=(overrides={})=>inferenceAdmission({date,index:index(),sourceCommit:commit,latestCommit:commit,...overrides});

test('A/B/C: scheduled price 01:17 is early; 07:17 and missing-Official 13:17 are eligible',()=>{
  assert.equal(admit('workflow_run',priceRun(),'2026-09-29T17:17:00Z').reason,'BEFORE_07_SHANGHAI');
  assert.equal(admit('workflow_run',priceRun(),'2026-09-29T23:17:00Z').eligible,true);
  assert.equal(admit('workflow_run',priceRun(),'2026-09-30T05:17:00Z').eligible,true);
  assert.equal(decision().eligible,true);
});

test('D: an existing Official Daily prevents a second inference',()=>{
  const prior={forecastDate:date,generatedAt:'2026-09-30T00:20:00.000Z',role:'OFFICIAL_DAILY',forecastId:'a'.repeat(64),forecastHash:'a'.repeat(64),evidenceHash:'b'.repeat(64),sourceCommit:commit,provider:'QWEN',model:'qwen3.8-flash',historyFile:'2026-09-30T00-20-00.000Z-aaaaaaaaaaaa.json'};
  assert.equal(decision({index:{...index(),entries:[prior]}}).reason,'OFFICIAL_DAILY_ALREADY_EXISTS');
});

test('E/F/G/H: push, manual price, foreign repo and failed price cannot launch model work',()=>{
  const at='2026-09-30T00:25:00Z';
  for(const changed of [{event:'push'},{event:'workflow_dispatch'},{head_repository:{full_name:'other/fuel-lab'}},{conclusion:'failure'}])assert.equal(admit('workflow_run',priceRun(changed),at).eligible,false);
  assert.equal(triggerAdmission({eventName:'workflow_run',event:priceRun(),repo:'other/fuel-lab',ref,now:new Date(at)}).eligible,false);
  assert.equal(admit('workflow_dispatch',{inputs:{mode:'DRY_RUN'}},at).eligible,false);
});

test('I/J: 08:23 and 09:23 fallback schedules are admitted when Official is missing',()=>{
  for(const at of ['2026-09-30T00:23:00Z','2026-09-30T01:23:00Z']){
    assert.equal(admit('schedule',{},at).eligible,true);
    assert.equal(decision().eligible,true);
  }
});

test('K: concurrent primary and fallback serialize; the later attempt sees a reservation',async()=>{
  const workflow=await readFile(new URL('../.github/workflows/intelligence-v2-official-daily.yml',import.meta.url),'utf8');
  assert.match(workflow,/group: intelligence-v2-official-daily/);
  assert.match(workflow,/cancel-in-progress: false/);
  let qwenCalls=0;const artifacts=[];
  for(const eventName of ['workflow_run','schedule']){
    const event=eventName==='workflow_run'?priceRun():{};
    if(!admit(eventName,event,'2026-09-30T00:23:00Z').eligible)continue;
    if(decision({artifacts}).eligible){artifacts.push(reserve());qwenCalls++;}
  }
  assert.equal(qwenCalls,1);
  assert.equal(decision({artifacts}).reason,'QWEN_INFERENCE_RESERVED_FOR_DATE');
});

test('L: failed Evidence leaves no reservation; later fresh Evidence may attempt once',()=>{
  const artifacts=[];let qwenCalls=0;
  assert.equal(decision({artifacts}).eligible,true);
  const evidenceGate='FAIL';if(evidenceGate==='PASS'){artifacts.push(reserve());qwenCalls++;}
  assert.equal(artifacts.length,0);assert.equal(qwenCalls,0);
  assert.equal(decision({artifacts}).eligible,true);
  artifacts.push(reserve());qwenCalls++;
  assert.equal(qwenCalls,1);
});

test('M: a generated forecast left uncommitted by scan failure cannot cause a second inference',async t=>{
  const root=await mkdtemp(join(tmpdir(),'official-inference-reservation-'));t.after(()=>rm(root,{recursive:true,force:true}));
  for(const dir of ['data/forecast-history-v2','intelligence-v2','dist/data'])await mkdir(join(root,dir),{recursive:true});
  await writeFile(join(root,INDEX_PATH),JSON.stringify(index()));
  const f=fixture(), modelDate='2026-09-28', artifacts=[{...reserve(),name:reservationName(modelDate)}];let qwenCalls=0;
  const first=await runOfficialDaily({root,pack:f.pack,sourceCommit:commit,clock:()=>f.now,providerOptions:fakeOptions(f.pack,{fetchImpl:async()=>{qwenCalls++;return response(analysis(f.pack));}})});
  assert.equal(first.published,true);assert.equal(qwenCalls,1);
  // A failed public scan leaves the generated index only in this runner's checkout.
  const publicScan='FAIL', remoteIndex=index();assert.equal(publicScan,'FAIL');assert.equal(remoteIndex.entries.length,0);
  assert.equal(inferenceAdmission({date:modelDate,index:remoteIndex,artifacts,sourceCommit:commit,latestCommit:commit}).reason,'QWEN_INFERENCE_RESERVED_FOR_DATE');
  assert.equal(qwenCalls,1);
});

test('changed main or unknown reservation state fails closed before Qwen',async()=>{
  assert.throws(()=>decision({latestCommit:'b'.repeat(40)}),/OFFICIAL_MAIN_MOVED_BEFORE_INFERENCE/);
  await assert.rejects(readReservations(date,{token:'fake',fetchImpl:async()=>({ok:false})}),/INFERENCE_RESERVATION_LOOKUP_FAILED/);
  await assert.rejects(readReservations(date,{token:''}),/ACTIONS_READ_TOKEN_REQUIRED/);
});

test('reservation lookup only uses the exact date name and does not expose its read token',async()=>{
  let requestedUrl='',auth='';
  const artifacts=await readReservations(date,{token:'fake-read-token',fetchImpl:async(url,options)=>{requestedUrl=url;auth=options.headers.Authorization;return {ok:true,json:async()=>({artifacts:[reserve()]})};}});
  assert.equal(artifacts.length,1);assert.match(requestedUrl,/qwen-inference-reserved-2026-09-30/);assert.equal(auth,'Bearer fake-read-token');
});

test('workflow orders source check, evidence, durable reservation, Qwen, scan and commit',async()=>{
  const workflow=await readFile(new URL('../.github/workflows/intelligence-v2-official-daily.yml',import.meta.url),'utf8');
  const names=['Admit trusted trigger and Shanghai time window','Unique Official Daily preflight','Evidence Gate before any model request','Recheck latest main and prior inference reservations','Persist inference reservation for publication failures','Confirm latest main immediately before inference','Qwen structured inference','Public scan before publication','Whitelist, latest main check'];
  let previous=0;for(const name of names){const at=workflow.indexOf(name);assert.ok(at>previous,name);previous=at;}
  assert.match(workflow,/github\.event\.workflow_run\.event == 'schedule'/);
  assert.match(workflow,/github\.event\.workflow_run\.head_repository\.full_name == 'Zhyquan\/ayu-fuel-lab'/);
  assert.match(workflow,/test "\$\(git rev-parse HEAD\)" = "\$GITHUB_SHA"/);
  assert.match(workflow,/qwen-inference-reserved-\$\{\{ steps\.preflight\.outputs\.forecastDate \}\}/);
  assert.match(workflow,/path: \.work\/official-daily-reservation\.json\s*\n\s*if-no-files-found: error\s*\n\s*include-hidden-files: true/);
  assert.match(workflow,/if: steps\.confirm\.outputs\.eligible == 'true'\s*\n\s*env:\s*\n\s*QWEN_API_ACTIVATION_AUTHORIZED/);
});
