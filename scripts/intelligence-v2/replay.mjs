import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { coreEvidenceGate, coreForecastGate, coreMarketSignals, newsEnrichmentGate, primaryDirectionFor, canonicalJson } from '../../dist/data/intelligence-v2-contract.js';
import { publicEvidenceGate } from '../../dist/data/public-evidence.js';
import { publicEvidenceMarkup } from '../../dist/data/public-evidence-view.js';
import { forecastMarkup } from '../../dist/data/intelligence-v2-view.js';
import { readForecast } from '../../dist/data/intelligence-v2-service.js';
import { createQwenProvider, projectEvidence, validateAnalysis } from './qwen-provider.mjs';
import { evidenceHashFor } from './history.mjs';
import { runOfficialDaily, INDEX_PATH, PROVIDER_AUDIT_PATH } from './official-daily.mjs';
import { verifyGenerated } from './commit-official-daily.mjs';
import { dailyDeliveryReady } from './pages-delivery-ready.mjs';

export const loadReplayFixture=async()=>JSON.parse(await readFile(new URL('../../tests/fixtures/forecast-production-shape.json',import.meta.url),'utf8'));
// An injected transport and isolated environment make these commands incapable of a real model call.
export const replayProviderOptions=(value,now)=>({mock:true,environment:{DASHSCOPE_API_KEY:'test'},clock:()=>new Date(now),wait:async()=>{},
  fetchImpl:async()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(value)}}],usage:{prompt_tokens:100,completion_tokens:50}}),{status:200})});
