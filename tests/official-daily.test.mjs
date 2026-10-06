import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, readdir, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { atomicJson, runOfficialDaily, officialPreflight, readOfficialIndex, INDEX_PATH, hashFor } from '../scripts/intelligence-v2/official-daily.mjs';
import { saveForecastSnapshot } from '../scripts/intelligence-v2/history.mjs';
import { validateForecastCache } from '../dist/data/intelligence-v2-contract.js';
import { fixture, analysis, response, fakeOptions, testTime } from './fixtures/qwen-fixture.mjs';

const legacyIndex=JSON.parse(await readFile(new URL('../data/forecast-history-v2/official-daily-index.json',import.meta.url),'utf8'));
async function workspace(t) {
  const root=await mkdtemp(join(tmpdir(),'qwen-official-test-'));t.after(()=>rm(root,{recursive:true,force:true}));
  for(const d of ['data/forecast-history-v2','intelligence-v2','dist/data'])await mkdir(join(root,d),{recursive:true});
  await atomicJson(join(root,INDEX_PATH),{...legacyIndex,entries:[]});
  for(const item of legacyIndex.legacyHistory)await copyFile(new URL(`../data/forecast-history-v2/${item.historyFile}`,import.meta.url),join(root,'data/forecast-history-v2',item.historyFile));
  await writeFile(join(root,'dist/data/forecast-cache.json'),'OLD_CACHE');
  return root;
}
const run=(root,f,options={})=>runOfficialDaily({root,pack:f.pack,sourceCommit:'d'.repeat(40),clock:()=>f.now,providerOptions:fakeOptions(f.pack,options)});
const json=async path=>JSON.parse(await readFile(path,'utf8'));

