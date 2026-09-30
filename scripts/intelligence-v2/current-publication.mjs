import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { canonicalJson, forecastGate } from '../../dist/data/intelligence-v2-contract.js';
import { publicEvidenceGate } from '../../dist/data/public-evidence.js';
import { readForecast } from '../../dist/data/intelligence-v2-service.js';
import { evidenceHashFor } from './history.mjs';
import { projectEvidence } from './qwen-provider.mjs';
import { validTimestamp } from '../../dist/data/validation.js';

export const CURRENT_CACHE_PATH='dist/data/forecast-cache.json';
export const CURRENT_ORIGIN_PATH='intelligence-v2/current-forecast-origin.json';
export const BRIDGE_WORKFLOW='Ayu Fuel · 情报桥';
export const currentHash = value => createHash('sha256').update(canonicalJson(value)).digest('hex');
const fail = code => { throw new Error(code); };

export async function verifyCurrentSnapshot(snapshot,{now=new Date()}={}) {
  const {evidencePack,...candidate}=snapshot;
  if(forecastGate(candidate,evidencePack,{now,expectedEvidenceHash:evidenceHashFor(evidencePack)}).gate!=='PASS')fail('CURRENT_FORECAST_GATE_FAILED');
  if(publicEvidenceGate({forecast:candidate,evidencePack},{now}).gate!=='PASS')fail('CURRENT_PUBLIC_EVIDENCE_GATE_FAILED');
  if((await readForecast({fetchImpl:async()=>new Response(JSON.stringify(snapshot)),now})).status!=='LIVE')fail('CURRENT_READBACK_FAILED');
  return currentHash(snapshot);
}

export async function currentPublication(snapshot,audit,{sourceCommit,runId,now=new Date()}={}) {
  const forecastHash=await verifyCurrentSnapshot(snapshot,{now});
  const inputHash=currentHash(projectEvidence(snapshot.evidencePack));
  if(!/^[a-f0-9]{40}$/.test(sourceCommit??'')||!/^\d+$/.test(String(runId??'')))fail('CURRENT_ORIGIN_INVALID');
  if(audit?.mock!==false||audit.status!=='OK'||audit.provider!=='QWEN'||audit.model!=='qwen3.8-flash'||audit.semanticCallCount!==1||
    audit.httpStatus!==200||!Number.isInteger(audit.attemptCount)||audit.attemptCount<1||audit.attemptCount>3||
    audit.inputPackHash!==inputHash||snapshot.inputPackHash!==inputHash||audit.evidenceHash!==snapshot.evidenceHash||!/^[a-f0-9]{64}$/.test(audit.outputHash??''))fail('CURRENT_PROVIDER_AUDIT_INVALID');
  return {role:'CURRENT_INTRADAY',producer:BRIDGE_WORKFLOW,sourceCommit,runId:String(runId),forecastHash,evidenceHash:snapshot.evidenceHash,
    inputPackHash:inputHash,generatedAt:snapshot.generatedAt,provider:'QWEN',model:'qwen3.8-flash',providerAudit:audit};
}

export async function verifyCurrentPublication(root,origin,options={}) {
  const snapshot=JSON.parse(await readFile(resolve(root,CURRENT_CACHE_PATH),'utf8'));
  const expected=await currentPublication(snapshot,origin.providerAudit,{...options,sourceCommit:origin.sourceCommit,runId:origin.runId});
  if(canonicalJson(expected)!==canonicalJson(origin))fail('CURRENT_ORIGIN_MISMATCH');
  return origin;
}

export async function currentDeliveryReady({root,triggerHeadSha,runCreatedAt,runId,commitSubject,now=new Date()}) {
  try {
    const origin=JSON.parse(await readFile(resolve(root,CURRENT_ORIGIN_PATH),'utf8'));
    if(origin.sourceCommit!==triggerHeadSha||origin.runId!==String(runId)||Date.parse(origin.generatedAt)<Date.parse(runCreatedAt)||
      !validTimestamp(runCreatedAt)||!validTimestamp(origin.providerAudit?.requestStartedAt)||Date.parse(origin.providerAudit.requestStartedAt)<Date.parse(runCreatedAt)||
      commitSubject!==`data: Current Forecast ${origin.forecastHash.slice(0,12)}`)return {ready:false,reason:'NOT_THIS_CURRENT_FORECAST_COMMIT'};
    await verifyCurrentPublication(root,origin,{now});
    return {ready:true,reason:null,forecastId:origin.forecastHash,role:origin.role};
  }catch{return {ready:false,reason:'CURRENT_DELIVERY_GATE_FAILED'};}
}
