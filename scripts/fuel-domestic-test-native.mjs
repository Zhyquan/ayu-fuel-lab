import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { runFuelTestTrigger, reserveFuelTestOpportunity, readTestDocument, assertFuelTestTrigger, TEST_ENV, CORE_SHA, CONSUMER_SHA, AUTHORIZATION } from './fuel-domestic-test-runtime.mjs';
import { loadFreshDomesticInput } from './fuel-domestic-test-input.mjs';
import { verifyAcceptedCollection } from './intelligence-v2/accepted-news-refresh.mjs';

const COLLECTION='yuzhang_fuel_forecasts';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const normalize=result=>Array.isArray(result?.data)?result.data[0]??null:result?.data??null;
const fail=code=>{throw Object.assign(new Error(code),{code});};

export function verifyRuntimeFiles(root,manifest) {
  if(manifest.coreSha!==CORE_SHA||manifest.consumerSha!==CONSUMER_SHA||manifest.environment!==TEST_ENV||
    manifest.authorization!==AUTHORIZATION||!Array.isArray(manifest.files)||!manifest.files.length)fail('FUEL_TEST_RUNTIME_MANIFEST_INVALID');
  for(const file of manifest.files) {
    if(!(/^(?:core|consumer)\/[A-Za-z0-9_./-]+$/.test(file.path)||file.path==='index.js')||file.path.includes('..')||
      digest(readFileSync(resolve(root,file.path)))!==file.sha256)fail('FUEL_TEST_FROZEN_BYTES_MISMATCH');
  }
}

// Only the existing Test Forecast documents are exposed to the frozen publication transaction.
export function nativePublicationDatabase(native,receipt) {
  const allowed=new Set(['currentFuelForecast',receipt.forecastId]);
  const doc=(db,name,id,writable)=>{
    if(name!==COLLECTION||!allowed.has(id))fail('FUEL_TEST_PUBLICATION_SCOPE_INVALID');
    return {get:async()=>({data:normalize(await db.collection(name).doc(id).get())}),...(writable?{set:({data})=>{
      if(data.sourceCommit!==receipt.sourceCommit||data.sourceArtifactHash!==receipt.sourceArtifactHash||
        data.forecastHash!==receipt.forecastId)fail('FUEL_TEST_PUBLICATION_SCOPE_INVALID');
      const {_id,...payload}=data;return db.collection(name).doc(id).set(payload);
    }}:{})};
  };
  return {collection:name=>({doc:id=>doc(native,name,id,false)}),
    runTransaction:callback=>native.runTransaction(tx=>callback({collection:name=>({doc:id=>doc(tx,name,id,true)})}))};
}

// Authorization comes from this exact private Test runtime and its immutable artifact,
// not from a client request, a model-selected source, or a fictional Git artifact commit.
export async function publishRuntimeArtifact({native,consumerRoot,stored,now=Date.now()}={}) {
  const {bytes,receipt}=stored;
  if(!Buffer.isBuffer(bytes)||receipt.kind!=='RUNTIME_ACCEPTED_ARTIFACT'||receipt.environment!==TEST_ENV||
    receipt.coreSha!==CORE_SHA||receipt.consumerSha!==CONSUMER_SHA||receipt.sourceCommit!==CORE_SHA||
    receipt.authorization!==AUTHORIZATION||digest(bytes)!==receipt.sourceArtifactHash)fail('FUEL_TEST_RUNTIME_ARTIFACT_INVALID');
  const bundle=JSON.parse(bytes),require=createRequire(import.meta.url);
  const {checkBundle}=require(resolve(consumerRoot,'fuel-contract/domestic-fuel-projection.js'));
  if(!checkBundle(bundle,now)||bundle.forecast.evidenceProof!=='REAL_VERIFIED_EVIDENCE'||
    bundle.providerAudit.mock!==false||bundle.providerAudit.actualExternalRequestCount!==1)fail('FUEL_TEST_RUNTIME_ARTIFACT_INVALID');
  const persistent=await readTestDocument(native.collection(COLLECTION).doc(receipt.artifactLocator));
  if(persistent?.artifactBytesBase64!==bytes.toString('base64')||
    JSON.stringify(persistent?.receipt)!==JSON.stringify(receipt))fail('FUEL_TEST_IMMUTABLE_ARTIFACT_MISMATCH');
  const input={sourceCommit:receipt.sourceCommit,sourceArtifactHash:receipt.sourceArtifactHash,...bundle};
  const {publishFuelForecast}=require(resolve(consumerRoot,'fuel-forecast.js'));
  return publishFuelForecast(nativePublicationDatabase(native,receipt),input,
    {now,authorize:async value=>value===input&&digest(bytes)===receipt.sourceArtifactHash});
}

