import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { domesticFixture } from './fixtures/domestic-fuel-fixtures.mjs';
import { normalizeDomesticForecast } from '../scripts/intelligence-v2/domestic-fuel.mjs';
import { evidenceHashFor } from '../scripts/intelligence-v2/history.mjs';
import { nativePublicationDatabase, publishRuntimeArtifact } from '../scripts/fuel-domestic-test-native.mjs';
import { TEST_ENV, CORE_SHA, CONSUMER_SHA, AUTHORIZATION } from '../scripts/fuel-domestic-test-runtime.mjs';

const collectionName='yuzhang_fuel_forecasts',digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const consumerRoot=process.env.FUEL_TEST_CONSUMER_ROOT&&resolve(process.env.FUEL_TEST_CONSUMER_ROOT,'cloudfunctions/paymentDomain');
const needsConsumer={skip:consumerRoot?false:'Set FUEL_TEST_CONSUMER_ROOT to the frozen Consumer checkout'};

// Every source/provider value is invented. REAL/mocked-audit flags below exercise publication
// contract shapes only; these tests make zero HTTP requests and are never real source/model proof.
async function fixtureBundle(now=new Date('2026-10-11T03:00:00.000Z')) {
  const f=await domesticFixture('CASE_DOWN_DOMESTIC',{now});f.input.evidenceProof='REAL_VERIFIED_EVIDENCE';
  const forecast=await normalizeDomesticForecast({analysis:f.analysis,input:f.input,now});
  const providerAudit={provider:'QWEN',model:'qwen3.8-flash',promptVersion:'qwen-domestic-fuel-v1-integer-1pct',status:'OK',mock:false,
    semanticCallCount:1,configuredTransportRetries:0,maxExternalRequests:1,actualExternalRequestCount:1,attemptCount:1,httpStatus:200,
    inputPackHash:evidenceHashFor(f.input),evidenceHash:evidenceHashFor(f.input),outputHash:digest(JSON.stringify(f.analysis)),
    requestStartedAt:now.toISOString(),requestCompletedAt:now.toISOString(),providerResponseId:'synthetic-local-native-publication'};
  return {forecast,evidencePack:f.input,providerAudit};
}

function memoryNative(shape='OBJECT') {
  const rows=new Map(),writes=[];let queue=Promise.resolve();
  const collection=(store,pending)=>name=>({doc:id=>({
    get:async()=>{const value=store.has(`${name}/${id}`)?{...structuredClone(store.get(`${name}/${id}`)),_id:id}:null;
      return {data:shape==='ARRAY'?(value?[value]:[]):value};},
    set:async payload=>{assert.equal(Object.hasOwn(payload,'data'),false,'Node SDK set takes the plain document');
      store.set(`${name}/${id}`,structuredClone(payload));pending.push({name,id,payload:structuredClone(payload)});},
  })});
  return {rows,writes,collection:collection(rows,writes),runTransaction:callback=>{
    const operation=queue.then(async()=>{const staged=new Map(structuredClone([...rows])),pending=[];
      const result=await callback({collection:collection(staged,pending)});
      rows.clear();for(const [key,value]of staged)rows.set(key,value);writes.push(...pending);return result;});
    queue=operation.catch(()=>{});return operation;
  }};
}

function persist(native,bundle,{bytes=Buffer.from(JSON.stringify(bundle,null,2)+'\n'),suffix=''}={}) {
  const receipt={kind:'RUNTIME_ACCEPTED_ARTIFACT',environment:TEST_ENV,coreSha:CORE_SHA,consumerSha:CONSUMER_SHA,sourceCommit:CORE_SHA,
    sourceArtifactHash:digest(bytes),forecastId:bundle.forecast.forecastId,evidenceRevision:bundle.forecast.evidenceRevision,
    authorization:AUTHORIZATION,artifactLocator:`synthetic-artifact-${bundle.forecast.forecastId}${suffix}`,
    sourceCommitMeaning:'FROZEN_CORE_CODE_COMMIT_NOT_A_GENERATED_ARTIFACT_GIT_COMMIT'};
  native.rows.set(`${collectionName}/${receipt.artifactLocator}`,{artifactBytesBase64:bytes.toString('base64'),receipt:structuredClone(receipt)});
  return {bytes,receipt};
}
const snapshot=native=>JSON.stringify([...native.rows]);
const publish=(native,stored,now)=>publishRuntimeArtifact({native,consumerRoot,stored,now:+now});

for(const shape of ['OBJECT','ARRAY'])test(`frozen publisher writes current/history through native ${shape} reads with _id`,needsConsumer,async()=>{
  const native=memoryNative(shape),bundle=await fixtureBundle(),stored=persist(native,bundle),now=new Date('2026-10-11T03:01:00.000Z');
  const untouched=new Map([['currentFuelNews',{synthetic:'news'}],['currentFuelPrices',{synthetic:'prices'}]]);
  for(const [id,row]of untouched)native.rows.set(`${collectionName}/${id}`,row);
  const result=await publish(native,stored,now);
  assert.equal(result.forecastHash,bundle.forecast.forecastId);assert.equal(result.replayed,false);
  assert.deepEqual(native.writes.map(w=>w.id),[bundle.forecast.forecastId,'currentFuelForecast']);
  const current=native.rows.get(`${collectionName}/currentFuelForecast`);
  assert.equal(Object.hasOwn(current,'_id'),false);assert.equal(current.sourceCommit,CORE_SHA);assert.equal(current.sourceArtifactHash,digest(stored.bytes));
  assert.deepEqual(current.forecast.probabilities,bundle.forecast.probabilities);
  assert.deepEqual(current,native.rows.get(`${collectionName}/${bundle.forecast.forecastId}`));
  const require=createRequire(import.meta.url),{validatePublication}=require(resolve(consumerRoot,'fuel-forecast.js'));
  assert.equal(validatePublication({...current,_id:'currentFuelForecast'},+now).status,'LIVE');
  for(const [id,row]of untouched)assert.deepEqual(native.rows.get(`${collectionName}/${id}`),row);
});

