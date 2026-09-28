import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DAY, canonicalJson, forecastGate, publicUrl } from '../../dist/data/intelligence-v2-contract.js';
import { validDate, validTimestamp } from '../../dist/data/validation.js';

export const evidenceHashFor = pack => createHash('sha256').update(canonicalJson(pack)).digest('hex');
export async function saveForecastSnapshot(directory,candidate,pack,{now=new Date()}={}) {
  const gate=forecastGate(candidate,pack,{now,expectedEvidenceHash:evidenceHashFor(pack)});
  if (gate.gate!=='PASS') throw new Error('FORECAST_GATE_FAILED');
  await mkdir(directory,{recursive:true});
  const filename=`${candidate.generatedAt.replaceAll(':','-')}-${candidate.evidenceHash.slice(0,12)}.json`;
  const snapshot={...candidate,evidencePack:pack};
  const path=resolve(directory,filename);
  // Exclusive creation prevents replacing an accepted prediction, including reruns.
  await writeFile(path,JSON.stringify(snapshot,null,2)+'\n',{flag:'wx'});
  return {path,snapshot};
}

export async function recordOutcome(snapshotPath,input,{now=new Date()}={}) {
  const fields=['series','unit','baselineDate','baselinePrice','observedPrice','observationDate','observedAt','sourceUrl'];
  if (!input || Object.keys(input).some(key=>!fields.includes(key))) throw new Error('INVALID_OUTCOME_CONTRACT');
  const snapshot=JSON.parse(await readFile(snapshotPath,'utf8'));
  if (snapshot.evidenceHash!==evidenceHashFor(snapshot.evidencePack)) throw new Error('HISTORY_HASH_MISMATCH');
  const dueAt=Date.parse(snapshot.generatedAt)+7*DAY;
  if (+new Date(now)<dueAt || !validTimestamp(input.observedAt) || Date.parse(input.observedAt)<dueAt || Date.parse(input.observedAt)>+new Date(now)) throw new Error('OUTCOME_NOT_DUE');
  const baseline=snapshot.evidencePack.signals.find(s=>s.id==='market-diesel');
  if (!baseline || input.series!=='NY_HARBOR_LOW_SULFUR_DIESEL' || input.unit!=='USD/gallon' || input.baselineDate!==baseline.eventDate || input.baselinePrice!==baseline.observation.price || !Number.isFinite(input.observedPrice) || input.observedPrice<=0 || !validDate(input.observationDate) || Date.parse(input.observationDate)<Date.parse(new Date(dueAt).toISOString().slice(0,10)) || Date.parse(input.observationDate)>Date.parse(input.observedAt)) throw new Error('INCOMPATIBLE_OUTCOME_OBSERVATION');
  if (!publicUrl(input.sourceUrl) || !['www.eia.gov','fred.stlouisfed.org'].includes(new URL(input.sourceUrl).hostname)) throw new Error('OUTCOME_SOURCE_REQUIRED');
  const changePercent=(input.observedPrice/input.baselinePrice-1)*100;
  const actualObservedDirection=Math.abs(changePercent)<0.5?'FLAT':changePercent>0?'UP':'DOWN';
  const outcome={...input,forecastGeneratedAt:snapshot.generatedAt,evidenceHash:snapshot.evidenceHash,dueAt:new Date(dueAt).toISOString(),changePercent,flatThresholdPercent:0.5,actualObservedDirection};
  const path=snapshotPath.replace(/\.json$/,'.outcome.json');
  await writeFile(path,JSON.stringify(outcome,null,2)+'\n',{flag:'wx'});
  return {path,outcome};
}
