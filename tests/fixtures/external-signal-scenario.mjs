import { runManualBridge } from '../../scripts/intelligence-v2/manual-bridge.mjs';
import { replayOutput } from '../../scripts/intelligence-v2/replay.mjs';
export function externalPackage(now='2026-09-30T05:00:00.000Z') {
  return {schemaVersion:'AYU_EXTERNAL_ANALYST_SIGNAL_V1',generatedAt:now,signals:[{
    eventKey:'synthetic-diesel-supply-review',category:'SUPPLY_DISRUPTION',source:'Reuters',eventAt:null,publishedAt:now,
    title:'合成演示：柴油供应变化',summary:'这是合成测试材料，用于验证情报包入口，不代表真实新闻。',
    sourceUrl:'https://www.reuters.com/business/energy/synthetic-diesel-review/',kind:'RISK',direction:'UP',strength:'MEDIUM',confirmation:'CONDITIONAL',reason:'合成场景中的供应风险可能推高柴油价格，仅用于离线合同验证。',
  }]};
}
export function externalScenario(fixture,{packageValue=externalPackage(fixture.now),pack=fixture.pack,role='main',mutateOutput}={}) {
  const counts={article:0,model:0,collect:0};let modelInput,requestBody,collectionOptions;
  const options={intakeType:'CHATGPT_SIGNAL_PACKAGE',signalPackage:JSON.stringify(packageValue),clock:()=>new Date(fixture.now),refreshAuthorized:true,
    resolveOptions:{fetchImpl:async()=>{counts.article++;throw new Error('ARTICLE_FETCH_FORBIDDEN');}},
    collect:async value=>{counts.collect++;collectionOptions=value;return {pack:structuredClone(pack)};},
    providerOptions:{mock:true,environment:{DASHSCOPE_API_KEY:'test'},clock:()=>new Date(fixture.now),wait:async()=>{},fetchImpl:async(_url,request)=>{
      counts.model++;requestBody=JSON.parse(request.body);const content=requestBody.messages[1].content;modelInput=JSON.parse(content.slice(content.indexOf('\n')+1));
      const value=replayOutput(modelInput), external=modelInput.externalAnalystSignals[0];
      if(role&&external) {
        const key=role==='main'?'mainReasonEvidenceIds':'counterReasonEvidenceIds';value[key]=[...value[key].slice(0,1),external.evidenceId];
      }
      mutateOutput?.(value,modelInput);
      return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(value)}}],usage:{prompt_tokens:100,completion_tokens:50}}));
    }}};
  return {counts,options,get modelInput(){return modelInput;},get requestBody(){return requestBody;},get collectionOptions(){return collectionOptions;},run:extra=>runManualBridge({...options,...extra})};
}
