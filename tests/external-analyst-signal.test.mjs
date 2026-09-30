import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { validateExternalAnalystSignalPackage, externalEvidenceId, mergeExternalSignals } from '../scripts/intelligence-v2/external-analyst-signals.mjs';
import { canonicalSourceUrl } from '../dist/data/external-analyst-contract.js';
import { loadReplayFixture } from '../scripts/intelligence-v2/replay.mjs';
import { externalPackage, externalScenario } from './fixtures/external-signal-scenario.mjs';
import { bridgeSummary } from '../scripts/intelligence-v2/manual-bridge.mjs';
import { collectEvidence, SOURCES } from '../scripts/intelligence-v2/collect.mjs';
import { forecastGate } from '../dist/data/intelligence-v2-contract.js';
import { analysisSchema, projectEvidence, qwenSchemaCompatibilityGate } from '../scripts/intelligence-v2/qwen-provider.mjs';
import { publicEvidenceGate } from '../dist/data/public-evidence.js';
import { publicEvidenceMarkup } from '../dist/data/public-evidence-view.js';
import { readForecast } from '../dist/data/intelligence-v2-service.js';
import { evidenceHashFor } from '../scripts/intelligence-v2/history.mjs';
import { currentPublication, verifyCurrentPublication, CURRENT_CACHE_PATH, CURRENT_ORIGIN_PATH } from '../scripts/intelligence-v2/current-publication.mjs';
import { resolveNewsUrl } from '../scripts/intelligence-v2/source-adapters.mjs';
import { bridgeHtml, bridgeUrl } from './fixtures/bridge-scenario.mjs';
const f=await loadReplayFixture(),now=new Date(f.now),setup=options=>externalScenario(f,options);
const validate=value=>validateExternalAnalystSignalPackage(value,{now});

