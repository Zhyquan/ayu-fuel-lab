import { canonicalJson, validateForecastCache } from './intelligence-v2-contract.js';
import { chinaDate, validDate } from './validation.js';

const length = value => Array.from(value).length;
const directionLabel = signal => signal.kind==='RISK' ? ({UP:'上涨风险',DOWN:'下跌风险',NEUTRAL:'供应风险'})[signal.impact] : ({UP:'利涨',DOWN:'利跌',NEUTRAL:'中性'})[signal.impact];
const newsCopy = {
  SUPPLY_DISRUPTION_CONFIRMED:{kind:'FACT',impact:'UP',title:'油品供应设施运行中断',summary:'报道确认油品供应作业中断，可能增加供应压力。',fact:'当前油品供应作业中断'},
  SUPPLY_RESTORATION_CONFIRMED:{kind:'FACT',impact:'DOWN',title:'油品供应设施恢复运行',summary:'报道确认相关油品供应作业恢复，原有供应压力有所缓解。',fact:'相关油品供应作业恢复运行'},
  HORMUZ_SHIPPING_RISK:{kind:'RISK',impact:'UP',title:'霍尔木兹运输仍存不确定风险',summary:'报道提到海峡重开仍待解决，属于运输供应风险。',fact:'霍尔木兹重开尚待解决'},
  STRATEGIC_RESERVE_RELEASE_OUTLOOK:{kind:'OUTLOOK',impact:'DOWN',title:'战略储备释放仍属前瞻',summary:'能源机构或政府可能讨论储备释放，尚未确认实施。',fact:'这是条件性前瞻，不代表已经释放'},
};

export function formatEvidenceDate(date,now=new Date()) {
  if (!validDate(date)) return null;
  const today=chinaDate(now), yesterday=new Date(Date.parse(today)-86400000).toISOString().slice(0,10);
  if (date===today) return '今天';
  if (date===yesterday) return '昨天';
  const [year,month,day]=date.split('-').map(Number);
  return `${year===Number(today.slice(0,4))?'':`${year}年`}${month}月${day}日`;
}

// Owned short copy for the four admitted reason types; never truncate or copy raw fact text.
// A changed/unsupported fact needs a reviewed projection, rather than a guessed summary.
function publicCopy(signal,now) {
  const observed=formatEvidenceDate(signal.eventDate,now);
  if (signal.sourceOrganization==='EIA' && signal.kind==='FACT') {
    if (signal.id==='eia-stocks' && signal.category==='DISTILLATE_FUNDAMENTALS' && signal.impact==='UP' && signal.displayText==='美国馏分油库存减少' && /库存周变化 -\d/.test(signal.fact)) return {
      title:'美国馏分油库存减少',summary:`统计周截至${observed}，馏分油库存较上周减少。`,
    };
    if (signal.id==='eia-stocks' && signal.category==='DISTILLATE_FUNDAMENTALS' && signal.impact==='DOWN' && signal.displayText==='美国馏分油库存增加' && /库存周变化 \+\d/.test(signal.fact)) return {
      title:'美国馏分油库存增加',summary:`统计周截至${observed}，馏分油库存较上周增加。`,
    };
    if (signal.id==='market-brent' && signal.category==='CRUDE' && signal.impact==='UP' && signal.displayText==='Brent最新日度报价上涨' && signal.observation?.name==='Brent' && signal.observation.change1dPercent>0) return {
      title:'Brent日度报价上涨',summary:`${observed}的Brent现货报价较上一报价日上涨。`,
    };
    if (signal.id==='market-diesel' && signal.category==='INTERNATIONAL_DIESEL' && signal.impact==='DOWN' && signal.displayText==='纽约港低硫柴油最新日度报价回落' && signal.observation?.name==='NY_HARBOR_LOW_SULFUR_DIESEL' && signal.observation.change1dPercent<0) return {
      title:'纽约港低硫柴油报价回落',summary:`${observed}的低硫柴油现货报价较上一报价日回落。`,
    };
    if (signal.id==='market-brent' && signal.category==='CRUDE' && signal.impact==='DOWN' && signal.displayText==='Brent最新日度报价回落' && signal.observation?.name==='Brent' && signal.observation.change1dPercent<0) return {
      title:'Brent日度报价回落',summary:`${observed}的Brent现货报价较上一报价日回落。`,
    };
    if (signal.id==='market-diesel' && signal.category==='INTERNATIONAL_DIESEL' && signal.impact==='UP' && signal.displayText==='纽约港低硫柴油最新日度报价上涨' && signal.observation?.name==='NY_HARBOR_LOW_SULFUR_DIESEL' && signal.observation.change1dPercent>0) return {
      title:'纽约港低硫柴油报价上涨',summary:`${observed}的低硫柴油现货报价较上一报价日上涨。`,
    };
  }
  if (signal.sourceOrganization==='Reuters' && signal.kind==='RISK' && signal.category==='SUPPLY_DISRUPTION' && signal.impact==='UP' && signal.displayText==='霍尔木兹供应仍有不确定风险' && signal.fact.includes('谈判僵局') && signal.fact.includes('供应担忧')) return {
    title:'霍尔木兹供应仍有不确定风险',summary:'报道提到谈判僵局带来的石油供应担忧，属于风险信号。',
  };
  const copy=Object.hasOwn(newsCopy,signal.ruleId)?newsCopy[signal.ruleId]:null;
  if (copy && signal.sourceOrganization==='Reuters' && signal.category==='SUPPLY_DISRUPTION' && signal.kind===copy.kind && signal.impact===copy.impact && signal.displayText===copy.title && signal.fact.includes(copy.fact)) return {title:copy.title,summary:copy.summary};
  return null;
}

