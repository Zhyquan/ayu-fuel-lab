import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { CATEGORIES, coreEvidenceGate, filterAndDeduplicateSignals, marketObservationLag } from '../../dist/data/intelligence-v2-contract.js';
import { newsCandidatePriority } from './news-event-rules.mjs';
import { resolveNewsUrl, deduplicateNewsDocuments } from './source-adapters.mjs';
import { WEEKLY_SOURCES, parseWeeklyMachineRelease } from './eia-weekly.mjs';
export { verifyNewsArticle, NEWS_EVENT_RULES } from './news-event-rules.mjs';

export const SOURCES = {
  prices:'https://www.eia.gov/todayinenergy/prices.php',
  ...WEEKLY_SOURCES,
  recent:'https://fred.stlouisfed.org/graph/fredgraph.csv?id=DCOILBRENTEU,DCOILWTICO,DDFUELNYH',
  opec:'https://www.opec.org/press-releases.html',
  gdelt:'https://api.gdeltproject.org/api/v2/doc/doc',
  rss:'https://www.brecorder.com/feeds/latest-news',
  sitemap:'https://www.brecorder.com/feeds/sitemap',
};
const sha = value => createHash('sha256').update(value).digest('hex');
const clean = s => s.replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&#(?:0*39|x27);/g,"'").replace(/&quot;/g,'"').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();
const dateOnly = s => { const n = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(s ?? '') ? s : `${s} UTC`); if (!Number.isFinite(n)) throw new Error('SOURCE_DATE_NOT_PARSED'); return new Date(n).toISOString().slice(0,10); };
const iso = s => new Date(s).toISOString();
const sign = value => value>0?'UP':value<0?'DOWN':'NEUTRAL';
const verb = direction => direction==='UP'?'上涨':direction==='DOWN'?'回落':'持平';
export function parseDailyPrices(html, checkedAt) {
  const table = html.match(/<table[^>]*summary="Spot Petroleum Prices"[^>]*>([\s\S]*?)<\/table>/)?.[1];
  const date = table?.match(/Wholesale Spot Petroleum Prices,\s*(\d{1,2}\/\d{1,2}\/\d{2}) Close/)?.[1];
  const published = html.match(/(?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, 2026/)?.[0];
  if (!date || !published) throw new Error('DAILY_PRICE_LAYOUT_CHANGED');
  const eventDate = dateOnly(date), publishedAt = `${dateOnly(published)}T00:00:00.000Z`;
  const signals = []; let product = '';
  for (const match of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)) {
    const row = match[1], group = row.match(/<td class="s1"[^>]*>([\s\S]*?)<\/td>/)?.[1];
    if (group) product = clean(group);
    const area = row.match(/<td class="s2"[^>]*>([\s\S]*?)<\/td>/)?.[1];
    const price = row.match(/<td class="d1"[^>]*>([\s\S]*?)<\/td>/)?.[1];
    const change = row.match(/<td class="(?:up|dn|nc|nochange)"[^>]*>([\s\S]*?)<\/td>/)?.[1];
    const name = clean(area ?? '');
    if (!(product.startsWith('Crude Oil') && ['Brent','WTI'].includes(name)) && !(product.startsWith('Low-Sulfur Diesel') && name==='NY Harbor')) continue;
    const number = Number(clean(price ?? 'NA')), change1dPercent = Number(clean(change ?? 'NA'));
    if (!Number.isFinite(number) || number<=0 || !Number.isFinite(change1dPercent)) throw new Error('DAILY_PRICE_MISSING');
    const diesel = product.startsWith('Low-Sulfur Diesel'), label = diesel?'纽约港低硫柴油':name;
    const impact = sign(change1dPercent), unit = diesel?'USD/gallon':'USD/barrel';
    signals.push({id:diesel?'market-diesel':`market-${name.toLowerCase()}`,category:diesel?'INTERNATIONAL_DIESEL':'CRUDE',eventKey:`daily-spot-${eventDate}`,measurementKey:label,
      headline:`${label}最新日度报价${verb(impact)}`,fact:`${eventDate} 收盘：${label} ${number} ${unit}，日变化 ${change1dPercent}%。`,displayText:`${label}最新日度报价${verb(impact)}`,
      impact,importance:diesel?'HIGH':'MEDIUM',kind:'FACT',eventDate,publishedAt,publishedAtPrecision:'DATE_ONLY',checkedAt,sourceName:'EIA Daily Prices / Refinitiv',sourceOrganization:'EIA',sourceUrl:SOURCES.prices,sourceTier:1,verified:true,freshness:'MARKET_PRICE',observation:{name:diesel?'NY_HARBOR_LOW_SULFUR_DIESEL':name,price:number,unit,change1dPercent},provenanceNote:'EIA publishes Refinitiv spot observations with permission; not a futures quote. The page gives a publication date, not an exact time; 00:00Z is a date anchor only.'});
  }
  if (signals.length!==3) throw new Error('CORE_MARKET_SERIES_MISSING');
  return signals;
}

