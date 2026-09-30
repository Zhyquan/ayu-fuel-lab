import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { publicEvidenceGate, buildPublicEvidenceCards, formatEvidenceDate } from '../dist/data/public-evidence.js';
import { publicEvidenceMarkup } from '../dist/data/public-evidence-view.js';
import { forecastMarkup } from '../dist/data/intelligence-v2-view.js';
import { readForecast } from '../dist/data/intelligence-v2-service.js';
import { evidenceHashFor } from '../scripts/intelligence-v2/history.mjs';
import { getProvinceFuelData } from '../dist/data/fuel-service.js';

// Immutable historical fixture, independent of today's automated current cache.
const {evidencePack,...candidate}=JSON.parse(await readFile(new URL('../data/forecast-history-v2/2026-09-28T11-17-34.176Z-66453209e4ab.json',import.meta.url),'utf8'));
const now=new Date(candidate.generatedAt), options={now};
const fixture=()=>({forecast:structuredClone(candidate),evidencePack:structuredClone(evidencePack)});
const cache=f=>({...f.forecast,evidencePack:f.evidencePack});
const ref=signal=>({evidenceId:signal.id,text:signal.displayText});
const signal=(f,id)=>f.evidencePack.signals.find(s=>s.id===id);

test('public cards contain only the four actual reason refs, safe own copy and exact HTTPS links',()=>{
  const f=fixture(), result=publicEvidenceGate(f,options);
  assert.equal(result.gate,'PASS');
  assert.deepEqual(result.cards.map(c=>c.evidenceId),['eia-stocks','market-brent','news-hormuz-40441609','market-diesel']);
  for(const card of result.cards) {
    const evidence=signal(f,card.evidenceId);
    assert.ok([...f.forecast.mainReasons,...f.forecast.counterReasons].some(r=>r.evidenceId===card.evidenceId&&r.text===evidence.displayText));
    assert.ok(card.title.length&&Array.from(card.title).length<=24);
    assert.ok(card.summary.length&&Array.from(card.summary).length<=60);
    assert.equal(card.sourceUrl,evidence.sourceUrl);assert.equal(new URL(card.sourceUrl).protocol,'https:');
    assert.equal(card.sourceName,evidence.sourceOrganization);assert.equal(card.direction,evidence.impact);
    assert.equal(Object.hasOwn(card,'fact'),false);assert.equal(Object.hasOwn(card,'headline'),false);
  }
  assert.equal(result.cards[0].summary,'统计周截至9月18日，馏分油库存较上周减少。');
  assert.equal(result.cards[1].summary,'9月24日的Brent现货报价较上一报价日上涨。');
  assert.deepEqual(buildPublicEvidenceCards(f,options),result.cards);
});
test('missing evidence ID fails closed, and unused pack events are not selected',()=>{
  const f=fixture();f.forecast.mainReasons[0].evidenceId='MISSING';
  assert.equal(publicEvidenceGate(f,options).gate,'FAIL');assert.deepEqual(buildPublicEvidenceCards(f,options),[]);
  const cards=buildPublicEvidenceCards(fixture(),options);
  assert.equal(cards.some(c=>['market-wti','eia-production','eia-refinery-inputs'].includes(c.evidenceId)),false);
});
test('reason text different from the admitted evidence or with invented facts is rejected',()=>{
  for(const text of ['库存增加','霍尔木兹已经关闭','全球供应已经停止']) {
    const f=fixture();f.forecast.mainReasons[0].text=text;assert.equal(publicEvidenceGate(f,options).gate,'FAIL');
  }
});
test('invalid or non-HTTPS source links never become clickable cards',()=>{
  for(const sourceUrl of ['',null,'http://example.com','javascript:alert(1)','https://user:pass@example.com','https://example.com/?tracking=1']) {
    const f=fixture();signal(f,'eia-stocks').sourceUrl=sourceUrl;
    assert.equal(publicEvidenceGate(f,options).gate,'FAIL');assert.deepEqual(buildPublicEvidenceCards(f,options),[]);
  }
});
test('missing source, unparseable date and illegal impact are rejected',()=>{
  for(const modify of [s=>s.sourceOrganization='',s=>s.sourceName='',s=>s.eventDate='2026-02-30',s=>s.publishedAt='invalid',s=>s.impact='SIDEWAYS']) {
    const f=fixture();modify(signal(f,'eia-stocks'));assert.equal(publicEvidenceGate(f,options).gate,'FAIL');
  }
});
test('invalid evidence still fails; historically valid expired forecast retains its cards',()=>{
  for(const modify of [s=>s.nextReleaseAt=now.toISOString(),s=>s.checkedAt=new Date(+now-86400000).toISOString()]) {
    const f=fixture();modify(signal(f,'eia-stocks'));assert.equal(publicEvidenceGate(f,options).gate,'FAIL');
  }
  assert.equal(publicEvidenceGate(fixture(),{now:new Date(candidate.validUntil)}).gate,'PASS');
  assert.match(publicEvidenceMarkup(cache(fixture()),{now:new Date(candidate.validUntil)}),/evidence-card/);
});
test('unknown reason type has no guessed summary and does not copy long source text',()=>{
  const f=fixture();f.forecast.mainReasons[1]=ref(signal(f,'market-wti'));
  const result=publicEvidenceGate(f,options);assert.equal(result.gate,'FAIL');assert.deepEqual(result.cards,[]);
  assert.ok(result.errors.includes('NO_SAFE_PUBLIC_COPY'));
  const g=fixture();signal(g,'eia-stocks').publicSummary='原文'.repeat(1000);signal(g,'eia-stocks').headline='标题'.repeat(1000);
  assert.equal(publicEvidenceGate(g,options).gate,'PASS');
  assert.doesNotMatch(publicEvidenceMarkup(cache(g),options),/原文|标题标题/);
});
test('risk is explicitly labelled and cannot silently become an occurred fact',()=>{
  const cards=buildPublicEvidenceCards(fixture(),options), risk=cards.find(c=>c.sourceName==='Reuters');
  assert.equal(risk.directionLabel,'上涨风险');assert.match(risk.summary,/属于风险信号/);
  assert.doesNotMatch(risk.title+risk.summary,/已经关闭|确定减产/);
  const f=fixture();signal(f,risk.evidenceId).kind='FACT';
  f.forecast.signalAssessments.find(a=>a.evidenceId===risk.evidenceId).kind='FACT';
  assert.equal(publicEvidenceGate(f,options).gate,'FAIL');
});
test('publication dates are explicit while summaries keep observation dates; DATE_ONLY shows no time',()=>{
  const html=publicEvidenceMarkup(cache(fixture()),options);
  assert.match(html,/datetime="2026-09-25">9月25日发布/);assert.match(html,/datetime="2026-09-23">9月23日发布/);
  assert.match(html,/今天发布/);assert.doesNotMatch(html,/00:00|09:30|14:30|10:44/);
  assert.equal(formatEvidenceDate('2026-09-28',now),'今天');assert.equal(formatEvidenceDate('2026-09-27',now),'昨天');
  assert.equal(formatEvidenceDate('2025-09-23',now),'2025年9月23日');assert.equal(formatEvidenceDate('2026-02-30',now),null);
});
test('all genuine cards appear directly without explanation headings or disclosure',()=>{
  const html=publicEvidenceMarkup(cache(fixture()),options);
  assert.equal((html.match(/<article/g)??[]).length,4);
  assert.doesNotMatch(html,/<details|主要上行因素|主要下行因素|反向因素|查看全部依据/);
  assert.match(html,/Reuters/);assert.match(html,/上涨风险/);assert.match(html,/利跌/);
});
test('only two true reason cards are shown directly without filler or disclosure',()=>{
  const f=fixture();f.forecast.mainReasons=f.forecast.mainReasons.slice(0,1);
  assert.equal(publicEvidenceGate(f,options).gate,'PASS');
  const html=publicEvidenceMarkup(cache(f),options);assert.equal((html.match(/<article/g)??[]).length,2);assert.doesNotMatch(html,/<details/);
});
test('DOWN retains card direction labels and leaves original probabilities intact',()=>{
  const f=fixture();[f.forecast.mainReasons,f.forecast.counterReasons]=[f.forecast.counterReasons,f.forecast.mainReasons.slice(0,2)];
  f.forecast.primaryDirection='DOWN';f.forecast.probabilities={DOWN:40,FLAT:25,UP:35};
  assert.equal(publicEvidenceGate(f,options).gate,'PASS');assert.match(publicEvidenceMarkup(cache(f),options),/利跌/);
  assert.deepEqual(f.forecast.probabilities,{DOWN:40,FLAT:25,UP:35});
});
test('same EIA weekly event is deduplicated even if multiple measurements are genuine reason refs',()=>{
  const f=fixture();f.forecast.mainReasons=[ref(signal(f,'eia-stocks')),ref(signal(f,'eia-production')),ref(signal(f,'news-hormuz-40441609'))];
  const result=publicEvidenceGate(f,options);assert.equal(result.gate,'PASS');assert.equal(result.cards.length,3);
  assert.deepEqual(result.excluded,[{evidenceId:'eia-production',reason:'SAME_EVENT_AND_DIRECTION'}]);
  assert.equal(result.cards.some(c=>c.sourceName==='Reuters'),true);
});
test('opposite diesel movement in the same market snapshot remains a genuine counter factor',()=>{
  const f=fixture();assert.equal(signal(f,'market-brent').eventKey,signal(f,'market-diesel').eventKey);
  const cards=buildPublicEvidenceCards(f,options);assert.ok(cards.some(c=>c.evidenceId==='market-brent'));assert.ok(cards.some(c=>c.evidenceId==='market-diesel'&&c.role==='COUNTER'));
});
test('reason count exceeding five fails, and distinct embedded evidence cannot be substituted',()=>{
  const f=fixture();f.forecast.mainReasons.push(ref(signal(f,'eia-production')));assert.equal(publicEvidenceGate(f,options).gate,'FAIL');
  const g=fixture();g.forecast.evidencePack=structuredClone(g.evidencePack);g.evidencePack.signals[0].fact+='changed';
  assert.equal(publicEvidenceGate(g,options).errors[0],'EVIDENCE_PACK_MISMATCH');
});
test('safe source link markup uses exact URLs, a new context and no redirect; card body is not clickable',()=>{
  const html=publicEvidenceMarkup(cache(fixture()),options);
  assert.equal((html.match(/target="_blank" rel="noopener noreferrer"/g)??[]).length,4);
  for(const card of buildPublicEvidenceCards(fixture(),options)) assert.ok(html.includes(`href="${card.sourceUrl}"`));
  assert.doesNotMatch(html,/onclick|<a[^>]*>\s*<article|redirect|<img|<video/);
});
test('projection is read only; source hash verification remains enforced before rendering',async()=>{
  const f=fixture(), original=JSON.stringify(f);publicEvidenceMarkup(cache(f),options);buildPublicEvidenceCards(f,options);
  assert.equal(JSON.stringify(f),original);assert.deepEqual(f.forecast.probabilities,{DOWN:35,FLAT:25,UP:40});
  assert.equal(f.forecast.evidenceHash,evidenceHashFor(f.evidencePack));
  f.evidencePack.signals[0].fact+='changed';
  const result=await readForecast({fetchImpl:async()=>new Response(JSON.stringify(cache(f))),now});
  assert.equal(result.reason,'EVIDENCE_HASH_MISMATCH');assert.doesNotMatch(publicEvidenceMarkup(result,options),/<article/);
});
test('public evidence failure does not hide a valid trend or affect the actual price service',async context=>{
  const f=fixture();f.forecast.mainReasons[1]=ref(signal(f,'market-wti'));
  assert.match(forecastMarkup(cache(f),options),/偏涨/);assert.match(publicEvidenceMarkup(cache(f),options),/暂时无法展示/);
  context.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({generatedAt:new Date().toISOString(),source:'APIZero',provinces:{福建:{province:'福建',diesel0Price:8.29,unit:'元/升',updatedAt:'2026-09-26',sourceStatus:'LIVE'}}})));
  const result=await getProvinceFuelData('福建',{refresh:true});assert.equal(result.status,'LIVE');assert.equal(result.record.diesel0Price,8.29);
  assert.doesNotMatch(publicEvidenceMarkup({status:'UNAVAILABLE'}),/<article/);assert.doesNotMatch(publicEvidenceMarkup({status:'STALE'}),/<article|数据更新中/);
});
test('automated daily supports reviewed inverse movements without copying raw facts or changing the UI',()=>{
  const f=fixture();
  for(const [id,impact,displayText]of [
    ['eia-stocks','DOWN','美国馏分油库存增加'],
    ['market-brent','DOWN','Brent最新日度报价回落'],
    ['market-diesel','UP','纽约港低硫柴油最新日度报价上涨'],
  ]) {
    const s=signal(f,id);s.impact=impact;s.displayText=displayText;
    if(id==='eia-stocks')s.fact=s.fact.replace('库存周变化 -','库存周变化 +');
    else s.observation.change1dPercent=impact==='UP'?1:-1;
    f.forecast.signalAssessments.find(a=>a.evidenceId===id).impact=impact;
  }
  f.forecast.probabilities={DOWN:40,FLAT:25,UP:35};f.forecast.primaryDirection='DOWN';
  f.forecast.mainReasons=['eia-stocks','market-brent'].map(id=>ref(signal(f,id)));
  f.forecast.counterReasons=['market-diesel',signal(fixture(),'news-hormuz-40441609').id].map(id=>ref(signal(f,id)));
  f.forecast.evidenceHash=evidenceHashFor(f.evidencePack);
  const result=publicEvidenceGate(f,options);assert.equal(result.gate,'PASS');
  assert.deepEqual(result.cards.slice(0,3).map(c=>c.title),['美国馏分油库存增加','Brent日度报价回落','纽约港低硫柴油报价上涨']);
  signal(f,'market-brent').observation.change1dPercent=1;
  assert.equal(publicEvidenceGate(f,options).gate,'FAIL');
});