export function publicEvidenceGate({forecast,evidencePack}, {now=new Date()}={}) {
  const fail = (errors,excluded=[]) => ({gate:'FAIL',cards:[],errors,excluded,checkedAt:new Date(now).toISOString()});
  if (forecast?.evidencePack && canonicalJson(forecast.evidencePack)!==canonicalJson(evidencePack)) return fail(['EVIDENCE_PACK_MISMATCH']);
  // Reuse the existing reason/source/date/expiry contract. Hash verification remains upstream.
  const checked=validateForecastCache({...forecast,evidencePack},{now});
  if (checked.status!=='LIVE') return fail([`FORECAST_NOT_LIVE:${checked.reason}`]);
  const byId=new Map(evidencePack.signals.map(signal=>[signal.id,signal]));
  const documents=new Map((evidencePack.newsDocuments??[]).map(document=>[document.documentId,document]));
  const newsById=new Map((forecast.newsAssessments??[]).map(item=>[item.evidenceId,item]));
  const refs=[...forecast.mainReasons.map(ref=>({...ref,role:'MAIN'})),...forecast.counterReasons.map(ref=>({...ref,role:'COUNTER'}))];
  const cards=[], excluded=[], seen=new Set();
  for (const ref of refs) {
    const signal=byId.get(ref.evidenceId);
    if(!signal) {
      const item=newsById.get(ref.evidenceId), document=documents.get(item?.documentId);
      if(!item||!document||!document.segments.some(segment=>segment.segmentId===item.segmentId)||!/[\u3400-\u9fff]/.test(item.title+item.summary)||length(item.title)>24||length(item.summary)>60) return fail(['NO_SAFE_PUBLIC_COPY']);
      const key=`${item.documentId}:${item.impact}`;
      if(seen.has(key)){excluded.push({evidenceId:ref.evidenceId,reason:'SAME_NEWS_DOCUMENT'});continue;}
      seen.add(key);
      cards.push({evidenceId:item.evidenceId,direction:item.impact,directionLabel:directionLabel(item),title:item.title,summary:item.summary,sourceName:document.originalSource,date:document.publishedAt.slice(0,10),sourceUrl:document.sourceUrl,role:ref.role});
      continue;
    }
    // Same release can carry opposite measurements; retain the genuine counter-signal.
    const key=`${signal.eventKey}:${signal.impact}`;
    if (seen.has(key)) { excluded.push({evidenceId:ref.evidenceId,reason:'SAME_EVENT_AND_DIRECTION'}); continue; }
    seen.add(key);
    const copy=publicCopy(signal,now);
    if (!copy || !copy.title || !copy.summary || length(copy.title)>24 || length(copy.summary)>60) return fail(['NO_SAFE_PUBLIC_COPY'],[...excluded,{evidenceId:ref.evidenceId,reason:'NO_SAFE_PUBLIC_COPY'}]);
    const date=signal.publishedAtPrecision==='DATE_ONLY'?signal.publishedAt.slice(0,10):chinaDate(signal.publishedAt);
    if (!validDate(date) || !signal.sourceOrganization || length(signal.sourceOrganization)>24 || !directionLabel(signal)) return fail(['INVALID_PUBLIC_CARD']);
    cards.push({evidenceId:signal.id,direction:signal.impact,directionLabel:directionLabel(signal),title:copy.title,summary:copy.summary,sourceName:signal.sourceOrganization,date,sourceUrl:signal.sourceUrl,role:ref.role});
  }
  if (!cards.length || cards.length>5) return fail(['INVALID_CARD_COUNT'],excluded);
  return {gate:'PASS',cards,errors:[],excluded,checkedAt:new Date(now).toISOString()};
}

export function buildPublicEvidenceCards(input,options) {
  return publicEvidenceGate(input,options).cards;
}
