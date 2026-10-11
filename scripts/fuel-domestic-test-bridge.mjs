import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { domesticInputGate, runDomesticForecast } from './intelligence-v2/domestic-fuel.mjs';
import { validateDomesticBridgeRequest } from './intelligence-v2/domestic-bridge-intake.mjs';
import { buildDomesticBridgeInput, buildDomesticBridgeCards } from './intelligence-v2/domestic-bridge-input.mjs';
import { loadFreshDomesticInput } from './fuel-domestic-test-input.mjs';
import { assertFuelTestTrigger, readTestDocument, TEST_ENV, CORE_SHA, CONSUMER_SHA } from './fuel-domestic-test-runtime.mjs';
import { verifyRuntimeFiles, publishRuntimeArtifact } from './fuel-domestic-test-native.mjs';

export const BRIDGE_AUTHORIZATION='FUEL_EXPLICIT_DOMESTIC_TEST_BRIDGE_V1';
export const BRIDGE_PATH='data/domestic-test-bridge/latest-request.json';
export const CARD_PROJECTION_VERSION='DIRECTIONAL_BRIDGE_CARDS_V3';
const COLLECTION='yuzhang_fuel_forecasts';
const digest=x=>createHash('sha256').update(x).digest('hex');
const fail=code=>{throw Object.assign(new Error(code),{code});};
export const bridgeStateId=request=>`fuelDomesticBridge-${request.requestId}`;

// Read only this repository's committed analyst document; never fetch model-selected URLs.
export async function loadCommittedBridgeRequest({fetchImpl=fetch,now=()=>new Date()}={}) {
  const get=async url=>{
    const response=await fetchImpl(url,{redirect:'error',signal:AbortSignal.timeout(15000),headers:{'User-Agent':'ayu-fuel-domestic-test-bridge'}});
    if(response.status===404)return null;
    if(response.status!==200)fail('BRIDGE_REQUEST_SOURCE_HTTP_FAILED');
    const bytes=Buffer.from(await response.arrayBuffer());
    if(bytes.length>65536)fail('BRIDGE_REQUEST_SOURCE_TOO_LARGE');return bytes;
  };
  const list=await get(`https://api.github.com/repos/Zhyquan/ayu-fuel-lab/commits?path=${BRIDGE_PATH}&per_page=1`);
  if(!list)return null;
  const commits=JSON.parse(list),commit=commits?.[0]?.sha;
  if(!commit&&Array.isArray(commits)&&!commits.length)return null;
  if(!/^[a-f0-9]{40}$/.test(commit??''))fail('BRIDGE_REQUEST_COMMIT_INVALID');
  const sourceUrl=`https://raw.githubusercontent.com/Zhyquan/ayu-fuel-lab/${commit}/${BRIDGE_PATH}`;
  const bytes=await get(sourceUrl);if(!bytes)fail('BRIDGE_REQUEST_COMMITTED_FILE_MISSING');
  const checkedAt=now().toISOString(),request=JSON.parse(bytes);
  validateDomesticBridgeRequest(request,{now:new Date(checkedAt)});
  return {request,sourceReceipt:{sourceUrl,contentHash:digest(bytes),checkedAt,commit},bytes};
}

export async function reserveDomesticBridge(native,{request,requestId,startedAt,inputHash}) {
  const id=bridgeStateId(request);
  return native.runTransaction(async tx=>{
    const doc=tx.collection(COLLECTION).doc(id),lock=tx.collection(COLLECTION).doc('fuelDomesticBridgeGenerationLock');
    if(await readTestDocument(doc))return {claimed:false,reason:'REQUEST_ALREADY_CONSUMED'};
    const active=await readTestDocument(lock);
    if(active?.status==='RESERVED')return {claimed:false,reason:'GENERATION_ALREADY_RESERVED'};
    const row={authorization:BRIDGE_AUTHORIZATION,status:'RESERVED',bridgeRequestId:request.requestId,requestId,
      startedAt,triggerType:request.triggerKind,maxTotalModelCalls:1,inputHash,packageHash:request.packageHash};
    await doc.set(row);await lock.set(row);return {claimed:true,requestId};
  });
}

