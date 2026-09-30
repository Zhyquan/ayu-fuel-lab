import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createQwenProvider } from '../scripts/intelligence-v2/qwen-provider.mjs';
import { runOfficialDaily, atomicJson, INDEX_PATH } from '../scripts/intelligence-v2/official-daily.mjs';
import { fixture, analysis, response, fakeOptions } from './fixtures/qwen-fixture.mjs';
import { loadReplayFixture } from '../scripts/intelligence-v2/replay.mjs';
import { externalScenario } from './fixtures/external-signal-scenario.mjs';

const replay=await loadReplayFixture();
for(const status of [200,'timeout',429,500,503])test(`Bridge one-shot ${status}: caller cannot expand budget, at most one transport`,async()=>{
  const s=externalScenario(replay);let calls=0,waits=0;
  const original=s.options.providerOptions.fetchImpl;
  const result=await s.run({mode:'REFRESH_CURRENT',providerOptions:{...s.options.providerOptions,maxTransportRetries:2,maxExternalRequests:3,
    wait:async()=>{waits++;},fetchImpl:async(...args)=>{
      calls++;
      if(status==='timeout')throw new DOMException('synthetic timeout','TimeoutError');
      return status===200?original(...args):new Response('',{status});
    }}});
  assert.equal(calls,1);assert.equal(waits,0);
  assert.equal(result.providerAudit.configuredTransportRetries,0);assert.equal(result.providerAudit.maxExternalRequests,1);
  assert.equal(result.providerAudit.actualExternalRequestCount,1);assert.equal(result.providerAudit.attemptCount,1);
  assert.equal(result.providerAudit.httpStatus,status==='timeout'?null:status);
  assert.equal(result.status,status===200?'CURRENT_READY':'REJECTED');
  if(status===200)assert.equal(result.coreForecastGate,'PASS');
  else {assert.equal(result.failureCode,'QWEN_TRANSPORT_FAILED');assert.equal(result.currentForecastUpdated,false);}
  assert.doesNotMatch(JSON.stringify(result.providerAudit),/Authorization|Bearer|DASHSCOPE|messages|choices|合成测试材料/);
});

test('external request hard budget blocks the second network request independently of retry count',async()=>{
  const f=fixture();let calls=0,audit;
  const provider=createQwenProvider(fakeOptions(f.pack,{maxTransportRetries:2,maxExternalRequests:1,wait:async()=>{},
    onAudit:value=>{audit=value;},fetchImpl:async()=>{calls++;return new Response('',{status:503});}}));
  await assert.rejects(provider.generateForecast({evidencePack:f.pack,evidenceHash:f.evidenceHash,now:f.now}),/QWEN_EXTERNAL_REQUEST_BUDGET_EXCEEDED/);
  assert.equal(calls,1);assert.equal(audit.actualExternalRequestCount,1);assert.equal(audit.attemptCount,2);
  assert.equal(audit.configuredTransportRetries,2);assert.equal(audit.maxExternalRequests,1);
  assert.equal(audit.validationCode,'QWEN_EXTERNAL_REQUEST_BUDGET_EXCEEDED');
  await assert.rejects(provider.generateForecast({evidencePack:f.pack,evidenceHash:f.evidenceHash,now:f.now}),/QWEN_RUN_CALL_BUDGET_EXCEEDED/);
  assert.equal(calls,1);
});

for(const value of [-1,3,0.5,'0',null,NaN])test(`invalid provider retry configuration fails before transport: ${String(value)}`,()=>{
  assert.throws(()=>createQwenProvider({maxTransportRetries:value}),/QWEN_TRANSPORT_RETRIES_INVALID/);
});
for(const value of [0,-1,4,1.5,'1',null])test(`invalid external request limit fails before transport: ${String(value)}`,()=>{
  assert.throws(()=>createQwenProvider({maxExternalRequests:value}),/QWEN_EXTERNAL_REQUEST_LIMIT_INVALID/);
});

test('default provider still succeeds after 503 then 200, with two real-shaped mock requests',async()=>{
  const f=fixture();let calls=0;
  const provider=createQwenProvider(fakeOptions(f.pack,{wait:async()=>{},fetchImpl:async()=>++calls===1?new Response('',{status:503}):response(analysis(f.pack))}));
  await provider.generateForecast({evidencePack:f.pack,evidenceHash:f.evidenceHash,now:f.now});
  assert.equal(calls,2);assert.equal(provider.lastRun.configuredTransportRetries,2);
  assert.equal(provider.lastRun.maxExternalRequests,3);assert.equal(provider.lastRun.actualExternalRequestCount,2);assert.equal(provider.lastRun.attemptCount,2);
});

test('production Official Daily runner keeps default retry policy; only disposable mock workspace changes',async t=>{
  const root=await mkdtemp(join(tmpdir(),'ayu-one-shot-official-'));t.after(()=>rm(root,{recursive:true,force:true}));
  for(const path of ['data/forecast-history-v2','intelligence-v2','dist/data'])await mkdir(join(root,path),{recursive:true});
  const index=JSON.parse(await readFile(new URL('../data/forecast-history-v2/official-daily-index.json',import.meta.url),'utf8'));
  await atomicJson(join(root,INDEX_PATH),{...index,entries:[],legacyHistory:[]});await writeFile(join(root,'dist/data/forecast-cache.json'),'OLD_CACHE');
  const f=fixture();let calls=0;
  const result=await runOfficialDaily({root,pack:f.pack,sourceCommit:'a'.repeat(40),clock:()=>f.now,
    providerOptions:fakeOptions(f.pack,{wait:async()=>{},fetchImpl:async()=>++calls===1?new Response('',{status:503}):response(analysis(f.pack))})});
  assert.equal(result.status,'OFFICIAL_DAILY_SAVED');assert.equal(calls,2);
  assert.equal(result.providerAudit.configuredTransportRetries,2);assert.equal(result.providerAudit.maxExternalRequests,3);
  assert.equal(result.providerAudit.actualExternalRequestCount,2);assert.equal(result.providerAudit.attemptCount,2);
});
