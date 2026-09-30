import { validDate, validTimestamp } from './validation.js';

export const INTELLIGENCE_V2_SOURCE = 'AYU_INTELLIGENCE_V2';
export const PROBABILITY_TYPE = 'AI_SUBJECTIVE_ESTIMATE';
export const CATEGORIES = ['INTERNATIONAL_DIESEL','CRUDE','DISTILLATE_FUNDAMENTALS','OPEC_MAJOR_PRODUCERS','SUPPLY_DISRUPTION','SHIPPING','DEMAND_MACRO'];
export const DAY = 86400000;
export const NEWS_INPUT_CONTRACT = 'NEWS_MATERIAL_V1';
const text = value => typeof value === 'string' && value.trim().length > 0;
export const publicUrl = value => {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash; }
  catch { return false; }
};
export const canonicalJson = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key,item[key]])) : item);
export const unavailableForecast = reason => ({source:INTELLIGENCE_V2_SOURCE,status:'UNAVAILABLE',reason,probabilities:null,primaryDirection:null});

// Normalize provider estimates explicitly. The quality gate never repairs bad input.
export function normalizeAiEstimateTo5PercentSteps(value) {
  const keys = ['DOWN','FLAT','UP'];
  if (!value || keys.some(key => !Number.isFinite(value[key]) || value[key] < 0)) throw new Error('INVALID_ESTIMATE');
  const total = keys.reduce((sum,key) => sum + value[key],0);
  if (!total) throw new Error('EMPTY_ESTIMATE');
  const target = keys.map(key => value[key] * 100 / total);
  let best, distance = Infinity;
  for (let down = 5; down <= 90; down += 5) for (let flat = 5; flat <= 90; flat += 5) {
    const up = 100 - down - flat;
    if (up < 5 || up > 90) continue;
    const score = [down,flat,up].reduce((sum,n,i) => sum + (n-target[i])**2,0);
    if (score < distance) { distance = score; best = {DOWN:down,FLAT:flat,UP:up}; }
  }
  return best;
}
export const primaryDirectionFor = p => p.UP > p.DOWN ? 'UP' : 'DOWN';

// A limited publication-lag calendar, not a futures model or exchange calendar.
const holidays2026 = new Set(['2026-01-01','2026-01-19','2026-02-16','2026-04-03','2026-04-06','2026-05-04','2026-05-25','2026-06-19','2026-07-03','2026-08-31','2026-09-07','2026-10-12','2026-11-11','2026-11-26','2026-12-25','2026-12-28']);
const priorDate = date => new Date(Date.parse(date)-DAY).toISOString().slice(0,10);
const workingDay = date => ![0,6].includes(new Date(date).getUTCDay()) && !holidays2026.has(date);
export function marketObservationLag(date, now = new Date()) {
  if (!validDate(date) || date.slice(0,4) !== '2026') return Infinity;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date(now)).map(p => [p.type,p.value]));
  let expected = `${parts.year}-${parts.month}-${parts.day}`;
  if (parts.year !== '2026') return Infinity;
  if (Number(parts.hour) < 18) expected = priorDate(expected);
  while (!workingDay(expected)) expected = priorDate(expected);
  if (date > expected || !workingDay(date)) return Infinity;
  let lag = 0;
  while (expected > date && lag <= 2) { expected = priorDate(expected); if (workingDay(expected)) lag++; }
  return lag;
}

