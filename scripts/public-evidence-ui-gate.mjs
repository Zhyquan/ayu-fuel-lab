import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { evidenceGate, forecastGate, canonicalJson } from '../dist/data/intelligence-v2-contract.js';
import { publicEvidenceGate } from '../dist/data/public-evidence.js';
import { coastalProvinces } from '../dist/data/coastal-provinces.js';
import { selectProvinceData } from '../dist/data/validation.js';
import { validatePublicData } from './public-data-gate.mjs';

// Read existing frozen inputs only. This command does not collect or change data.
const read=async path=>JSON.parse(await readFile(new URL(`../${path}`,import.meta.url),'utf8'));
const now=new Date(), evidencePack=await read('CURRENT_EVIDENCE_V2.json'), forecast=await read('CURRENT_FORECAST_CANDIDATE_V2.json');
const forecastCache=await read('dist/data/forecast-cache.json'), priceCache=await read('dist/data/normalized-live-cache.json');
const evidenceHash=createHash('sha256').update(canonicalJson(evidencePack)).digest('hex');
const evidence=evidenceGate(evidencePack,{now}), forecastResult=forecastGate(forecast,evidencePack,{now,expectedEvidenceHash:evidenceHash});
const prices=validatePublicData(priceCache,{startedAt:priceCache.generatedAt,now});
const coastal=coastalProvinces.map(({name})=>({province:name,status:selectProvinceData(priceCache,name,now).status}));
const cacheMatches=canonicalJson(forecastCache)===canonicalJson({...forecast,evidencePack});
const projection=publicEvidenceGate({forecast:forecastCache,evidencePack},{now});
let browser;
try { browser=await read('outputs/evidence-ui/BROWSER_ACCEPTANCE.json'); }
catch { browser={gate:'FAIL',reason:'BROWSER_ACCEPTANCE_MISSING'}; }
const gates={
  INTELLIGENCE_V2_DATA_GATE:evidence.gate==='PASS'&&prices.gate==='PASS'&&coastal.every(p=>p.status==='LIVE')?'PASS':'FAIL',
  INTELLIGENCE_V2_FORECAST_GATE:forecastResult.gate==='PASS'&&cacheMatches?'PASS':'FAIL',
  INTELLIGENCE_V2_UI_GATE:browser.gate==='PASS'?'PASS':'FAIL',
  PUBLIC_EVIDENCE_UI_GATE:projection.gate==='PASS'&&browser.gate==='PASS'&&cacheMatches&&forecastResult.gate==='PASS'?'PASS':'FAIL',
};
const result={task:'AYU_FUEL_INTELLIGENCE_V2_EVIDENCE_UI_001',checkedAt:now.toISOString(),runType:'FROZEN_INPUT_READBACK',gates,
  forecast:{primaryDirection:forecast.primaryDirection,probabilities:forecast.probabilities,generatedAt:forecast.generatedAt,validUntil:forecast.validUntil,evidenceHash,cacheMatches},
  evidence,forecastResult,prices,coastal,publicEvidence:projection,browserAcceptance:browser.gate};
const directory=new URL('../outputs/evidence-ui/',import.meta.url);
await mkdir(directory,{recursive:true});
await writeFile(new URL('PUBLIC_EVIDENCE_UI_GATE_RESULT.json',directory),JSON.stringify(result,null,2)+'\n');
await writeFile(new URL('public-evidence-cards.json',directory),JSON.stringify({evidenceHash,cards:projection.cards},null,2)+'\n');
console.log(JSON.stringify({checkedAt:result.checkedAt,...gates,cardCount:projection.cards.length},null,2));
if(Object.values(gates).some(gate=>gate!=='PASS'))process.exitCode=1;
