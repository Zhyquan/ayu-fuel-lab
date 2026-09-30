import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, mkdir, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolveNewsUrl, deduplicateNewsDocuments } from '../scripts/intelligence-v2/source-adapters.mjs';
import { runManualBridge, mergeBridgeEvidence, bridgeSummary } from '../scripts/intelligence-v2/manual-bridge.mjs';
import { currentPublication, currentDeliveryReady, CURRENT_CACHE_PATH, CURRENT_ORIGIN_PATH, BRIDGE_WORKFLOW } from '../scripts/intelligence-v2/current-publication.mjs';
import { currentChangesAllowed } from '../scripts/intelligence-v2/commit-current-bridge.mjs';
import { dailyDeliveryReady } from '../scripts/intelligence-v2/pages-delivery-ready.mjs';
import { publicEvidenceGate } from '../dist/data/public-evidence.js';
import { publicEvidenceMarkup } from '../dist/data/public-evidence-view.js';
import { canonicalJson } from '../dist/data/intelligence-v2-contract.js';
import { loadReplayFixture, replayOutput } from '../scripts/intelligence-v2/replay.mjs';
import { bridgeScenario, bridgeHtml, bridgeUrl } from './fixtures/bridge-scenario.mjs';

const fixture=await loadReplayFixture(),now=new Date(fixture.now);
const setup=options=>bridgeScenario(fixture,replayOutput,options);
const resolvedDocument=async()=> (await resolveNewsUrl(bridgeUrl,{now,fetchImpl:async()=>new Response(bridgeHtml())})).document;

