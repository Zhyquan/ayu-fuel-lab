import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateExternalAnalystSignalPackage } from '../scripts/intelligence-v2/external-analyst-signals.mjs';
import { evidenceHashFor } from '../scripts/intelligence-v2/history.mjs';
import { DOMESTIC_BRIDGE_REQUEST_PATH, domesticBridgeRequestId, normalizeDomesticBridgeSignalPackage, prepareDomesticBridgeRequest, validateDomesticBridgeRequest } from '../scripts/intelligence-v2/domestic-bridge-intake.mjs';
import { runDomesticBridgeCli } from '../scripts/intelligence-v2/domestic-bridge-cli.mjs';

const now='2026-10-11T08:00:00.000Z';
const packageValue=()=>({schemaVersion:'AYU_EXTERNAL_ANALYST_SIGNAL_V1',generatedAt:now,signals:[{
  eventKey:'synthetic-unconfirmed-energy-ceasefire',category:'SUPPLY_DISRUPTION',source:'Reuters',eventAt:null,publishedAt:now,
  title:'合成测试：能源停火消息待核实',summary:'这是未确认消息的合成合同测试，不代表真实新闻或已发生停火。',
  sourceUrl:'https://www.reuters.com/business/energy/synthetic-energy-ceasefire/',kind:'CLAIM',direction:'DOWN',strength:'LOW',confirmation:'UNCONFIRMED',
  reason:'合成场景中的停火消息若属实可能缓解供应风险，目前尚未确认。',
}]});
const prepare=(value=packageValue(),options={})=>prepareDomesticBridgeRequest({signalPackage:value,mode:'REFRESH_CURRENT',now,...options});
const temporary=async run=>{const root=await mkdtemp(join(tmpdir(),'ayu-domestic-bridge-test-'));try{await run(root);}finally{await rm(root,{recursive:true,force:true});}};
const environment=(value=packageValue(),mode='REFRESH_CURRENT')=>({BRIDGE_MODE:mode,BRIDGE_INTAKE_TYPE:'CHATGPT_SIGNAL_PACKAGE',BRIDGE_SIGNAL_PACKAGE:JSON.stringify(value)});

test('user-form CLAIM fixture reuses production admission and retains source/date/confirmation without becoming material',()=>{
  const input=packageValue(),before=JSON.stringify(input),request=prepare(input).request;
  assert.doesNotThrow(()=>validateExternalAnalystSignalPackage(request.signalPackage,{now:new Date(now)}));
  assert.deepEqual(request.signalPackage,input);
  assert.equal(JSON.stringify(input),before);
  assert.equal(request.target,'CHINA_DOMESTIC_REFINED_OIL_ADJUSTMENT');
  assert.equal(request.environment,'Test');
  assert.equal(request.triggerKind,'EXPLICIT_BRIDGE_TEST_REFRESH');
  assert.equal(request.expiresAt,'2026-10-12T08:00:00.000Z');
  assert.equal(request.packageHash,evidenceHashFor(input));
  assert.deepEqual(validateDomesticBridgeRequest(request,{now}),request);
  assert.ok(!('evidenceId'in request.signalPackage.signals[0]));
  assert.ok(!('material'in request));
});

test('only one complete Markdown URL wrapper is stripped before the production URL validator',()=>{
  const input=packageValue(),url=input.signals[0].sourceUrl;
  input.signals[0].sourceUrl=`[Reuters](${url})`;
  assert.equal(normalizeDomesticBridgeSignalPackage(input,{now}).signals[0].sourceUrl,url);
  assert.equal(prepare(input).requestId,prepare().requestId);
  for(const invalid of [`prefix [Reuters](${url})`,`[Reuters](${url}) [other](${url})`,`[Reuters](http://example.com/a)`]) {
    input.signals[0].sourceUrl=invalid;
    assert.throws(()=>prepare(input),/EXTERNAL_URL/);
  }
});