export function replayOutput(pack,{probabilities={DOWN:35,FLAT:25,UP:40},newsCount=0,strength='MEDIUM'}={}) {
  const primary=primaryDirectionFor(probabilities), signals=coreMarketSignals(pack);
  const unique=(impact)=>signals.filter(s=>s.impact===impact).filter((s,i,all)=>all.findIndex(x=>x.eventKey===s.eventKey)===i);
  const opposite=primary==='UP'?'DOWN':'UP';
  return {probabilities,mainReasonEvidenceIds:unique(primary).slice(0,2).map(s=>s.id),counterReasonEvidenceIds:unique(opposite).slice(0,2).map(s=>s.id),
    strengthAssessments:signals.map(s=>({evidenceId:s.id,strength})),
    newsAssessments:(pack.newsDocuments??[]).slice(0,newsCount).map((d,i)=>({evidenceId:`${d.documentId}:${d.segments[0].segmentId}`,impact:i===1?opposite:primary,kind:'RISK',title:'柴油市场供需变化',summary:'报道讨论柴油供需变化及市场影响。',strength}))};
}
export async function replayCandidate(pack,value,now) {
  validateAnalysis(value,pack);
  return createQwenProvider(replayProviderOptions(value,now)).generateForecast({evidencePack:pack,evidenceHash:evidenceHashFor(pack),now:new Date(now)});
}
async function scanTemporary(root) {
  await mkdir(join(root,'scripts'),{recursive:true});
  await writeFile(join(root,'scripts/scan-public-files.mjs'),await readFile(new URL('../scan-public-files.mjs',import.meta.url)));
  const result=spawnSync(process.execPath,[join(root,'scripts/scan-public-files.mjs')],{cwd:root,encoding:'utf8',env:{}});
  assert.equal(result.status,0,result.stdout||result.stderr);
  return JSON.parse(result.stdout);
}
async function assertPublic(candidate,pack,now) {
  assert.equal(coreForecastGate(candidate,pack,{now:new Date(now),expectedEvidenceHash:evidenceHashFor(pack)}).gate,'PASS');
  const cache=JSON.parse(JSON.stringify({...candidate,evidencePack:pack}));
  const readback=await readForecast({now:new Date(now),fetchImpl:async()=>new Response(JSON.stringify(cache))});
  assert.equal(readback.status,'LIVE');
  const publicGate=publicEvidenceGate({forecast:readback,evidencePack:readback.evidencePack},{now:new Date(now)});
  assert.equal(publicGate.gate,'PASS',publicGate.errors.join(','));
  const html=forecastMarkup(readback,{now:new Date(now)})+publicEvidenceMarkup(readback,{now:new Date(now)});
  assert.match(html,/偏涨|偏跌/);assert.match(html,/AI综合估计/);assert.match(html,/查看来源/);
  assert.doesNotMatch(html,/暂时无法展示|系统失败/);
  return {cache,cards:publicGate.cards,html};
}
export async function runReplay() {
  const started=performance.now(),f=await loadReplayFixture(),now=new Date(f.now);
  assert.equal(f.fixtureKind,'SYNTHETIC_PRODUCTION_SHAPE_NOT_FOR_PUBLICATION');
  assert.equal(coreEvidenceGate(f.pack,{now}).gate,'PASS');
  const input=projectEvidence(f.pack);
  assert.equal(input.signals.length,6);assert.equal(input.newsDocuments.length,3);
  const root=await mkdtemp(join(tmpdir(),'ayu-core-replay-'));
  try {
    for(const dir of ['dist/data','intelligence-v2','data/forecast-history-v2'])await mkdir(join(root,dir),{recursive:true});
    const before={schemaVersion:1,entries:[],legacyHistory:[]},sourceCommit='a'.repeat(40);
    const evidenceGate=coreEvidenceGate(f.pack,{now});
    for(const [path,value] of [[INDEX_PATH,before],['CURRENT_EVIDENCE_V2.json',f.pack],['intelligence-v2/current-evidence.json',f.pack],['intelligence-v2/EVIDENCE_GATE_RESULT.json',evidenceGate],['intelligence-v2/pending-intelligence-pack.json',{evidencePack:f.pack,evidenceGate}]])
      await writeFile(join(root,path),JSON.stringify(value));
    const output=replayOutput(f.pack,{newsCount:3});
    output.mainReasonEvidenceIds.push(output.newsAssessments[0].evidenceId);
    // The real official writer, immutable history and index operate only in this disposable root.
    const result=await runOfficialDaily({root,pack:f.pack,sourceCommit,clock:()=>now,providerOptions:replayProviderOptions(output,now)});
    const cache=JSON.parse(await readFile(join(root,'dist/data/forecast-cache.json'),'utf8'));
    const {evidencePack,...candidate}=cache;
    const projected=await assertPublic(candidate,evidencePack,now);
    await writeFile(join(root,'dist/cards.json'),JSON.stringify(projected.cards));
    await writeFile(join(root,'dist/index.html'),projected.html);
    // Production must reject a mock audit. Then test the production audit SHAPE in isolation.
    await assert.rejects(verifyGenerated(root,before,{sourceCommit,now}),/OFFICIAL_PROVIDER_AUDIT_INVALID/);
    const audit=JSON.parse(await readFile(join(root,PROVIDER_AUDIT_PATH),'utf8'));
    await writeFile(join(root,PROVIDER_AUDIT_PATH),JSON.stringify({...audit,mock:false}));
    await verifyGenerated(root,before,{sourceCommit,now});
    const pages=await dailyDeliveryReady({root,triggerHeadSha:sourceCommit,runCreatedAt:f.now,now,commitSubject:`data: Official Daily ${result.entry.forecastDate} ${result.entry.forecastId.slice(0,12)}`});
    assert.equal(pages.ready,true);
    const scan=await scanTemporary(root);
    return {gate:'PASS',coreForecastGate:'PASS',publicProjection:'PASS',publicScan:scan.gate,pagesCompatibleOutput:'PASS',mockAuditRejected:true,
      proof:'SYNTHETIC_NOT_PRODUCTION',inputPackHash:candidate.inputPackHash,fixtureShape:{signals:6,newsDocuments:3},elapsedMs:Math.round(performance.now()-started),realQwenCalls:0};
  }finally{await rm(root,{recursive:true,force:true});}
}

