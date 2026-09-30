import { externalSignalsGate, evidenceEventKey, EXTERNAL_CATEGORIES } from './external-analyst-contract.js';
import { validDate, validTimestamp } from './validation.js';

export const INTELLIGENCE_V2_SOURCE = 'AYU_INTELLIGENCE_V2';
export const PROBABILITY_TYPE = 'AI_SUBJECTIVE_ESTIMATE';
export const CATEGORIES = EXTERNAL_CATEGORIES;
export const DAY = 86400000;
export const NEWS_INPUT_CONTRACT = 'NEWS_MATERIAL_V1';
export const NEWS_ASSESSMENT_CONTRACT = 'NEWS_ASSESSMENT_V2';
export const CORE_FORECAST_CONTRACT = 'CORE_FORECAST_V1';
export const coreMarketSignals = pack => (Array.isArray(pack?.signals)?pack.signals:[]).filter(s=>CATEGORIES.slice(0,3).includes(s?.category));
const text = value => typeof value === 'string' && value.trim().length > 0;
export const newsSegmentFor = (pack, evidenceId) => {
  for (const document of Array.isArray(pack?.newsDocuments)?pack.newsDocuments:[]) for (const segment of Array.isArray(document?.segments)?document.segments:[])
    if (segment && `${document.documentId}:${segment.segmentId}`===evidenceId) return {document,segment};
  return null;
};
export const newsNumbersGrounded = (copy, segment) => {
  const sourceNumbers=new Set([...segment.matchAll(/\d+(?:\.\d+)?/g)].map(match=>match[0]));
  return [...copy.matchAll(/\d+(?:\.\d+)?/g)].every(match=>sourceNumbers.has(match[0]));
};
export const conditionalNewsSegment = segment => /\b(?:may|might|could|would|expected|considering|plans?|if|potential|rumou?r|unconfirmed)\b/i.test(segment);
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
    const authority=signal.weeklyReleaseIdentity;
    // A newly fetched machine authority may still identify the preceding release.
    // Frozen pre-release snapshots cannot use this to cross their next release time.
    const recheckedLatest=authority?.sourceDataset==='EIA_WPSR_TABLES_1_2'&&authority.authoritySourceUrl==='https://ir.eia.gov/wpsr/psw00.json'&&authority.sourceKey==='WCESTUS1'&&
      authority.releaseDate===signal.releaseDate&&authority.periodEndDate===signal.eventDate&&validDate(authority.previousPeriodEndDate)&&
      Date.parse(signal.eventDate)-Date.parse(authority.previousPeriodEndDate)===7*DAY&&authority.authorityCheckedAt===signal.checkedAt&&Date.parse(signal.checkedAt)>=Date.parse(signal.nextReleaseAt);
    if (!validDate(signal.releaseDate) || signal.releaseDate !== signal.latestReleaseDate || signal.publishedAt.slice(0,10) !== signal.releaseDate || !validTimestamp(signal.nextReleaseAt) || Date.parse(signal.nextReleaseAt)<=Date.parse(signal.publishedAt) || (time >= Date.parse(signal.nextReleaseAt)&&!recheckedLatest) || time-Date.parse(signal.publishedAt) > 10*DAY) return 'STALE_EIA_RELEASE';
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

export function admittedNewsDocuments(pack) {
  const documents=[], errors=[], seen=new Set();
  if(pack?.newsDocuments?.length>6)errors.push('NEWS_DOCUMENT_TOO_MANY');
  for(const document of Array.isArray(pack?.newsDocuments)?pack.newsDocuments.slice(0,6):[]) {
    if(seen.has(document?.documentId)){errors.push('NEWS_DUPLICATE_DOCUMENT');continue;}
    seen.add(document?.documentId);
    const check=evidenceGate({...pack,signals:coreMarketSignals(pack),newsDocuments:[document],coverageMode:'NORMAL'},{now:new Date(pack.generatedAt)});
    if(check.gate==='PASS')documents.push(document);
    else errors.push(`NEWS_DOCUMENT_INVALID:${document?.documentId??'UNKNOWN'}`);
  }
  if(!Array.isArray(pack?.newsDocuments))errors.push('NEWS_DOCUMENT_SET_INVALID');
  return {documents,errors};
}

