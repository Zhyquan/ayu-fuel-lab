import { createHash } from 'node:crypto';
import { articleBody } from './news-event-rules.mjs';
import { validDate, validTimestamp } from '../../dist/data/validation.js';

const digest = value => createHash('sha256').update(value).digest('hex');
const clean = value => value.replace(/<(?:script|style|aside)\b[^>]*>[\s\S]*?<\/\1>/gi,' ')
  .replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"')
  .replace(/&#(?:0*39|x27);/gi,"'").replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();
const energy = /\b(?:oil|crude|diesel|gasoil|distillate|fuel|refiner(?:y|ies)|pipeline|tanker|OPEC|Hormuz|petroleum|energy|barrels?)\b/i;
const navigation = /^(?:READ MORE|RELATED|ADVERTISEMENT|SPONSORED|ALSO READ|Click here)\b/i;
const articleUrl = /^https:\/\/www\.brecorder\.com\/news\/(\d+)(?:\/[^?#]*)?$/;
const fail = reason => { throw new Error(reason); };

// The publisher's article container and NewsArticle metadata are the only inputs.
// A discovery title, crawl time, navigation block or a word in the page footer is not evidence.
export function parseNewsMaterial(html,sourceUrl,fetchedAt) {
  const id=sourceUrl?.match(articleUrl)?.[1];
  if(!id)fail('UNSUPPORTED_ARTICLE_URL');
  let metadata;
  for(const match of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/g)) {
    try { const item=JSON.parse(match[1]);if(item['@type']==='NewsArticle'){metadata=item;break;} } catch {}
  }
  if(!metadata || !/^(?:Business Recorder|Brecorder)$/i.test(metadata.publisher?.name??''))fail('PUBLISHER_NOT_VERIFIED');
  const authors=(Array.isArray(metadata.author)?metadata.author:[metadata.author]).map(a=>a?.name).filter(Boolean);
  if(!authors.length)fail('AUTHOR_NOT_VERIFIED');
  const originalSource=authors.includes('Reuters')?'Reuters':'Business Recorder';
  if(!originalSource)fail('ORIGINAL_SOURCE_NOT_VERIFIED');
  const precision=/^\d{4}-\d{2}-\d{2}$/.test(metadata.datePublished??'')?'DATE_ONLY':'SECOND';
  if(!validTimestamp(fetchedAt)||!(precision==='DATE_ONLY'?validDate(metadata.datePublished):validTimestamp(metadata.datePublished)))fail('ARTICLE_PUBLICATION_TIME_UNVERIFIED');
  const publishedAt=precision==='DATE_ONLY'?`${metadata.datePublished}T00:00:00.000Z`:new Date(metadata.datePublished).toISOString();
  if(!Number.isFinite(Date.parse(publishedAt)) || Date.parse(publishedAt)>Date.parse(fetchedAt) || Date.parse(fetchedAt)-Date.parse(publishedAt)>72*3600000)fail('ARTICLE_PUBLICATION_TIME_UNVERIFIED');
  const markup=articleBody(html);
  if(!markup)fail('ARTICLE_BODY_NOT_READ');
  const paragraphs=[...markup.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)].map(m=>clean(m[1]));
  const body=paragraphs.filter(p=>p&&!navigation.test(p)).join('\n');
  if(body.length<70)fail('ARTICLE_BODY_NOT_READ');
  const relevant=paragraphs.filter(p=>p.length>=55 && energy.test(p) && !navigation.test(p)).slice(0,3);
  const headline=clean(metadata.headline??'');
  if(!relevant.length || !energy.test(headline) || /^(?:Dollar|Euro|Pound|Rupee|Stocks?|Shares?|Currencies|Forex)\b/i.test(headline))fail('UNRELATED_MARKET_ARTICLE');
  const segments=relevant.map((paragraph,index)=>({segmentId:`s${index+1}-${digest(paragraph).slice(0,12)}`,text:paragraph.slice(0,240)}));
  return {documentId:`br-${id}`,sourceUrl,publisher:'Business Recorder',originalSource,authorName:authors.join(', ').slice(0,100),publishedAt,publishedAtPrecision:precision,
    fetchedAt,articleContentHash:digest(body),headline:headline.slice(0,180),segments};
}
