import { createHash } from 'node:crypto';
import { validDate,validTimestamp } from '../dist/data/validation.js';
import { DAY,freshTime,safeReason,unavailableIntelligence,validateIntelligenceCache } from '../dist/data/intelligence-contract.js';
export const hashText=text=>createHash('sha256').update(text).digest('hex');
export const REVIEW_CHECKS=['realSources','realDates','sourcesOpened','factVsComment','conflictsHandled','noAddedFacts','reasonsSupported','counterEvidence','conclusionConsistent','notHeadlineDriven'];
const categories=['MARKET','OPEC_POLICY','SUPPLY','INVENTORY','MACRO','CHINA_ADJUSTMENT'];
const list=value=>Array.isArray(value)?value:[];
const https=value=>{try {const u=new URL(value);return u.protocol==='https:' && !u.username && !u.password;} catch {return false;}};
const dated=(value,now)=>(validDate(value)||validTimestamp(value)) && Date.parse(value)<=+now;

// Conservative weekday calendar, not an exchange holiday calendar.
export function recentMarketDates(now) {
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
  const day=new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00Z`);
  if (+parts.hour<18) day.setUTCDate(day.getUTCDate()-1);
  const dates=[];
  while (dates.length<2) {if (![0,6].includes(day.getUTCDay())) dates.push(day.toISOString().slice(0,10));day.setUTCDate(day.getUTCDate()-1);}
  return dates;
}

export function reviewIntelligence({evidence:e,analysis:a,sourceReview:r,humanReview:h,evidenceHash,analysisHash,now=new Date()}) {
  const evidenceIssues=[],analysisIssues=[],humanIssues=[];
  const add=(condition,issue)=>{if (!condition) evidenceIssues.push(issue);};
  const sources=list(e?.sources),signals=list(e?.signals),sourceById=new Map(sources.map(s=>[s.id,s]));
  add(e?.schemaVersion==='AYU_EVIDENCE_V1' && e?.forecastHorizonDays===7 && freshTime(e?.generatedAt,now),'PACK_INVALID_OR_STALE');
  add(sources.length>0 && sources.length===sourceById.size,'SOURCE_IDS_INVALID');
  add(r?.evidenceHash===evidenceHash && freshTime(r?.reviewedAt,now),'SOURCE_REVIEW_UNBOUND_OR_STALE');
  for (const s of sources) {
    const checked=list(r?.sourceChecks).find(x=>x.sourceId===s.id);
    add(https(s.sourceUrl) && !!s.sourceName && !!s.originalPublisher && [1,2,3,4].includes(s.tier) && dated(s.publishedAt,now) && freshTime(s.checkedAt,now) && s.readStatus==='OPENED' && checked?.status==='OPENED' && checked.url===s.sourceUrl,`SOURCE_UNVERIFIED:${s.id}`);
  }
  for (const category of categories) {
    const check=list(e?.categoryChecks).find(c=>c.category===category);
    add(check && freshTime(check.checkedAt,now) && ['CHECKED','CHECKED_NO_SIGNAL'].includes(check.status) && list(check.sourceIds).length>0 && check.sourceIds.every(id=>sourceById.has(id)),`CATEGORY_UNCHECKED:${category}`);
  }
  add(!list(r?.criticalConflicts).length && list(e?.conflicts).every(c=>c.severity==='QUARANTINED_SECONDARY' && c.usedInAnalysis===false),'UNRESOLVED_CRITICAL_CONFLICT');
  const marketDates=recentMarketDates(now);
  const markets=['brent','wti'].map(k=>e?.market?.[k]).filter(m=>m && typeof m.value==='number' && Number.isFinite(m.value) && m.value>0 && marketDates.includes(m.date) && m.unit==='USD/barrel' && !!m.basis && sourceById.get(m.sourceId)?.tier<=3 && ['UP','DOWN','NEUTRAL'].includes(m.recentDirection));
  add(markets.length>0,'NO_FRESH_MARKET');
  const china=e?.china,chinaSource=sourceById.get(china?.latestAdjustment?.sourceId);
  add(chinaSource?.tier===1 && dated(china?.latestAdjustment?.date,now) && china.latestAdjustment.date===chinaSource.publishedAt?.slice(0,10) && freshTime(china?.latestVerifiedAt,now) && china?.source===chinaSource.sourceUrl,'CHINA_LATEST_UNVERIFIED');
  const inv=e?.inventory;
  const inventoryFresh=dated(inv?.latestReleaseDate,now) && validDate(inv?.observationWeek) && inv.observationWeek<=inv.latestReleaseDate && validDate(inv?.nextReleaseDate) && Date.parse(inv.nextReleaseDate)>+now && freshTime(inv?.verifiedAt,now) && https(inv?.releaseIndexUrl);
  const expires=new Map();
  add(new Set(signals.map(s=>s.id)).size===signals.length,'DUPLICATE_SIGNAL');
  for (const s of signals) {
    const src=sourceById.get(s.sourceId);
    add(src && src.sourceName===s.sourceName && src.sourceUrl===s.sourceUrl && src.publishedAt===s.publishedAt && src.tier<=2 && dated(s.eventDate,now) && Date.parse(s.eventDate)<=Date.parse(s.publishedAt) && safeReason(s.displayText) && ['UP','DOWN','NEUTRAL'].includes(s.directionImpact) && ['FACT','REPORTED_FACT','RISK','OUTLOOK'].includes(s.claimKind) && ['PRIMARY','SECONDARY'].includes(s.importance) && s.impactIsInference===true,`SIGNAL_UNVERIFIED:${s.id}`);
    let end=0;
    if (s.category==='MARKET' && markets.some(m=>m.sourceId===s.sourceId && m.date===s.eventDate)) end=Date.parse(e?.generatedAt)+DAY;
    if (s.category==='SUPPLY' && dated(s.eventDate,now)) end=Date.parse(s.eventDate)+3*DAY;
    if (s.category==='MACRO' && dated(s.eventDate,now)) end=Date.parse(s.eventDate)+7*DAY;
    if (s.category==='OPEC_POLICY' && validDate(s.effectiveUntil) && freshTime(s.currentPolicyVerifiedAt,now)) end=Date.parse(s.effectiveUntil);
    if (s.category==='INVENTORY' && inventoryFresh && s.releaseDate===inv.latestReleaseDate && s.eventDate===inv.observationWeek && s.publishedAt.slice(0,10)===s.releaseDate) end=Date.parse(inv.nextReleaseDate);
    if (s.category==='CHINA_ADJUSTMENT' && s.sourceId===china?.latestAdjustment?.sourceId && freshTime(china?.latestVerifiedAt,now)) end=Date.parse(china.latestVerifiedAt)+DAY;
    if (end>+now) expires.set(s.id,end);
  }
  const fresh=signals.filter(s=>expires.has(s.id));
  const supply=fresh.filter(s=>['SUPPLY','INVENTORY','OPEC_POLICY'].includes(s.category));
  add(new Set(supply.map(s=>sourceById.get(s.sourceId)?.originalPublisher)).size>=2,'INSUFFICIENT_INDEPENDENT_SUPPLY');
  if (markets.length===1) add(['SUPPLY','INVENTORY','OPEC_POLICY'].every(c=>fresh.some(s=>s.category===c)),'SINGLE_MARKET_NEEDS_MORE_EVIDENCE');
  const hasUp=fresh.some(s=>s.importance==='PRIMARY' && s.directionImpact==='UP');
  const hasDown=fresh.some(s=>s.importance==='PRIMARY' && s.directionImpact==='DOWN');
  const mixedPrimary=hasUp && hasDown;
  const allowed=['status','source','generatedAt','horizonDays','direction','label','reasons','counterSignals','evidenceUpdatedAt','method','evidenceHash','reasonRefs','counterSignalRefs','assessments','conclusionBasis'];
  if (!a || Object.keys(a).some(k=>!allowed.includes(k)) || a.status!=='CANDIDATE' || a.evidenceHash!==evidenceHash || a.evidenceUpdatedAt!==e?.generatedAt) analysisIssues.push('ANALYSIS_UNBOUND_OR_EXTRA_FIELDS');
  const refs=[...list(a?.reasonRefs),...list(a?.counterSignalRefs)];
  for (const [textKey,refKey] of [['reasons','reasonRefs'],['counterSignals','counterSignalRefs']]) {
    const texts=list(a?.[textKey]),ids=list(a?.[refKey]);
    if (!texts.length || texts.length!==ids.length || texts.some((text,i)=>!fresh.some(s=>s.id===ids[i] && s.displayText===text))) analysisIssues.push(`UNGROUNDED_${textKey.toUpperCase()}`);
  }
  if (new Set(refs).size!==refs.length) analysisIssues.push('DUPLICATE_REASON');
  const assessments=list(a?.assessments);
  if (assessments.length!==signals.length || new Set(assessments.map(s=>s.evidenceId)).size!==signals.length || assessments.some(x=>!signals.some(s=>s.id===x.evidenceId && s.directionImpact===x.directionImpact && s.claimKind===x.claimKind) || Object.keys(x).some(k=>!['evidenceId','directionImpact','claimKind'].includes(k)))) analysisIssues.push('ASSESSMENTS_UNGROUNDED');
  const reasonDirections=signals.filter(s=>list(a?.reasonRefs).includes(s.id)).map(s=>s.directionImpact);
  const counters=signals.filter(s=>list(a?.counterSignalRefs).includes(s.id)).map(s=>s.directionImpact);
  if (mixedPrimary && (a?.direction!=='SIDEWAYS' || a?.conclusionBasis!=='MIXED_PRIMARY_SIGNALS')) analysisIssues.push('PRIMARY_CONFLICT_REQUIRES_SIDEWAYS');
  if (!mixedPrimary && !['PRIMARY_UP','PRIMARY_DOWN','BALANCED_EVIDENCE'].includes(a?.conclusionBasis)) analysisIssues.push('CONCLUSION_BASIS_INVALID');
  if (a?.direction==='SIDEWAYS' ? !(hasUp && hasDown && reasonDirections.includes('UP') && reasonDirections.includes('DOWN')) : !reasonDirections.includes(a?.direction) || !counters.includes(a?.direction==='UP'?'DOWN':'UP')) analysisIssues.push('DIRECTION_OR_COUNTER_UNSUPPORTED');
  const validUntil=new Date(Math.min((Date.parse(e?.generatedAt)||0)+DAY,...fresh.map(s=>expires.get(s.id)),...refs.map(id=>expires.get(id)||0))).toISOString();
  // A projection is review material until the separate HUMAN gate approves both hashes.
  const projection={status:'LIVE',source:a?.source,generatedAt:a?.generatedAt,horizonDays:a?.horizonDays,direction:a?.direction,label:a?.label,reasons:a?.reasons,counterSignals:a?.counterSignals,evidenceUpdatedAt:a?.evidenceUpdatedAt,method:a?.method,validUntil};
  if (validateIntelligenceCache(projection,{now}).status!=='LIVE') analysisIssues.push('FORECAST_CONTRACT_INVALID');
  if (h?.status!=='APPROVED' || h?.kind!=='HUMAN') humanIssues.push('HUMAN_REVIEW_PENDING');
  else if (!h.reviewer || !freshTime(h.reviewedAt,now) || Date.parse(h.reviewedAt)<Date.parse(a?.generatedAt) || h.evidenceHash!==evidenceHash || h.analysisHash!==analysisHash || REVIEW_CHECKS.some(k=>h.checks?.[k]!==true)) humanIssues.push('HUMAN_REVIEW_INVALID_OR_UNBOUND');
  const issues=[...evidenceIssues,...analysisIssues,...humanIssues];
  return {gate:issues.length?'FAIL':'PASS',evidenceGate:evidenceIssues.length?'FAIL':'PASS',groundingGate:analysisIssues.length?'FAIL':'PASS',humanReviewGate:humanIssues.length?'PENDING_OR_FAIL':'PASS',issues,evidenceIssues,analysisIssues,humanIssues,evidenceHash,analysisHash,checkedAt:now.toISOString(),freshSignalIds:fresh.map(s=>s.id),excludedSignalIds:signals.filter(s=>!expires.has(s.id)).map(s=>s.id),mixedPrimary,validUntil,forecast:issues.length?unavailableIntelligence(evidenceIssues.length?'INSUFFICIENT_OR_STALE_EVIDENCE':analysisIssues.length?'ANALYSIS_REVIEW_FAILED':humanIssues[0]):projection};
}