export async function runDomesticBridgeRequest({request,sourceReceipt,loadInput,previous=[],consumedEvidence=[],claim,saveArtifact,publish,publishCards,
  providerOptions={},onAudit=async()=>{},now=()=>new Date()}={}) {
  const startedAt=now().toISOString();validateDomesticBridgeRequest(request,{now:now()});
  // A valid analyst card does not depend on fresh market collection or successful inference.
  const initial=buildDomesticBridgeCards({pack:{generatedAt:startedAt,signals:[],newsDocuments:[]},request,previous,now:now()});
  const cardDelivery=await publishCards({collection:initial.collection,request,sourceReceipt});
  const acceptedCollection=cardDelivery.collection??initial.collection;
  if(request.signalPackage.signals.every(s=>s.strength==='LOW'))return {
    status:'CARDS_DELIVERED',modelCalls:0,cardDelivery,eligibility:{eligible:false,reason:'LOW_MATERIALITY'},
    cardIds:acceptedCollection.acceptedEvidence.map(e=>e.id),completedAt:now().toISOString()};
  let loaded;
  try {loaded=await loadInput();} catch(error) {
    return {status:'CARDS_DELIVERED_CORE_PENDING',modelCalls:0,cardDelivery,eligibility:{eligible:false,reason:'CORE_INPUT_UNAVAILABLE'},
      code:error.validationSubtype??error.code??'BRIDGE_INPUT_UNAVAILABLE',cardIds:acceptedCollection.acceptedEvidence.map(e=>e.id)};
  }
  const time=now();
  const input=buildDomesticBridgeInput({input:loaded.input,request,sourceReceipt,now:time});
  const gate=domesticInputGate(input,{now:time});
  if(gate.gate!=='PASS')return {status:'INPUT_REJECTED',gate,modelCalls:0};
  const {eligibility}=buildDomesticBridgeCards({pack:loaded.pack,request,previous,consumedEvidence,now:time});
  if(!eligibility.eligible)return {status:'CARDS_DELIVERED',modelCalls:0,cardDelivery,eligibility,
    cardIds:acceptedCollection.acceptedEvidence.map(e=>e.id),completedAt:now().toISOString()};
  if(providerOptions.mock!==true&&!providerOptions.environment?.DASHSCOPE_API_KEY)return {
    status:'CARDS_DELIVERED_CORE_PENDING',modelCalls:0,cardDelivery,code:'FUEL_TEST_API_KEY_ABSENT',eligibility};
  const reservation=await claim({request,startedAt,inputHash:digest(JSON.stringify(input))});
  if(!reservation.claimed)return {status:reservation.reason,modelCalls:0};
  let audit=null,result;
  try {
    result=await runDomesticForecast({input,acceptedCollection,now:time,requestId:reservation.requestId,
      testAttemptId:BRIDGE_AUTHORIZATION,providerOptions:{...providerOptions,maxTransportRetries:0,maxExternalRequests:1,
        onAudit:async value=>{audit=value;await onAudit(value);}}});
  } catch(error) {
    const code=error.validationCode??error.code??error.message;
    return {status:'GENERATION_REJECTED',code:/^[A-Z0-9_]+$/.test(code)?code:'BRIDGE_GENERATION_FAILED',
      startedAt,modelCalls:audit?.actualExternalRequestCount??0,providerAudit:audit};
  }
  if(result.gate.gate!=='PASS')return {status:'FORECAST_REJECTED',gate:result.gate,modelCalls:1};
  const bundle={forecast:result.forecast,evidencePack:result.evidencePack,providerAudit:result.providerAudit};
  const bytes=Buffer.from(JSON.stringify(bundle,null,2)+'\n'),acceptedAt=now().toISOString();
  const receipt={kind:'RUNTIME_ACCEPTED_ARTIFACT',environment:TEST_ENV,coreSha:CORE_SHA,consumerSha:CONSUMER_SHA,
    sourceCommit:CORE_SHA,sourceArtifactHash:digest(bytes),forecastId:bundle.forecast.forecastId,
    evidenceRevision:bundle.forecast.evidenceRevision,authorization:BRIDGE_AUTHORIZATION,requestId:reservation.requestId,
    bridgeRequestId:request.requestId,triggerType:request.triggerKind,startedAt,acceptedAt,analystDocument:sourceReceipt,
    sourceCommitMeaning:'FROZEN_CORE_CODE_COMMIT_NOT_A_GENERATED_ARTIFACT_GIT_COMMIT'};
  const stored=await saveArtifact({bytes,receipt});
  if(!Buffer.isBuffer(stored.bytes)||digest(stored.bytes)!==receipt.sourceArtifactHash||
    JSON.stringify(stored.receipt)!==JSON.stringify(receipt))fail('BRIDGE_IMMUTABLE_ARTIFACT_MISMATCH');
  const delivery=await publish({stored});
  return {status:'DELIVERED',modelCalls:1,startedAt,acceptedAt,deliveredAt:now().toISOString(),receipt,
    forecastId:bundle.forecast.forecastId,providerResponseId:bundle.providerAudit.providerResponseId,
    probabilities:bundle.forecast.probabilities,reasonLength:Array.from(bundle.forecast.reason).length,
    cardIds:bundle.forecast.acceptedEvidence.map(e=>e.id),cardDelivery,eligibility,delivery};
}

