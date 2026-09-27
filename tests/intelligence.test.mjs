import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {hashText,reviewIntelligence,REVIEW_CHECKS,recentMarketDates} from '../scripts/intelligence-review.mjs';
import {saveIntelligenceRun} from '../scripts/run-intelligence.mjs';
import {validateIntelligenceCache,INTELLIGENCE_SOURCE} from '../dist/data/intelligence-contract.js';
import {forecastMarkup} from '../dist/data/intelligence-view.js';
import {getForecast} from '../dist/data/intelligence-service.js';
import {activeForecastSource} from '../dist/data/forecast-config.js';
import {getProvinceFuelData} from '../dist/data/fuel-service.js';
import {validatePublicData} from '../scripts/public-data-gate.mjs';
import {provinces} from '../dist/data/provinces.js';
import {coastalProvinces} from '../dist/data/coastal-provinces.js';
import {getPriceDisplay} from '../dist/data/price-display.js';
const now=new Date('2026-09-27T13:55:00Z');
const read=async p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const initial={evidence:JSON.parse(await read('intelligence/current-evidence.json')),analysis:JSON.parse(await read('intelligence/current-analysis.json')),sourceReview:JSON.parse(await read('intelligence/source-review.json'))};
const json=v=>JSON.stringify(v,null,2)+'\n';
// Synthetic HUMAN approval exists only in test memory/tempdirs, never in delivered inputs.
function fixture() {return {...structuredClone(initial),humanReview:{status:'APPROVED',kind:'HUMAN',reviewer:'TEST_FIXTURE_ONLY',reviewedAt:now.toISOString(),checks:Object.fromEntries(REVIEW_CHECKS.map(k=>[k,true]))},now};}
function bind(f) {
 f.evidenceHash=hashText(json(f.evidence));f.analysis.evidenceHash=f.evidenceHash;
 f.analysis.evidenceUpdatedAt=f.evidence.generatedAt;f.sourceReview.evidenceHash=f.evidenceHash;
 f.analysisHash=hashText(json(f.analysis));f.humanReview.evidenceHash=f.evidenceHash;f.humanReview.analysisHash=f.analysisHash;return f;
}
const run=f=>reviewIntelligence(bind(f||fixture()));
const live=()=>run().forecast;