test('Official Daily saves immutable pack/hash/model/time; same-day repeat makes zero calls',async t=>{
  const root=await workspace(t), f=fixture();let calls=0;
  const legacyBytes=await Promise.all(legacyIndex.legacyHistory.map(e=>readFile(join(root,'data/forecast-history-v2',e.historyFile),'utf8')));
  const first=await run(root,f,{fetchImpl:async()=>{calls++;return response(analysis(f.pack));}});
  assert.equal(first.published,true);assert.equal(first.entry.forecastDate,'2026-09-28');assert.equal(first.entry.role,'OFFICIAL_DAILY');
  const snapshot=await json(join(root,'data/forecast-history-v2',first.entry.historyFile));
  assert.deepEqual(snapshot.evidencePack,f.pack);assert.equal(hashFor(snapshot),first.entry.forecastHash);assert.equal(first.entry.forecastId,first.entry.forecastHash);
  assert.equal(first.entry.model,'qwen3.8-flash');assert.equal(first.entry.provider,'QWEN');
  assert.deepEqual(await json(join(root,'dist/data/forecast-cache.json')),snapshot);
  const audit=await json(join(root,'intelligence-v2/provider-run.json'));assert.equal(audit.status,'OK');assert.equal(audit.mock,true);
  const second=await run(root,f,{fetchImpl:async()=>{calls++;throw new Error('must not call');}});
  assert.equal(second.status,'OFFICIAL_DAILY_ALREADY_EXISTS');assert.equal(calls,1);assert.equal((await readOfficialIndex(root)).entries.length,1);
  const next=fixture('2026-09-29T11:20:00Z');
  await run(root,next,{clock:()=>next.now});assert.equal((await readOfficialIndex(root)).entries.length,2);
  for(let i=0;i<legacyBytes.length;i++)assert.equal(await readFile(join(root,'data/forecast-history-v2',legacyIndex.legacyHistory[i].historyFile),'utf8'),legacyBytes[i]);
  assert.equal(legacyIndex.legacyHistory.every(e=>e.role==='ROLE_UNCONFIRMED'),true);
  assert.equal((await officialPreflight(root,next.now)).eligible,false);
  const {evidencePack,...candidate}=snapshot;
  await assert.rejects(saveForecastSnapshot(join(root,'data/forecast-history-v2'),candidate,evidencePack,{now:f.now}),{code:'EEXIST'});
  assert.equal(validateForecastCache(snapshot,{now:new Date(candidate.validUntil)}).status,'STALE');
});
test('concurrent generators are locked before model use',async t=>{
  const root=await workspace(t), f=fixture();let release, started;
  const begin=new Promise(r=>started=r), hold=new Promise(r=>release=r);let calls=0;
  const pending=run(root,f,{fetchImpl:async()=>{calls++;started();await hold;return response(analysis(f.pack));}});
  await begin;
  await assert.rejects(run(root,f),/OFFICIAL_DAILY_RUN_BUSY/);
  release();await pending;assert.equal(calls,1);assert.equal((await readOfficialIndex(root)).entries.length,1);
});
for(const mode of ['evidence','missing-key','transport','schema','public-copy'])test(`failed ${mode} preserves old cache and history; no manual fallback`,async t=>{
  const root=await workspace(t), f=fixture();let calls=0;
  const options={fetchImpl:async()=>{calls++;if(mode==='transport')throw new Error('timeout');const value=analysis(f.pack);if(mode==='schema')value.freeText='invented';if(mode==='public-copy')value.upReasonEvidenceIds=['market-wti','eia-stocks'];return response(value);}};
  if(mode==='evidence')f.pack.signals=[];
  if(mode==='missing-key')options.environment={};
  await assert.rejects(run(root,f,options),/EVIDENCE_GATE_FAILED|DASHSCOPE_API_KEY_REQUIRED|QWEN_TRANSPORT_FAILED|QWEN_SCHEMA_INVALID|FORECAST_GATE_FAILED/);
  assert.equal(await readFile(join(root,'dist/data/forecast-cache.json'),'utf8'),'OLD_CACHE');
  assert.equal((await readOfficialIndex(root)).entries.length,0);
  assert.equal((await readdir(join(root,'data/forecast-history-v2'))).filter(n=>n!== 'official-daily-index.json').length,2);
  assert.equal(calls,mode==='evidence'||mode==='missing-key'?0:mode==='transport'?3:1);
  if(calls){const audit=await json(join(root,'intelligence-v2/provider-run.json'));assert.equal(audit.attemptCount,calls);}
});
test('cache replacement is atomic: failed rename leaves old bytes and cleans temporary file',async t=>{
  const root=await workspace(t), target=join(root,'dist/data/forecast-cache.json');
  await assert.rejects(atomicJson(target,{new:true},{renameImpl:async()=>{assert.equal(await readFile(target,'utf8'),'OLD_CACHE');throw new Error('disk failure');}}),/disk failure/);
  assert.equal(await readFile(target,'utf8'),'OLD_CACHE');assert.deepEqual(await readdir(join(root,'dist/data')),['forecast-cache.json']);
  await atomicJson(target,{new:true});assert.deepEqual(await json(target),{new:true});
});
test('tampered Official history is rejected before a later model request',async t=>{
  const root=await workspace(t), f=fixture(), result=await run(root,f);
  const file=join(root,'data/forecast-history-v2',result.entry.historyFile), snapshot=await json(file);
  snapshot.probabilities.UP=90;await atomicJson(file,snapshot);
  let calls=0;const next=fixture('2026-09-29T11:20:00Z');
  await assert.rejects(run(root,next,{fetchImpl:async()=>{calls++;}}),/OFFICIAL_HISTORY_INTEGRITY_FAILED/);assert.equal(calls,0);
});
test('China date rollover during generation cannot enter the wrong daily sample',async t=>{
  const root=await workspace(t), f=fixture('2026-09-28T15:59:00Z');let complete=false;
  await assert.rejects(runOfficialDaily({root,pack:f.pack,sourceCommit:'d'.repeat(40),clock:()=>new Date(complete?'2026-09-28T16:01:00Z':'2026-09-28T15:59:00Z'),providerOptions:fakeOptions(f.pack,{fetchImpl:async()=>{complete=true;return response(analysis(f.pack));}})}),/OFFICIAL_DAILY_DATE_CHANGED/);
  assert.equal((await readOfficialIndex(root)).entries.length,0);assert.equal(await readFile(join(root,'dist/data/forecast-cache.json'),'utf8'),'OLD_CACHE');
});