export function signalFailure(signal, now = new Date()) {
  const time = +new Date(now);
  if (!signal || !text(signal.id) || !text(signal.eventKey) || !CATEGORIES.includes(signal.category)) return 'INVALID_SIGNAL';
  if (!publicUrl(signal.sourceUrl)) return 'MISSING_OR_UNSAFE_SOURCE_URL';
  if (!text(signal.sourceName) || !text(signal.sourceOrganization) || !text(signal.headline) || !text(signal.fact) || !text(signal.displayText)) return 'MISSING_FACT';
  if (signal.displayText.length > 50 || !['UP','DOWN','NEUTRAL'].includes(signal.impact) || !['LOW','MEDIUM','HIGH'].includes(signal.importance) || !['FACT','RISK','OUTLOOK','CLAIM'].includes(signal.kind) || ![1,2,3].includes(signal.sourceTier) || signal.verified !== true) return 'UNVERIFIED_SIGNAL';
  if (!validTimestamp(signal.publishedAt) || !validTimestamp(signal.checkedAt) || !validDate(signal.eventDate) || Date.parse(signal.publishedAt) > time || Date.parse(signal.checkedAt) > time || time-Date.parse(signal.checkedAt) >= DAY || Date.parse(signal.eventDate) > time) return 'INVALID_SIGNAL_DATE';
  if (signal.freshness === 'MARKET_PRICE') {
    if (marketObservationLag(signal.eventDate,now) > 1 || !Number.isFinite(signal.observation?.price) || signal.observation.price <= 0 || !Number.isFinite(signal.observation?.change1dPercent)) return 'STALE_MARKET_PRICE';
  } else if (signal.freshness === 'EIA_RELEASE') {
    if (!validDate(signal.releaseDate) || signal.releaseDate !== signal.latestReleaseDate || signal.publishedAt.slice(0,10) !== signal.releaseDate || !validTimestamp(signal.nextReleaseAt) || time >= Date.parse(signal.nextReleaseAt) || time-Date.parse(signal.publishedAt) > 10*DAY) return 'STALE_EIA_RELEASE';
  } else if (signal.freshness === 'CURRENT_POLICY') {
    if (!validTimestamp(signal.policyValidUntil) || time >= Date.parse(signal.policyValidUntil)) return 'EXPIRED_POLICY';
  } else if (signal.freshness === 'BREAKING_72H') {
    // Event time, not a syndication or modified date, determines news freshness.
    if (!validTimestamp(signal.eventAt) || signal.eventAt.slice(0,10) !== signal.eventDate || Date.parse(signal.eventAt) > time || time-Date.parse(signal.eventAt) > 72*3600000) return 'EXPIRED_NEWS';
  } else return 'UNKNOWN_FRESHNESS_RULE';
  return null;
}

export function filterAndDeduplicateSignals(signals, now = new Date()) {
  const accepted = [], excluded = [], groups = new Map();
  for (const signal of signals) {
    const reason = signalFailure(signal,now);
    if (reason) { excluded.push({id:signal?.id ?? null,reason}); continue; }
    // One event may contain several measurements; repeat reports of the same fact add no signal.
    const key = `${signal.eventKey}:${signal.measurementKey ?? signal.category}`;
    const existing = groups.get(key);
    if (existing) {
      existing.verificationSources ??= [];
      existing.verificationSources.push({sourceName:signal.sourceName,sourceUrl:signal.sourceUrl,publishedAt:signal.publishedAt});
      excluded.push({id:signal.id,reason:'DUPLICATE_EVENT',retainedId:existing.id});
    } else { const copy = structuredClone(signal); groups.set(key,copy); accepted.push(copy); }
  }
  return {signals:accepted,excluded,independentEventCount:new Set(accepted.map(s=>s.eventKey)).size};
}

