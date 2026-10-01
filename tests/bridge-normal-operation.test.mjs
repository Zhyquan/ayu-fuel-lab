import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadReplayFixture } from '../scripts/intelligence-v2/replay.mjs';
import { externalPackage, externalScenario } from './fixtures/external-signal-scenario.mjs';
import { bridgeSummary } from '../scripts/intelligence-v2/manual-bridge.mjs';
import { currentHash } from '../scripts/intelligence-v2/current-publication.mjs';

const fixture=await loadReplayFixture();
const workflow=await readFile(new URL('../.github/workflows/manual-intelligence-bridge.yml',import.meta.url),'utf8');

test('operational default retains free option, trusted main guard and serial writer; no temporary switch',()=>{
  assert.match(workflow,/options: \[REFRESH_CURRENT, VERIFY_ONLY\]\n        default: REFRESH_CURRENT/);
  assert.match(workflow,/default: CHATGPT_SIGNAL_PACKAGE/);
  assert.match(workflow,/验证通过后重新计算并更新当前预测（会调用一次 Qwen）/);
  assert.match(workflow,/仅免费验证情报，不调用模型/);
  assert.doesNotMatch(workflow,/BRIDGE_REFRESH_(?:ACTIVATED|NOT_AUTHORIZED)/);
  assert.match(workflow,/group: ayu-fuel-manual-bridge\n  cancel-in-progress: false/);
  const refresh=workflow.split('- name: 验证情报并更新 Current')[1].split('- name: 受控提交 Current')[0];
  assert.match(refresh,/inputs.mode == 'REFRESH_CURRENT' && vars.QWEN_API_ACTIVATED == 'true' && github.ref == 'refs\/heads\/main' && github.repository == 'Zhyquan\/ayu-fuel-lab'/);
  const free=workflow.split('- name: 免费验证新闻')[1].split('- name: 刷新条件')[0];
  assert.doesNotMatch(free,/secrets\.|DASHSCOPE|GITHUB_TOKEN/);
});

test('production CLI defaults to refresh with only the global activation and trusted context',()=>{
  const trusted={QWEN_API_ACTIVATED:'true',GITHUB_ACTIONS:'true',GITHUB_REF:'refs/heads/main',GITHUB_REPOSITORY:'Zhyquan/ayu-fuel-lab',BRIDGE_SIGNAL_PACKAGE:'{bad'};
  const run=env=>{
    const child=spawnSync(process.execPath,['scripts/intelligence-v2/manual-bridge-cli.mjs'],{env,encoding:'utf8'});
    assert.equal(child.status,0,child.stderr);
    const value=JSON.parse(child.stdout);assert.equal(value.actualExternalRequestCount,0);assert.equal(value.qwenCalled,false);
    return value;
  };
  const admitted=run(trusted);assert.equal(admitted.mode,'REFRESH_CURRENT');assert.equal(admitted.failureCode,'EXTERNAL_JSON_INVALID');
  for(const change of [{QWEN_API_ACTIVATED:'false'},{QWEN_API_ACTIVATED:''},{GITHUB_ACTIONS:'false'},{GITHUB_REF:'refs/heads/feature/test'},{GITHUB_REPOSITORY:'Other/repo'}])
    assert.equal(run({...trusted,...change}).failureCode,'QWEN_API_NOT_ACTIVATED');
  assert.equal(run({...trusted,BRIDGE_MODE:'VERIFY_ONLY',QWEN_API_ACTIVATED:'false'}).failureCode,'EXTERNAL_JSON_INVALID');
});

for(const [label,mutate,code] of [
  ['invalid JSON',()=>'{bad','EXTERNAL_JSON_INVALID'],
  ['schema',p=>{p.schemaVersion='INVALID';},'EXTERNAL_SCHEMA_INVALID'],
  ['stale signal',p=>{p.signals[0].publishedAt='2026-09-20T05:00:00Z';},'EXTERNAL_SIGNAL_STALE'],
  ['source mismatch',p=>{p.signals[0].sourceUrl='https://example.com/news';},'EXTERNAL_SOURCE_URL_MISMATCH'],
  ['duplicate event',p=>{p.signals.push({...p.signals[0]});},'EXTERNAL_DUPLICATE_EVENT'],
])test(`refresh free preflight rejects ${label} with zero requests`,async()=>{
  const p=externalPackage(fixture.now),replacement=mutate(p),s=externalScenario(fixture,{packageValue:p});
  const result=await s.run({mode:'REFRESH_CURRENT',...(replacement?{signalPackage:replacement}:{})});
  assert.equal(result.failureCode,code);assert.equal(result.actualExternalRequestCount,0);assert.equal(result.currentForecastUpdated,false);
  assert.deepEqual(s.counts,{article:0,model:0,collect:0});
});

