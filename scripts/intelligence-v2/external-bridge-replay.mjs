import assert from 'node:assert/strict';
import { externalPackage, externalScenario } from '../../tests/fixtures/external-signal-scenario.mjs';
import { replayOutput } from './replay.mjs';
import { publicEvidenceGate } from '../../dist/data/public-evidence.js';
import { publicEvidenceMarkup } from '../../dist/data/public-evidence-view.js';
import { readForecast } from '../../dist/data/intelligence-v2-service.js';
import { forecastGate, primaryDirectionFor } from '../../dist/data/intelligence-v2-contract.js';
import { evidenceHashFor } from './history.mjs';

export async function runExternalBridgeReplay(fixture,{count=128}={}) {
  let payloadChars=0;
  for(let i=0;i<count;i++) {
    const p=externalPackage(fixture.now),probabilities=i%2?{DOWN:50,FLAT:20,UP:30}:{DOWN:30,FLAT:20,UP:50};
    const primary=primaryDirectionFor(probabilities),role=[null,'main','counter'][i%3];
    p.signals[0].direction=role==='counter'?(primary==='UP'?'DOWN':'UP'):primary;
    p.signals[0].strength=['LOW','MEDIUM','HIGH'][i%3];
    p.signals[0].sourceUrl=i%2?null:p.signals[0].sourceUrl;
    const scenario=externalScenario(fixture,{packageValue:p,role:null,mutateOutput:(value,input)=>{
      Object.assign(value,replayOutput(input,{probabilities,newsCount:i%4}));
      if(role){const key=role==='main'?'mainReasonEvidenceIds':'counterReasonEvidenceIds';value[key]=[value[key][0],input.externalAnalystSignals[0].evidenceId];}
    }});
    const result=await scenario.run({mode:'REFRESH_CURRENT'});assert.equal(result.status,'CURRENT_READY',`external replay ${i}: ${result.failureCode}`);
    const {evidencePack,...candidate}=result.snapshot,now=new Date(fixture.now);
    assert.equal(forecastGate(candidate,evidencePack,{now,expectedEvidenceHash:evidenceHashFor(evidencePack)}).gate,'PASS');
    assert.equal((await readForecast({now,fetchImpl:async()=>new Response(JSON.stringify(result.snapshot))})).status,'LIVE');
    const cards=publicEvidenceGate({forecast:candidate,evidencePack},{now});assert.equal(cards.gate,'PASS');
    const id=evidencePack.externalAnalystSignals[0].evidenceId;assert.equal(cards.cards.some(c=>c.evidenceId===id),Boolean(role));
    const html=publicEvidenceMarkup(result.snapshot,{now});assert.doesNotMatch(html,/href="null"|SERVER_FETCH_VERIFIED|External Analyst/);
    assert.equal(scenario.counts.article,0);assert.equal(scenario.counts.model,1);
    payloadChars=Math.max(payloadChars,JSON.stringify(scenario.modelInput.externalAnalystSignals).length);
  }
  return {gate:'PASS',legalCases:count,externalPayloadMaxChars:payloadChars,approxTokens:Math.ceil(payloadChars/2),proof:'FIXED_SYNTHETIC_REPLAY_NOT_PUBLICATION',realQwenCalls:0,productionWrites:0};
}
