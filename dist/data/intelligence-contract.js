import { validTimestamp } from './validation.js';
export const INTELLIGENCE_SOURCE='AYU_INTELLIGENCE_V1';
export const METHOD='STRUCTURED_INTELLIGENCE_V1';
export const labels={UP:'偏上涨',SIDEWAYS:'震荡',DOWN:'偏下跌'};
export const DAY=86400000;
export const freshTime=(value,now,maxAge=DAY)=>validTimestamp(value) && Date.parse(value)<=+now && +now-Date.parse(value)<maxAge;
export const unavailableIntelligence=reason=>({status:'UNAVAILABLE',source:INTELLIGENCE_SOURCE,reason});
const fields=['status','source','generatedAt','horizonDays','direction','label','reasons','counterSignals','evidenceUpdatedAt','method','validUntil'];
export const safeReason=text=>typeof text==='string' && text.length>0 && text.length<=40 && !/[<>%\d]|概率|置信|可信度|准确率|(?:预测|预计).*元|元[／/]吨|confidence|futures|wti|brent|basis|spread|curve|backwardation/i.test(text);

export function validateIntelligenceCache(cache,{now=new Date()}={}) {
  const bad=()=>unavailableIntelligence('INVALID_OR_EXPIRED_INTELLIGENCE');
  if (!cache || cache.status!=='LIVE' || Object.keys(cache).some(k=>!fields.includes(k))) return bad();
  if (cache.source!==INTELLIGENCE_SOURCE || cache.method!==METHOD || cache.horizonDays!==7 || !Object.hasOwn(labels,cache.direction) || cache.label!==labels[cache.direction]) return bad();
  if (!freshTime(cache.generatedAt,now) || !freshTime(cache.evidenceUpdatedAt,now) || Date.parse(cache.generatedAt)<Date.parse(cache.evidenceUpdatedAt)) return bad();
  if (!validTimestamp(cache.validUntil) || Date.parse(cache.validUntil)<=+now || Date.parse(cache.validUntil)>Date.parse(cache.evidenceUpdatedAt)+DAY) return bad();
  if (!Array.isArray(cache.reasons) || !Array.isArray(cache.counterSignals) || !cache.reasons.length || cache.reasons.length>3 || !cache.counterSignals.length || cache.counterSignals.length>2) return bad();
  const texts=[...cache.reasons,...cache.counterSignals];
  if (!texts.every(safeReason) || new Set(texts).size!==texts.length) return bad();
  return cache;
}