test('previous event dedup rejects before fresh core collection or Qwen',async()=>{
  const p=externalPackage(fixture.now),s=externalScenario(fixture,{packageValue:p});
  const result=await s.run({mode:'REFRESH_CURRENT',currentCache:{evidencePack:{externalAnalystSignals:p.signals}}});
  assert.equal(result.failureCode,'BRIDGE_DUPLICATE_ONLY');assert.equal(result.duplicateEvents,1);
  assert.equal(result.actualExternalRequestCount,0);assert.deepEqual(s.counts,{article:0,model:0,collect:0});
});

test('core invalid refresh rejects with zero model requests; VERIFY_ONLY always stays free',async()=>{
  const pack=structuredClone(fixture.pack);pack.signals=pack.signals.filter(s=>s.id!=='market-diesel');
  const failed=externalScenario(fixture,{pack}),result=await failed.run({mode:'REFRESH_CURRENT'});
  assert.equal(result.failureCode,'CORE_EVIDENCE_GATE_FAILED');assert.equal(result.actualExternalRequestCount,0);assert.equal(failed.counts.model,0);
  const free=externalScenario(fixture),checked=await free.run({mode:'VERIFY_ONLY',activationAuthorized:false});
  assert.equal(checked.status,'READY_FOR_REFORECAST');assert.equal(checked.actualExternalRequestCount,0);assert.equal(free.counts.model,0);
  assert.equal(checked.currentForecastUpdated,false);
});

test('one-step refresh validates, collects core, calls once and audits the selected external card',async()=>{
  const p=externalPackage(fixture.now);p.signals.push({...p.signals[0],eventKey:'synthetic-new-event'});
  const s=externalScenario(fixture,{packageValue:p});
  const result=await s.run({mode:'REFRESH_CURRENT',currentCache:{evidencePack:{externalAnalystSignals:[p.signals[0]]}}});
  assert.equal(result.status,'CURRENT_READY',result.failureCode);assert.equal(s.collectionOptions.coreOnly,true);
  assert.equal(result.signalCount,2);assert.equal(result.externalSignalsAdmitted,1);assert.equal(result.externalSignalsUsedInReasons,1);
  assert.equal(result.actualExternalRequestCount,1);assert.equal(s.counts.model,1);assert.equal(result.publicCard,true);
  assert.equal(result.forecastId,currentHash(result.snapshot));assert.ok(result.publicCards>=1);
  const summary=bridgeSummary(result);
  for(const label of ['External signals received','External signals admitted','Fresh Core Evidence','Qwen called','actualExternalRequestCount','Core Forecast Gate','External Signals Used In Reasons','Public Cards','Current Forecast Updated','Forecast ID','Failure Code'])
    assert.ok(summary.includes(label),label);
  assert.doesNotMatch(summary,/Authorization|Bearer|DASHSCOPE|messages|choices|合成测试材料/);
});

test('normal refresh and a failed successor preserve all Official files and Last Known Good',async t=>{
  const root=await mkdtemp(join(tmpdir(),'ayu-bridge-operation-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const paths=['data/forecast-history-v2/official-daily-index.json','data/forecast-history-v2/official.json','.work/official-daily-reservation.json','CURRENT_FORECAST_CANDIDATE_V2.json'];
  for(const directory of ['data/forecast-history-v2','.work','dist/data'])await mkdir(join(root,directory),{recursive:true});
  for(const path of paths)await writeFile(join(root,path),`FROZEN ${path}`);
  const cachePath=join(root,'dist/data/forecast-cache.json');await writeFile(cachePath,'OLD_GOOD');
  const good=await externalScenario(fixture,{mutateOutput:v=>{v.probabilities={DOWN:21,FLAT:16,UP:63};}}).run({mode:'REFRESH_CURRENT',persist:true,cachePath});
  assert.deepEqual(good.snapshot.probabilities,{DOWN:21,FLAT:16,UP:63});
  assert.equal(good.currentForecastUpdated,true);
  const nextPackage=externalPackage(fixture.now);nextPackage.signals[0].eventKey='synthetic-next-integer-event';
  const next=await externalScenario(fixture,{packageValue:nextPackage,mutateOutput:v=>{v.probabilities={DOWN:21,FLAT:17,UP:62};}}).run({mode:'REFRESH_CURRENT',persist:true,cachePath,currentCache:good.snapshot});
  assert.equal(next.currentForecastUpdated,true);assert.deepEqual(next.snapshot.probabilities,{DOWN:21,FLAT:17,UP:62});
  const accepted=await readFile(cachePath);
  const failed=await externalScenario(fixture,{mutateOutput:v=>{v.probabilities.UP=45;}}).run({mode:'REFRESH_CURRENT',persist:true,cachePath});
  assert.equal(failed.status,'REJECTED');assert.equal(failed.qwenCalled,true);assert.equal(failed.actualExternalRequestCount,1);
  assert.equal(failed.currentForecastUpdated,false);assert.deepEqual(await readFile(cachePath),accepted);
  for(const path of paths)assert.equal(await readFile(join(root,path),'utf8'),`FROZEN ${path}`);
});
