import test from 'node:test';
import assert from 'node:assert/strict';
import { weeklySourceFixture } from './fixtures/eia-weekly-source.mjs';
import { externalPackage } from './fixtures/external-signal-scenario.mjs';
import { parseWeeklyMachineRelease } from '../scripts/intelligence-v2/eia-weekly.mjs';
import { collectEvidence, SOURCES } from '../scripts/intelligence-v2/collect.mjs';
import { signalFailure, coreEvidenceGate } from '../dist/data/intelligence-v2-contract.js';
import { runManualBridge } from '../scripts/intelligence-v2/manual-bridge.mjs';

const old=()=>weeklySourceFixture({releaseDate:'2026-09-23',period:'2026-09-18',checkedAt:'2026-09-30T14:29:59.000Z'}),current=()=>weeklySourceFixture();
const codes=r=>r.diagnostics.map(d=>d.code);
test('official CSV DOS end-of-file marker is framing, not a data row',()=>{
  const f=current();f.table1+='\r\n\x1a';assert.equal(parseWeeklyMachineRelease(f).signals.length,3);
  f.table1=f.table1.replace('"105.18"','"105.18\x1a"');assert.throws(()=>parseWeeklyMachineRelease(f),/EIA_VALUE_INVALID/);
});
for(const [label,summaryLag,landingLag]of [['both lag',true,true],['summary lag',true,false],['landing lag',false,true],['all synchronized',false,false]])test(`machine release continues through ${label}`,()=>{
  const f=current(),prior=old();if(summaryLag)f.summary=prior.summary;if(landingLag)f.landing=prior.landing;
  const r=parseWeeklyMachineRelease(f);assert.equal(r.signals.length,3);assert.equal(r.identity.releaseDate,'2026-09-30');assert.equal(r.identity.periodEndDate,'2026-09-25');
  assert.equal(codes(r).includes('SUMMARY_LAGGING_CURRENT_RELEASE'),summaryLag);assert.equal(codes(r).includes('LANDING_LAGGING_CURRENT_RELEASE'),landingLag);assert.equal(codes(r).includes('SOURCE_PROPAGATION_LAG'),summaryLag||landingLag);
  for(const s of r.signals)assert.equal(signalFailure(s,new Date(f.checkedAt)),null);
});
test('before release the previous observation passes, without changing its release date or event age',()=>{
  const f=old(),r=parseWeeklyMachineRelease(f);assert.equal(r.identity.releaseDate,'2026-09-23');assert.equal(r.signals[0].eventDate,'2026-09-18');assert.equal(r.signals[0].publishedAt,'2026-09-23T14:30:00.000Z');
  assert.equal(signalFailure(r.signals[0],new Date(f.checkedAt)),null);
});
test('OLD VALID to NEW VALID: clock alone cannot delete a freshly rechecked latest machine observation',()=>{
  const before=old(),frozen=parseWeeklyMachineRelease(before),after={...before,checkedAt:'2026-09-30T14:31:00.000Z'},checked=parseWeeklyMachineRelease(after);
  assert.equal(signalFailure(frozen.signals[0],new Date(after.checkedAt)),'STALE_EIA_RELEASE');
  assert.equal(signalFailure(checked.signals[0],new Date(after.checkedAt)),null);assert.ok(codes(checked).includes('AWAITING_NEW_MACHINE_RELEASE'));
  assert.equal(checked.signals[0].publishedAt,frozen.signals[0].publishedAt);
  const fresh=parseWeeklyMachineRelease(current());assert.equal(fresh.signals[0].releaseDate,'2026-09-30');
  assert.equal(signalFailure(fresh.signals[0],new Date(current().checkedAt)),null);
});
test('new machine identity with previous CSV cannot fall back to the old release',()=>{
  const f=current();f.table1=old().table1;assert.throws(()=>parseWeeklyMachineRelease(f),/EIA_MACHINE_PERIOD_CONFLICT/);
});
test('official exception schedule binds holiday release identity and Eastern time',()=>{
  const f=weeklySourceFixture({releaseDate:'2026-09-10',period:'2026-09-04',checkedAt:'2026-09-10T15:01:00.000Z'});
  f.schedule='Wednesday 10:30 am<table><tr><td>September 4, 2026</td><td>September 10, 2026</td><td>Thursday</td><td>11:00 a.m.</td></tr></table>';
  f.metadata.metadata.release_time='11:00 am';f.summary=null;
  const r=parseWeeklyMachineRelease(f);assert.equal(r.signals[0].publishedAt,'2026-09-10T15:00:00.000Z');assert.equal(r.signals[0].nextReleaseAt,'2026-09-16T14:30:00.000Z');
});
test('continuity recheck requires the same source, release, period and fresh authority check',()=>{
  const f={...old(),checkedAt:'2026-09-30T14:31:00.000Z'},r=parseWeeklyMachineRelease(f);
  for(const mutate of [s=>{s.weeklyReleaseIdentity.sourceKey='WRONG';},s=>{s.weeklyReleaseIdentity.releaseDate='2026-09-30';},s=>{s.weeklyReleaseIdentity.authorityCheckedAt='2026-09-30T14:29:00.000Z';},s=>{s.checkedAt='2026-09-29T14:31:00.000Z';}]) {
    const signal=structuredClone(r.signals[0]);mutate(signal);assert.notEqual(signalFailure(signal,new Date(f.checkedAt)),null);
  }
});
test('stocks/production/inputs deltas come from current minus previous values; no invented five-year mean',()=>{
  const r=parseWeeklyMachineRelease(current()),[stocks,production,inputs]=r.signals;
  assert.deepEqual(r.signals.map(s=>s.id),['eia-stocks','eia-production','eia-refinery-inputs']);
  assert.equal(stocks.weeklyObservation.change,-2.251);assert.equal(production.weeklyObservation.change,-156);assert.equal(inputs.weeklyObservation.change,-554);assert.equal(inputs.weeklyObservation.utilizationPercent.current,92.5);
  assert.ok(r.signals.every(s=>s.impact==='UP'&&s.sourceOrganization==='EIA'&&s.verified&&s.freshness==='EIA_RELEASE'));
  assert.equal(stocks.sourceUrl,SOURCES.table1);assert.doesNotMatch(stocks.fact,/五年/);
});
test('positive and zero stock changes preserve DOWN/NEUTRAL semantics',()=>{
  for(const [value,impact]of [['108.431','DOWN'],['107.431','NEUTRAL']]){
    const f=current();f.table1=f.table1.replace('"105.18"',`"${value}"`);f.summary=null;
    assert.equal(parseWeeklyMachineRelease(f).signals[0].impact,impact);
  }
});
for(const [label,mutate,code]of [
  ['malformed release',f=>{f.metadata.metadata.release_date='bad';},'EIA_RELEASE_METADATA_INVALID'],
  ['invalid period',f=>{f.metadata.metadata.time_period.end_date='2026-09-31';},'EIA_RELEASE_METADATA_INVALID'],
  ['future release',f=>{f.checkedAt='2026-09-30T14:29:59.000Z';},'EIA_RELEASE_FUTURE'],
  ['wrong release identity',f=>{f.metadata.metadata.release_date='2026-09-23';},'EIA_RELEASE_IDENTITY_CONFLICT'],
  ['wrong dataset key',f=>{f.metadata.data['U.S.'].sourcekey='WRONG';},'EIA_AUTHORITY_SERIES_INVALID'],
  ['wrong authority units',f=>{f.metadata.data['U.S.'].units='barrels';},'EIA_AUTHORITY_SERIES_INVALID'],
  ['missing authority previous',f=>{f.metadata.data['U.S.'].time_series.shift();},'EIA_AUTHORITY_WEEK_MISSING'],
  ['suppressed authority current',f=>{f.metadata.data['U.S.'].time_series[1].suppression_flag='-';},'EIA_AUTHORITY_WEEK_MISSING'],
  ['duplicate authority week',f=>{f.metadata.data['U.S.'].time_series.push({...f.metadata.data['U.S.'].time_series[1]});},'EIA_AUTHORITY_WEEK_MISSING'],
  ['authority future observation',f=>{f.metadata.data['U.S.'].time_series.push({date:'2026-10-02',value:1});},'EIA_AUTHORITY_SERIES_INVALID'],
  ['authority number conflict',f=>{f.metadata.data['U.S.'].time_series[1].value+=100;},'EIA_AUTHORITY_VALUE_CONFLICT'],
  ['missing stocks',f=>{f.table1=f.table1.split('\r\n').filter(r=>!r.startsWith('"Distillate Fuel Oil"')).join('\r\n');},'EIA_REQUIRED_FIELD_MISSING_OR_DUPLICATE'],
  ['nonfinite number',f=>{f.table2=f.table2.replace('"5003"','"Infinity"');},'EIA_VALUE_INVALID'],
  ['missing previous value',f=>{f.table2=f.table2.replace('"5159"','""');},'EIA_VALUE_INVALID'],
  ['changed header',f=>{f.table2=f.table2.replace('"STUB_2"','"NEW_COLUMN"');},'EIA_TABLE_LAYOUT_CHANGED'],
  ['fields from different weeks',f=>{f.table2=f.table2.replace('"9/25/26"','"9/18/26"');},'EIA_MACHINE_PERIOD_CONFLICT'],
  ['future secondary date',f=>{f.summary=f.summary.replace('September 25','October 2');},'EIA_SECONDARY_DATE_CONFLICT'],
  ['two releases old summary',f=>{f.summary=f.summary.replace('September 25','September 11');},'EIA_SECONDARY_DATE_CONFLICT'],
  ['ahead landing date',f=>{f.landing=f.landing.replace('2026_09_30','2026_10_07');},'EIA_SECONDARY_DATE_CONFLICT'],
  ['same week numeric conflict',f=>{f.summary=f.summary.replace('decreased 2.3','increased 2.3');},'EIA_SECONDARY_VALUE_CONFLICT'],
])test(`weekly machine fails closed: ${label}`,()=>{
  const f=current();mutate(f);assert.throws(()=>parseWeeklyMachineRelease(f),new RegExp(code));
});
test('optional summary/landing fetch failures are explicit and cannot delete complete machine data',()=>{
  const f=current();f.summary=null;f.landing=null;const r=parseWeeklyMachineRelease(f);
  assert.ok(codes(r).includes('SUMMARY_UNAVAILABLE'));assert.ok(codes(r).includes('LANDING_UNAVAILABLE'));assert.equal(r.signals.length,3);
});
test('fresh machine authority never extends a release beyond the original ten-day age cap',()=>{
  const f=old();f.checkedAt='2026-10-04T15:00:00.000Z';const r=parseWeeklyMachineRelease(f);
  assert.equal(signalFailure(r.signals[0],new Date(f.checkedAt)),'STALE_EIA_RELEASE');
});
const daily='<h1>September 30, 2026</h1><table summary="Spot Petroleum Prices"><b>Wholesale Spot Petroleum Prices, 9/29/26 Close</b><tr><td class="s1">Crude Oil ($/barrel)</td><td class="s2">WTI</td><td class="d1">95.88</td><td class="up">+2.7</td></tr><tr><td class="s2">Brent</td><td class="d1">120.92</td><td class="up">+3.0</td></tr><tr><td class="s1">Low-Sulfur Diesel ($/gallon)</td><td class="s2">NY Harbor</td><td class="d1">4.88</td><td class="dn">-1.6</td></tr></table>';
function sourceFetch(f,{secondaryHTTP=false}={}) {
  return async url=>{
    if(secondaryHTTP&&[SOURCES.summary,SOURCES.weekly].includes(url))return new Response('',{status:503});
    const bodies={[SOURCES.metadata]:JSON.stringify(f.metadata),[SOURCES.table1]:f.table1,[SOURCES.table2]:f.table2,[SOURCES.summary]:f.summary,[SOURCES.weekly]:f.landing,[SOURCES.schedule]:f.schedule,[SOURCES.prices]:daily};
    return new Response(bodies[url]??'',{status:bodies[url]===undefined?503:200});
  };
}
test('production collector + three external signals VERIFY_ONLY during source lag: READY, model never contacted',async()=>{
  const f=current();f.summary=old().summary;f.landing=old().landing;
  const pack=externalPackage(f.checkedAt);pack.signals=Array.from({length:3},(_,i)=>({...pack.signals[0],eventKey:`synthetic-release-event-${i}`,sourceUrl:i===2?null:pack.signals[0].sourceUrl}));
  const collect=options=>collectEvidence({...options,fetchImpl:sourceFetch(f)});
  const result=await runManualBridge({intakeType:'CHATGPT_SIGNAL_PACKAGE',signalPackage:JSON.stringify(pack),mode:'VERIFY_ONLY',clock:()=>new Date(f.checkedAt),collect,providerOptions:{fetchImpl:()=>assert.fail('MODEL_FORBIDDEN')}});
  assert.equal(result.status,'READY_FOR_REFORECAST',JSON.stringify(result));assert.equal(result.coreEvidenceGate,'PASS');assert.equal(result.qwenCalled,false);assert.equal(result.currentForecastUpdated,false);assert.deepEqual(result.inputShape,{signals:6,newsDocuments:0,externalAnalystSignals:3});
});
test('real collector tolerates secondary HTTP failure while broken primary still blocks core',async()=>{
  const f=current(),options={now:new Date(f.checkedAt),coreOnly:true};
  const good=await collectEvidence({...options,fetchImpl:sourceFetch(f,{secondaryHTTP:true})});assert.equal(good.gate.gate,'PASS');assert.ok(good.pack.weeklyRelease.diagnostics.some(d=>d.code==='SUMMARY_UNAVAILABLE'));
  f.table1=f.table1.replace('"Distillate Fuel Oil"','"UNKNOWN"');const bad=await collectEvidence({...options,fetchImpl:sourceFetch(f)});
  assert.equal(coreEvidenceGate(bad.pack,options).gate,'FAIL');assert.ok(bad.pack.exclusions.some(e=>e.reason==='EIA_REQUIRED_FIELD_MISSING_OR_DUPLICATE'));assert.equal(bad.pack.signals.some(s=>s.id==='eia-stocks'),false);
});
