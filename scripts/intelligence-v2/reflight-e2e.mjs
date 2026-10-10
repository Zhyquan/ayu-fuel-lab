// Cross-repository isolated delivery replay. Both HTTP transports and the database
// are injected; this command cannot call Qwen or write any cloud environment.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { loadReplayFixture, replayOutput, replayProviderOptions } from './replay.mjs';
import { externalPackage, externalScenario } from '../../tests/fixtures/external-signal-scenario.mjs';
import { createQwenProvider } from './qwen-provider.mjs';
import { evidenceHashFor } from './history.mjs';
import { currentHash } from './current-publication.mjs';
import { acceptedEvidenceGate } from '../../dist/data/accepted-evidence-contract.js';

const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const plain = value => JSON.parse(JSON.stringify(value));
function isolatedDatabase() {
  const rows = new Map();
  const db = { collection: name => ({ doc: id => ({
    get: async () => ({ data: rows.get(`${name}:${id}`) ?? null }),
    set: async ({ data }) => rows.set(`${name}:${id}`, plain(data)),
  }) }), runTransaction: async fn => fn(db) };
  return { db, rows };
}

function clientFactory(source, requireFuel, now, storage) {
  const timers = new Map(); let next = 0;
  class FixtureDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  const runtime = { getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, plain(value)), removeStorageSync: key => storage.delete(key) };
  const scope = { context: { native: 'synthetic-owner-context', environment: 'isolated-local' }, generation: 0 };
  const context = { Date: FixtureDate, wx: runtime, Page() {}, module: { exports: {} },
    setTimeout: (fn, ms) => { timers.set(++next, { fn, ms }); return next; }, clearTimeout: id => timers.delete(id),
    require: name => name.startsWith('./') ? requireFuel(name) : name.endsWith('/payment-purchase')
      ? { hasPendingPurchaseOperation: () => false, activePurchaseOperation: () => null, preparePurchaseContext() {} } : {} };
  vm.runInNewContext(source, context);
  return callApi => {
    const page = context.module.exports.createFuelPage({ callApi, wxRuntime: runtime, captureScope: () => scope,
      isCurrent: s => s.context?.native === scope.context.native && s.context?.environment === scope.context.environment });
    page.data = plain(page.data); page.setData = value => Object.assign(page.data, plain(value)); page.onLoad();
    return page;
  };
}