export function coreEvidenceGate(pack,{now=new Date()}={}) {
  if(pack?.inputContractVersion!==NEWS_INPUT_CONTRACT)return evidenceGate(pack,{now});
  const signals=coreMarketSignals(pack);
  const core=evidenceGate({...pack,signals,newsDocuments:[],coverageMode:'LIMITED'},{now});
  const admitted=admittedNewsDocuments(pack);
  const coverageMode=core.gate==='PASS'&&admitted.documents.length&&admitted.errors.length===0&&pack.coverageMode!=='LIMITED'?'NORMAL':core.gate==='PASS'?'LIMITED':'UNAVAILABLE';
  const sourceErrors=signals.filter(s=>s.sourceOrganization!=='EIA'||!publicUrl(s.sourceUrl)||!['www.eia.gov','ir.eia.gov'].includes(new URL(s.sourceUrl).hostname)).map(s=>`CORE_SOURCE_INVALID:${s.id}`);
  const errors=[...core.errors,...sourceErrors];
  for(const [name,category,unit] of [['NY_HARBOR_LOW_SULFUR_DIESEL','INTERNATIONAL_DIESEL','USD/gallon'],['Brent','CRUDE','USD/barrel'],['WTI','CRUDE','USD/barrel']])
    if(!signals.some(s=>s.category===category&&s.freshness==='MARKET_PRICE'&&s.observation?.name===name&&s.observation.unit===unit))errors.push(`CORE_MARKET_COVERAGE_INVALID:${name}`);
  return {...core,gate:errors.length?'FAIL':'PASS',status:errors.length?'UNAVAILABLE':'READY',dataValidity:errors.length?'INVALID':'VALID',errors,
    coverageMode:errors.length?'UNAVAILABLE':coverageMode,newsDocumentCount:admitted.documents.length,newsExclusions:admitted.errors,
    independentSourceCount:new Set([...signals.map(s=>s.sourceOrganization),...admitted.documents.map(d=>d.originalSource)].filter(Boolean)).size,
    independentEventCount:new Set((pack.signals??[]).map(s=>s?.eventKey)).size};
}

function strictForecastGate(candidate, pack, {now = new Date(),expectedEvidenceHash} = {}) {
  const errors = [];
  if (evidenceGate(pack,{now}).gate !== 'PASS') errors.push('EVIDENCE_GATE_FAILED');
  if (!candidate || candidate.source !== INTELLIGENCE_V2_SOURCE || candidate.status !== 'LIVE' || candidate.probabilityType !== PROBABILITY_TYPE || candidate.forecastHorizonDays !== 7 || !['MANUAL','QWEN','OPENAI','OTHER'].includes(candidate.provider)) errors.push('INVALID_FORECAST_CONTRACT');
  if (!validTimestamp(candidate?.generatedAt) || !validTimestamp(candidate?.validUntil) || Date.parse(candidate.validUntil)-Date.parse(candidate.generatedAt)!==DAY || Date.parse(candidate.generatedAt)<Date.parse(pack?.generatedAt) || Date.parse(candidate.generatedAt)>+new Date(now)) errors.push('INVALID_FORECAST_TIME');
  if (Date.parse(candidate?.validUntil)<=+new Date(now)) errors.push('FORECAST_EXPIRED');
  if (!/^[a-f0-9]{64}$/.test(candidate?.evidenceHash ?? '') || (expectedEvidenceHash && candidate.evidenceHash !== expectedEvidenceHash)) errors.push('EVIDENCE_HASH_MISMATCH');
  const newsContract=pack?.inputContractVersion===NEWS_INPUT_CONTRACT;
  if(newsContract && (candidate?.inputContractVersion!==NEWS_INPUT_CONTRACT || candidate?.coverageMode!==pack.coverageMode || !text(candidate?.promptVersion) || !/^[a-f0-9]{64}$/.test(candidate?.inputPackHash??''))) errors.push('INVALID_INPUT_IDENTITY');
  const newsV2=newsContract&&candidate?.newsAssessmentContract===NEWS_ASSESSMENT_CONTRACT;
  if(newsV2&&candidate.promptVersion!=='qwen-forecast-news-v2') errors.push('INVALID_NEWS_ASSESSMENT_VERSION');
  if(newsContract&&candidate?.promptVersion==='qwen-forecast-news-v2'&&!newsV2) errors.push('INVALID_NEWS_ASSESSMENT_VERSION');
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
      if(newsV2) {
        const selected=newsSegmentFor(pack,a?.evidenceId);
        if(!selected||!document||!segment||selected.document!==document||selected.segment!==segment||
          a.sourceUrl!==document.sourceUrl||a.publisher!==document.publisher||a.originalSource!==document.originalSource||a.publishedAt!==document.publishedAt||
          !['UP','DOWN','NEUTRAL'].includes(a.impact)||!['FACT','RISK','OUTLOOK','CLAIM'].includes(a.kind)||!['LOW','MEDIUM','HIGH'].includes(a.strength)||
          !text(a.title)||Array.from(a.title).length>24||!text(a.summary)||Array.from(a.summary).length>60||
          (a.kind==='FACT'&&conditionalNewsSegment(segment.text))||!newsNumbersGrounded(a.title+a.summary,segment.text)||
          Object.keys(a).sort().join(',')!=='documentId,evidenceId,impact,kind,originalSource,publishedAt,publisher,segmentId,sourceUrl,strength,summary,title')
          errors.push(`UNGROUNDED_NEWS_ASSESSMENT:${a?.evidenceId??'UNKNOWN'}`);
        continue;
      }
      if(!document||!segment||a.evidenceId!==`${a.documentId}:${a.segmentId}`||!['UP','DOWN','NEUTRAL'].includes(a.impact)||
        !['FACT','RISK','OUTLOOK','CLAIM'].includes(a.kind)||!['LOW','MEDIUM','HIGH'].includes(a.strength)||
        !text(a.title)||a.title.length>48||!text(a.summary)||a.summary.length>100||!text(a.quote)||a.quote.length>140||
        !segment.text.includes(a.quote)||Object.keys(a).sort().join(',')!=='documentId,evidenceId,impact,kind,quote,segmentId,strength,summary,title'||
        (a.kind==='FACT'&&/\b(?:may|might|could|would|expected|considering|plans?|if|potential|rumou?r|unconfirmed)\b/i.test(a.quote))||
        [...(a.title+a.summary).matchAll(/\d+(?:\.\d+)?%?/g)].some(m=>!a.quote.includes(m[0]))) errors.push(`UNGROUNDED_NEWS_ASSESSMENT:${a?.evidenceId??'UNKNOWN'}`);
    }
    if(!newsV2&&documents.size&&!news.length) errors.push('NEWS_NOT_ANALYZED');
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
  const allowed = ['source','status','probabilityType','forecastHorizonDays','provider','generatedAt','validUntil','evidenceHash','probabilities','primaryDirection','mainReasons','counterReasons','signalAssessments',...(newsContract?['inputContractVersion','promptVersion','inputPackHash','coverageMode','newsAssessments',...(newsV2?['newsAssessmentContract']:[])]:[])];
  if (candidate && Object.keys(candidate).some(key=>!allowed.includes(key))) errors.push('UNCONTRACTED_ANALYSIS_FIELD');
  return {gate:errors.length?'FAIL':'PASS',errors,checkedAt:new Date(now).toISOString(),evidenceHash:candidate?.evidenceHash ?? null};
}

