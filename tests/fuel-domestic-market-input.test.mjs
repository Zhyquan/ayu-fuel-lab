import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { loadReplayFixture } from '../scripts/intelligence-v2/replay.mjs';
import { domesticFixture } from './fixtures/domestic-fuel-fixtures.mjs';
import { buildFreshDomesticInput, loadFreshDomesticInput, recheckDomesticSources } from '../scripts/fuel-domestic-test-input.mjs';
import { projectDomesticInput, domesticInputGate } from '../scripts/intelligence-v2/domestic-fuel.mjs';
import { coreEvidenceGate } from '../dist/data/intelligence-v2-contract.js';

// Constructed counterexamples, not the unsaved original SCF request.
async function fixture() {
  const f=await loadReplayFixture(),now=new Date(f.now),domestic=await domesticFixture('CASE_DOWN_DOMESTIC',{now});
  return {pack:structuredClone(f.pack),now,verified:{policy:domestic.input.policy,adjustmentWindow:domestic.input.adjustmentWindow,
    domesticEvidence:domestic.input.evidence.filter(e=>e.role==='DOMESTIC_PRICING_SIGNAL')}};
}

test('the existing valid market pack yields the unchanged domestic target and input contract',async()=>{
  const f=await fixture(),before=projectDomesticInput({...f,...f.verified,evidenceProof:'REAL_VERIFIED_EVIDENCE'});
  const after=buildFreshDomesticInput(f);
  assert.deepEqual(after,before);assert.equal(domesticInputGate(after,{now:f.now}).gate,'PASS');
  assert.equal(after.target,'CHINA_DOMESTIC_REFINED_OIL_ADJUSTMENT');
  assert.equal(after.evidence.some(e=>e.role==='INTERNATIONAL_PRICE_INPUT'&&e.directionScope!=='INPUT_ONLY'),false);
});

for(const [name,mutate]of [
  ['missing diesel',p=>{p.signals=p.signals.filter(s=>s.id!=='market-diesel');}],
  ['missing Brent',p=>{p.signals=p.signals.filter(s=>s.id!=='market-brent');}],
  ['missing WTI',p=>{p.signals=p.signals.filter(s=>s.id!=='market-wti');}],
  ['missing inventory',p=>{p.signals=p.signals.filter(s=>s.id!=='eia-stocks');}],
  ['malformed price',p=>{p.signals.find(s=>s.id==='market-diesel').observation.price=null;}],
  ['wrong diesel unit',p=>{p.signals.find(s=>s.id==='market-diesel').observation.unit='元/升';}],
  ['expired observation',p=>{p.signals.find(s=>s.id==='market-diesel').eventDate='2026-09-20';}],
  ['future check',p=>{p.signals[0].checkedAt='2099-01-01T00:00:00Z';}],
  ['untrusted source',p=>{p.signals[0].sourceUrl='https://example.com/forged';}],
  ['empty evidence',p=>{p.signals=[];}],
  ['critical conflict',p=>{p.conflicts=[{severity:'MAJOR'}];}],
])test(`a ${name} reject preserves the exact original invariant without relaxing the Gate`,async()=>{
  const f=await fixture();mutate(f.pack);const expected=coreEvidenceGate(f.pack,{now:f.now});
  assert.equal(expected.gate,'FAIL');
  assert.throws(()=>projectDomesticInput({...f,...f.verified,evidenceProof:'REAL_VERIFIED_EVIDENCE'}),/^Error: DOMESTIC_MARKET_INPUT_INVALID$/);
  assert.throws(()=>buildFreshDomesticInput(f),error=>{
    assert.equal(error.code,'DOMESTIC_MARKET_INPUT_INVALID');
    assert.equal(error.validationStage,'DOMESTIC_MARKET_INPUT');
    assert.equal(error.validationSubtype,expected.errors[0]);assert.deepEqual(error.gateErrors,expected.errors);
    return true;
  });
});