export function parseRecentContext(csv, now) {
  const lines = csv.trim().split(/\r?\n/), header = lines.shift().split(','), keys = ['DCOILBRENTEU','DCOILWTICO','DDFUELNYH'];
  const rows = lines.map(line=>line.split(',')).filter(row=>row[0]<=new Date(now).toISOString().slice(0,10) && keys.every(key=>row[header.indexOf(key)] && Number.isFinite(Number(row[header.indexOf(key)])))).slice(-8);
  if (rows.length<5) throw new Error('RECENT_CONTEXT_INSUFFICIENT');
  const first = rows[0], last = rows.at(-1);
  return {status:marketObservationLag(last[0],now)>1?'STALE':'AVAILABLE',asOf:last[0],windowStart:first[0],role:'CONTEXT_ONLY_NO_CURRENT_SIGNAL_WEIGHT',reason:'FRED publication lag is explicit; these observations do not replace the latest price snapshot.',series:keys.map(key=>({name:key,firstPrice:Number(first[header.indexOf(key)]),lastPrice:Number(last[header.indexOf(key)]),direction:sign(Number(last[header.indexOf(key)])-Number(first[header.indexOf(key)])),sourceUrl:`https://fred.stlouisfed.org/series/${key}`}))};
}

export function parseRssCandidates(xml) {
  return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/g)].slice(0,30).map(match=>{
    const field = name=>clean(match[1].match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`))?.[1]?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/,'$1') ?? '');
    return {headline:field('title'),url:field('link'),discoveredAt:field('pubDate'),discoverySource:'Business Recorder RSS'};
  });
}

export function parseNewsSitemap(xml) {
  return [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(match=>{
    const field=name=>clean(match[1].match(new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`))?.[1]?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/,'$1') ?? '');
    return {headline:field('news:title'),url:field('loc'),discoveredAt:field('news:publication_date'),discoverySource:'Business Recorder news sitemap'};
  }).filter(candidate=>candidate.headline && candidate.url.startsWith('https://www.brecorder.com/news/')).slice(0,200);
}