export function coreForecastGate(candidate,pack,options={}) {
  if(candidate?.forecastContract!==CORE_FORECAST_CONTRACT)return strictForecastGate(candidate,pack,options);
  const signals=coreMarketSignals(pack), byId=new Map(signals.map(s=>[s.id,s]));
  const structural=items=>(Array.isArray(items)?items:[]).filter(ref=>byId.has(ref?.evidenceId));
  const main=structural(candidate.mainReasons), counter=structural(candidate.counterReasons);
  const normalized={...candidate,coverageMode:'LIMITED',promptVersion:'qwen-forecast-news-v2',newsAssessments:[],mainReasons:main,counterReasons:counter};
  delete normalized.forecastContract;
  const corePack={...pack,signals,newsDocuments:[],coverageMode:'LIMITED'};
  const result=strictForecastGate(normalized,corePack,options), errors=[...result.errors];
  const external=externalSignalsGate(pack,{now:options.now}), externalById=new Map(external.signals.map(s=>[s.evidenceId,s]));
  errors.push(...external.errors);
  const promptVersion=external.signals.length?'qwen-forecast-external-v1':'qwen-forecast-core-v1';
  if(candidate.promptVersion!==promptVersion||!['NORMAL','LIMITED'].includes(candidate.coverageMode)||candidate.newsAssessmentContract!==NEWS_ASSESSMENT_CONTRACT)errors.push('INVALID_CORE_CONTRACT_VERSION');
  const allowed=['source','status','probabilityType','forecastHorizonDays','provider','generatedAt','validUntil','evidenceHash','probabilities','primaryDirection','mainReasons','counterReasons','signalAssessments','inputContractVersion','newsAssessmentContract','promptVersion','inputPackHash','coverageMode','newsAssessments','forecastContract'];
  if(Object.keys(candidate).some(key=>!allowed.includes(key)))errors.push('UNCONTRACTED_ANALYSIS_FIELD');
  for(const reasons of [candidate.mainReasons,candidate.counterReasons]) {
    if(!Array.isArray(reasons)){errors.push('INVALID_REASON_COUNT');continue;}
    if(reasons.some(ref=>!byId.has(ref?.evidenceId)&&!externalById.has(ref?.evidenceId)&&!/^br-\d+:/.test(ref?.evidenceId??'')))errors.push('UNKNOWN_MARKET_REASON');
    const events=structural(reasons).map(ref=>byId.get(ref.evidenceId)?.eventKey);
    if(new Set(events).size!==events.length)errors.push('DUPLICATE_MARKET_REASON_EVENT');
  }
  const allReasons=[...(Array.isArray(candidate.mainReasons)?candidate.mainReasons:[]),...(Array.isArray(candidate.counterReasons)?candidate.counterReasons:[])];
  for(const [items,opposite]of [[candidate.mainReasons,false],[candidate.counterReasons,true]])for(const ref of Array.isArray(items)?items:[]) {
    const signal=externalById.get(ref?.evidenceId);if(!signal)continue;
    if(Object.keys(ref).sort().join(',')!=='evidenceId,text'||ref.text!==signal.title||signal.direction==='NEUTRAL'||(signal.direction===candidate.primaryDirection)===opposite)errors.push('UNGROUNDED_EXTERNAL_REASON');
    if(allReasons.filter(r=>evidenceEventKey(pack,r.evidenceId)===signal.eventKey).length>1)errors.push('DUPLICATE_REASON_EVENT');
  }
  if(allReasons.length>5||candidate.mainReasons?.length>3||candidate.counterReasons?.length>2)errors.push('INVALID_REASON_COUNT');
  if(external.signals.some(s=>s.direction!==candidate.primaryDirection&&s.direction!=='NEUTRAL')&&!candidate.counterReasons?.length)errors.push('COUNTER_EVIDENCE_IGNORED');
  if(coreEvidenceGate(pack,{now:options.now}).gate!=='PASS')errors.push('CORE_EVIDENCE_GATE_FAILED');
  return {...result,gate:errors.length?'FAIL':'PASS',errors};
}