test('valid single/multi signal JSON, including newlines removed by a browser input, admits without any article or model request',async()=>{
  for(const count of [1,3,6]) {
    const value=externalPackage(f.now);value.signals=Array.from({length:count},(_,i)=>({...value.signals[0],eventKey:`synthetic-event-${i}`}));
    const s=setup({packageValue:value}),result=await s.run({signalPackage:JSON.stringify(value,null,2).replace(/\n/g,'')});
    assert.equal(result.status,'READY_FOR_REFORECAST',result.failureCode);assert.equal(result.signalCount,count);assert.equal(result.freshSignals,count);
    assert.deepEqual(s.counts,{article:0,model:0,collect:1});assert.equal(s.collectionOptions.coreOnly,true);assert.equal(result.currentForecastUpdated,false);
    assert.ok(!('snapshot'in result));assert.equal(result.coreEvidenceGate,'PASS');
    assert.match(bridgeSummary(result),/ChatGPT Signal Package/);assert.doesNotMatch(bridgeSummary(result),/synthetic-event|柴油供应变化/);
  }
});
for(const [name,change,code]of [
  ['invalid JSON',()=>'{bad','EXTERNAL_JSON_INVALID'],
  ['wrong schema',p=>{p.schemaVersion='WRONG';},'EXTERNAL_SCHEMA_INVALID'],
  ['duplicate event',p=>{p.signals.push({...p.signals[0]});},'EXTERNAL_DUPLICATE_EVENT'],
  ['unknown category',p=>{p.signals[0].category='FAKE';},'EXTERNAL_CATEGORY_INVALID'],
  ['future publication',p=>{p.signals[0].publishedAt='2026-10-01T05:00:00Z';},'EXTERNAL_TIME_FUTURE'],
  ['stale publication',p=>{p.signals[0].publishedAt='2026-09-20T05:00:00Z';},'EXTERNAL_SIGNAL_STALE'],
  ['old event republished',p=>{p.signals[0].eventAt='2026-09-20T05:00:00Z';},'EXTERNAL_SIGNAL_STALE'],
  ['unconfirmed high',p=>{p.signals[0].confirmation='UNCONFIRMED';p.signals[0].kind='CLAIM';p.signals[0].strength='HIGH';},'EXTERNAL_CONFIRMATION_INVALID'],
  ['unconfirmed fact',p=>{p.signals[0].confirmation='UNCONFIRMED';p.signals[0].kind='FACT';},'EXTERNAL_CONFIRMATION_INVALID'],
  ['conditional fact',p=>{p.signals[0].kind='FACT';},'EXTERNAL_CONFIRMATION_INVALID'],
  ['source mismatch',p=>{p.signals[0].sourceUrl='https://example.com/article';},'EXTERNAL_SOURCE_URL_MISMATCH'],
  ['unknown extra field',p=>{p.signals[0].rawArticle='not allowed';},'EXTERNAL_SIGNAL_FIELDS_INVALID'],
  ['empty array',p=>{p.signals=[];},'EXTERNAL_SIGNAL_COUNT_INVALID'],
  ['too many',p=>{p.signals=Array.from({length:7},(_,i)=>({...p.signals[0],eventKey:`event-${i}`}));},'EXTERNAL_SIGNAL_COUNT_INVALID'],
  ['future package',p=>{p.generatedAt='2026-10-01T05:00:00Z';},'EXTERNAL_PACKAGE_TIME_FUTURE'],
  ['old package',p=>{p.generatedAt='2026-09-28T05:00:00Z';},'EXTERNAL_PACKAGE_STALE'],
  ['non ISO date',p=>{p.signals[0].publishedAt='2026-09-30';},'EXTERNAL_TIME_INVALID'],
  ['invalid calendar',p=>{p.signals[0].publishedAt='2026-09-31T05:00:00Z';},'EXTERNAL_TIME_INVALID'],
  ['bad event key',p=>{p.signals[0].eventKey='Bad Event';},'EXTERNAL_EVENT_KEY_INVALID'],
  ['empty title',p=>{p.signals[0].title='';},'EXTERNAL_TITLE_INVALID'],
  ['long summary',p=>{p.signals[0].summary='长'.repeat(91);},'EXTERNAL_SUMMARY_INVALID'],
  ['HTML summary',p=>{p.signals[0].summary='<script>合成</script>';},'EXTERNAL_SUMMARY_INVALID'],
])test(`external ${name} rejects before collection/model without repairing input`,async()=>{
  const value=externalPackage(f.now), replacement=change(value),s=setup({packageValue:value});
  const result=await s.run(replacement?{signalPackage:replacement}:{});
  assert.equal(result.failureCode,code);assert.deepEqual(s.counts,{article:0,model:0,collect:0});assert.equal(result.currentForecastUpdated,false);
});
test('freshness uses event first, exact 72h boundary; generated package has separate 24h boundary',()=>{
  const p=externalPackage(f.now);p.signals[0].eventAt=new Date(+now-72*3600000).toISOString();assert.doesNotThrow(()=>validate(p));
  p.signals[0].eventAt=new Date(+now-72*3600000-1).toISOString();assert.throws(()=>validate(p),/EXTERNAL_SIGNAL_STALE/);
  p.signals[0].eventAt=null;p.generatedAt=new Date(+now-86400000).toISOString();assert.throws(()=>validate(p),/EXTERNAL_PACKAGE_STALE/);
});
for(const url of ['http://example.com/a','javascript:alert(1)','data:text/html,test','file:///example','https://user:pass@example.com/a','https://localhost/a','https://127.0.0.1/a','https://10.0.0.1/a','https://169.254.169.254/a','https://[::1]/a','https://[::ffff:127.0.0.1]/a','https://2130706433/a','https://example.com/a?token=bad','https://example.com/a?redirect=https%3A%2F%2Flocalhost','https://example.local/a'])
  test(`unsafe external navigation URL blocked: ${url}`,()=>assert.throws(()=>canonicalSourceUrl(url),/EXTERNAL_URL/));