export async function collectEvidence({fetchImpl=fetch,now=new Date(),timeoutMs=15000,coreOnly=false}={}) {
  const generatedAt=iso(now), signals=[], newsDocuments=[], exclusions=[], fetchLog=[], candidates=[];
  const get = async (url) => {
    try {
      const response=await fetchImpl(url,{headers:{'User-Agent':'AyuFuelLabEvidence/2.0 (https://github.com/Zhyquan/ayu-fuel-lab)'},signal:AbortSignal.timeout(timeoutMs)});
      if (!response.ok) throw new Error(`HTTP_${response.status}`);
      if(url.startsWith('https://www.brecorder.com/news/')&&response.url&&response.url!==url) throw new Error('ARTICLE_REDIRECTED');
      if (Number(response.headers.get('content-length'))>1000000) throw new Error('SOURCE_TOO_LARGE');
      let body=''; const decoder=new TextDecoder();
      for await (const chunk of response.body) { body+=decoder.decode(chunk,{stream:true}); if (body.length>1000000) throw new Error('SOURCE_TOO_LARGE'); }
      body+=decoder.decode();
      fetchLog.push({url:url.startsWith(SOURCES.gdelt)?SOURCES.gdelt:url,status:'OK',checkedAt:generatedAt,bodySha256:sha(body),bytes:Buffer.byteLength(body)});
      return body;
    } catch(error) { fetchLog.push({url:url.startsWith(SOURCES.gdelt)?SOURCES.gdelt:url,status:'FAILED',checkedAt:generatedAt,reason:/^(?:HTTP_\d+|SOURCE_TOO_LARGE|ARTICLE_REDIRECTED)$/.test(error.message)?error.message:error.name==='TimeoutError'?'TIMEOUT':'FETCH_FAILED'}); throw error; }
  };
  try { signals.push(...parseDailyPrices(await get(SOURCES.prices),generatedAt)); } catch { exclusions.push({source:'EIA_DAILY',reason:fetchLog.some(f=>f.url===SOURCES.prices&&f.status==='FAILED')?'MARKET_FETCH_FAILED':'MARKET_PARSE_FAILED'}); }
  let weeklyRelease;
  try {
    const metadata=JSON.parse(await get(SOURCES.metadata)),table1=await get(SOURCES.table1),table2=await get(SOURCES.table2),schedule=await get(SOURCES.schedule);
    const summary=await get(SOURCES.summary).catch(()=>null),landing=await get(SOURCES.weekly).catch(()=>null);
    const parsed=parseWeeklyMachineRelease({metadata,table1,table2,schedule,summary,landing,checkedAt:generatedAt});
    signals.push(...parsed.signals);weeklyRelease={status:'AVAILABLE',identity:parsed.identity,diagnostics:parsed.diagnostics};
  } catch(error) {
    const reason=fetchLog.some(f=>[SOURCES.metadata,SOURCES.table1,SOURCES.table2,SOURCES.schedule].includes(f.url)&&f.status==='FAILED')?'WEEKLY_FETCH_FAILED':/^[A-Z0-9_]+$/.test(error.message)?error.message:'WEEKLY_PARSE_FAILED';
    weeklyRelease={status:'FAILED',reason};exclusions.push({source:'EIA_WEEKLY',reason});
  }
  let recentMarketContext;
  try { recentMarketContext=parseRecentContext(await get(SOURCES.recent),now); }
  catch { recentMarketContext={status:'UNAVAILABLE',reason:'RECENT_CONTEXT_COLLECTION_FAILED',role:'CONTEXT_ONLY_NO_CURRENT_SIGNAL_WEIGHT'}; }
  let discovery=coreOnly?'CORE_ONLY_NO_NEWS_FETCH':'GDELT_DOC',articleRequests=0;
  if(!coreOnly) {
  try { await get(SOURCES.opec); exclusions.push({source:'OPEC',reason:'POLICY_REQUIRES_EFFECTIVE_DATE_VERIFICATION'}); } catch { /* Source failure remains explicit in fetchLog/categoryChecks. */ }
  try {
    const query=new URLSearchParams({query:'(oil OR diesel OR gasoil OR OPEC OR Hormuz OR "refinery outage") sourcelang:english',mode:'artlist',format:'json',maxrecords:'15',timespan:'72h',sort:'datedesc'});
    const json=JSON.parse(await get(`${SOURCES.gdelt}?${query}`));
    if (!Array.isArray(json.articles)) throw new Error('DISCOVERY_RESPONSE_INVALID');
    candidates.push(...json.articles.slice(0,15).map(a=>({headline:a.title,url:a.url,discoveredAt:a.seendate,discoverySource:'GDELT_DOC_DISCOVERY_ONLY'})));
  } catch { discovery='RSS_FALLBACK'; }
  if (!candidates.some(c=>c.url?.startsWith('https://www.brecorder.com/news/'))) {
    discovery=candidates.length?'GDELT_DOC_WITH_RSS_FALLBACK':'RSS_FALLBACK';
    try { candidates.push(...parseRssCandidates(await get(SOURCES.rss)).slice(0,30-candidates.length)); } catch { exclusions.push({source:'RSS',reason:'DISCOVERY_FAILED'}); }
  }
  // The general RSS contains only 30 items; use the publisher's robots-listed
  // news sitemap as discovery, never as proof of an event or its timestamp.
  try {
    const found=parseNewsSitemap(await get(SOURCES.sitemap));
    if(found.length) {candidates.push(...found);discovery+='_WITH_NEWS_SITEMAP';}
  } catch { exclusions.push({source:'NEWS_SITEMAP',reason:'DISCOVERY_FAILED'}); }
  candidates.sort((a,b)=>newsCandidatePriority(b.headline)-newsCandidatePriority(a.headline));
  const seenArticles=new Set();
  const selected=candidates.filter(candidate=>{
    const key=candidate.url?.match(/^https:\/\/www\.brecorder\.com\/news\/(\d+)(?:\/|$)/)?.[1]??candidate.url;
    if(seenArticles.has(key)) {exclusions.push({...candidate,reason:'DUPLICATE_DISCOVERY_ARTICLE'});return false;}
    seenArticles.add(key);return true;
  });
  for(const candidate of selected.slice(30))exclusions.push({...candidate,reason:'DISCOVERY_CANDIDATE_LIMIT'});
  selected.length=Math.min(selected.length,30);
  candidates.splice(0,candidates.length,...selected);
  for (const candidate of candidates) {
    if (!newsCandidatePriority(candidate.headline)) { candidate.status='IRRELEVANT';candidate.reason='NO_ENERGY_RELEVANCE_IN_HEADLINE';continue; }
    if (!/^https:\/\/www\.brecorder\.com\/news\/\d+(?:\/[^?#]*)?$/.test(candidate.url??'') || articleRequests>=6) { candidate.status='NEEDS_VERIFICATION';candidate.reason=articleRequests>=6?'ARTICLE_REQUEST_LIMIT':'UNSUPPORTED_ARTICLE_URL';continue; }
    articleRequests++;
    try {
      const resolved=await resolveNewsUrl(candidate.url,{now,loadHtml:get});
      const document=resolved.document;
      const duplicate=deduplicateNewsDocuments([...newsDocuments,document]).excluded.find(item=>item.documentId===document.documentId);
      if(duplicate) {
        candidate.status='EXCLUDED';candidate.reason=duplicate.reason;continue;
      }
      newsDocuments.push(document);
      candidate.status='CONTENT_VERIFIED';candidate.documentId=document.documentId;
      candidate.publisher=document.publisher;candidate.originalSource=document.originalSource;
      candidate.publishedAt=document.publishedAt;candidate.articleContentHash=document.articleContentHash;
      candidate.segmentIds=document.segments.map(segment=>segment.segmentId);
      if(resolved.legacySignal){signals.push(resolved.legacySignal);candidate.evidenceId=resolved.legacySignal.id;candidate.ruleId=resolved.legacySignal.ruleId;}
      else candidate.legacyRuleDisposition=resolved.legacyRuleDisposition;
    } catch(error) {
      candidate.status='EXCLUDED';
      const failedFetch=fetchLog.findLast(item=>item.url===candidate.url&&item.status==='FAILED');
      candidate.reason=failedFetch?.reason??(/^[A-Z0-9_]+$/.test(error.message)?error.message:'ARTICLE_VERIFICATION_FAILED');
    }
  }
  }
  const news=signals.filter(s=>s.sourceOrganization==='Reuters').sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt));
  const dedup=filterAndDeduplicateSignals([...signals.filter(s=>s.sourceOrganization!=='Reuters'),...news],now);
  for(const excluded of dedup.excluded) {
    const candidate=candidates.find(c=>c.evidenceId===excluded.id);
    if(candidate) {if(candidate.documentId)candidate.legacyRuleDisposition=excluded.reason;else {candidate.status='EXCLUDED';candidate.reason=excluded.reason;}}
  }
  const categoryChecks=CATEGORIES.map(category=>{
    const relevant=dedup.signals.filter(s=>s.category===category || s.relatedCategories?.includes(category));
    const officialFailure=category==='OPEC_MAJOR_PRODUCERS' && fetchLog.some(f=>f.url===SOURCES.opec && f.status==='FAILED');
    return {category,status:relevant.length && category!=='OPEC_MAJOR_PRODUCERS'?'VERIFIED':officialFailure?'FAILED':'NO_QUALIFIED_SIGNAL',checkedAt:generatedAt,sourceUrls:category===CATEGORIES[0] || category===CATEGORIES[1]?[SOURCES.prices]:category===CATEGORIES[2]?[SOURCES.metadata,SOURCES.table1,SOURCES.table2]:category==='OPEC_MAJOR_PRODUCERS'?[SOURCES.opec,SOURCES.rss]:[SOURCES.gdelt,SOURCES.rss,SOURCES.sitemap],reason:coreOnly&&!relevant.length?'Not fetched in external bridge core-only intake.':relevant.length && category!=='OPEC_MAJOR_PRODUCERS'?'Original sources verified; linked shipping risk belongs to the same event.':officialFailure?'Official OPEC endpoint inaccessible; no current production/export/policy fact admitted.':'Discovery checked; no verified material signal admitted for this category.'};
  });
  const pack={weeklyRelease,inputContractVersion:'NEWS_MATERIAL_V1',generatedAt,forecastHorizonDays:7,runType:'CURRENT_REAL_WORLD_RUN',signals:dedup.signals,newsDocuments,coverageMode:newsDocuments.length?'NORMAL':'LIMITED',categoryChecks,recentMarketContext,discovery:{provider:discovery,candidateCount:candidates.length,articleRequests,candidates},exclusions:[...exclusions,...dedup.excluded],fetchLog,conflicts:[],eventGroups:[...new Set(dedup.signals.map(s=>s.eventKey))].map(eventKey=>({eventKey,evidenceIds:dedup.signals.filter(s=>s.eventKey===eventKey).map(s=>s.id),weightingRule:'ONE_EVENT_NOT_ARTICLE_COUNT'}))};
  return {pack,gate:coreEvidenceGate(pack,{now})};
}

async function main() {
  const root=fileURLToPath(new URL('../../',import.meta.url));
  const {pack,gate}=await collectEvidence();
  await mkdir(resolve(root,'intelligence-v2'),{recursive:true});
  for (const path of ['CURRENT_EVIDENCE_V2.json','intelligence-v2/current-evidence.json']) await writeFile(resolve(root,path),JSON.stringify(pack,null,2)+'\n');
  await writeFile(resolve(root,'intelligence-v2/pending-intelligence-pack.json'),JSON.stringify({status:gate.status,evidenceGate:gate,evidencePack:pack},null,2)+'\n');
  await writeFile(resolve(root,'intelligence-v2/EVIDENCE_GATE_RESULT.json'),JSON.stringify(gate,null,2)+'\n');
  await writeFile(resolve(root,'intelligence-v2/collection-diagnostics.json'),JSON.stringify({generatedAt:pack.generatedAt,gate,weeklyRelease:pack.weeklyRelease,fetchLog:pack.fetchLog,candidates:pack.discovery.candidates,exclusions:pack.exclusions},null,2)+'\n');
  console.log(JSON.stringify({runType:pack.runType,...gate,discovery:pack.discovery.provider,candidates:pack.discovery.candidateCount}));
  if (gate.gate!=='PASS') process.exitCode=1;
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) await main();