export function newsEnrichmentGate(input,pack,{mode='MODEL'}={}) {
  const admitted=admittedNewsDocuments(pack), externalEvents=new Set((pack.externalAnalystSignals??[]).map(s=>s.eventKey)), documents=new Set(admitted.documents.filter(d=>!externalEvents.has(d.eventKey)).map(d=>d.documentId));
  const errors=[...admitted.errors], diagnostics=[], accepted=[], seenDocuments=new Set();
  const reject=(code,assessmentIndex,fieldName)=>{errors.push(code);diagnostics.push({validationCode:code,assessmentIndex,fieldName});};
  const items=Array.isArray(input?.newsAssessments)?input.newsAssessments:[];
  if(!Array.isArray(input?.newsAssessments))errors.push('NEWS_ASSESSMENTS_INVALID');
  if(items.length>3)errors.push('NEWS_ASSESSMENT_TOO_MANY');
  const modelKeys='evidenceId,impact,kind,strength,summary,title';
  const forecastKeys='documentId,evidenceId,impact,kind,originalSource,publishedAt,publisher,segmentId,sourceUrl,strength,summary,title';
  for(const [index,item] of items.slice(0,3).entries()) {
    if(!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).sort().join(',')!==(mode==='FORECAST'?forecastKeys:modelKeys)){reject('NEWS_ASSESSMENT_FIELDS_INVALID',index,'fields');continue;}
    const selected=newsSegmentFor(pack,item.evidenceId), document=selected?.document, segment=selected?.segment;
    if(!selected||!documents.has(document.documentId)){reject('NEWS_EVIDENCE_ID_UNKNOWN',index,'evidenceId');continue;}
    if(seenDocuments.has(document.documentId)){reject('NEWS_DUPLICATE_DOCUMENT',index,'evidenceId');continue;}
    if(mode==='FORECAST'&&(item.documentId!==document.documentId||item.segmentId!==segment.segmentId||item.sourceUrl!==document.sourceUrl||item.publisher!==document.publisher||item.originalSource!==document.originalSource||item.publishedAt!==document.publishedAt)){reject('NEWS_SOURCE_IDENTITY_INVALID',index,'sourceIdentity');continue;}
    if(!['UP','DOWN','NEUTRAL'].includes(item.impact)||!['FACT','RISK','OUTLOOK','CLAIM'].includes(item.kind)||!['LOW','MEDIUM','HIGH'].includes(item.strength)){reject('NEWS_ASSESSMENT_ENUM_INVALID',index,'impact/kind/strength');continue;}
    if(!text(item.title)||Array.from(item.title).length>24||!/[\u3400-\u9fff]/.test(item.title)){reject('NEWS_TITLE_INVALID',index,'title');continue;}
    if(!text(item.summary)||Array.from(item.summary).length>60||!/[\u3400-\u9fff]/.test(item.summary)){reject('NEWS_SUMMARY_INVALID',index,'summary');continue;}
    const numberField=['title','summary'].find(field=>!newsNumbersGrounded(item[field],segment.text));
    if(numberField){reject('NEWS_NEW_NUMBER',index,numberField);continue;}
    if(item.kind==='FACT'&&conditionalNewsSegment(segment.text)){reject('NEWS_FACT_FROM_CONDITIONAL_SEGMENT',index,'kind');continue;}
    seenDocuments.add(document.documentId);
    accepted.push({evidenceId:item.evidenceId,impact:item.impact,kind:item.kind,title:item.title,summary:item.summary,strength:item.strength,
      documentId:document.documentId,segmentId:segment.segmentId,sourceUrl:document.sourceUrl,publisher:document.publisher,originalSource:document.originalSource,publishedAt:document.publishedAt});
  }
  const byId=new Map(accepted.map(item=>[item.evidenceId,item])), primary=input?.primaryDirection??(input?.probabilities?primaryDirectionFor(input.probabilities):null), seenReasons=new Set();
  const reasonIds=(modelKey,forecastKey)=>(Array.isArray(input?.[modelKey])?input[modelKey]:Array.isArray(input?.[forecastKey])?input[forecastKey].map(ref=>ref?.evidenceId):[]).filter(id=>typeof id==='string'&&id.includes(':'));
  const select=(modelKey,forecastKey,opposite)=>{
    const coreIds=new Set([...coreMarketSignals(pack).map(s=>s.id),...(pack.externalAnalystSignals??[]).map(s=>s.evidenceId)]);
    const raw=Array.isArray(input?.[modelKey])?input[modelKey]:Array.isArray(input?.[forecastKey])?input[forecastKey].map(ref=>ref?.evidenceId):[];
    let room=(opposite?2:3)-raw.filter(id=>coreIds.has(id)).length;
    return reasonIds(modelKey,forecastKey).filter(id=>{
    const item=byId.get(id);
    if(!item){errors.push('NEWS_REASON_NOT_ASSESSED');return false;}
    if(mode==='FORECAST') {
      const ref=input[forecastKey].find(r=>r?.evidenceId===id);
      if(Object.keys(ref).sort().join(',')!=='documentId,evidenceId,segmentId,text'||ref.documentId!==item.documentId||ref.segmentId!==item.segmentId||ref.text!==item.title){errors.push('NEWS_REASON_IDENTITY_INVALID');return false;}
    }
    if(seenReasons.has(item.documentId)){errors.push('NEWS_REASON_DUPLICATE_EVENT');return false;}
    if(item.impact==='NEUTRAL'||(item.impact===primary)===opposite){errors.push('NEWS_REASON_DIRECTION_INVALID');return false;}
    if(room<=0){errors.push('NEWS_REASON_TOO_MANY');return false;}
    room--;
    seenReasons.add(item.documentId);return true;
    });
  };
  const mainReasonEvidenceIds=select('mainReasonEvidenceIds','mainReasons',false);
  const counterReasonEvidenceIds=select('counterReasonEvidenceIds','counterReasons',true);
  return {gate:errors.length?'FAIL':'PASS',errors,diagnostics,newsAssessments:accepted,mainReasonEvidenceIds,counterReasonEvidenceIds,
    coverageMode:errors.length||!admitted.documents.length||pack.coverageMode==='LIMITED'||input?.coverageMode==='LIMITED'?'LIMITED':'NORMAL'};
}

export const forecastGate=coreForecastGate;

export function validateForecastCache(cache, {now = new Date()} = {}) {
  if (cache?.status==='UNAVAILABLE') return unavailableForecast(cache.reason ?? 'EVIDENCE_UNAVAILABLE');
  if (!cache?.evidencePack) return unavailableForecast('MISSING_EVIDENCE_PACK');
  const stale=validTimestamp(cache.validUntil) && +new Date(now)>=Date.parse(cache.validUntil);
  const {evidencePack,...candidate} = cache;
  // Display expired judgments only if the unchanged production gate passed at generation time.
  if (stale && candidate.status==='STALE') candidate.status='LIVE';
  try {
    const gate = forecastGate(candidate,evidencePack,{now:stale?new Date(candidate.generatedAt):now});
    return gate.gate==='PASS' ? (stale?{...cache,status:'STALE'}:cache) : unavailableForecast(gate.errors.join(','));
  } catch { return unavailableForecast('INVALID_FORECAST_CACHE'); }
}