export async function publishBridgeCards({native,consumerRoot,collection,request,sourceReceipt,now=Date.now()}={}) {
  let bytes=Buffer.from(JSON.stringify(collection,null,2)+'\n'),sourceArtifactHash=digest(bytes);
  let receipt={kind:'RUNTIME_ACCEPTED_NEWS_ARTIFACT',cardProjectionVersion:CARD_PROJECTION_VERSION,bridgeRequestId:request.requestId,sourceReceipt,
    coreSha:CORE_SHA,consumerSha:CONSUMER_SHA,sourceArtifactHash,collectionHash:collection.collectionHash};
  const id=`fuelTestBridgeNewsArtifact-${request.requestId}-direction-v3`;
  await native.runTransaction(async tx=>{
    const doc=tx.collection(COLLECTION).doc(id),old=await readTestDocument(doc);
    if(old) {
      if(old.receipt?.kind!==receipt.kind||old.receipt.bridgeRequestId!==request.requestId||
        old.receipt.coreSha!==CORE_SHA||old.receipt.consumerSha!==CONSUMER_SHA||
        old.receipt.sourceReceipt.contentHash!==sourceReceipt.contentHash||old.receipt.sourceReceipt.sourceUrl!==sourceReceipt.sourceUrl)fail('BRIDGE_NEWS_ARTIFACT_CONFLICT');
      bytes=Buffer.from(old.artifactBytesBase64,'base64');receipt=old.receipt;sourceArtifactHash=digest(bytes);
      if(sourceArtifactHash!==receipt.sourceArtifactHash)fail('BRIDGE_NEWS_ARTIFACT_CONFLICT');
      collection=JSON.parse(bytes);
    } else await doc.set({artifactBytesBase64:bytes.toString('base64'),receipt});
  });
  const doc=(db,name,key,write=false)=>{
    if(name!==COLLECTION||key!=='currentFuelNews')fail('BRIDGE_NEWS_WRITE_SCOPE_INVALID');
    return {get:async()=>({data:await readTestDocument(db.collection(name).doc(key))}),
      ...(write?{set:({data})=>db.collection(name).doc(key).set(data)}:{})};
  };
  const database={runTransaction:callback=>native.runTransaction(tx=>callback({collection:name=>({doc:key=>doc(tx,name,key,true)})}))};
  const require=createRequire(import.meta.url),{publishAcceptedNews,projectAcceptedNews}=require(resolve(consumerRoot,'fuel-news.js'));
  const current=await readTestDocument(native.collection(COLLECTION).doc('currentFuelNews'));
  if(current&&Date.parse(current.collection?.generatedAt)>Date.parse(collection.generatedAt)&&projectAcceptedNews(current,now,null)) {
    const selected=collection.acceptedEvidence.filter(e=>request.signalPackage.signals.some(s=>s.eventKey===e.eventKey));
    if(selected.length&&selected.every(e=>current.collection.acceptedEvidence.some(c=>c.id===e.id&&c.contentHash===e.contentHash&&c.directionLabel===e.directionLabel)))
      return {replayed:true,collection:current.collection};
  }
  const value={sourceCommit:sourceReceipt.commit,sourceArtifactHash,collection};
  const delivery=await publishAcceptedNews(database,value,{now,authorize:async input=>{
    const stored=await readTestDocument(native.collection(COLLECTION).doc(id));
    return input===value&&stored?.artifactBytesBase64===bytes.toString('base64')&&JSON.stringify(stored.receipt)===JSON.stringify(receipt);
  }});
  return {...delivery,collection};
}

