import { mkdir, writeFile, rename, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chinaDate } from '../dist/data/validation.js';
import { adaptAPIZeroForecast } from './apizero-forecast-adapter.mjs';
import { mapForecastDirection, toPublicForecast, unavailableForecast } from '../dist/data/forecast-contract.js';

export async function requestForecast({ fetchImpl=fetch, timeoutMs=20000 }={}) {
  const fetchedAt=()=>new Date().toISOString();
  try {
    const response=await fetchImpl('https://v1.apizero.cn/api/oil-price-forecast?action=forecast',{signal:AbortSignal.timeout(timeoutMs)});
    return {httpStatus:response.status,rawText:await response.text(),rawFetchedAt:fetchedAt()};
  } catch(error) { return {httpStatus:null,rawText:'',rawFetchedAt:fetchedAt(),error:error.name==='TimeoutError'?'FORECAST_TIMEOUT':'FORECAST_REQUEST_FAILED'}; }
}

export async function saveForecastSnapshot(snapshot, { root=new URL('../',import.meta.url), crosscheck, now=new Date() }={}) {
  let raw=null;
  try {raw=JSON.parse(snapshot.rawText);} catch { /* Invalid JSON is archived as received and fails validation. */ }
  const result=adaptAPIZeroForecast(raw,{...snapshot,crosscheck,now});
  const digest=createHash('sha256').update(snapshot.rawText).digest('hex');
  const assessedAt=new Date(now).toISOString();
  const name=snapshot.rawFetchedAt.replace(/[:.]/g,'-')+'-assessed-'+assessedAt.replace(/[:.]/g,'-')+'-'+digest.slice(0,12)+'.json';
  const prediction=raw?.data?.prediction;
  const history={assessedAt,assessmentVersion:'APIZERO_FORECAST_GATE_V1',forecastDate:chinaDate(snapshot.rawFetchedAt),source:'APIZERO',gate:result.gate,issues:result.issues,
    direction:mapForecastDirection(prediction?.direction),sourceDirectionRaw:prediction?.direction??null,
    estimatedChangePerTon:prediction?.estimated_change_per_ton??null,estimatedChangePerLiter:prediction?.estimated_change_per_liter??null,
    sourceConfidenceRaw:prediction?.confidence??null,brent:raw?.data?.crude_oil?.brent??null,wti:raw?.data?.crude_oil?.wti??null,
    rawFetchedAt:snapshot.rawFetchedAt,httpStatus:snapshot.httpStatus,requestError:snapshot.error??null,rawSha256:digest,
    rawText:snapshot.rawText,crosscheck:crosscheck??null};
  await mkdir(new URL('data/forecast-history/',root),{recursive:true});
  // Exclusive creation: neither repeated runs nor same-day snapshots overwrite history.
  await writeFile(new URL('data/forecast-history/'+name,root),JSON.stringify(history,null,2)+'\n',{flag:'wx'});
  await mkdir(new URL('dist/data/',root),{recursive:true});
  const temporary=new URL('dist/data/forecast-cache.json.tmp',root);
  await writeFile(temporary,JSON.stringify(toPublicForecast(result.normalized),null,2)+'\n');
  await rename(temporary,new URL('dist/data/forecast-cache.json',root));
  return {...result,historyFile:name};
}

async function main() {
  // Source gate is not approved; automatic use is intentionally not wired to Pages.
  let crosscheck;
  if (process.env.FORECAST_EVIDENCE_FILE) crosscheck=JSON.parse(await readFile(process.env.FORECAST_EVIDENCE_FILE,'utf8'));
  const snapshot=await requestForecast();
  const result=await saveForecastSnapshot(snapshot,{crosscheck});
  console.log(JSON.stringify({APIZERO_FORECAST_GATE:result.gate,issues:result.issues,historyFile:result.historyFile}));
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) main().catch(async error=>{
  // Optional forecast storage/update failure must still clear an old forecast.
  await writeFile(new URL('../dist/data/forecast-cache.json',import.meta.url),JSON.stringify(unavailableForecast('FORECAST_UPDATE_FAILED'))+'\n');
  console.error(error.code??'FORECAST_UPDATE_FAILED');
});
