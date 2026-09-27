import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { selectForecast, selectState } from '../ui/contract.js';

// Synthetic contract fixtures exercise rejection; never shipped as a current forecast.
const now=new Date('2026-09-28T00:00:00Z');
const fixture=()=>({gate:'PASS',contract:{status:'LIVE',source:'AYU_GLOBAL_DIESEL_V2',generatedAt:'2026-09-27T23:00:00Z',validUntil:'2026-09-28T01:00:00Z',horizonDays:7,modelVersion:'TEST_ONLY',calibrated:true,currentState:'NEUTRAL',benchmark:{name:'TEST_ONLY',latestDate:'2026-09-22',latestValue:5},primaryDirection:'UP',probabilities:{down:.333,flat:.333,up:.334}}});

test('failed gate blocks even an otherwise valid contract',()=>{const d=fixture();d.gate='FAIL';assert.equal(selectForecast(d,now).probabilities,null);});
test('no contract and invalid values fail closed',()=>{for(const d of [null,{}, {gate:'PASS'}])assert.equal(selectForecast(d,now).status,'VALIDATING');for(const value of [NaN,Infinity,-.1,'0.3']){const d=fixture();d.contract.probabilities.down=value;assert.equal(selectForecast(d,now).probabilities,null);}});
test('sum, source, calibration and direction cannot be forged',()=>{for(const patch of [{source:'AYU_PROBABILITY_MODEL_V1'},{calibrated:false},{primaryDirection:'DOWN'},{probabilities:{down:.5,flat:.5,up:.5}}]){const d=fixture();Object.assign(d.contract,patch);assert.equal(selectForecast(d,now).probabilities,null);}});
test('expired or future forecasts fail closed',()=>{for(const patch of [{generatedAt:'2026-09-29T00:00:00Z'},{validUntil:'2026-09-27T23:59:59Z'},{validUntil:'2026-10-01T00:00:00Z'}]){const d=fixture();Object.assign(d.contract,patch);assert.equal(selectForecast(d,now).probabilities,null);}});
test('largest remainder display totals 100',()=>{const d=selectForecast(fixture(),now);assert.equal(d.status,'LIVE');assert.deepEqual(d.percentages,{down:33,flat:33,up:34});});
test('actual candidate has no current percentages and observation state expires',async()=>{const d=JSON.parse(await readFile(new URL('../ui/candidate-status.json',import.meta.url)));assert.equal(selectForecast(d,now).probabilities,null);const s=selectState(d.currentState,now);assert.equal(s.stale,false);assert.equal(selectState(d.currentState,new Date('2026-10-03')).stale,true);});
test('bad current state cannot masquerade as real data',()=>{assert.equal(selectState({currentState:'WEAK'},now),null);});