export async function handleDomesticBridgeTimer({event,context,root,native,providerEnvironment,now=()=>new Date(),fetchImpl=fetch}={}) {
  const manifest=JSON.parse(readFileSync(resolve(root,'runtime-manifest.json'),'utf8'));
  assertFuelTestTrigger(event,context,manifest);verifyRuntimeFiles(root,manifest);
  const loadedRequest=await loadCommittedBridgeRequest({fetchImpl,now});
  if(!loadedRequest)return {status:'NO_BRIDGE_REQUEST',modelCalls:0};
  const {request,sourceReceipt}=loadedRequest,id=bridgeStateId(request);
  const intakeId=`fuelDomesticBridgeIntake-${request.requestId}`;
  const intake=await readTestDocument(native.collection(COLLECTION).doc(intakeId));
  if(intake?.cardProjectionVersion===CARD_PROJECTION_VERSION)return {status:'BRIDGE_INTAKE_ALREADY_DELIVERED',modelCalls:0};
  const reserved=await readTestDocument(native.collection(COLLECTION).doc(id));
  if(reserved?.status==='RESERVED')return {status:'REQUEST_ALREADY_CONSUMED',modelCalls:0};
  const current=await readTestDocument(native.collection(COLLECTION).doc('currentFuelForecast'));
  const news=await readTestDocument(native.collection(COLLECTION).doc('currentFuelNews'));
  const previous=[...(current?.forecast?.acceptedEvidence??[]),...(news?.collection?.acceptedEvidence??[])];
  if(reserved||intake?.status==='DELIVERED') {
    const {collection}=buildDomesticBridgeCards({pack:{generatedAt:now().toISOString(),signals:[],newsDocuments:[]},request,previous,now:now()});
    const cardDelivery=await publishBridgeCards({native,consumerRoot:resolve(root,'consumer'),collection,request,sourceReceipt,now:+now()});
    const metadata={cardProjectionVersion:CARD_PROJECTION_VERSION,cardProjectionRefreshedAt:now().toISOString()};
    const doc=native.collection(COLLECTION).doc(intakeId);
    if(intake)await doc.update(metadata);
    else await doc.set({status:'CARDS_DELIVERED',bridgeRequestId:request.requestId,...metadata});
    return {status:'BRIDGE_CARDS_REFRESHED',modelCalls:0,cardDelivery};
  }
  const seedBytes=readFileSync(resolve(root,'domestic-source-seed.json'));
  if(digest(seedBytes)!==manifest.sourceSeedHash)fail('FUEL_TEST_SOURCE_SEED_MISMATCH');
  const diagnostic=native.collection(COLLECTION).doc(`fuelDomesticBridgePreflight-${request.requestId}`);
  await diagnostic.set({status:'ENTRY_RECEIVED',receivedAt:now().toISOString(),requestId:context.request_id,
    bridgeRequestId:request.requestId,sourceReceipt,eventType:event.Type,functionVersion:String(context.function_version)});
  const consumedEvidence=(current?.evidencePack?.evidence??[]).filter(e=>e.evidenceId?.startsWith('external-'));
  const result=await runDomesticBridgeRequest({request,sourceReceipt,previous,consumedEvidence,now,
    loadInput:async()=>{
      let pack;const loaded=await loadFreshDomesticInput(JSON.parse(seedBytes),{fetchImpl,now,onMarketInput:async audit=>{
        pack=audit.pack;await diagnostic.update({marketInputAudit:audit});}});return {...loaded,pack};
    },
    publishCards:value=>publishBridgeCards({native,consumerRoot:resolve(root,'consumer'),...value,now:+now()}),
    claim:value=>reserveDomesticBridge(native,{...value,requestId:context.request_id}),
    providerOptions:{environment:providerEnvironment,activationAuthorized:true,clock:now,timeoutMs:45000},
    onAudit:async audit=>native.collection(COLLECTION).doc(id).update({providerAudit:audit}),
    saveArtifact:async({bytes,receipt})=>{
      receipt.artifactLocator=`fuelTestRuntimeArtifact-${receipt.forecastId}`;
      const data={artifactBytesBase64:bytes.toString('base64'),receipt};
      await native.runTransaction(async tx=>{
        const doc=tx.collection(COLLECTION).doc(receipt.artifactLocator),old=await readTestDocument(doc);
        if(old&&old.artifactBytesBase64!==data.artifactBytesBase64)fail('BRIDGE_ARTIFACT_CONFLICT');
        if(!old)await doc.set(data);
      });return {bytes,receipt};
    },
    publish:({stored})=>publishRuntimeArtifact({native,consumerRoot:resolve(root,'consumer'),stored,now:+now()})});
  await diagnostic.update({status:result.status,resultCode:result.code??null,completedAt:now().toISOString()});
  if(['CARDS_DELIVERED','DELIVERED'].includes(result.status))await native.collection(COLLECTION).doc(intakeId).set({
    status:result.status,cardProjectionVersion:CARD_PROJECTION_VERSION,requestId:context.request_id,bridgeRequestId:request.requestId,result,completedAt:now().toISOString()});
  const state=await readTestDocument(native.collection(COLLECTION).doc(id));
  if(state?.requestId===context.request_id) {
    const terminal={status:result.status,completedAt:now().toISOString(),result};
    await native.collection(COLLECTION).doc(id).update(terminal);
    await native.collection(COLLECTION).doc('fuelDomesticBridgeGenerationLock').update(terminal);
  }
  return result;
}