export async function handleFuelTestTimer({event,context,root,native,providerEnvironment,now=()=>new Date()}={}) {
  const manifest=JSON.parse(readFileSync(resolve(root,'runtime-manifest.json'),'utf8'));
  assertFuelTestTrigger(event,context,manifest);
  verifyRuntimeFiles(root,manifest);
  const stateId='fuelFinalIntegrationAuthorization20261011';
  // Budget check precedes every public HTTP request. Reserved also means consumed after a failure.
  if(await readTestDocument(native.collection(COLLECTION).doc(stateId)))return {status:'TEST_AUTHORIZATION_ALREADY_CONSUMED',modelCalls:0};
  const seed=JSON.parse(readFileSync(resolve(root,'domestic-source-seed.json'),'utf8'));
  if(digest(readFileSync(resolve(root,'domestic-source-seed.json')))!==manifest.sourceSeedHash)fail('FUEL_TEST_SOURCE_SEED_MISMATCH');
  const newsRow=await readTestDocument(native.collection(COLLECTION).doc('currentFuelNews'));
  let acceptedCollection=newsRow?.collection??null,newsStatus='UNAVAILABLE';
  if(acceptedCollection) {
    try {verifyAcceptedCollection(acceptedCollection,{now:now()});newsStatus='VALID';}
    catch {acceptedCollection=null;newsStatus='INVALID_OPTIONAL_NEWS_OMITTED';}
  }
  let loaded;
  const result=await runFuelTestTrigger({event,context,binding:manifest,
    loadInput:async()=>{loaded=await loadFreshDomesticInput(seed,{now});return loaded.input;},
    loadCurrent:async()=>readTestDocument(native.collection(COLLECTION).doc('currentFuelForecast')),
    claim:request=>reserveFuelTestOpportunity(native,request,context.request_id),
    acceptedCollection,now,
    providerOptions:{environment:providerEnvironment,activationAuthorized:true,clock:now,timeoutMs:45000},
    onAudit:async audit=>{await native.collection(COLLECTION).doc(stateId).update({providerAudit:audit});},
    saveArtifact:async({bytes,receipt})=>{
      receipt.artifactLocator=`fuelTestRuntimeArtifact-${receipt.forecastId}`;
      const data={artifactBytesBase64:bytes.toString('base64'),receipt,sourceReceipts:loaded.sourceReceipts};
      await native.runTransaction(async tx=>{
        const doc=tx.collection(COLLECTION).doc(receipt.artifactLocator),existing=await readTestDocument(doc);
        if(existing) {const {_id,...previous}=existing;if(JSON.stringify(previous)!==JSON.stringify(data))fail('FUEL_TEST_IMMUTABLE_ARTIFACT_CONFLICT');}
        if(!existing)await doc.set(data);
      });
      const row=normalize(await native.collection(COLLECTION).doc(receipt.artifactLocator).get());
      return {bytes:Buffer.from(row.artifactBytesBase64,'base64'),receipt:row.receipt};
    },
    publish:async({bundle,receipt})=>publishRuntimeArtifact({native,consumerRoot:resolve(root,'consumer'),
      stored:{bytes:Buffer.from(JSON.stringify(bundle,null,2)+'\n'),receipt},now:+now()}),
  });
  if(result.status==='DELIVERED')await native.collection(COLLECTION).doc(stateId).update({status:'DELIVERED',
    forecastId:result.forecastId,receipt:result.receipt,deliveredAt:result.deliveredAt});
  if(['GENERATION_REJECTED','FORECAST_REJECTED'].includes(result.status))await native.collection(COLLECTION).doc(stateId).update({status:result.status,
    validationCode:result.code??result.gate?.errors?.[0]??'FUEL_TEST_FORECAST_REJECTED',completedAt:now().toISOString()});
  return {...result,newsStatus};
}