for(const [name,mutate,code]of [
  ['invalid URL',p=>{p.signals[0].sourceUrl='http://example.com/a';},'EXTERNAL_URL_INVALID'],
  ['source mismatch',p=>{p.signals[0].source='AP';},'EXTERNAL_SOURCE_URL_MISMATCH'],
  ['UNCONFIRMED FACT',p=>{p.signals[0].kind='FACT';},'EXTERNAL_CONFIRMATION_INVALID'],
  ['UNCONFIRMED HIGH',p=>{p.signals[0].strength='HIGH';},'EXTERNAL_CONFIRMATION_INVALID'],
  ['future publication',p=>{p.signals[0].publishedAt='2026-10-11T08:00:00.001Z';},'EXTERNAL_TIME_FUTURE'],
  ['invalid timestamp',p=>{p.signals[0].publishedAt='2026-10-11';},'EXTERNAL_TIME_INVALID'],
  ['future package',p=>{p.generatedAt='2026-10-11T08:00:00.001Z';},'EXTERNAL_PACKAGE_TIME_FUTURE'],
  ['expired package',p=>{p.generatedAt='2026-10-10T08:00:00.000Z';},'EXTERNAL_PACKAGE_STALE'],
  ['stale event',p=>{p.signals[0].eventAt='2026-10-08T07:59:59.999Z';},'EXTERNAL_SIGNAL_STALE'],
  ['extra signal field',p=>{p.signals[0].material=true;},'EXTERNAL_SIGNAL_FIELDS_INVALID'],
])test(`production admission rejects ${name}`,()=>{const input=packageValue();mutate(input);assert.throws(()=>prepare(input),new RegExp(code));});

test('VERIFY_ONLY and the default mode validate for free without constructing a request; NEWS_URL cannot dispatch internationally',()=>{
  for(const mode of ['VERIFY_ONLY',undefined]) {
    const result=prepareDomesticBridgeRequest({signalPackage:packageValue(),mode,now});
    assert.equal(result.status,'VERIFIED');assert.equal(result.request,null);assert.equal(result.noQwen,true);
  }
  assert.throws(()=>prepare(packageValue(),{intakeType:'NEWS_URL'}),/DOMESTIC_BRIDGE_SIGNAL_PACKAGE_REQUIRED/);
  assert.throws(()=>prepare(packageValue(),{mode:'OTHER'}),/DOMESTIC_BRIDGE_MODE_INVALID/);
});

test('request identity ignores package generation time and signal order; retry cannot extend the original expiry',()=>{
  const first=prepare().request,renewed=packageValue();renewed.generatedAt='2026-10-11T09:00:00.000Z';
  const same=prepare(renewed,{now:renewed.generatedAt,previousRequest:first});
  assert.equal(same.deduplicated,true);assert.deepEqual(same.request,first);
  assert.equal(domesticBridgeRequestId(renewed),first.requestId);assert.notEqual(evidenceHashFor(renewed),first.packageHash);
  const later={...renewed,generatedAt:'2026-10-12T09:00:00.000Z'};
  assert.equal(prepare(later,{now:later.generatedAt,previousRequest:first}).deduplicated,true);
  const multi=packageValue();multi.signals.push({...multi.signals[0],eventKey:'synthetic-second-event'});
  assert.equal(domesticBridgeRequestId(multi),domesticBridgeRequestId({...multi,signals:[...multi.signals].reverse()}));
  const originalId=domesticBridgeRequestId(multi);multi.signals[0].reason+=' 需要独立核验。';assert.notEqual(domesticBridgeRequestId(multi),originalId);
});

for(const [name,mutate,code]of [
  ['extra request key',r=>{r.extra=true;},'DOMESTIC_BRIDGE_REQUEST_SCHEMA_INVALID'],
  ['wrong target',r=>{r.target='INTERNATIONAL_DIESEL';},'DOMESTIC_BRIDGE_REQUEST_TARGET_INVALID'],
  ['wrong environment',r=>{r.environment='Production';},'DOMESTIC_BRIDGE_REQUEST_TARGET_INVALID'],
  ['material trigger',r=>{r.triggerKind='MATERIAL_NEWS';},'DOMESTIC_BRIDGE_REQUEST_TARGET_INVALID'],
  ['wrong request ID',r=>{r.requestId='a'.repeat(64);},'DOMESTIC_BRIDGE_REQUEST_HASH_MISMATCH'],
  ['wrong package hash',r=>{r.packageHash='b'.repeat(64);},'DOMESTIC_BRIDGE_REQUEST_HASH_MISMATCH'],
  ['changed signal text',r=>{r.signalPackage.signals[0].summary='合成篡改的摘要。';},'DOMESTIC_BRIDGE_REQUEST_HASH_MISMATCH'],
  ['extended expiry',r=>{r.expiresAt='2026-10-13T08:00:00.000Z';},'DOMESTIC_BRIDGE_REQUEST_TIME_INVALID'],
  ['future request',r=>{r.requestedAt='2026-10-11T08:00:00.001Z';},'DOMESTIC_BRIDGE_REQUEST_TIME_FUTURE'],
  ['source tamper',r=>{r.signalPackage.signals[0].source='AP';},'EXTERNAL_SOURCE_URL_MISMATCH'],
  ['wrapped URL in stored request',r=>{r.signalPackage.signals[0].sourceUrl=`[Reuters](${r.signalPackage.signals[0].sourceUrl})`;},'DOMESTIC_BRIDGE_PACKAGE_NOT_CANONICAL'],
])test(`request validator rejects ${name}`,()=>{const request=prepare().request;mutate(request);assert.throws(()=>validateDomesticBridgeRequest(request,{now}),new RegExp(code));});

