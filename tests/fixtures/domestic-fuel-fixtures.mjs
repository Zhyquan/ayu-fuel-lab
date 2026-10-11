import { loadReplayFixture } from '../../scripts/intelligence-v2/replay.mjs';
import { projectDomesticInput } from '../../scripts/intelligence-v2/domestic-fuel.mjs';
import { marketObservationLag } from '../../dist/data/intelligence-v2-contract.js';
import { evidenceHashFor } from '../../scripts/intelligence-v2/history.mjs';
import { DOMESTIC_FUEL_TARGET, DOMESTIC_FUEL_HORIZON } from '../../dist/data/domestic-fuel-contract.js';

export const DOMESTIC_FIXTURE_NAMES=['CASE_UP_DOMESTIC','CASE_DOWN_DOMESTIC','CASE_HOLD','CASE_INTERNATIONAL_ONLY'];
export const DOMESTIC_FIXTURE_NOW='2026-10-11T03:00:00.000Z';
const day=86400000;

// All values/receipts here are invented. Public URLs identify source types, never live proof.
export async function domesticFixture(name,{now=new Date(DOMESTIC_FIXTURE_NOW)}={}) {
  if(!DOMESTIC_FIXTURE_NAMES.includes(name))throw new Error('DOMESTIC_FIXTURE_UNKNOWN');
  const original=await loadReplayFixture(),pack=structuredClone(original.pack),checkedAt=new Date(now).toISOString();
  const date=Array.from({length:10},(_,i)=>new Date(+now-i*day).toISOString().slice(0,10)).find(d=>marketObservationLag(d,now)===0);
  pack.generatedAt=checkedAt;pack.newsDocuments=[];pack.coverageMode='LIMITED';
  for(const check of pack.categoryChecks)check.checkedAt=checkedAt;
  const internationalDirection=name==='CASE_UP_DOMESTIC'?'DOWN':'UP';
  for(const s of pack.signals) {
    s.checkedAt=checkedAt;s.fact=`Synthetic semantic fixture. ${s.fact}`;
    if(s.freshness==='MARKET_PRICE') {s.eventDate=date;s.publishedAt=new Date(+now-3600000).toISOString();s.impact=internationalDirection;s.observation.change1dPercent=internationalDirection==='UP'?8:-8;}
    if(s.freshness==='EIA_RELEASE') {s.publishedAt=new Date(+now-2*day).toISOString();s.releaseDate=s.publishedAt.slice(0,10);s.latestReleaseDate=s.releaseDate;s.eventDate=new Date(+now-7*day).toISOString().slice(0,10);s.nextReleaseAt=new Date(+now+5*day).toISOString();}
  }
  const receipt=(evidenceId,sourceUrl)=>({evidenceId,sourceName:'NDRC',sourceUrl,publishedAt:new Date(+now-day).toISOString(),checkedAt,contentHash:evidenceHashFor({name,evidenceId,proof:'SYNTHETIC'}),verified:true});
  const policy={...receipt('synthetic-domestic-policy','https://www.ndrc.gov.cn/xxgk/zcfb/tz/201601/t20160113_963566_ext.html'),cycleWorkingDays:10,minAdjustmentYuanPerTonne:50,floorUsdPerBarrel:40,ceilingUsdPerBarrel:130,temporaryControl:'NONE_CONFIRMED'};
  const adjustmentWindow={...receipt('synthetic-domestic-window','https://cx.sinopecsales.com/yjkqiantai/core/toCalendar'),sourceName:'Sinopec',windowId:'synthetic-window',pricingWindowStartAt:new Date(+now-10*day).toISOString(),pricingWindowEndAt:new Date(+now+3*day).toISOString(),nextAdjustmentAt:new Date(+now+3*day+3600000).toISOString()};
  const direction=name==='CASE_UP_DOMESTIC'?'UP':name==='CASE_DOWN_DOMESTIC'?'DOWN':'HOLD_OR_NO_ADJUSTMENT';
  const domesticEvidence=name==='CASE_INTERNATIONAL_ONLY'?[]:[{...receipt('synthetic-domestic-pricing','https://www.ndrc.gov.cn/synthetic-semantic-fixture'),eventKey:'synthetic-window-pricing',role:'DOMESTIC_PRICING_SIGNAL',direction,directionScope:'DOMESTIC_ADJUSTMENT',strength:'HIGH',freshness:'CURRENT',relevance:'DIRECT',kind:'ESTIMATE',windowId:adjustmentWindow.windowId,
    text:direction==='UP'?'合成测试：本次国内计价窗口的人民币调价估计汽油上调240元、柴油上调230元，均超过50元门槛。':direction==='DOWN'?'合成测试：本次国内计价窗口的人民币调价估计汽油下调240元、柴油下调230元，均超过50元门槛。':'合成测试：本次国内计价窗口汽油预计上涨20元、柴油预计上涨15元，均低于50元调价门槛，支持维持或不调整。'}];
  const input=projectDomesticInput({pack,policy:name==='CASE_INTERNATIONAL_ONLY'?null:policy,adjustmentWindow:name==='CASE_INTERNATIONAL_ONLY'?null:adjustmentWindow,domesticEvidence,evidenceProof:'SYNTHETIC_SEMANTIC_TEST',now});
  const probabilities=direction==='UP'?{UP:70,DOWN:10,FLAT:20}:direction==='DOWN'?{UP:10,DOWN:70,FLAT:20}:{UP:10,DOWN:10,FLAT:80};
  const analysis={target:DOMESTIC_FUEL_TARGET,horizon:DOMESTIC_FUEL_HORIZON,probabilities,confidence:'MEDIUM',reason:direction==='UP'?'国内窗口定价证据支持上调，国际回落不能替代国内调价判断。':direction==='DOWN'?'国内窗口定价证据支持下调，国际上涨不等于国内必然上调。':'国内窗口预估变化低于调价门槛，支持未来七天维持或不调整。',primaryEvidenceIds:['synthetic-domestic-pricing']};
  return {name,input,analysis,now:new Date(now),proof:'SYNTHETIC_SEMANTIC_TEST_NOT_PUBLICATION'};
}