// Fixed seed shuffles the finite probability space; every failure has a stable case index.
export async function runContractFuzz({seed=20260930,count=192}={}) {
  const started=performance.now(), f=await loadReplayFixture(),now=new Date(f.now);
  let state=seed>>>0;const next=()=>state=(Math.imul(state,1664525)+1013904223)>>>0;
  const probabilities=[];
  for(let DOWN=5;DOWN<=90;DOWN+=5)for(let FLAT=5;FLAT<=90;FLAT+=5){const UP=100-DOWN-FLAT;if(UP>=5&&UP<=90)probabilities.push({DOWN,FLAT,UP});}
  for(let i=probabilities.length-1;i>0;i--){const j=next()%(i+1);[probabilities[i],probabilities[j]]=[probabilities[j],probabilities[i]];}
  const coverage={directions:new Set(),mainCounts:new Set(),counterCounts:new Set(),newsCounts:new Set(),strengths:new Set(),modes:new Set()};
  const root=await mkdtemp(join(tmpdir(),'ayu-core-fuzz-'));let homogeneousVariants=0;
  try {
    await mkdir(join(root,'dist/data'),{recursive:true});
    for(let i=0;i<count;i++) {
      const pack=structuredClone(f.pack), p=probabilities[i%probabilities.length],primary=primaryDirectionFor(p);
      if(i%8===0) {
        // Explicit synthetic same-shape variant permits zero counter-reasons under the unchanged core rule.
        homogeneousVariants++;
        for(const s of pack.signals) {
          s.impact=primary;
          if(s.observation){s.observation.change1dPercent=(primary==='UP'?1:-1)*Math.abs(s.observation.change1dPercent);s.displayText=`${s.observation.name}报价${primary==='UP'?'上涨':'回落'}`;s.fact=`合成变体：${s.displayText}，日变化 ${s.observation.change1dPercent}%。`;}
          else {s.displayText=primary==='UP'?'美国馏分油供应收紧':'美国馏分油供应缓解';s.fact=`合成变体：${s.displayText}。`;}
        }
      }
      pack.coverageMode=i%2?'LIMITED':'NORMAL';
      const strength=['LOW','MEDIUM','HIGH'][i%3],newsCount=i%4;
      const value=replayOutput(pack,{probabilities:p,newsCount,strength});
      const target=1+i%3;
      value.mainReasonEvidenceIds=value.mainReasonEvidenceIds.slice(0,target);
      for(const a of value.newsAssessments.filter(a=>a.impact===primary))if(value.mainReasonEvidenceIds.length<target)value.mainReasonEvidenceIds.push(a.evidenceId);
      if(i%8===0)value.counterReasonEvidenceIds=[];
      else {
        value.counterReasonEvidenceIds=value.counterReasonEvidenceIds.slice(0,1+i%2);
        for(const a of value.newsAssessments.filter(a=>a.impact!==primary))if(value.counterReasonEvidenceIds.length<1+i%2)value.counterReasonEvidenceIds.push(a.evidenceId);
      }
      const original=canonicalJson(pack),candidate=await replayCandidate(pack,value,now);
      const projected=await assertPublic(candidate,pack,now);
      assert.equal(canonicalJson(pack),original,`mutated fixture at seed ${seed}, case ${i}`);
      assert.equal(newsEnrichmentGate(candidate,pack,{mode:'FORECAST'}).gate,'PASS');
      await writeFile(join(root,`dist/data/legal-${i}.json`),JSON.stringify(projected));
      for(const [key,v] of [['directions',candidate.primaryDirection],['mainCounts',candidate.mainReasons.length],['counterCounts',candidate.counterReasons.length],['newsCounts',candidate.newsAssessments.length],['strengths',strength],['modes',candidate.coverageMode]])coverage[key].add(v);
    }
    const base=replayOutput(f.pack),candidate=await replayCandidate(f.pack,base,now);
    const illegalAnalysis=[
      ['NON_5_STEP',v=>{v.probabilities={DOWN:36,FLAT:24,UP:40};}],
      ['BAD_SUM',v=>{v.probabilities.UP=45;}],
      ['UNKNOWN_MARKET',v=>{v.mainReasonEvidenceIds=['market-unknown'];}],
      ['DUPLICATE_MAIN',v=>{v.mainReasonEvidenceIds=['eia-stocks','eia-stocks'];}],
      ['SAME_EVENT',v=>{v.mainReasonEvidenceIds=['eia-stocks','eia-production'];}],
      ['REVERSE_REASON',v=>{v.mainReasonEvidenceIds=['market-diesel'];}],
      ['MISSING_ASSESSMENT',v=>{v.strengthAssessments.pop();}],
    ];
    for(const [name,mutate]of illegalAnalysis){const value=structuredClone(base);mutate(value);assert.throws(()=>validateAnalysis(value,f.pack),undefined,name);}
    const illegalCandidates=[
      ['NON_5_STEP',c=>{c.probabilities={DOWN:36,FLAT:24,UP:40};}],['BAD_SUM',c=>{c.probabilities.UP=45;}],
      ['UNKNOWN_MARKET',c=>{c.mainReasons[0].evidenceId='market-unknown';}],['DUPLICATE_MAIN',c=>{c.mainReasons.push(c.mainReasons[0]);}],
      ['SAME_EVENT',c=>{c.mainReasons=[{evidenceId:'eia-stocks',text:'美国馏分油库存减少'},{evidenceId:'eia-production',text:'美国馏分油产量减少'}];}],
      ['REVERSE_REASON',c=>{c.primaryDirection='DOWN';}],['MISSING_ASSESSMENT',c=>{c.signalAssessments.pop();}],
      ['TAMPERED_HASH',c=>{c.evidenceHash='0'.repeat(64);}],['EXPIRED_FORECAST',c=>{c.validUntil=f.now;}],
    ];
    for(const [name,mutate]of illegalCandidates){const c=structuredClone(candidate);mutate(c);assert.equal(coreForecastGate(c,f.pack,{now,expectedEvidenceHash:evidenceHashFor(f.pack)}).gate,'FAIL',name);}
    const illegalPacks=[
      ['MISSING_DIESEL',p=>{p.signals=p.signals.filter(s=>s.id!=='market-diesel');}],
      ['MISSING_BRENT',p=>{p.signals=p.signals.filter(s=>s.id!=='market-brent');}],
      ['MISSING_WTI',p=>{p.signals=p.signals.filter(s=>s.id!=='market-wti');}],
      ['STALE_INVENTORY',p=>{p.signals.find(s=>s.id==='eia-stocks').nextReleaseAt=f.now;}],
      ['FORGED_SOURCE',p=>{p.signals[0].sourceUrl='https://example.com/forged';}],
      ['WRONG_UNIT',p=>{p.signals.find(s=>s.id==='market-diesel').observation.unit='USD/barrel';}],
      ['STALE_DIESEL',p=>{p.signals.find(s=>s.id==='market-diesel').eventDate='2026-09-20';}],
      ['EXPIRED_PACK',p=>{p.generatedAt='2026-09-28T05:00:00Z';}],
      ['MAJOR_CONFLICT',p=>{p.conflicts=[{severity:'MAJOR'}];}],
    ];
    for(const [name,mutate]of illegalPacks) {
      const p=structuredClone(f.pack);mutate(p);assert.equal(coreEvidenceGate(p,{now}).gate,'FAIL',name);
      assert.equal(coreForecastGate(candidate,p,{now}).gate,'FAIL',name);
      let calls=0;const options=replayProviderOptions(base,now);options.fetchImpl=async()=>{calls++;throw new Error('MUST_NOT_CALL');};
      await assert.rejects(createQwenProvider(options).generateForecast({evidencePack:p,evidenceHash:evidenceHashFor(p),now}),/EVIDENCE_GATE_FAILED/);
      assert.equal(calls,0,name);
    }
    const scan=await scanTemporary(root);
    const dimensions=Object.fromEntries(Object.entries(coverage).map(([key,v])=>[key,[...v].sort()]));
    for(const [key,expected]of Object.entries({directions:['DOWN','UP'],mainCounts:[1,2,3],counterCounts:[0,1,2],newsCounts:[0,1,2,3],strengths:['HIGH','LOW','MEDIUM'],modes:['LIMITED','NORMAL']}))assert.deepEqual(dimensions[key],expected,`missing ${key} coverage`);
    return {gate:'PASS',seed,legalCases:count,homogeneousSyntheticVariants:homogeneousVariants,illegalCases:illegalAnalysis.length+illegalCandidates.length+illegalPacks.length,coverage:dimensions,publicScan:scan.gate,elapsedMs:Math.round(performance.now()-started),realQwenCalls:0};
  }finally{await rm(root,{recursive:true,force:true});}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try{console.log(JSON.stringify(process.argv[2]==='fuzz'?await runContractFuzz():await runReplay()));}
  catch(error){console.error(error.message);process.exitCode=1;}
}