test('the production fetch path retains its actual rejected pack before projection or any model request',async()=>{
  const f=await fixture(),body='synthetic verified policy',digest=x=>createHash('sha256').update(x).digest('hex');
  const seed={sources:[{sourceId:'official',sourceUrl:'https://www.ndrc.gov.cn/synthetic',kind:'FROZEN_OFFICIAL_RECEIPT',contentHash:digest(body)}],
    ...f.verified,policySourceIds:['official'],windowSourceIds:['official']};
  let audit=null;const urls=[];
  await assert.rejects(()=>loadFreshDomesticInput(seed,{now:()=>f.now,fetchImpl:async url=>{
    urls.push(url);return new Response(url.includes('ndrc.gov.cn')?body:'unparseable synthetic response');
  },onMarketInput:async value=>{audit=value;}}),error=>{
    assert.equal(error.code,'DOMESTIC_MARKET_INPUT_INVALID');
    assert.deepEqual(error.gateErrors,audit.gate.errors);return true;
  });
  assert.equal(audit.gate.gate,'FAIL');assert.equal(audit.pack.signals.length,0);
  assert(audit.pack.exclusions.some(e=>e.reason==='MARKET_PARSE_FAILED'));
  assert(audit.pack.fetchLog.some(f=>f.status==='OK'&&/^[a-f0-9]{64}$/.test(f.bodySha256)));
  assert.equal(audit.validatedAt,f.now.toISOString());
  assert.equal(urls.some(url=>url.includes('dashscope')),false);
});

// Synthetic calendar-shaped bytes reproduce the verified UI-date-only change;
// they are not a historical calendar body or a new official source.
async function calendarFixture() {
  const f=await fixture(),now=new Date('2026-10-12T01:00:00.000Z');
  const old='data:{cadendarList:["https://cx.sinopecsales.com/yjkqiantai/oilImages/202610.png"],toDay:"2026\\u5E7410\\u670811\\u65E5"};当日24时';
  const next=old.replace('670811','670812'),digest=x=>createHash('sha256').update(x).digest('hex');
  const source={sourceId:'calendar',sourceUrl:'https://cx.sinopecsales.com/yjkqiantai/core/toCalendar',kind:'FROZEN_OFFICIAL_RECEIPT',contentHash:digest(old),frozenUiDay:'2026-10-11'};
  const image={sourceId:'calendar-image',sourceUrl:'https://cx.sinopecsales.com/yjkqiantai/oilImages/202610.png',kind:'FROZEN_OFFICIAL_RECEIPT',contentHash:digest('synthetic image')};
  const seed={...f.verified,sources:[source,image],policySourceIds:['calendar'],windowSourceIds:['calendar','calendar-image']};
  const fetchImpl=async url=>new Response(url===source.sourceUrl?next:'synthetic image');
  return {seed,old,next,now,fetchImpl,digest};
}

test('only the current Beijing-day calendar widget may change while all window bytes and image hash remain bound',async()=>{
  const f=await calendarFixture(),r=await recheckDomesticSources(f.seed,{fetchImpl:f.fetchImpl,now:()=>f.now});
  assert.equal(r.receipts[0].contentHash,f.digest(f.next));assert.equal(r.receipts[0].frozenContentHash,f.digest(f.old));
  assert.equal(r.receipts[0].uiOnlyChange,true);assert.equal(r.adjustmentWindow.nextAdjustmentAt,f.seed.adjustmentWindow.nextAdjustmentAt);
  assert.equal(r.adjustmentWindow.publishedAt,f.seed.adjustmentWindow.publishedAt);assert.equal(r.adjustmentWindow.contentHash,f.seed.adjustmentWindow.contentHash);
});

for(const [name,mutate]of [
  ['changed image URL',s=>s.replace('202610.png','202611.png')],
  ['changed adjustment-time text',s=>s.replace('当日24时','当日18时')],
  ['duplicate widget',s=>s+',toDay:"2026\\u5E7410\\u670812\\u65E5"'],
  ['future UI day',s=>s.replace('670812','670813')],
  ['malformed widget',s=>s.replace('toDay:','unknownDay:')],
])test(`calendar ${name} remains rejected rather than bypassing the frozen source`,async()=>{
  const f=await calendarFixture();
  await assert.rejects(()=>recheckDomesticSources(f.seed,{now:()=>f.now,fetchImpl:async()=>new Response(mutate(f.next))}),/FUEL_TEST_OFFICIAL_SOURCE_CHANGED/);
});

test('calendar exception cannot apply to another source or permit changed image bytes',async()=>{
  const f=await calendarFixture();f.seed.sources[0].sourceUrl='https://www.ndrc.gov.cn/synthetic';
  await assert.rejects(()=>recheckDomesticSources(f.seed,{now:()=>f.now,fetchImpl:async()=>new Response(f.next)}),/FUEL_TEST_OFFICIAL_SOURCE_CHANGED/);
  const image=await calendarFixture();
  await assert.rejects(()=>recheckDomesticSources(image.seed,{now:()=>image.now,fetchImpl:async url=>new Response(url===image.seed.sources[0].sourceUrl?image.next:'changed image')}),/FUEL_TEST_OFFICIAL_SOURCE_CHANGED/);
});