test('supported URL VERIFY_ONLY admits the same NewsDocument and never calls a model or writes Current',async()=>{
  const s=setup(),before=canonicalJson(fixture.pack),result=await s.run();
  assert.equal(result.status,'READY_FOR_REFORECAST');assert.equal(result.qwenCalled,false);assert.equal(result.currentForecastUpdated,false);
  assert.deepEqual(s.counts,{source:1,model:0,collect:1});assert.equal(result.verificationChecks.length,9);
  assert.equal(result.evidenceAdmission,'PASS');assert.equal(canonicalJson(fixture.pack),before);
  assert.ok(!('snapshot' in result));
});
for(const [url,code]of [
  ['not-a-url','HTTPS_URL_INVALID'],['http://www.brecorder.com/news/999000','HTTPS_URL_INVALID'],
  ['https://example.com/news/999000','SOURCE_UNSUPPORTED'],['https://www.reuters.com/business/energy/example/','SOURCE_UNSUPPORTED'],
  ['https://www.eia.gov/todayinenergy/detail.php','SOURCE_UNSUPPORTED'],['https://user:password@www.brecorder.com/news/999000','HTTPS_URL_INVALID'],
  ['https://www.brecorder.com/news/999000?token=fake','HTTPS_URL_INVALID'],
])test(`unsupported/invalid URL rejects before source, collection or model: ${url}`,async()=>{
  const s=setup(),result=await s.run({newsUrl:url});assert.equal(result.failureCode,code);assert.deepEqual(s.counts,{source:0,model:0,collect:0});
  assert.ok(!bridgeSummary(result).includes(url));
});
for(const [name,fetchImpl,code]of [
  ['HTTP 404',async()=>new Response('',{status:404}),'SOURCE_HTTP_404'],
  ['timeout',async()=>{throw new DOMException('synthetic timeout','TimeoutError');},'SOURCE_FETCH_UNAVAILABLE'],
  ['redirect',async()=>({ok:true,url:'https://example.com/redirected'}),'SOURCE_REDIRECT_REJECTED'],
  ['oversize',async()=>new Response('x'.repeat(1000001)),'SOURCE_TOO_LARGE'],
])test(`fetch ${name} cannot reach collection/model`,async()=>{
  const s=setup(),result=await s.run({resolveOptions:{fetchImpl}});assert.equal(result.failureCode,code);assert.equal(s.counts.collect,0);assert.equal(s.counts.model,0);
});
for(const [name,html,code]of [
  ['stale publication',bridgeHtml({date:'2026-09-20T04:00:00Z'}),'ARTICLE_PUBLICATION_TIME_UNVERIFIED'],
  ['future publication',bridgeHtml({date:'2026-10-01T04:00:00Z'}),'ARTICLE_PUBLICATION_TIME_UNVERIFIED'],
  ['invalid calendar date',bridgeHtml({date:'2026-09-31'}),'ARTICLE_PUBLICATION_TIME_UNVERIFIED'],
  ['wrong publisher',bridgeHtml({publisher:'Fake Business Recorder copy'}),'PUBLISHER_NOT_VERIFIED'],
  ['missing author',bridgeHtml({author:''}),'AUTHOR_NOT_VERIFIED'],
  ['unread body',bridgeHtml().replace('story__content','menu'),'ARTICLE_BODY_NOT_READ'],
  ['advertisement only',bridgeHtml({body:'ADVERTISEMENT: Oil diesel petroleum energy refinery supply fake promotion repeated until the text is long enough.'}),'ARTICLE_BODY_NOT_READ'],
])test(`unverified material ${name} is excluded before Qwen`,async()=>{
  const s=setup({html}),result=await s.run();assert.equal(result.failureCode,code);assert.equal(s.counts.model,0);assert.equal(s.counts.collect,0);
});
test('publication precision and authorship use source metadata, never a footer or modified date',async()=>{
  const html=bridgeHtml({date:'2026-09-30',author:'Staff Reporter'})+'<footer>Reuters</footer>';
  const result=await setup({html}).run();assert.equal(result.source,'Business Recorder');
  assert.equal(result.publishedAtPrecision,'DATE_ONLY');assert.match(bridgeSummary(result),/Published At \| 2026-09-30 \|/);
  assert.doesNotMatch(bridgeSummary(result),/00:00/);
  const stale=bridgeHtml({date:'2026-09-20'}).replace('"datePublished"','"dateModified":"2026-09-30","datePublished"');
  assert.equal((await setup({html:stale}).run()).status,'REJECTED');
});
test('AUTO duplicate and repeated Current submission receive no new event weight',async()=>{
  const document=await resolvedDocument();
  const auto=setup({pack:{...fixture.pack,newsDocuments:[document]}}),a=await auto.run();
  assert.equal(a.failureCode,'BRIDGE_DUPLICATE_ONLY');assert.equal(auto.counts.model,0);
  const repeated=setup(),b=await repeated.run({currentCache:{evidencePack:{newsDocuments:[document]}}});
  assert.equal(b.failureCode,'BRIDGE_DUPLICATE_ONLY');assert.equal(repeated.counts.model,0);
});
test('content copies, same supported event and identical syndicated context dedupe across identities',async()=>{
  const doc=await resolvedDocument();
  const copies=[doc,{...doc,documentId:'br-999001',sourceUrl:bridgeUrl.replace('999000','999001')}];
  assert.equal(deduplicateNewsDocuments(copies).documents.length,1);
  assert.equal(deduplicateNewsDocuments(copies).excluded[0].reason,'DUPLICATE_SYNDICATED_CONTENT');
  const context={...copies[1],articleContentHash:'b'.repeat(64)};
  assert.equal(deduplicateNewsDocuments([doc,context]).excluded[0].reason,'DUPLICATE_NEWS_CONTEXT');
  const event={...context,segments:[{segmentId:'s1-000000000000',text:'Different synthetic diesel body for the same supported refinery event.'}],eventKey:'SUPPORTED_EVENT:refinery:2026-09-30'};
  assert.equal(deduplicateNewsDocuments([{...doc,eventKey:event.eventKey},event]).excluded[0].reason,'DUPLICATE_EVENT');
  const merged=mergeBridgeEvidence(fixture.pack,doc);assert.ok(merged.pack.newsDocuments.length<=6);
  assert.equal(merged.pack.newsDocuments.filter(d=>d.documentId===doc.documentId).length,1);
});
for(const [name,mutate]of [
  ['missing diesel',p=>{p.signals=p.signals.filter(s=>s.id!=='market-diesel');}],
  ['stale diesel',p=>{p.signals.find(s=>s.id==='market-diesel').eventDate='2026-09-20';}],
  ['critical conflict',p=>{p.conflicts=[{severity:'MAJOR'}];}],
])test(`Core ${name} rejects Bridge before inference`,async()=>{
  const pack=structuredClone(fixture.pack);mutate(pack);const s=setup({pack}),result=await s.run({mode:'REFRESH_CURRENT'});
  assert.equal(result.failureCode,'CORE_EVIDENCE_GATE_FAILED');assert.equal(s.counts.model,0);
});
for(const role of [null,'main','counter'])test(`existing Qwen contract and public card renderer: Bridge ${role??'unselected'}`,async()=>{
  const s=setup({role}),result=await s.run({mode:'REFRESH_CURRENT'});
  assert.equal(result.status,'CURRENT_READY',result.failureCode);assert.equal(result.coreForecastGate,'PASS');assert.equal(s.counts.model,1);
  assert.equal(result.newsUsedInReasons,Boolean(role));assert.equal(result.publicCard,Boolean(role));
  const cards=publicEvidenceGate({forecast:result.snapshot,evidencePack:result.snapshot.evidencePack},{now}).cards;
  const card=cards.find(c=>c.evidenceId.startsWith('br-999000:'));assert.equal(Boolean(card),Boolean(role));
  if(role){assert.equal(card.sourceUrl,bridgeUrl);assert.equal(card.sourceName,'Reuters');assert.match(publicEvidenceMarkup(result.snapshot,{now}),/查看来源/);}
});
for(const [name,mutate,code]of [
  ['empty title',v=>{v.newsAssessments[0].title='';},'NEWS_TITLE_INVALID'],
  ['invented number',v=>{v.newsAssessments[0].summary='供应下降99%。';},'NEWS_NEW_NUMBER'],
])test(`optional Bridge ${name} drops enrichment without killing Core`,async()=>{
  const s=setup({role:'main',mutateOutput:mutate}),result=await s.run({mode:'REFRESH_CURRENT'});
  assert.equal(result.status,'CURRENT_READY');assert.equal(result.coreForecastGate,'PASS');assert.equal(result.newsEnrichmentGate,'FAIL');
  assert.equal(result.publicCard,false);assert.equal(result.snapshot.coverageMode,'LIMITED');assert.ok(result.providerAudit.newsEnrichment.codes.includes(code));
});
test('Current success atomically replaces only a disposable cache; Official and reservation files stay identical',async()=>{
  const root=await mkdtemp(join(tmpdir(),'ayu-bridge-isolation-'));
  try{
    const cachePath=join(root,'forecast-cache.json'), protectedPaths=['official-daily-index.json','official-snapshot.json','reservation.json'];
    await writeFile(cachePath,'old-good');for(const p of protectedPaths)await writeFile(join(root,p),`unchanged ${p}`);
    const s=setup({role:'main'}),result=await s.run({mode:'REFRESH_CURRENT',persist:true,cachePath});
    assert.equal(result.status,'CURRENT_READY');assert.equal(result.currentForecastUpdated,true);
    assert.equal(canonicalJson(JSON.parse(await readFile(cachePath,'utf8'))),canonicalJson(result.snapshot));
    for(const p of protectedPaths)assert.equal(await readFile(join(root,p),'utf8'),`unchanged ${p}`);
    assert.ok((await readdir(root)).every(p=>!p.endsWith('.tmp')));
  }finally{await rm(root,{recursive:true,force:true});}
});
test('invalid forecast, public projection, Qwen or write failure all preserve Last Known Good bytes',async()=>{
  const root=await mkdtemp(join(tmpdir(),'ayu-bridge-lkg-')),cachePath=join(root,'forecast-cache.json');
  const old=await readFile(new URL('../dist/data/forecast-cache.json',import.meta.url));await writeFile(cachePath,old);
  try{
    const cases=[
      ['probability',setup({mutateOutput:v=>{v.probabilities.UP=45;}}),{},'QWEN_PROBABILITIES_INVALID'],
      ['provider',setup(),{providerOptions:{mock:true,environment:{DASHSCOPE_API_KEY:'test'},fetchImpl:async()=>{throw new Error('SYNTHETIC_HTTP_FAIL');},wait:async()=>{}}},'QWEN_TRANSPORT_FAILED'],
      ['write',setup(),{writeOptions:{write:async()=>{throw new Error('SYNTHETIC_WRITE_FAILURE');}}},'SYNTHETIC_WRITE_FAILURE'],
      ['rename',setup(),{writeOptions:{move:async()=>{throw new Error('SYNTHETIC_RENAME_FAILURE');}}},'SYNTHETIC_RENAME_FAILURE'],
    ];
    const pack=structuredClone(fixture.pack);for(const s of pack.signals.filter(s=>['market-wti','market-diesel'].includes(s.id)))s.displayText='合成结构化标题'.repeat(5);
    cases.push(['public card',setup({pack,mutateOutput:v=>{v.mainReasonEvidenceIds=['market-wti'];}}),{},'PUBLIC_EVIDENCE_GATE_FAILED']);
    for(const [label,s,extra,code]of cases){
      const result=await s.run({mode:'REFRESH_CURRENT',persist:true,cachePath,...extra});
      assert.equal(result.status,'REJECTED',label);assert.equal(result.failureCode,code,label);
      assert.deepEqual(await readFile(cachePath),old,label);assert.equal(result.currentForecastUpdated,false);
    }
  }finally{await rm(root,{recursive:true,force:true});}
});
test('Current publisher rejects mock proof and disallows Official/history/reservation or other changes',async()=>{
  const result=await setup().run({mode:'REFRESH_CURRENT'});
  await assert.rejects(currentPublication(result.snapshot,result.providerAudit,{sourceCommit:'a'.repeat(40),runId:'100',now}),/CURRENT_PROVIDER_AUDIT_INVALID/);
  assert.deepEqual(currentChangesAllowed([{path:CURRENT_CACHE_PATH,status:' M'},{path:CURRENT_ORIGIN_PATH,status:'??'}]),[CURRENT_CACHE_PATH,CURRENT_ORIGIN_PATH]);
  for(const path of ['data/forecast-history-v2/official-daily-index.json','data/forecast-history-v2/new.json','reservation.json','CURRENT_EVIDENCE_V2.json','dist/app.js'])
    assert.throws(()=>currentChangesAllowed([{path,status:' M'}]),/CURRENT_CHANGE_NOT_ALLOWED/);
});
test('Pages accepts only the matching verified Current commit; VERIFY_ONLY cannot publish a Forecast',async()=>{
  const root=await mkdtemp(join(tmpdir(),'ayu-current-pages-'));
  try{
    const result=await setup({role:'main'}).run({mode:'REFRESH_CURRENT'}),sourceCommit='a'.repeat(40),runId='100';
    // Synthetic audit shape is changed ONLY inside this disposable replay tree.
    const origin=await currentPublication(result.snapshot,{...result.providerAudit,mock:false},{sourceCommit,runId,now});
    await mkdir(join(root,'dist/data'),{recursive:true});await mkdir(join(root,'intelligence-v2'),{recursive:true});
    await writeFile(join(root,CURRENT_CACHE_PATH),JSON.stringify(result.snapshot));await writeFile(join(root,CURRENT_ORIGIN_PATH),JSON.stringify(origin));
    const args={root,triggerHeadSha:sourceCommit,runId,runCreatedAt:fixture.now,now,commitSubject:`data: Current Forecast ${origin.forecastHash.slice(0,12)}`,workflowName:BRIDGE_WORKFLOW};
    assert.equal((await dailyDeliveryReady(args)).ready,true);
    for(const change of [{runId:'101'},{triggerHeadSha:'b'.repeat(40)},{commitSubject:'code only'},{workflowName:'Unknown workflow'}])assert.equal((await dailyDeliveryReady({...args,...change})).ready,false);
    await rm(join(root,CURRENT_ORIGIN_PATH));assert.equal((await currentDeliveryReady(args)).ready,false);
  }finally{await rm(root,{recursive:true,force:true});}
});
test('default workflow intake, secret boundary, strict publication and safe artifact path are explicit',async()=>{
  const yml=await readFile(new URL('../.github/workflows/manual-intelligence-bridge.yml',import.meta.url),'utf8');
  assert.match(yml,/name: Ayu Fuel · 情报桥/);assert.match(yml,/description: '粘贴需要验证的原始新闻链接'/);
  assert.match(yml,/type: string\n        required: true/);assert.match(yml,/default: VERIFY_ONLY/);
  assert.doesNotMatch(yml,/schedule:|\n  push:/);
  const verify=yml.split('- name: 免费验证新闻')[1].split('- name: 尚未授权')[0];assert.doesNotMatch(verify,/secrets\.|DASHSCOPE|GITHUB_TOKEN/);
  assert.match(yml,/vars.BRIDGE_REFRESH_ACTIVATED == 'true'/);assert.match(yml,/path: .work\/manual-bridge\/result.json/);
  assert.doesNotMatch(yml,/path: .*snapshot|path: .*origin/);
  const source=await readFile(new URL('../scripts/intelligence-v2/manual-bridge.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(source,/runOfficialDaily|reservation|official-daily-index/);
});
test('unauthorized refresh fails before all network and does not read credentials',async()=>{
  const s=setup(),result=await s.run({mode:'REFRESH_CURRENT',refreshAuthorized:false});
  assert.equal(result.failureCode,'BRIDGE_REFRESH_NOT_AUTHORIZED');assert.deepEqual(s.counts,{source:0,model:0,collect:0});
  const cli=spawnSync(process.execPath,['scripts/intelligence-v2/commit-current-bridge.mjs'],{env:{},encoding:'utf8'});
  assert.equal(cli.status,1);assert.match(cli.stderr,/CURRENT_COMMIT_NOT_AUTHORIZED/);
});
test('safe summaries do not include model text, article text or provider credentials',async()=>{
  const result=await setup({role:'main'}).run({mode:'REFRESH_CURRENT'}),summary=bridgeSummary(result);
  assert.match(summary,/情报桥结果/);assert.match(summary,/News Used In Reasons/);assert.match(summary,/Current Forecast Updated/);
  assert.doesNotMatch(summary,/Synthetic bridge fixture|DASHSCOPE|Authorization|Bearer|choices|prompt_tokens/);
  assert.doesNotMatch(JSON.stringify(result.providerAudit),/Synthetic bridge fixture|Authorization|Bearer|DASHSCOPE/);
});
