import { readFile } from 'node:fs/promises';
import { evidenceHashFor } from '../../scripts/intelligence-v2/history.mjs';
const snapshot=JSON.parse(await readFile(new URL('../../data/forecast-history-v2/2026-09-28T11-17-34.176Z-66453209e4ab.json',import.meta.url),'utf8'));
export const testTime='2026-09-28T11:20:00.000Z';
export function fixture(at=testTime) {
  const pack=structuredClone(snapshot.evidencePack);
  // Synthetic freshness for isolated tests, never written to the repository's current data.
  pack.generatedAt=at;
  for(const s of pack.signals)s.checkedAt=at;
  for(const c of pack.categoryChecks)c.checkedAt=at;
  if(at.startsWith('2026-09-29'))for(const s of pack.signals.filter(s=>s.freshness==='MARKET_PRICE')) {
    s.eventDate='2026-09-28';s.publishedAt='2026-09-29T00:00:00Z';
  }
  return {pack,evidenceHash:evidenceHashFor(pack),now:new Date(at)};
}
export function analysis(pack) {
  return {probabilities:{DOWN:35,FLAT:25,UP:40},upReasonEvidenceIds:['eia-stocks','market-brent',pack.signals.find(s=>s.kind==='RISK').id],downReasonEvidenceIds:['market-diesel'],strengthAssessments:pack.signals.map(s=>({evidenceId:s.id,strength:'MEDIUM'}))};
}
export function response(output,{status=200,finish='stop',content=JSON.stringify(output)}={}) {
  return new Response(JSON.stringify({choices:[{finish_reason:finish,message:{role:'assistant',content}}],usage:{prompt_tokens:100,completion_tokens:50}}),{status});
}
export function fakeOptions(pack,{clock=()=>new Date(testTime),fetchImpl=async()=>response(analysis(pack)),...rest}={}) {
  return {environment:{DASHSCOPE_API_KEY:'test'},mock:true,fetchImpl,clock,wait:async()=>{},...rest};
}