export function evidenceGate(pack, {now = new Date()} = {}) {
  const errors = [];
  if(pack?.inputContractVersion!==undefined&&pack.inputContractVersion!==NEWS_INPUT_CONTRACT) errors.push('UNKNOWN_INPUT_CONTRACT');
  if (!pack || pack.forecastHorizonDays !== 7 || !validTimestamp(pack.generatedAt) || +new Date(now)-Date.parse(pack.generatedAt) >= DAY || Date.parse(pack.generatedAt)>+new Date(now)) errors.push('INVALID_OR_EXPIRED_PACK');
  const signals = Array.isArray(pack?.signals) ? pack.signals : [];
  if (signals.length < 5 || signals.length > 12) errors.push('INSUFFICIENT_OR_EXCESS_EVIDENCE');
  const checked = pack?.categoryChecks;
  if (!Array.isArray(checked) || checked.length !== 7 || CATEGORIES.some(c => checked.filter(item=>item?.category===c).length !== 1) || checked.some(c=>!c || !['VERIFIED','NO_QUALIFIED_SIGNAL','FAILED'].includes(c.status) || !text(c.reason) || !validTimestamp(c.checkedAt) || !Array.isArray(c.sourceUrls) || !c.sourceUrls.length || c.sourceUrls.some(url=>!publicUrl(url)))) errors.push('CATEGORY_CHECK_MISSING');
  for (const signal of signals) { const error = signalFailure(signal,now); if (error) errors.push(`${signal?.id ?? 'UNKNOWN'}:${error}`); }
  if (new Set(signals.map(s=>s?.id)).size !== signals.length || new Set(signals.map(s=>`${s?.eventKey}:${s?.measurementKey ?? s?.category}`)).size !== signals.length) errors.push('DUPLICATE_EVIDENCE');
  for (const category of CATEGORIES.slice(0,3)) if (!signals.some(s=>s?.category===category && s.kind==='FACT')) errors.push(`CORE_CATEGORY_MISSING:${category}`);
  if (!signals.some(s=>s?.category==='CRUDE' && s.observation?.name==='Brent') || !signals.some(s=>s?.category==='CRUDE' && s.observation?.name==='WTI')) errors.push('CRUDE_COVERAGE_MISSING');
  if (pack?.inputContractVersion===NEWS_INPUT_CONTRACT && !signals.some(s=>s?.id==='eia-stocks' && s.category==='DISTILLATE_FUNDAMENTALS')) errors.push('DISTILLATE_STOCKS_MISSING');
  if (!pack?.recentMarketContext || !['AVAILABLE','STALE','UNAVAILABLE'].includes(pack.recentMarketContext.status)) errors.push('RECENT_DIRECTION_NOT_CHECKED');
  const documents=pack?.inputContractVersion===NEWS_INPUT_CONTRACT?pack.newsDocuments:[];
  if (pack?.inputContractVersion===NEWS_INPUT_CONTRACT) {
    if(!Array.isArray(documents)||documents.length>6||new Set(documents.map(d=>d?.documentId)).size!==documents.length) errors.push('INVALID_NEWS_DOCUMENT_SET');
    for(const d of Array.isArray(documents)?documents:[]) {
      if(!d || !/^br-\d+$/.test(d.documentId??'') || !/^https:\/\/www\.brecorder\.com\/news\/\d+(?:\/[^?#]*)?$/.test(d.sourceUrl??'') || d.documentId!==`br-${d.sourceUrl?.match(/\/news\/(\d+)/)?.[1]}` ||
        d.publisher!=='Business Recorder'||!text(d.authorName)||!['Reuters','Business Recorder'].includes(d.originalSource)||(d.originalSource==='Reuters'&&!d.authorName.split(', ').includes('Reuters'))||!validTimestamp(d.publishedAt)||
        !validTimestamp(d.fetchedAt)||!['DATE_ONLY','SECOND'].includes(d.publishedAtPrecision)||Date.parse(d.publishedAt)>Date.parse(d.fetchedAt)||
        Date.parse(d.fetchedAt)>+new Date(now)||+new Date(now)-Date.parse(d.fetchedAt)>=DAY||Date.parse(d.fetchedAt)-Date.parse(d.publishedAt)>72*3600000||
        !/^[a-f0-9]{64}$/.test(d.articleContentHash??'')||!Array.isArray(d.segments)||!d.segments.length||d.segments.length>3||
        new Set(d.segments.map(s=>s?.segmentId)).size!==d.segments.length||d.segments.some(s=>!/^s\d+-[a-f0-9]{12}$/.test(s?.segmentId??'')||!text(s?.text)||s.text.length<30||s.text.length>240||/^(?:READ MORE|RELATED|ADVERTISEMENT|SPONSORED)/i.test(s.text))) errors.push(`INVALID_NEWS_DOCUMENT:${d?.documentId??'UNKNOWN'}`);
    }
    if(pack.coverageMode!==(documents?.length?'NORMAL':'LIMITED')) errors.push('COVERAGE_MODE_MISMATCH');
  } else if (new Set(signals.map(s=>s?.sourceOrganization).filter(Boolean)).size < 2) errors.push('SOURCE_DIVERSITY_INSUFFICIENT');
  if (Array.isArray(pack?.conflicts) && pack.conflicts.some(c=>c.severity==='MAJOR')) errors.push('MAJOR_SOURCE_CONFLICT');
  const coverageMode=errors.length?'UNAVAILABLE':pack?.inputContractVersion===NEWS_INPUT_CONTRACT?pack.coverageMode:'NORMAL';
  return {gate:errors.length?'FAIL':'PASS',status:errors.length?'UNAVAILABLE':'READY',dataValidity:errors.length?'INVALID':'VALID',coverageMode,errors,signalCount:signals.length,newsDocumentCount:Array.isArray(documents)?documents.length:0,independentSourceCount:new Set([...signals.map(s=>s?.sourceOrganization),...(Array.isArray(documents)?documents.map(d=>d?.originalSource):[])].filter(Boolean)).size,independentEventCount:new Set(signals.map(s=>s?.eventKey).filter(Boolean)).size,checkedAt:new Date(now).toISOString()};
}

export function forecastGate(candidate, pack, {now = new Date(),expectedEvidenceHash} = {}) {
  const errors = [];
  if (evidenceGate(pack,{now}).gate !== 'PASS') errors.push('EVIDENCE_GATE_FAILED');
  if (!candidate || candidate.source !== INTELLIGENCE_V2_SOURCE || candidate.status !== 'LIVE' || candidate.probabilityType !== PROBABILITY_TYPE || candidate.forecastHorizonDays !== 7 || !['MANUAL','QWEN','OPENAI','OTHER'].includes(candidate.provider)) errors.push('INVALID_FORECAST_CONTRACT');
  if (!validTimestamp(candidate?.generatedAt) || !validTimestamp(candidate?.validUntil) || Date.parse(candidate.validUntil)-Date.parse(candidate.generatedAt)!==DAY || Date.parse(candidate.generatedAt)<Date.parse(pack?.generatedAt) || Date.parse(candidate.generatedAt)>+new Date(now)) errors.push('INVALID_FORECAST_TIME');
  if (Date.parse(candidate?.validUntil)<=+new Date(now)) errors.push('FORECAST_EXPIRED');
  if (!/^[a-f0-9]{64}$/.test(candidate?.evidenceHash ?? '') || (expectedEvidenceHash && candidate.evidenceHash !== expectedEvidenceHash)) errors.push('EVIDENCE_HASH_MISMATCH');
  const newsContract=pack?.inputContractVersion===NEWS_INPUT_CONTRACT;
  if(newsContract && (candidate?.inputContractVersion!==NEWS_INPUT_CONTRACT || candidate?.coverageMode!==pack.coverageMode || !text(candidate?.promptVersion) || !/^[a-f0-9]{64}$/.test(candidate?.inputPackHash??''))) errors.push('INVALID_INPUT_IDENTITY');
  const p = candidate?.probabilities;
  if (!p || Object.keys(p).sort().join(',')!=='DOWN,FLAT,UP' || ['DOWN','FLAT','UP'].some(key=>!Number.isFinite(p[key]) || p[key]%5!==0 || p[key]<5 || p[key]>90) || p.DOWN+p.FLAT+p.UP!==100) errors.push('INVALID_PROBABILITIES');
  if (!['UP','DOWN'].includes(candidate?.primaryDirection) || (p && candidate.primaryDirection!==primaryDirectionFor(p))) errors.push('INVALID_PRIMARY_DIRECTION');
  const signals = Array.isArray(pack?.signals) ? pack.signals : [];
  const byId = new Map(signals.filter(Boolean).map(s=>[s.id,s]));
  const documents=new Map((Array.isArray(pack?.newsDocuments)?pack.newsDocuments:[]).map(d=>[d.documentId,d]));
  const news=Array.isArray(candidate?.newsAssessments)?candidate.newsAssessments:[];
  if(newsContract) {
    if(!Array.isArray(candidate?.newsAssessments)||news.length>3||new Set(news.map(a=>a?.documentId)).size!==news.length) errors.push('INVALID_NEWS_ASSESSMENTS');
    for(const a of news) {
      const document=documents.get(a?.documentId), segment=document?.segments.find(s=>s.segmentId===a.segmentId);
      if(!document||!segment||a.evidenceId!==`${a.documentId}:${a.segmentId}`||!['UP','DOWN','NEUTRAL'].includes(a.impact)||
        !['FACT','RISK','OUTLOOK','CLAIM'].includes(a.kind)||!['LOW','MEDIUM','HIGH'].includes(a.strength)||
        !text(a.title)||a.title.length>48||!text(a.summary)||a.summary.length>100||!text(a.quote)||a.quote.length>140||
        !segment.text.includes(a.quote)||Object.keys(a).sort().join(',')!=='documentId,evidenceId,impact,kind,quote,segmentId,strength,summary,title'||
        (a.kind==='FACT'&&/\b(?:may|might|could|would|expected|considering|plans?|if|potential|rumou?r|unconfirmed)\b/i.test(a.quote))||
        [...(a.title+a.summary).matchAll(/\d+(?:\.\d+)?%?/g)].some(m=>!a.quote.includes(m[0]))) errors.push(`UNGROUNDED_NEWS_ASSESSMENT:${a?.evidenceId??'UNKNOWN'}`);
    }
    if(documents.size && !news.length) errors.push('NEWS_NOT_ANALYZED');
  }
  const newsById=new Map(news.map(a=>[a.evidenceId,a]));
  const main = candidate?.mainReasons, counter = candidate?.counterReasons;
  if (!Array.isArray(main) || !main.length || main.length>3 || !Array.isArray(counter) || counter.length>2) errors.push('INVALID_REASON_COUNT');
  for (const [items,opposite] of [[main,false],[counter,true]]) for (const reason of Array.isArray(items)?items:[]) {
    const signal = byId.get(reason?.evidenceId), article=newsContract?newsById.get(reason?.evidenceId):null;
    if(signal) {
      if(Object.keys(reason).sort().join(',')!=='evidenceId,text' || reason.text!==signal.displayText || signal.impact==='NEUTRAL' || (signal.impact===candidate.primaryDirection)===opposite) errors.push('UNGROUNDED_REASON');
    } else if(!article || Object.keys(reason).sort().join(',')!=='documentId,evidenceId,segmentId,text' || reason.documentId!==article.documentId || reason.segmentId!==article.segmentId || reason.text!==article.title || article.impact==='NEUTRAL' || (article.impact===candidate.primaryDirection)===opposite) errors.push('UNGROUNDED_NEWS_REASON');
  }
  const reasonIds=[...(Array.isArray(main)?main:[]),...(Array.isArray(counter)?counter:[])].map(r=>r?.evidenceId);
  if(new Set(reasonIds).size!==reasonIds.length || new Set(reasonIds.filter(id=>newsById.has(id)).map(id=>newsById.get(id).documentId)).size!==reasonIds.filter(id=>newsById.has(id)).length) errors.push('DUPLICATE_REASON_EVENT');
  const analysis = candidate?.signalAssessments;
  if (!Array.isArray(analysis) || analysis.length!==byId.size || new Set(analysis.map(a=>a?.evidenceId)).size!==byId.size) errors.push('INCOMPLETE_SIGNAL_ASSESSMENT');
  for (const a of Array.isArray(analysis)?analysis:[]) {
    if (!a) { errors.push('UNGROUNDED_ANALYSIS'); continue; }
    const signal = byId.get(a.evidenceId);
    if (!signal || Object.keys(a).sort().join(',')!=='evidenceId,impact,kind,strength' || a.impact!==signal.impact || a.kind!==signal.kind || !['LOW','MEDIUM','HIGH'].includes(a.strength)) errors.push('UNGROUNDED_ANALYSIS');
  }
  if ([...signals,...news].some(s=>s && s.impact!==candidate?.primaryDirection && s.impact!=='NEUTRAL') && !counter?.length) errors.push('COUNTER_EVIDENCE_IGNORED');
  const allowed = ['source','status','probabilityType','forecastHorizonDays','provider','generatedAt','validUntil','evidenceHash','probabilities','primaryDirection','mainReasons','counterReasons','signalAssessments',...(newsContract?['inputContractVersion','promptVersion','inputPackHash','coverageMode','newsAssessments']:[])];
  if (candidate && Object.keys(candidate).some(key=>!allowed.includes(key))) errors.push('UNCONTRACTED_ANALYSIS_FIELD');
  return {gate:errors.length?'FAIL':'PASS',errors,checkedAt:new Date(now).toISOString(),evidenceHash:candidate?.evidenceHash ?? null};
}

export function validateForecastCache(cache, {now = new Date()} = {}) {
  if (cache?.status==='STALE') return { ...unavailableForecast('FORECAST_EXPIRED'),status:'STALE' };
  if (cache?.status==='UNAVAILABLE') return unavailableForecast(cache.reason ?? 'EVIDENCE_UNAVAILABLE');
  if (validTimestamp(cache?.validUntil) && +new Date(now)>=Date.parse(cache.validUntil)) return { ...unavailableForecast('FORECAST_EXPIRED'),status:'STALE' };
  if (!cache?.evidencePack) return unavailableForecast('MISSING_EVIDENCE_PACK');
  const {evidencePack,...candidate} = cache;
  const gate = forecastGate(candidate,evidencePack,{now});
  return gate.gate==='PASS' ? cache : unavailableForecast(gate.errors.join(','));
}