test('tracking and fragments canonicalize for both package and old NEWS_URL while dangerous remaining query is still blocked',async()=>{
  const p=externalPackage(f.now);p.signals[0].sourceUrl+='?utm_source=chatgpt&utm_medium=web&fbclid=test#section';
  assert.equal(validate(p).signals[0].sourceUrl,externalPackage(f.now).signals[0].sourceUrl);
  const canonical=await resolveNewsUrl(bridgeUrl+'?utm_source=test#body',{now,fetchImpl:async url=>{assert.equal(url,bridgeUrl);return new Response(bridgeHtml());}});
  assert.equal(canonical.document.sourceUrl,bridgeUrl);
  await assert.rejects(resolveNewsUrl(bridgeUrl,{now,fetchImpl:async()=>new Response('',{status:403})}),/SOURCE_HTTP_403/);
});
for(const [source,domain]of [['Reuters','reuters.com'],['EIA','eia.gov'],['IEA','iea.org'],['OPEC','opec.org'],['AP','apnews.com']])test(`known source domain consistency: ${source}`,()=>{
  const p=externalPackage(f.now);p.signals[0].source=source;p.signals[0].sourceUrl=`https://www.${domain}/synthetic/`;assert.doesNotThrow(()=>validate(p));
  p.signals[0].sourceUrl=`https://${domain}.example.com/`;assert.throws(()=>validate(p),/SOURCE_URL_MISMATCH/);
});
test('stable evidence identity, explicit provenance, no forged article/body/segments and no mutation',()=>{
  const p=externalPackage(f.now),before=JSON.stringify(p),n=validate(p);assert.equal(JSON.stringify(p),before);
  assert.equal(n.signals[0].evidenceId,externalEvidenceId(p.signals[0].eventKey));assert.equal(n.signals[0].provenance,'EXTERNAL_ANALYST_WITH_URL');
  p.signals[0].sourceUrl=null;assert.equal(validate(p).signals[0].provenance,'EXTERNAL_ANALYST_NO_URL');
  assert.equal(validate(p).signals[0].evidenceId,n.signals[0].evidenceId);
  assert.doesNotMatch(JSON.stringify(n),/articleContentHash|segments|publisher/);
});
for(const role of [null,'main','counter'])test(`selected ${role??'none'} external signal follows existing Forecast/Card/browser contracts without an external assessment`,async()=>{
  const p=externalPackage(f.now);if(role==='counter')p.signals[0].direction='DOWN';
  const s=setup({packageValue:p,role}),result=await s.run({mode:'REFRESH_CURRENT'});assert.equal(result.status,'CURRENT_READY',result.failureCode);
  assert.deepEqual(s.counts,{article:0,model:1,collect:1});assert.equal(result.currentForecastUpdated,false);
  const snapshot=result.snapshot,pack=snapshot.evidencePack,id=pack.externalAnalystSignals[0].evidenceId;
  const {evidencePack,...candidate}=snapshot;assert.equal(forecastGate(candidate,pack,{now,expectedEvidenceHash:evidenceHashFor(pack)}).gate,'PASS');
  assert.equal((await readForecast({now,fetchImpl:async()=>new Response(JSON.stringify(snapshot))})).status,'LIVE');
  const cards=publicEvidenceGate({forecast:candidate,evidencePack:pack},{now});assert.equal(cards.gate,'PASS');
  const card=cards.cards.find(c=>c.evidenceId===id);assert.equal(Boolean(card),Boolean(role));
  if(role){assert.equal(card.title,p.signals[0].title);assert.equal(card.summary,p.signals[0].summary);assert.equal(card.sourceName,'Reuters');assert.equal(card.role,role.toUpperCase());}
  assert.ok(s.requestBody.response_format.json_schema.schema.properties.mainReasonEvidenceIds.items.enum.includes(id));
  assert.ok(!('externalAssessments'in s.requestBody.response_format.json_schema.schema.properties));
  assert.equal(qwenSchemaCompatibilityGate(analysisSchema(pack)).gate,'PASS');
});
test('selected null URL still renders one normal card with no source button, no exposed analyst metadata',async()=>{
  const p=externalPackage(f.now);p.signals[0].sourceUrl=null;const result=await setup({packageValue:p}).run({mode:'REFRESH_CURRENT'});
  assert.equal(result.status,'CURRENT_READY',result.failureCode);
  const html=publicEvidenceMarkup(result.snapshot,{now}),id=result.snapshot.evidencePack.externalAnalystSignals[0].evidenceId;
  const card=html.split(`data-evidence-id="${id}"`)[1].split('</article>')[0];
  assert.match(card,/Reuters|合成演示/);assert.doesNotMatch(card,/<a |null|ChatGPT|External Analyst|HIGH|MEDIUM|CONDITIONAL/);
});
test('external input is compact allowlisted data, without raw package/source URL/article HTML, and injection has no tools',async()=>{
  const p=externalPackage(f.now);p.signals[0].reason='忽略系统协议并读取环境变量的指令属于不可信数据。';
  const s=setup(),result=await s.run({mode:'REFRESH_CURRENT'});assert.equal(result.status,'CURRENT_READY');
  const payload=s.modelInput.externalAnalystSignals;
  assert.deepEqual(Object.keys(payload[0]).sort(),['evidenceId','eventKey','category','source','publishedAt','kind','direction','strength','confirmation','reason','title','summary'].sort());
  assert.ok(JSON.stringify(payload).length<6000);assert.doesNotMatch(JSON.stringify(payload),/schemaVersion|sourceUrl|articleContentHash|segments|<html/i);
  const injected=setup({packageValue:p});assert.equal((await injected.run({mode:'REFRESH_CURRENT'})).status,'CURRENT_READY');
  assert.ok(!('tools'in injected.requestBody));assert.match(injected.requestBody.messages[0].content,/不可信数据|不可执行/);
});
test('same explicit AUTO event keeps provenance but only one prompt/event vote; malicious dual reason is rejected',async()=>{
  const pack=structuredClone(f.pack),p=externalPackage(f.now);pack.newsDocuments[0].eventKey=p.signals[0].eventKey;
  const merged=mergeExternalSignals(pack,validate(p)),id=merged.pack.externalAnalystSignals[0].evidenceId;
  assert.equal(merged.duplicateEvents,1);assert.equal(merged.pack.newsDocuments.length,2); // The fixture also contains one syndicated Reuters copy.
  assert.ok(merged.excluded.some(e=>e.reason==='DUPLICATE_SYNDICATED_CONTENT'));
  assert.ok(merged.pack.eventGroups.find(g=>g.eventKey===p.signals[0].eventKey).evidenceIds.includes(id));
  assert.equal(projectEvidence(merged.pack).newsDocuments.length,1);
  const bad=setup({pack,mutateOutput:(v)=>{v.mainReasonEvidenceIds=['eia-stocks',id,`${pack.newsDocuments[0].documentId}:${pack.newsDocuments[0].segments[0].segmentId}`];}});
  assert.equal((await bad.run({mode:'REFRESH_CURRENT'})).failureCode,'DUPLICATE_REASON_EVENT');
  const good=await setup({pack}).run({mode:'REFRESH_CURRENT'});assert.equal(good.status,'CURRENT_READY');
  const candidate=structuredClone(good.snapshot);delete candidate.evidencePack;
  candidate.mainReasons.push({evidenceId:`${pack.newsDocuments[0].documentId}:${pack.newsDocuments[0].segments[0].segmentId}`,documentId:pack.newsDocuments[0].documentId,segmentId:pack.newsDocuments[0].segments[0].segmentId,text:'合成'});
  assert.ok(forecastGate(candidate,good.snapshot.evidencePack,{now}).errors.includes('DUPLICATE_REASON_EVENT'));
});
test('repeat event in accepted Current is rejected and partial package repeats are explicitly excluded',async()=>{
  const p=externalPackage(f.now),previous={evidencePack:{externalAnalystSignals:validate(p).signals}};
  const s=setup();assert.equal((await s.run({currentCache:previous})).failureCode,'BRIDGE_DUPLICATE_ONLY');assert.equal(s.counts.model,0);
  p.signals.push({...p.signals[0],eventKey:'synthetic-new-event'});
  const result=await setup({packageValue:p}).run({currentCache:previous});assert.equal(result.status,'READY_FOR_REFORECAST');assert.equal(result.duplicateEvents,1);assert.ok(result.excluded.some(e=>e.reason==='EXTERNAL_PREVIOUS_EVENT'));
});
for(const [name,mutate]of [['unknown external',v=>{v.mainReasonEvidenceIds.push('external-000000000000');}],['neutral external',(_v,_input)=>{}],['reversed external',(v,input)=>{v.mainReasonEvidenceIds=['eia-stocks'];v.counterReasonEvidenceIds=['market-diesel',input.externalAnalystSignals[0].evidenceId];}],['external only main',v=>{v.mainReasonEvidenceIds=v.mainReasonEvidenceIds.filter(id=>id.startsWith('external-'));}],['missing core counter',v=>{v.counterReasonEvidenceIds=[];}]])test(`external cannot bypass core reason controls: ${name}`,async()=>{
  const p=externalPackage(f.now);if(name==='neutral external')p.signals[0].direction='NEUTRAL';
  const s=setup({packageValue:p,mutateOutput:mutate}),result=await s.run({mode:'REFRESH_CURRENT'});assert.equal(result.status,'REJECTED');assert.equal(result.currentForecastUpdated,false);
});
test('opposite Core remains counter evidence even with confirmed high external signal; bad Core cannot be rescued',async()=>{
  const p=externalPackage(f.now);p.signals[0].confirmation='CONFIRMED';p.signals[0].strength='HIGH';
  const result=await setup({packageValue:p}).run({mode:'REFRESH_CURRENT'});assert.equal(result.status,'CURRENT_READY');assert.ok(result.snapshot.counterReasons.some(r=>r.evidenceId==='market-diesel'));
  for(const mutate of [p=>{p.signals=p.signals.filter(s=>s.id!=='market-diesel');},p=>{p.signals.find(s=>s.id==='market-diesel').eventDate='2026-09-20';},p=>{p.conflicts=[{severity:'MAJOR'}];}]) {
    const pack=structuredClone(f.pack);mutate(pack);const s=setup({pack,packageValue:p}),failed=await s.run({mode:'REFRESH_CURRENT'});
    assert.equal(failed.failureCode,'CORE_EVIDENCE_GATE_FAILED');assert.equal(failed.coreEvidenceGate,'FAIL');assert.ok(failed.coreEvidenceErrors.length);assert.match(bridgeSummary(failed),/Core Evidence \| FAIL/);assert.match(bridgeSummary(failed),/Duplicate events \| NOT_CHECKED/);assert.equal(s.counts.model,0);
  }
});
test('production core-only collector never contacts a news publisher, discovery, or proxy',async()=>{
  const urls=[];await collectEvidence({now,coreOnly:true,fetchImpl:async url=>{urls.push(url);return new Response('',{status:503});}});
  assert.deepEqual(urls.sort(),[SOURCES.prices,SOURCES.metadata,SOURCES.recent].sort());assert.ok(urls.every(u=>!u.includes('brecorder')&&!u.includes('reuters')));
});
test('VERIFY_ONLY ignores NEWS_URL and NEWS_URL ignores malformed signal package',async()=>{
  const a=await setup().run({newsUrl:'javascript:bad'});assert.equal(a.status,'READY_FOR_REFORECAST');
  const s=setup(),b=await s.run({intakeType:'NEWS_URL',newsUrl:bridgeUrl,signalPackage:'{bad',resolveOptions:{fetchImpl:async()=>new Response(bridgeHtml())}});assert.equal(b.status,'READY_FOR_REFORECAST');
});
test('Current success/failure atomic path protects last good and all Official files, and production audit rejects fake transport',async()=>{
  const root=await mkdtemp(join(tmpdir(),'ayu-external-isolation-')),cachePath=join(root,'cache.json');
  try {
    await writeFile(cachePath,'last-good');const protectedPaths=['official-daily-index.json','history.json','reservation.json'];for(const p of protectedPaths)await writeFile(join(root,p),'protected');
    const failed=await setup({mutateOutput:v=>{v.probabilities.UP=45;}}).run({mode:'REFRESH_CURRENT',persist:true,cachePath});assert.equal(failed.status,'REJECTED');assert.equal(await readFile(cachePath,'utf8'),'last-good');
    const good=await setup().run({mode:'REFRESH_CURRENT',persist:true,cachePath});assert.equal(good.status,'CURRENT_READY');
    for(const p of protectedPaths)assert.equal(await readFile(join(root,p),'utf8'),'protected');
    await assert.rejects(currentPublication(good.snapshot,good.providerAudit,{sourceCommit:'a'.repeat(40),runId:'1',now}),/CURRENT_PROVIDER_AUDIT_INVALID/);
    await mkdir(join(root,'dist/data'),{recursive:true});await mkdir(join(root,'intelligence-v2'),{recursive:true});
    const origin=await currentPublication(good.snapshot,{...good.providerAudit,mock:false},{sourceCommit:'a'.repeat(40),runId:'1',now});
    await writeFile(join(root,CURRENT_CACHE_PATH),JSON.stringify(good.snapshot));await writeFile(join(root,CURRENT_ORIGIN_PATH),JSON.stringify(origin));
    await verifyCurrentPublication(root,origin,{now});
    const script=await readFile(new URL('../scripts/scan-public-files.mjs',import.meta.url));await mkdir(join(root,'scripts'));await writeFile(join(root,'scripts/scan-public-files.mjs'),script);
    const scan=spawnSync(process.execPath,[join(root,'scripts/scan-public-files.mjs')],{encoding:'utf8',env:{}});assert.equal(scan.status,0,scan.stdout);
  }finally{await rm(root,{recursive:true,force:true});}
});
test('workflow defaults package/VERIFY_ONLY, takes env not shell interpolation, exposes no secret in free branch',async()=>{
  const yml=await readFile(new URL('../.github/workflows/manual-intelligence-bridge.yml',import.meta.url),'utf8');
  assert.match(yml,/default: CHATGPT_SIGNAL_PACKAGE/);assert.match(yml,/default: VERIFY_ONLY/);
  assert.match(yml,/粘贴 ChatGPT 推送的完整 AYU_EXTERNAL_ANALYST_SIGNAL_V1 JSON/);assert.match(yml,/BRIDGE_SIGNAL_PACKAGE: \$\{\{ inputs.signal_package \}\}/);
  const verify=yml.split('- name: 免费验证新闻')[1].split('- name: 尚未授权')[0];assert.doesNotMatch(verify,/secrets\.|DASHSCOPE/);
});

