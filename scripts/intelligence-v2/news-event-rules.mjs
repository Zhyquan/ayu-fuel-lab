import { signalFailure } from '../../dist/data/intelligence-v2-contract.js';
import { validTimestamp } from '../../dist/data/validation.js';

const clean = value => value.replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&#(?:0*39|x27);/g,"'").replace(/&quot;/g,'"').replace(/&nbsp;/g,' ').replace(/[\u200b-\u200f\uFEFF]/g,'').replace(/\s+/g,' ').trim();
const fail = reason => { throw new Error(reason); };
const conditional = /\b(?:may|might|could|would|expected|plans?|planned|consider|considering|if|potential|threatened)\b/i;
const negated = /\b(?:not|never|denied|unconfirmed|yet to)\b/i;
const historical = /\b(?:last (?:week|month|year|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)|earlier this month|\d+ (?:days?|weeks?|months?) ago|in 20\d{2}|(?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2})\b/i;
const commentary = /\b(?:analysts?|strategists?|opinion|commentary|column)\b/i;
const unrelated = /\b(?:stock(?:s| market)?|shares|equities|bourses|nikkei|wall st(?:reet)?|rupee|rand|forex|exchange rate|palm oil|vegetable oil|soybean|opinion|commentary|column)\b/i;
const facility = /\b(?:pipeline|refinery|oil loadings?|oil exports?|export terminal|oil port)\b/i;

function assetFor(text) {
  // The pipeline and its export hub are one supply route, not independent votes.
  if (/\b(?:Yanbu|East-West (?:oil )?Pipeline|Petroline)\b/i.test(text)) return {name:'Saudi East-West / Yanbu',key:'saudi-east-west-yanbu'};
  if (/\bHormuz\b/i.test(text)) return {name:'Strait of Hormuz',key:'hormuz'};
  const match=text.replace(/\b(?:The|A|An) (?=[A-Z])/g,'').match(/\b([A-Z][a-zA-Z-]+(?: [A-Z][a-zA-Z-]+){0,2}) (?:oil )?(?:pipeline|refinery|port|(?:export )?terminal)\b/);
  if (!match || /^(?:The|A|An|Oil|Crude|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)(?: |$)/.test(match[1])) return null;
  return {name:match[0],key:match[1].toLowerCase().replace(/[^a-z0-9]+/g,'-')};
}
const supplyKey = ({asset}) => `${asset.key}-supply-status`;

