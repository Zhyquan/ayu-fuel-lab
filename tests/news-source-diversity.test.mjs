import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { collectEvidence, parseNewsSitemap, verifyNewsArticle } from '../scripts/intelligence-v2/collect.mjs';
import { evidenceGate, filterAndDeduplicateSignals } from '../dist/data/intelligence-v2-contract.js';
import { publicEvidenceGate } from '../dist/data/public-evidence.js';
import { evidenceHashFor } from '../scripts/intelligence-v2/history.mjs';
import { fixture } from './fixtures/qwen-fixture.mjs';
import { cases, newsTime, newsUrl, newsArticle, newsSitemap, collectorFetch } from './fixtures/reuters-news.mjs';

const now=new Date(newsTime), options={now};
const verify=(item,id=1)=>verifyNewsArticle(newsArticle(item),newsUrl(id),newsTime);
const eiaPack=()=>{const {pack}=fixture(newsTime);pack.signals=pack.signals.filter(s=>s.sourceOrganization==='EIA');return pack;};
const withNews=signals=>{const pack=eiaPack();pack.signals.push(...signals);return pack;};

test('news A confirmed oil supply disruption is UP FACT with original provenance',()=>{
  const s=verify(cases.disruption);
  assert.equal(s.impact,'UP');assert.equal(s.kind,'FACT');assert.equal(s.sourceOrganization,'Reuters');
  assert.equal(s.sourceName,'Reuters via Business Recorder');assert.equal(s.sourceUrl,newsUrl(1));
  assert.equal(s.eventAt,'2026-09-29T10:00:00.000Z');assert.equal(s.eventDate,'2026-09-29');
});
test('news B confirmed loadings and pipeline restoration are DOWN FACT',()=>{
  for(const item of [cases.restoration,{headline:'Ras Tanura refinery restarts',body:'The Ras Tanura refinery restarted diesel production on Tuesday after repairs.'}]) {
    const s=verify(item);assert.equal(s.impact,'DOWN');assert.equal(s.kind,'FACT');
    assert.match(s.fact,/供应压力缓解/);assert.match(s.fact,/不保证价格下跌/);
  }
});
test('news C conditional strategic reserve release stays OUTLOOK DOWN and LOW',()=>{
  const s=verify(cases.outlook);
  assert.equal(s.kind,'OUTLOOK');assert.equal(s.impact,'DOWN');assert.equal(s.importance,'LOW');
  assert.match(s.fact,/不代表已经释放/);
});
for(const [label,name]of [['D','stocks'],['E','fx']])test(`news ${label} non-energy market article cannot supply an oil signal`,()=>{
  assert.throws(()=>verify(cases[name]),/UNRELATED_MARKET_ARTICLE/);
});
test('news F publisher, quoted Reuters and missing author do not prove Reuters authorship',()=>{
  for(const author of [[{name:'Business Recorder'}],[{name:'BR Research'}],null])
    assert.throws(()=>verify({...cases.disruption,author,body:`Reuters reported oil news. ${cases.disruption.body}`}),/REUTERS_AUTHOR_NOT_VERIFIED/);
  assert.equal(verify({...cases.disruption,author:{name:'Reuters'}}).sourceOrganization,'Reuters');
});
test('news G repeated Yanbu loadings and pipeline restart are one independent event',()=>{
  const a=verify(cases.restoration,1),b=verify({headline:'East-West pipeline restarted',body:'The East-West oil pipeline restarted crude transport on Tuesday.'},2);
  assert.equal(a.eventKey,b.eventKey);
  const result=filterAndDeduplicateSignals([a,b],now);
  assert.equal(result.signals.length,1);assert.equal(result.independentEventCount,1);
  assert.equal(result.excluded[0].reason,'DUPLICATE_EVENT');
});
test('news H publication older than 72h cannot be refreshed by modification',()=>{
  assert.throws(()=>verify({...cases.disruption,publishedAt:'2026-09-26T11:19:59Z'}),/EXPIRED_NEWS/);
  assert.equal(verify({...cases.disruption,publishedAt:'2026-09-26T11:20:00Z',body:'The Yanbu oil pipeline was shut down after damage stopped crude transport.'}).freshness,'BREAKING_72H');
});
test('news I ambiguous and price-only articles remain unsupported',()=>{
  for(const item of [cases.ambiguous,{headline:'Oil prices rise',body:'Brent and diesel prices rose on Tuesday.'}])
    assert.throws(()=>verify(item),/NEEDS_REVIEW_UNSUPPORTED_EVENT/);
});
test('current publication cannot turn historical, conditional, denied or analyst claims into FACT',()=>{
  for(const body of [
    'The Yanbu oil pipeline was shut down last week.',
    'The Yanbu oil pipeline was shut down on Friday.',
    'The Yanbu oil pipeline may be shut down.',
    'The Yanbu oil pipeline was not shut down.',
    'Analysts think the Yanbu oil pipeline was shut down.',
    'The Yanbu oil pipeline carries crude. A nearby power station was shut down.',
    'The oil pipeline was shut down after damage.',
  ])assert.throws(()=>verify({...cases.disruption,body}),/NEEDS_REVIEW_UNSUPPORTED_EVENT/);
});
test('strategic reserve outlook requires an energy mechanism and official actor',()=>{
  for(const body of [
    'A trader said oil reserves could be released.',
    'The government may release foreign exchange reserves.',
    'The government has released oil reserves and may release more.',
    'The IEA may not release oil reserves.',
  ])assert.throws(()=>verify({...cases.outlook,body}),/NEEDS_REVIEW_UNSUPPORTED_EVENT/);
});
test('current shipping restriction is RISK, never a new confirmed closure',()=>{
  const s=verify(cases.shipping);assert.equal(s.kind,'RISK');assert.equal(s.impact,'UP');
  assert.match(s.fact,/并不确认新的关闭/);
  assert.throws(()=>verify({...cases.shipping,body:'Analysts worry about ongoing supply disruptions while hoping to reopen Hormuz.'}),/NEEDS_REVIEW_UNSUPPORTED_EVENT/);
});
test('sitemap, discovery and modified dates cannot substitute for datePublished',()=>{
  assert.throws(()=>verify({...cases.disruption,publishedAt:null}),/ARTICLE_PUBLICATION_TIME_UNVERIFIED/);
  assert.throws(()=>verify({...cases.disruption,publishedAt:'2026-09-29'}),/ARTICLE_PUBLICATION_TIME_UNVERIFIED/);
  assert.throws(()=>verify({...cases.disruption,publishedAt:'2026-09-29T12:00:00Z'}),/INVALID_SIGNAL_DATE/);
  const result=parseNewsSitemap(newsSitemap([{id:1,headline:'Oil loading resumed'}]));
  assert.equal(result[0].discoveredAt,'2026-09-29');assert.equal(result[0].headline,'Oil loading resumed');
  assert.equal(verify(cases.disruption).eventAt,'2026-09-29T10:00:00.000Z');
});
test('related links, menus and nested markup cannot supply missing story facts',()=>{
  const html=newsArticle({...cases.ambiguous,related:`<p><a href="${newsUrl(2)}">${cases.disruption.body}</a></p>`});
  assert.throws(()=>verifyNewsArticle(html,newsUrl(1),newsTime),/NEEDS_REVIEW_UNSUPPORTED_EVENT/);
  assert.equal(verify(cases.disruption).kind,'FACT');
});
test('EIA-only source diversity continues to fail',()=>{
  const result=evidenceGate(eiaPack(),options);assert.equal(result.gate,'FAIL');
  assert.deepEqual(result.errors,['SOURCE_DIVERSITY_INSUFFICIENT']);
});
test('EIA plus actual verified Reuters satisfies the unchanged Evidence Gate',()=>{
  const result=evidenceGate(withNews([verify(cases.disruption)]),options);
  assert.equal(result.gate,'PASS');assert.equal(result.signalCount,7);assert.equal(result.independentEventCount,3);
});
test('duplicate Reuters event cannot inflate independent events or source organizations',()=>{
  const a=verify(cases.restoration,1),b=verify(cases.restoration,2);
  const pack=withNews([a,b]);assert.ok(evidenceGate(pack,options).errors.includes('DUPLICATE_EVIDENCE'));
  pack.signals=filterAndDeduplicateSignals(pack.signals,now).signals;
  assert.equal(evidenceGate(pack,options).independentEventCount,3);
  assert.deepEqual([...new Set(pack.signals.map(s=>s.sourceOrganization))],['EIA','Reuters']);
});
test('GDELT discovery without a verified original cannot satisfy diversity',async()=>{
  const result=await collectEvidence({now,fetchImpl:collectorFetch({gdelt:[{title:'Oil supply disrupted',url:'https://example.com/oil',seendate:newsTime}]})});
  assert.ok(result.gate.errors.includes('SOURCE_DIVERSITY_INSUFFICIENT'));
  assert.deepEqual([...new Set(result.pack.signals.map(s=>s.sourceOrganization))],['EIA']);
  assert.equal(result.pack.discovery.candidates[0].reason,'UNSUPPORTED_ARTICLE_URL');
});
test('publisher sitemap supplies original verification when general RSS misses energy',async()=>{
  const requested=[];
  const result=await collectEvidence({now,fetchImpl:collectorFetch({requested,rss:[{id:9,headline:'Stock market falls'}],sitemap:[{id:1,headline:cases.shipping.headline}],articles:{1:newsArticle(cases.shipping)}})});
  assert.equal(result.gate.gate,'PASS');assert.equal(result.pack.discovery.articleRequests,1);
  const s=result.pack.signals.find(s=>s.sourceOrganization==='Reuters');
  assert.equal(s.eventAt,'2026-09-29T10:00:00.000Z');
  assert.equal(result.pack.discovery.candidates.find(c=>c.evidenceId===s.id).status,'ORIGINAL_VERIFIED');
  assert.equal(requested.filter(url=>url===newsUrl(1)).length,1);
});
test('partial GDELT discovery does not suppress current sitemap or duplicate article fetches',async()=>{
  const requested=[];
  const result=await collectEvidence({now,fetchImpl:collectorFetch({requested,gdelt:[{title:'Oil supply concern',url:newsUrl(9)}],sitemap:[{id:1,headline:cases.restoration.headline},{id:2,headline:cases.restoration.headline},{id:1,headline:cases.restoration.headline}],articles:{1:newsArticle(cases.restoration),2:newsArticle({...cases.restoration,publishedAt:'2026-09-29T10:10:00Z'}),9:newsArticle(cases.ambiguous)}})});
  assert.equal(result.gate.gate,'PASS');assert.equal(result.gate.independentEventCount,3);
  assert.equal(requested.filter(url=>url===newsUrl(1)).length,1);
  assert.equal(result.pack.discovery.candidates.find(c=>c.url===newsUrl(1)).reason,'DUPLICATE_EVENT');
  assert.ok(result.pack.exclusions.some(item=>item.reason==='DUPLICATE_DISCOVERY_ARTICLE'));
  assert.equal(result.pack.signals.find(s=>s.sourceOrganization==='Reuters').sourceUrl,newsUrl(2));
});
test('article verification remains bounded to six requests with explicit exclusion reasons',async()=>{
  const items=Array.from({length:10},(_,i)=>({id:i+1,headline:`Oil supply concern ${i}`}));
  const result=await collectEvidence({now,fetchImpl:collectorFetch({sitemap:items,articles:Object.fromEntries(items.map(item=>[item.id,newsArticle(cases.ambiguous)]))})});
  assert.equal(result.pack.discovery.articleRequests,6);
  assert.equal(result.pack.discovery.candidates.filter(c=>c.reason==='ARTICLE_REQUEST_LIMIT').length,4);
});
test('admitted new news rules have owned public copy without altering forecast estimates',async()=>{
  const {evidencePack,...golden}=JSON.parse(await readFile(new URL('../data/forecast-history-v2/2026-09-28T11-17-34.176Z-66453209e4ab.json',import.meta.url),'utf8'));
  for(const item of [cases.disruption,cases.restoration,cases.outlook,cases.shipping]) {
    const s=verify(item),pack=withNews([s]),forecast=structuredClone(golden);
    forecast.generatedAt=newsTime;forecast.validUntil=new Date(+now+86400000).toISOString();forecast.evidenceHash=evidenceHashFor(pack);
    const ref={evidenceId:s.id,text:s.displayText};
    forecast.mainReasons=[{evidenceId:'eia-stocks',text:pack.signals.find(s=>s.id==='eia-stocks').displayText}];
    forecast.counterReasons=[{evidenceId:'market-diesel',text:pack.signals.find(s=>s.id==='market-diesel').displayText}];
    (s.impact==='UP'?forecast.mainReasons:forecast.counterReasons).push(ref);
    forecast.signalAssessments=pack.signals.map(s=>({evidenceId:s.id,kind:s.kind,impact:s.impact,strength:s.importance}));
    const result=publicEvidenceGate({forecast,evidencePack:pack},options);assert.equal(result.gate,'PASS');
    const card=result.cards.find(c=>c.evidenceId===s.id);assert.equal(card.sourceUrl,s.sourceUrl);
    assert.ok(Array.from(card.title).length<=24&&Array.from(card.summary).length<=60);
    assert.notEqual(card.summary,s.fact);assert.deepEqual(forecast.probabilities,golden.probabilities);
    if(s.kind==='OUTLOOK')assert.match(card.summary,/可能|尚未/);
    if(s.kind==='RISK')assert.equal(card.directionLabel,'上涨风险');
    s.ruleId='UNKNOWN';assert.equal(publicEvidenceGate({forecast,evidencePack:pack},options).gate,'FAIL');
  }
});