test('immutable candidate bytes and persisted artifact tampering fail before publication',needsConsumer,async()=>{
  const bundle=await fixtureBundle(),now=new Date('2026-10-11T03:01:00.000Z');
  for(const tamper of [
    stored=>stored.bytes=Buffer.concat([stored.bytes,Buffer.from(' ')]),
    (stored,native)=>native.rows.get(`${collectionName}/${stored.receipt.artifactLocator}`).artifactBytesBase64=Buffer.from('{}').toString('base64'),
    (stored,native)=>native.rows.get(`${collectionName}/${stored.receipt.artifactLocator}`).receipt.authorization='changed',
  ]) {
    const native=memoryNative(),stored=persist(native,bundle);tamper(stored,native);const before=snapshot(native);
    await assert.rejects(()=>publish(native,stored,now),/FUEL_TEST_(RUNTIME_ARTIFACT_INVALID|IMMUTABLE_ARTIFACT_MISMATCH)/);
    assert.equal(native.writes.length,0);assert.equal(snapshot(native),before);
  }
});

test('duplicate publication performs no native writes and preserves current/history bytes',needsConsumer,async()=>{
  const native=memoryNative(),stored=persist(native,await fixtureBundle()),now=new Date('2026-10-11T03:01:00.000Z');
  await publish(native,stored,now);const before=snapshot(native),count=native.writes.length;
  const second=await publish(native,stored,new Date(+now+1000));
  assert.equal(second.replayed,true);assert.equal(native.writes.length,count);assert.equal(snapshot(native),before);
});

test('older candidate and conflicting bytes cannot replace protected current LKG',needsConsumer,async()=>{
  const native=memoryNative(),older=persist(native,await fixtureBundle()),newer=persist(native,await fixtureBundle(new Date('2026-10-11T04:00:00.000Z')));
  const now=new Date('2026-10-11T04:01:00.000Z');await publish(native,newer,now);
  const alternate=persist(native,JSON.parse(newer.bytes),{bytes:Buffer.from(JSON.stringify(JSON.parse(newer.bytes))),suffix:'-different-bytes'});
  const before=snapshot(native),count=native.writes.length;
  for(const stored of [older,alternate])await assert.rejects(()=>publish(native,stored,now),/FUEL_PUBLICATION_VERSION_CONFLICT/);
  assert.equal(native.writes.length,count);assert.equal(snapshot(native),before);
});

test('changed source identity and mock provider audit never pass native publication authorization',needsConsumer,async()=>{
  for(const modify of [stored=>stored.receipt.environment='not-test',stored=>stored.receipt.coreSha='0'.repeat(40),
    stored=>stored.receipt.consumerSha='0'.repeat(40),stored=>stored.receipt.sourceCommit='0'.repeat(40)]) {
    const native=memoryNative(),stored=persist(native,await fixtureBundle());modify(stored);const before=snapshot(native);
    await assert.rejects(()=>publish(native,stored,new Date('2026-10-11T03:01:00.000Z')),/FUEL_TEST_RUNTIME_ARTIFACT_INVALID/);
    assert.equal(native.writes.length,0);assert.equal(snapshot(native),before);
  }
  const native=memoryNative(),bundle=await fixtureBundle();bundle.providerAudit.mock=true;const stored=persist(native,bundle);
  await assert.rejects(()=>publish(native,stored,new Date('2026-10-11T03:01:00.000Z')),/FUEL_TEST_RUNTIME_ARTIFACT_INVALID/);
  assert.equal(native.writes.length,0);
});

test('publication wrapper permits only exact Forecast docs and source identity inside the native transaction',async()=>{
  const native=memoryNative(),receipt={forecastId:'synthetic-id',sourceCommit:CORE_SHA,sourceArtifactHash:'a'.repeat(64)};
  const db=nativePublicationDatabase(native,receipt);
  for(const [name,id]of [['paymentOrders','synthetic-id'],['yuzhang_fuel_entitlements','synthetic-id'],
    [collectionName,'currentFuelNews'],[collectionName,'currentFuelPrices'],[collectionName,'other-history']]) {
    assert.throws(()=>db.collection(name).doc(id),/FUEL_TEST_PUBLICATION_SCOPE_INVALID/);
    await assert.rejects(()=>db.runTransaction(tx=>tx.collection(name).doc(id).set({data:{}})),/FUEL_TEST_PUBLICATION_SCOPE_INVALID/);
  }
  assert.equal(db.collection(collectionName).doc('currentFuelForecast').set,undefined);
  for(const data of [{sourceCommit:'wrong',sourceArtifactHash:receipt.sourceArtifactHash,forecastHash:receipt.forecastId},
    {sourceCommit:CORE_SHA,sourceArtifactHash:'b'.repeat(64),forecastHash:receipt.forecastId},
    {sourceCommit:CORE_SHA,sourceArtifactHash:receipt.sourceArtifactHash,forecastHash:'wrong'}])
    await assert.rejects(()=>db.runTransaction(tx=>tx.collection(collectionName).doc('currentFuelForecast').set({data})),/FUEL_TEST_PUBLICATION_SCOPE_INVALID/);
  assert.equal(native.writes.length,0);assert.equal(native.rows.size,0);
});