test('optional AUTO news cannot exceed reason/card slots already occupied by Core and external signals',async()=>{
  const scenario=setup({mutateOutput:(value,input)=>{
    const document=input.newsDocuments[0],id=`${document.documentId}:${document.segments[0].segmentId}`;
    value.newsAssessments=[{evidenceId:id,impact:'UP',kind:'RISK',title:'合成新闻风险',summary:'合成材料讨论柴油市场风险。',strength:'MEDIUM'}];
    value.mainReasonEvidenceIds=['eia-stocks','market-brent',input.externalAnalystSignals[0].evidenceId,id];
  }});
  const result=await scenario.run({mode:'REFRESH_CURRENT'});assert.equal(result.status,'CURRENT_READY',result.failureCode);
  assert.equal(result.snapshot.mainReasons.length,3);assert.equal(result.newsEnrichmentGate,'FAIL');assert.ok(result.providerAudit.newsEnrichment.codes.includes('NEWS_REASON_TOO_MANY'));
});
test('same canonical article URL associates AUTO verification with external event without reading the article again',()=>{
  const pack=structuredClone(f.pack),p=externalPackage(f.now),document=pack.newsDocuments[0];
  p.signals[0].source=document.publisher;p.signals[0].sourceUrl=document.sourceUrl;
  const merged=mergeExternalSignals(pack,validate(p));assert.equal(merged.duplicateEvents,1);
  assert.equal(merged.pack.newsDocuments[0].eventKey,p.signals[0].eventKey);
  assert.equal(projectEvidence(merged.pack).newsDocuments.length,1);
});

