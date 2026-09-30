import assert from 'node:assert/strict';
import { bridgeScenario, bridgeHtml } from '../../tests/fixtures/bridge-scenario.mjs';
import { publicEvidenceGate } from '../../dist/data/public-evidence.js';
import { resolveNewsUrl } from './source-adapters.mjs';
import { runForecast } from './run.mjs';

export async function runBridgeReplay(fixture,makeOutput) {
  const cases=[];
  const auto=bridgeScenario(fixture,makeOutput),autoResult=await runForecast({pack:fixture.pack,provider:'QWEN',providerOptions:auto.options.providerOptions,now:new Date(fixture.now),persist:false});
  assert.equal(autoResult.gate.gate,'PASS');cases.push('AUTO_ONLY');
  for(const role of [null,'main','counter']) {
    const scenario=bridgeScenario(fixture,makeOutput,{role}),result=await scenario.run({mode:'REFRESH_CURRENT'});
    assert.equal(result.status,'CURRENT_READY',result.failureCode);assert.equal(result.coreForecastGate,'PASS');
    assert.equal(result.publicCard,Boolean(role));assert.equal(scenario.counts.model,1);
    assert.equal(publicEvidenceGate({forecast:result.snapshot,evidencePack:result.snapshot.evidencePack},{now:new Date(fixture.now)}).gate,'PASS');
    cases.push(role?`AUTO_BRIDGE_${role.toUpperCase()}`:'AUTO_BRIDGE_UNSELECTED');
  }
  const scenario=bridgeScenario(fixture,makeOutput),document=(await resolveNewsUrl(scenario.options.newsUrl,{...scenario.options.resolveOptions,now:new Date(fixture.now)})).document;
  const duplicate=bridgeScenario(fixture,makeOutput,{pack:{...fixture.pack,newsDocuments:[...fixture.pack.newsDocuments,document]}});
  assert.equal((await duplicate.run()).failureCode,'BRIDGE_DUPLICATE_ONLY');assert.equal(duplicate.counts.model,0);cases.push('AUTO_BRIDGE_DUPLICATE');
  const stale=bridgeScenario(fixture,makeOutput,{html:bridgeHtml({date:'2026-09-20T04:00:00Z'})});
  assert.equal((await stale.run()).status,'REJECTED');assert.equal(stale.counts.model,0);cases.push('AUTO_BRIDGE_STALE');
  return {gate:'PASS',cases,realQwenCalls:0,productionWrites:0};
}
