import { readFile, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { forecastGate, unavailableForecast } from '../../dist/data/intelligence-v2-contract.js';
import { createForecastProvider } from './provider.mjs';
import { evidenceHashFor, saveForecastSnapshot } from './history.mjs';

export async function runForecast({pack,manualCandidate,provider='MANUAL',historyDirectory,cachePath,now=new Date()}) {
  const evidenceHash=evidenceHashFor(pack);
  const candidate=await createForecastProvider(provider).generateForecast({evidencePack:pack,evidenceHash,manualCandidate});
  const gate=forecastGate(candidate,pack,{now,expectedEvidenceHash:evidenceHash});
  if (gate.gate!=='PASS') {
    await writeFile(cachePath,JSON.stringify(unavailableForecast(gate.errors.join(',')),null,2)+'\n');
    return {gate,history:null};
  }
  const {path,snapshot}=await saveForecastSnapshot(historyDirectory,candidate,pack,{now});
  const temporary=`${cachePath}.${process.pid}.tmp`;
  await writeFile(temporary,JSON.stringify(snapshot,null,2)+'\n');
  await rename(temporary,cachePath);
  return {gate,history:path};
}

if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const root=fileURLToPath(new URL('../../',import.meta.url));
  const pack=JSON.parse(await readFile(resolve(root,'CURRENT_EVIDENCE_V2.json'),'utf8'));
  const manualCandidate=JSON.parse(await readFile(resolve(root,'CURRENT_FORECAST_CANDIDATE_V2.json'),'utf8'));
  const result=await runForecast({pack,manualCandidate,historyDirectory:resolve(root,'data/forecast-history-v2'),cachePath:resolve(root,'dist/data/forecast-cache.json')});
  await writeFile(resolve(root,'FORECAST_GATE_V2_RESULT.json'),JSON.stringify(result.gate,null,2)+'\n');
  console.log(JSON.stringify({gate:result.gate.gate,errors:result.gate.errors,history:result.history?.split('/').at(-1) ?? null}));
  if (result.gate.gate!=='PASS') process.exitCode=1;
}