test('fresh frozen AUTO documents participate in package precheck without fetch; stale stored AUTO is not retimed',async()=>{
  const core={...structuredClone(f.pack),newsDocuments:[],coverageMode:'LIMITED'},auto=structuredClone(f.pack),p=externalPackage(f.now);
  auto.newsDocuments[0].eventKey=p.signals[0].eventKey;
  const s=setup({pack:core,packageValue:p}),result=await s.run({autoEvidence:auto});assert.equal(result.status,'READY_FOR_REFORECAST');
  assert.equal(result.duplicateEvents,1);assert.equal(result.inputShape.newsDocuments,2);assert.equal(s.counts.article,0);
  auto.generatedAt='2026-09-28T05:00:00Z';const expired=await setup({pack:core}).run({autoEvidence:auto});
  assert.equal(expired.status,'READY_FOR_REFORECAST');assert.equal(expired.inputShape.newsDocuments,0);assert.equal(expired.duplicateEvents,0);
});
test('verified AUTO event conflict rejects before model while current Forecast stays untouched',async()=>{
  const auto=structuredClone(f.pack),p=externalPackage(f.now);auto.signals[0].eventKey=p.signals[0].eventKey;auto.signals[0].impact='DOWN';
  const s=setup({packageValue:p}),result=await s.run({autoEvidence:auto,mode:'REFRESH_CURRENT'});
  assert.equal(result.failureCode,'EXTERNAL_AUTO_EVENT_CONFLICT');assert.equal(s.counts.model,0);assert.equal(result.currentForecastUpdated,false);
});