export async function runReflightDelivery(consumerRoot) {
  assert.ok(consumerRoot, 'Explicit --consumer-root is required; no shared runtime is discovered automatically.');
  const require = createRequire(resolve(consumerRoot, 'package.json'));
  const fuel = require(resolve(consumerRoot, 'cloudfunctions/paymentDomain/fuel-forecast.js'));
  const news = require(resolve(consumerRoot, 'cloudfunctions/paymentDomain/fuel-news.js'));
  const pass = require(resolve(consumerRoot, 'cloudfunctions/paymentDomain/fuel-pass.js'));
  const requireFuel = name => require(resolve(consumerRoot, 'miniprogram/pages/fuel', name));
  const source = await readFile(resolve(consumerRoot, 'miniprogram/pages/fuel/index.js'), 'utf8');
  const clientSourceHash = hash(source), f = await loadReplayFixture(), now = Date.parse(f.now);
  assert.equal(f.fixtureKind, 'SYNTHETIC_PRODUCTION_SHAPE_NOT_FOR_PUBLICATION');
  const pack = { ...structuredClone(f.pack), newsDocuments: [], coverageMode: 'LIMITED' };
  const initial = await createQwenProvider(replayProviderOptions(replayOutput(pack), f.now)).generateForecast({
    evidencePack: pack, evidenceHash: evidenceHashFor(pack), now: new Date(now) });
  const initialCache = JSON.parse(JSON.stringify({ ...initial, evidencePack: pack }));
  const sourceCommit = 'a'.repeat(40), owner = 'synthetic-reflight-owner';
  const results = [];
  for (const [name, direction, strength, probabilities] of [
    ['CASE_UP', 'UP', 'HIGH', { DOWN: 21, FLAT: 16, UP: 63 }],
    ['CASE_DOWN', 'DOWN', 'HIGH', { DOWN: 61, FLAT: 18, UP: 21 }],
    ['CASE_NEUTRAL', 'NEUTRAL', 'LOW', initialCache.probabilities],
  ]) {
    const { db, rows } = isolatedDatabase(), storage = new Map(), started = performance.now(), times = {};
    const mark = key => times[key] = Math.round((performance.now() - started) * 100) / 100;
    const entitlement = pass.grantValue({ trustedOwner: owner, ownerOpenId: owner, operationType: 'FUEL_PASS_GRANT',
      operationId: 'synthetic-offline-entitlement', paidAt: now, paidAtPrecision: 'MILLISECOND', createdAt: now, trustedNow: now,
      payload: { productId: pass.PRODUCT_ID, durationDays: 7, sourceOrderId: 'synthetic-no-order-created', sourceRef: 'fixture-only' } });
    rows.set(`${pass.COLLECTIONS.entitlements}:${pass.entitlementId(owner)}`, { ...entitlement, status: 'ACTIVE' });
    if (name === 'CASE_NEUTRAL') await fuel.publishFuelForecast(db, { sourceCommit, sourceArtifactHash: hash(initialCache), forecast: initialCache }, { now, authorize: async () => true });
    let publicationCalls = 0;
    const p = externalPackage(f.now); Object.assign(p.signals[0], { direction, strength });
    const s = externalScenario(f, { packageValue: p, pack, role: null, mutateOutput: (value, input) => {
      Object.assign(value, replayOutput(input, { probabilities }));
      const signal = input.externalAnalystSignals[0];
      if (signal.direction !== 'NEUTRAL') {
        const key = signal.direction === 'UP' ? 'upReasonEvidenceIds' : 'downReasonEvidenceIds';
        value[key] = [value[key][0], signal.evidenceId];
      }
    } });
    mark('T0_bridgeSubmitted');
    const result = await s.run({ mode: 'REFRESH_CURRENT', onAcceptedEvidence: async collection => {
      assert.equal(acceptedEvidenceGate(collection, { now: new Date(now) }).gate, 'PASS');
      if (!publicationCalls++) {
        mark('T0_bridgeAccepted');
        mark('T1_evidenceAccepted');
      }
      mark('T2_projectionCreated');
      await news.publishAcceptedNews(db, { sourceCommit, sourceArtifactHash: hash(collection), collection }, { now, authorize: async () => true });
      mark('T3_newsPublished');
    } });
    assert.equal(result.status, name === 'CASE_NEUTRAL' ? 'ACCEPTED_NO_RECOMPUTE' : 'CURRENT_READY', result.failureCode);
    const selected = result.snapshot ?? initialCache;
    if (result.snapshot) await fuel.publishFuelForecast(db, { sourceCommit, sourceArtifactHash: hash(selected), forecast: selected }, { now, authorize: async () => true });
    const reading = await fuel.getFuelForecast(db, owner, now, () => {}, { commercialReady: false }); mark('T4_protectedRead');
    assert.equal(reading.locked, false); assert.equal(reading.status, 'LIVE');
    assert.deepEqual(reading.probabilities, probabilities);
    const id = result.acceptedCollection.acceptedEvidence[0].evidenceId;
    assert.ok(reading.acceptedEvidence.some(row => row.evidenceId === id));
    const pageFor = clientFactory(source, requireFuel, now, storage);
    let response = reading;
    const page = pageFor(async action => { assert.equal(action, 'getFuelForecast'); return response; });
    await page.onShow(); mark('T5_cardRenderable');
    assert.equal(page.data.forecastState, 'LIVE'); assert.ok(page.data.evidence.some(card => card.displayId === id));
    assert.deepEqual(plain(page.data.probabilities.map(row => row.value)), [probabilities.DOWN, probabilities.FLAT, probabilities.UP]);
    // A later LOW item reaches the already running Client without a new judgment.
    const later = externalPackage(f.now);
    Object.assign(later.signals[0], { eventKey: 'synthetic-neutral-followup', direction: 'NEUTRAL', strength: 'LOW',
      title: '合成演示：后续市场综述', summary: '新增低影响合成材料只用于证明动态卡片刷新。' });
    const followup = externalScenario(f, { packageValue: later, pack, role: null });
    const refreshed = await followup.run({ mode: 'REFRESH_CURRENT', clock: () => new Date(now + 1000),
      acceptedEvidence: result.acceptedCollection.acceptedEvidence,
      onAcceptedEvidence: collection => news.publishAcceptedNews(db, { sourceCommit, sourceArtifactHash: hash(collection), collection },
        { now: now + 1000, authorize: async () => true }) });
    assert.equal(refreshed.status, 'ACCEPTED_NO_RECOMPUTE'); assert.equal(followup.counts.model, 0);
    const updated = await fuel.getFuelForecast(db, owner, now + 1000, () => {}, { commercialReady: false });
    assert.equal(updated.forecastHash, reading.forecastHash);
    assert.notEqual(updated.newsCollectionHash, reading.newsCollectionHash);
    response = updated; await page.refreshForecast();
    const followupId = refreshed.acceptedCollection.acceptedEvidence.find(row => row.eventKey === later.signals[0].eventKey).evidenceId;
    assert.ok(page.data.evidence.some(card => card.displayId === followupId));
    page.onHide();
    const cold = pageFor(async () => { throw new Error('SYNTHETIC_OFFLINE'); });
    await cold.onShow();
    assert.equal(cold.data.forecastState, 'STALE', 'Cold launch must retain same-owner LKG offline.');
    assert.deepEqual(plain(cold.data.probabilities), plain(page.data.probabilities)); cold.onHide();
    const locked = await fuel.getFuelForecast(db, 'synthetic-unpaid-owner', now, () => {}, { commercialReady: false });
    assert.equal(locked.locked, true); assert.ok(!('probabilities' in locked)); assert.ok(!('acceptedEvidence' in locked));
    assert.equal(s.counts.model, name === 'CASE_NEUTRAL' ? 0 : 1); assert.equal(s.counts.article, 0);
    if (name === 'CASE_NEUTRAL') assert.equal(currentHash(selected), currentHash(initialCache));
    results.push({ name, proof: 'SYNTHETIC_MODEL_NOT_SENSITIVITY', acceptedEvidenceId: id, influence: strength,
      inputPackHash: result.snapshot?.inputPackHash ?? null, outputHash: result.providerAudit?.outputHash ?? null,
      probabilities, forecastHash: currentHash(selected), initialForecastHash: currentHash(initialCache),
      newsCollectionHash: reading.newsCollectionHash, modelRequestsInjected: s.counts.model,
      sameClientCardRendered: true, sameForecastNewNewsRevision: 'PASS', lowFollowupModelRequests: followup.counts.model,
      coldLaunchLkg: 'PASS', lockedUserNoPaidLeak: 'PASS', timesMs: times,
      acceptedToCardMs: Math.round((times.T5_cardRenderable - times.T0_bridgeAccepted) * 100) / 100 });
  }
  assert.equal(hash(await readFile(resolve(consumerRoot, 'miniprogram/pages/fuel/index.js'), 'utf8')), clientSourceHash);
  assert.notEqual(results[0].forecastHash, results[1].forecastHash);
  return { gate: 'PASS', proof: 'ISOLATED_IN_MEMORY_REPLAY_NOT_TEST_OR_PRODUCTION', results,
    clientSourceHash, realQwenCalls: 0, realOrdersCreated: 0, cloudWrites: 0, deployments: 0 };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = name => { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; };
  try {
    const result = await runReflightDelivery(arg('--consumer-root'));
    const output = arg('--output');
    if (output) { await mkdir(resolve(output, '..'), { recursive: true }); await writeFile(resolve(output), JSON.stringify(result, null, 2) + '\n'); }
    console.log(JSON.stringify(result, null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