test('request validator rejects the exact expiry boundary and returns a separate immutable copy',()=>{
  const request=prepare().request;
  assert.throws(()=>validateDomesticBridgeRequest(request,{now:request.expiresAt}),/DOMESTIC_BRIDGE_REQUEST_EXPIRED/);
  const checked=validateDomesticBridgeRequest(request,{now});checked.signalPackage.signals[0].title='合成修改';
  assert.notEqual(checked.signalPackage.signals[0].title,request.signalPackage.signals[0].title);
});

test('CLI verify never writes an outbox; refresh scans and writes one request; duplicates preserve exact bytes',async()=>temporary(async root=>{
  const free=await runDomesticBridgeCli({root,environment:environment(packageValue(),'VERIFY_ONLY'),now});
  assert.equal(free.status,'VERIFIED');assert.equal(free.noQwen,true);
  const path=join(root,DOMESTIC_BRIDGE_REQUEST_PATH);await assert.rejects(readFile(path),{code:'ENOENT'});
  const queued=await runDomesticBridgeCli({root,environment:environment(),now});assert.equal(queued.status,'QUEUED');
  const bytes=await readFile(path,'utf8');validateDomesticBridgeRequest(JSON.parse(bytes),{now});
  const renewed=packageValue();renewed.generatedAt='2026-10-11T09:00:00.000Z';
  const duplicate=await runDomesticBridgeCli({root,environment:environment(renewed),now:renewed.generatedAt});
  assert.equal(duplicate.deduplicated,true);assert.equal(await readFile(path,'utf8'),bytes);
  assert.ok(!JSON.stringify(queued).includes('synthetic-energy-ceasefire'));
}));

test('CLI refuses unsafe public candidate bytes before replacing the last request and rejects NEWS_URL',async()=>temporary(async root=>{
  await runDomesticBridgeCli({root,environment:environment(),now});
  const path=join(root,DOMESTIC_BRIDGE_REQUEST_PATH),bytes=await readFile(path,'utf8');
  const unsafe=packageValue();unsafe.signals[0].reason=['合成测试占位：','sk','-', 'x'.repeat(24)].join('');
  const result=await runDomesticBridgeCli({root,environment:environment(unsafe),now});
  assert.equal(result.status,'REJECTED');assert.equal(result.failureCode,'DOMESTIC_BRIDGE_PUBLIC_SCAN_FAILED');assert.equal(result.noQwen,true);
  assert.equal(await readFile(path,'utf8'),bytes);
  const news=await runDomesticBridgeCli({root,environment:{...environment(),BRIDGE_INTAKE_TYPE:'NEWS_URL'},now});
  assert.equal(news.failureCode,'DOMESTIC_BRIDGE_SIGNAL_PACKAGE_REQUIRED');assert.equal(await readFile(path,'utf8'),bytes);
  await writeFile(path,'{bad');
  const invalidOutbox=await runDomesticBridgeCli({root,environment:{...environment(),BRIDGE_INTAKE_TYPE:'NEWS_URL'},now});
  assert.equal(invalidOutbox.failureCode,'DOMESTIC_BRIDGE_SIGNAL_PACKAGE_REQUIRED');assert.equal(await readFile(path,'utf8'),'{bad');
}));

test('actual CLI exits nonzero for unsupported input and records only safe failure with no model call',()=>{
  const child=spawnSync(process.execPath,[fileURLToPath(new URL('../scripts/intelligence-v2/domestic-bridge-cli.mjs',import.meta.url))],
    {encoding:'utf8',env:{BRIDGE_INTAKE_TYPE:'NEWS_URL',BRIDGE_MODE:'VERIFY_ONLY'}});
  assert.equal(child.status,1);const result=JSON.parse(child.stdout);
  assert.equal(result.status,'REJECTED');assert.equal(result.failureCode,'DOMESTIC_BRIDGE_SIGNAL_PACKAGE_REQUIRED');assert.equal(result.noQwen,true);
});