function oldWeekdayReference(text,publishedAt) {
  const weekdays=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const publishedDay=new Date(publishedAt).getUTCDay();
  return [...text.matchAll(/\bon (Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\b/gi)]
    .some(match=>(publishedDay-weekdays.findIndex(day=>day.toLowerCase()===match[1].toLowerCase())+7)%7>2);
}

export const NEWS_EVENT_RULES = Object.freeze([
  {
    ruleId:'HORMUZ_NEGOTIATION_RISK',category:'SUPPLY_DISRUPTION',kind:'RISK',impact:'UP',importance:'MEDIUM',
    requiredPatterns:[/Hormuz/i,/(?:US President|Trump)[^.]{0,160}rejected [^.]{0,30}Iranian proposal/i,/(?:deadlock|stalemate)[^.]{0,80}concerns?[^.]{0,80}oil supplies/i],
    forbiddenPatterns:[/(?:deadlock|stalemate)[^.]{0,80}(?:resolved|ended)/i,historical,commentary],scope:'PARAGRAPH',
    eventKey:()=> 'us-iran-hormuz-negotiation-deadlock',
    displayText:()=> '霍尔木兹供应仍有不确定风险',
    fact:()=> 'Reuters报道美国拒绝伊朗提议，谈判僵局带来石油供应担忧；属于持续风险，不能等同于新发生的关闭或确定减产。',
  },
  {
    ruleId:'SUPPLY_RESTORATION_CONFIRMED',category:'SUPPLY_DISRUPTION',kind:'FACT',impact:'DOWN',importance:'MEDIUM',
    requiredPatterns:[facility,/\b(?:oil|crude|diesel|fuel|refinery)\b/i,/\b(?:pipeline|refinery|oil loadings?|oil exports?|export terminal|oil port)\b[^.]{0,80}\b(?:resumed|restarted|restored|reopened|operational again)\b/i],
    forbiddenPatterns:[conditional,negated,historical,commentary],scope:'PARAGRAPH',eventKey:supplyKey,
    displayText:()=> '油品供应设施恢复运行',
    fact:({asset})=> `Reuters报道确认 ${asset.name} 相关油品供应作业恢复运行；代表供应压力缓解，不保证价格下跌。`,
  },
  {
    ruleId:'SUPPLY_DISRUPTION_CONFIRMED',category:'SUPPLY_DISRUPTION',kind:'FACT',impact:'UP',importance:'MEDIUM',
    requiredPatterns:[facility,/\b(?:oil|crude|diesel|fuel|refinery)\b/i,/\b(?:pipeline|refinery|oil loadings?|oil exports?|export terminal|oil port)\b[^.]{0,80}\b(?:halted|shut down|shutdown|suspended|stopped|closed|blocked|outage)\b/i],
    forbiddenPatterns:[conditional,negated,historical,commentary,/\b(?:resumed|restarted|restored|reopened)\b/i],scope:'PARAGRAPH',eventKey:supplyKey,
    displayText:()=> '油品供应设施运行中断',
    fact:({asset})=> `Reuters报道确认 ${asset.name} 当前油品供应作业中断；涉及生产或运输，可能增加供应压力。`,
  },
  {
    ruleId:'HORMUZ_SHIPPING_RISK',category:'SUPPLY_DISRUPTION',kind:'RISK',impact:'UP',importance:'MEDIUM',
    requiredPatterns:[/\bHormuz\b/i,/\b(?:ongoing|continuing|continued|lingering|unresolved)\b[^.]{0,160}\bsupply disruptions?\b/i,/\b(?:reopen|restricted|restrictions?|blockaded)\b/i],
    forbiddenPatterns:[/\b(?:fully reopened|restrictions? (?:ended|lifted)|disruptions? (?:ended|resolved))\b/i,historical,commentary],scope:'PARAGRAPH',
    eventKey:()=> 'us-iran-hormuz-negotiation-deadlock',
    displayText:()=> '霍尔木兹运输仍存不确定风险',
    fact:()=> 'Reuters当前报道持续供应中断与霍尔木兹重开尚待解决；属于运输供应风险，并不确认新的关闭事件。',
  },
  {
    ruleId:'STRATEGIC_RESERVE_RELEASE_OUTLOOK',category:'SUPPLY_DISRUPTION',kind:'OUTLOOK',impact:'DOWN',importance:'LOW',
    requiredPatterns:[/\b(?:IEA|International Energy Agency|government|energy ministry|Department of Energy)\b/i,/\b(?:may|could|consider(?:ing)?|discuss)\b/i,/\b(?:IEA|International Energy Agency|oil|petroleum|strategic)\b/i,/\b(?:releas\w*[^.]{0,70}(?:strategic |oil |petroleum )?reserves?|(?:strategic |oil |petroleum )?reserves?[^.]{0,70}releas\w*)\b/i],
    forbiddenPatterns:[/\b(?:already released|has released|have released|unconfirmed|foreign exchange|currency|gold)\b/i,historical,commentary,negated],scope:'PARAGRAPH',
    eventKey:({text})=> `${/\b(?:IEA|International Energy Agency)\b/i.test(text)?'iea':'government'}-strategic-reserve-outlook`,
    displayText:()=> '战略储备释放仍属前瞻',
    fact:()=> 'Reuters报道能源机构或政府可能讨论战略储备释放；这是条件性前瞻，不代表已经释放，默认重要性为低。',
  },
]);

function articleBody(html) {
  const opening=/<div\b[^>]*class=["'][^"']*\bstory__content\b[^"']*["'][^>]*>/g.exec(html);
  if (!opening) return '';
  const tags=/<\/?div\b[^>]*>/g;tags.lastIndex=opening.index+opening[0].length;
  let depth=1;
  for (let tag;(tag=tags.exec(html));) {
    depth+=tag[0].startsWith('</')?-1:1;
    if (!depth) return html.slice(opening.index+opening[0].length,tag.index)
      .replace(/<(script|style|aside)\b[^>]*>[\s\S]*?<\/\1>/gi,'')
      .replace(/<p\b[^>]*>\s*<a\b[^>]*>[\s\S]*?<\/a>\s*<\/p>/gi,'');
  }
  return '';
}

export function verifyNewsArticle(html,url,checkedAt) {
  if (!/^https:\/\/www\.brecorder\.com\/news\/\d+(?:\/[^?#]*)?$/.test(url)) fail('UNSUPPORTED_ARTICLE_URL');
  let article;
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/g)) {
    try {const value=JSON.parse(m[1]);if(value['@type']==='NewsArticle'){article=value;break;}} catch { /* Unrelated metadata is not evidence. */ }
  }
  const authors=Array.isArray(article?.author)?article.author:[article?.author];
  if (!authors.some(author=>author?.name==='Reuters')) fail('REUTERS_AUTHOR_NOT_VERIFIED');
  if (!validTimestamp(article.datePublished)) fail('ARTICLE_PUBLICATION_TIME_UNVERIFIED');
  const publishedAt=new Date(article.datePublished).toISOString(), now=new Date(checkedAt);
  if (Date.parse(publishedAt)>+now) fail('INVALID_SIGNAL_DATE');
  if (+now-Date.parse(publishedAt)>72*3600000) fail('EXPIRED_NEWS');
  const markup=articleBody(html), body=clean(markup);
  if (!body) fail('ORIGINAL_ARTICLE_NOT_VERIFIED');
  if (unrelated.test(clean(article.headline??''))) fail('UNRELATED_MARKET_ARTICLE');
  const paragraphs=[...markup.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)].map(m=>clean(m[1]));
  for (const rule of NEWS_EVENT_RULES) {
    const text=paragraphs.find(value=>rule.requiredPatterns.every(pattern=>pattern.test(value))&&!rule.forbiddenPatterns.some(pattern=>pattern.test(value))&&!oldWeekdayReference(value,publishedAt));
    if (!text) continue;
    const asset=assetFor(text);
    if (rule.eventKey===supplyKey && !asset) continue;
    const context={text,asset}, eventDate=publishedAt.slice(0,10);
    const signal={id:`news-${url.match(/news\/(\d+)/)[1]}-${rule.ruleId.toLowerCase()}`,ruleId:rule.ruleId,category:rule.category,relatedCategories:rule.ruleId.startsWith('HORMUZ')?['SHIPPING']:[],eventKey:rule.eventKey(context),measurementKey:'supply-status',
      headline:rule.displayText(context),fact:rule.fact(context),displayText:rule.displayText(context),impact:rule.impact,importance:rule.importance,kind:rule.kind,eventDate,eventAt:publishedAt,publishedAt,checkedAt,
      sourceName:'Reuters via Business Recorder',sourceOrganization:'Reuters',sourceUrl:url,sourceTier:2,verified:true,freshness:'BREAKING_72H',
      eventTimeBasis:'Current supply status or conditional outlook explicitly reported at datePublished; not a crawl, modification or historical outage time.'};
    const error=signalFailure(signal,now);if(error)fail(error);
    return signal;
  }
  fail('NEEDS_REVIEW_UNSUPPORTED_EVENT');
}

export function newsCandidatePriority(headline) {
  if (unrelated.test(headline)) return 0;
  if (/\b(?:pipeline|refinery|loadings?|oil exports?|export terminal|strategic reserves?)\b/i.test(headline)) return 3;
  if (/\b(?:Hormuz|supply (?:disruption|concern|risk))\b/i.test(headline)) return 2;
  return /\b(?:oil|diesel|gasoil|OPEC|tanker)\b/i.test(headline)?1:0;
}
