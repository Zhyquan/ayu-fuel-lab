import test from 'node:test';
import assert from 'node:assert/strict';
import { roundProbabilitiesTo100, selectProbability } from '../research/ui/probability-contract.js';

// Contract fixtures only. These values are never used as a live candidate forecast.
const valid = () => ({ status: 'LIVE', source: 'AYU_PROBABILITY_MODEL_V1', generatedAt: '2026-09-27T01:00:00Z', validUntil: '2026-09-28T01:00:00Z', horizonDays: 7, primaryDirection: 'DOWN', probabilities: { down: .58, flat: .27, up: .15 }, modelVersion: 'contract-fixture', calibrated: true });
const now = new Date('2026-09-27T10:00:00Z');

test('largest remainders total 100 across rounding edges', () => {
  for (let down = 0; down <= 1000; down += 7) for (let flat = 0; flat <= 1000-down; flat += 13) {
    const p = { down: down/1000, flat: flat/1000, up: (1000-down-flat)/1000 };
    const result = roundProbabilitiesTo100(p);
    assert.equal(Object.values(result).reduce((a,b) => a+b),100);
    for (const k of Object.keys(p)) assert.ok(Math.abs(result[k]-p[k]*100) <= 1+1e-9);
  }
  assert.deepEqual(roundProbabilitiesTo100({down:1/3,flat:1/3,up:1/3}), {down:34,flat:33,up:33});
});
test('invalid probability values and inaccurate sum rejected', () => {
  for (const p of [null, {down:.58,flat:.27,up:.14}, {down:-.1,flat:.6,up:.5}, {down:NaN,flat:0,up:1}, {down:'0.5',flat:.2,up:.3}]) assert.throws(() => roundProbabilitiesTo100(p));
});
test('Gate FAIL never displays probabilities even with a valid live contract', () => {
  const result = selectProbability(valid(),'FAIL',now); assert.equal(result.status,'UNAVAILABLE'); assert.equal(result.probabilities,null);
});
test('valid calibrated contract respects direction and integer display', () => {
  const result = selectProbability(valid(),'PASS',now); assert.equal(result.status,'LIVE'); assert.deepEqual(result.percentages,{down:58,flat:27,up:15});
});
test('uncalibrated, wrong argmax, invalid source and wrong horizon fail closed', () => {
  for (const patch of [{calibrated:false},{primaryDirection:'UP'},{source:'INTELLIGENCE'},{horizonDays:3},{probabilities:{down:.5,flat:.4,up:.10000001}}]) assert.equal(selectProbability({...valid(),...patch},'PASS',now).status,'UNAVAILABLE');
});
test('expired, future, timezone-less and excessive validity fail closed', () => {
  for (const patch of [{validUntil:'2026-09-27T09:00:00Z'},{generatedAt:'2026-09-27T11:00:00Z'},{generatedAt:'2026-09-27T01:00:00'},{validUntil:'2027-09-28T01:00:00Z'}]) assert.equal(selectProbability({...valid(),...patch},'PASS',now).status,'UNAVAILABLE');
});