test('intelligence 01: complete fresh evidence plus synthetic human approval produces LIVE',()=>{
 const r=run();assert.deepEqual(r.issues,[]);assert.equal(r.forecast.status,'LIVE');assert.equal(r.forecast.source,INTELLIGENCE_SOURCE);assert.equal(r.forecast.horizonDays,7);
});
test('intelligence 02: stale evidence is UNAVAILABLE even after synthetic approval',()=>{
 const f=fixture();f.now=new Date('2026-10-05T13:55:00Z');const r=run(f);assert.equal(r.forecast.status,'UNAVAILABLE');assert.ok(r.evidenceIssues.includes('NO_FRESH_MARKET'));
});
test('intelligence 03: missing Brent requires fresh WTI plus OPEC, inventory and supply',()=>{
 const f=fixture();f.evidence.market.brent=null;assert.equal(run(f).gate,'PASS');
 f.evidence.signals=f.evidence.signals.filter(s=>s.category!=='OPEC_POLICY');f.analysis.assessments=f.analysis.assessments.filter(s=>s.evidenceId!=='O_POLICY');
 assert.ok(run(f).evidenceIssues.includes('SINGLE_MARKET_NEEDS_MORE_EVIDENCE'));
});
test('intelligence 04: missing all source dates fails',()=>{
 const f=fixture();for(const s of f.evidence.sources) delete s.publishedAt;assert.equal(run(f).evidenceGate,'FAIL');
});
test('intelligence 05: conflicting primary signals require SIDEWAYS and cannot pass UP',()=>{
 assert.equal(run().forecast.direction,'SIDEWAYS');const f=fixture();f.analysis.direction='UP';f.analysis.label='偏上涨';assert.ok(run(f).issues.includes('PRIMARY_CONFLICT_REQUIRES_SIDEWAYS'));
});
test('intelligence 06: invented fact or assessment is rejected',()=>{
 const f=fixture();f.analysis.reasons[0]='全球所有油田停产';assert.ok(run(f).issues.includes('UNGROUNDED_REASONS'));
 const g=fixture();g.analysis.assessments[0].claim='invented';assert.ok(run(g).issues.includes('ASSESSMENTS_UNGROUNDED'));
});
test('intelligence 07: missing source URL or unopened source fails review',()=>{
 for(const change of [f=>delete f.evidence.sources[0].sourceUrl,f=>f.sourceReview.sourceChecks[0].status='SEARCH_SNIPPET_ONLY']) {const f=fixture();change(f);assert.equal(run(f).evidenceGate,'FAIL');}
});
test('intelligence 08: UI displays simple grounded reasons without internal market fields',()=>{
 const html=forecastMarkup(live(),{now});assert.ok(html.includes('主要依据'));assert.ok(html.includes('反向因素'));
 for(const text of ['WTI','Brent','Futures','basis','spread','curve','backwardation','库存周环比','sourceUrl','directionImpact']) assert.equal(html.includes(text),false);
});
test('intelligence 09: no probabilities or predicted amounts in the active renderer',()=>{
 const html=forecastMarkup(live(),{now});for(const text of ['%','概率','置信','元/吨','元 / 吨','元/升','estimatedChange','forecast-ton']) assert.equal(html.includes(text),false);
 for(const text of ['上涨概率很大','高置信度','预计涨价一百元','上涨72%']) {const c=live();c.reasons[0]=text;assert.equal(validateIntelligenceCache(c,{now}).status,'UNAVAILABLE');}
});
test('intelligence 10: APIZero confidence/amount cannot leak through public cache or UI',()=>{
 for(const field of ['confidence','estimated_change_per_ton','estimated_change_per_liter','forecastRaw']){const c=live();c[field]='HIGH';assert.equal(validateIntelligenceCache(c,{now}).status,'UNAVAILABLE');assert.equal(forecastMarkup(c,{now}).includes('HIGH'),false);}
});
test('intelligence 11: forecast failure leaves national price gate and service functional',async context=>{
 const price={generatedAt:new Date().toISOString(),source:'APIZero',provinces:Object.fromEntries(provinces.map(({name})=>[name,{province:name,diesel0Price:8.29,unit:'元/升',updatedAt:'2026-09-26',sourceStatus:'LIVE'}]))};
 const bad=fixture();bad.evidence.market={};assert.equal(run(bad).forecast.status,'UNAVAILABLE');
 assert.equal(validatePublicData(price,{startedAt:price.generatedAt}).gate,'PASS');
 context.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify(price)));
 const result=await getProvinceFuelData('福建',{refresh:true});assert.equal(result.status,'LIVE');assert.equal(result.record.diesel0Price,8.29);
});
test('intelligence 12: history refuses overwrite and persists complete evidence plus hashes',async()=>{
 const root=await mkdtemp(join(tmpdir(),'ayu-intelligence-test-'));
 try {const f=bind(fixture());await mkdir(join(root,'intelligence'));
 for(const [key,file] of Object.entries({evidence:'current-evidence',analysis:'current-analysis',sourceReview:'source-review',humanReview:'human-review'})) await writeFile(join(root,`intelligence/${file}.json`),json(f[key]));
 const first=await saveIntelligenceRun({root,now});const raw=await readFile(join(root,first.historyFile),'utf8');assert.equal(first.gate,'PASS');
 await assert.rejects(saveIntelligenceRun({root,now}),{code:'EEXIST'});assert.equal(await readFile(join(root,first.historyFile),'utf8'),raw);
 const snapshot=JSON.parse(raw);assert.deepEqual(snapshot.evidence,f.evidence);assert.equal(snapshot.rawInputHashes.evidence,f.evidenceHash);assert.equal(snapshot.sourceUrls.length,8);
 await saveIntelligenceRun({root,now:new Date(+now+1000)});assert.equal((await readdir(join(root,'data/forecast-history'))).length,2);
 } finally {await rm(root,{recursive:true,force:true});}
});
test('intelligence 13: all 11 coastal regions and 31 national names preserved',()=>{
 assert.equal(provinces.length,31);assert.deepEqual(coastalProvinces.map(s=>s.name),['福建','浙江','山东','广东','辽宁','海南','江苏','河北','天津','上海','广西']);
});
test('intelligence 14: estimated ton price still uses 0.84 kg/L',()=>{
 assert.deepEqual([getPriceDisplay(8.29).estimatedPricePerTon,getPriceDisplay(8.36).estimatedPricePerTon],[9869,9952]);assert.equal(getPriceDisplay(8.29).dieselDensityKgPerLiter,0.84);
});
test('intelligence 15: existing price Actions and collector remain byte-identical',async()=>{
 assert.equal(hashText(await read('.github/workflows/update-and-deploy.yml')),'97fb43f290ad6f9e571968515e1b6e0a2b92f0516fc5e0b4ee6d685a07bd75e3');
 assert.equal(hashText(await read('scripts/update-fuel-prices.mjs')),'8f7f4394ab643e70b0c697e8a10bc4227fb7ec803d0d3d09cf90d085dba83715');
});
test('intelligence: pending human review still fails and active-source request errors degrade safely',async context=>{
 const f=fixture();f.humanReview.status='PENDING';assert.ok(run(f).issues.includes('HUMAN_REVIEW_PENDING'));
 assert.equal(activeForecastSource,INTELLIGENCE_SOURCE);context.mock.method(globalThis,'fetch',async()=>{throw new Error('request failure');});assert.equal((await getForecast()).status,'UNAVAILABLE');assert.equal(globalThis.fetch.mock.callCount(),1);
});
test('intelligence: changed pack or forecast invalidates exact human approval',()=>{
 const f=bind(fixture());f.humanReview.evidenceHash='different';assert.ok(reviewIntelligence(f).issues.includes('HUMAN_REVIEW_INVALID_OR_UNBOUND'));
 const g=bind(fixture());g.humanReview.analysisHash='different';assert.ok(reviewIntelligence(g).issues.includes('HUMAN_REVIEW_INVALID_OR_UNBOUND'));
});
test('intelligence: secondary APIZero direction never changes Ayu conclusion',()=>{
 const f=fixture();f.evidence.secondaryCrosscheck.directionRaw='上涨';f.evidence.secondaryCrosscheck.forecastRaw.confidence='HIGH';assert.deepEqual(run(f).forecast,live());
});
test('intelligence: expiry, future timestamps, unknown fields and markup fail closed',()=>{
 assert.equal(validateIntelligenceCache(live(),{now:new Date('2026-09-28T00:00:00Z')}).status,'UNAVAILABLE');
 for(const change of [c=>c.generatedAt='2026-10-01T00:00:00Z',c=>c.validUntil='2026-10-01T00:00:00Z',c=>c.reasons[0]='<script>bad</script>',c=>c.direction='constructor',c=>c.explanation='new fact']) {const c=live();change(c);assert.equal(validateIntelligenceCache(c,{now}).status,'UNAVAILABLE');}
});
test('intelligence: old news republished today does not become fresh',()=>{
 const f=fixture();f.evidence.signals.find(s=>s.id==='G_RISK').eventDate='2026-09-01';assert.ok(run(f).issues.includes('UNGROUNDED_REASONS'));
});
test('intelligence: latest official inventory expires when next release becomes due',()=>{
 const f=fixture();f.evidence.inventory.nextReleaseDate='2026-09-27';assert.ok(run(f).issues.includes('UNGROUNDED_REASONS'));
});
test('intelligence: weekday cutoff is conservative and weekend selects Thu/Fri',()=>{
 assert.deepEqual(recentMarketDates(now),['2026-09-25','2026-09-24']);
 assert.deepEqual(recentMarketDates(new Date('2026-09-28T16:00:00Z')),['2026-09-25','2026-09-24']);
});
test('intelligence: malformed JSON or sources replace cache with unavailable and preserve failed history',async()=>{
 const root=await mkdtemp(join(tmpdir(),'ayu-intelligence-error-'));
 try {await mkdir(join(root,'intelligence'));
 for(const raw of ['{broken','{"sources":{}}','{"sources":[null]}']) {
 await writeFile(join(root,'intelligence/current-evidence.json'),raw);
 const r=await saveIntelligenceRun({root,now});assert.equal(r.gate,'FAIL');assert.equal(JSON.parse(await readFile(join(root,'dist/data/forecast-cache.json'),'utf8')).status,'UNAVAILABLE');}
 assert.equal((await readdir(join(root,'data/forecast-history'))).length,3);
 } finally {await rm(root,{recursive:true,force:true});}
});
