import { runManualBridge } from '../../scripts/intelligence-v2/manual-bridge.mjs';

export const bridgeUrl='https://www.brecorder.com/news/999000/synthetic-bridge-diesel';
export function bridgeHtml({date='2026-09-30T04:00:00.000Z',publisher='Business Recorder',author='Reuters',body}={}) {
  const metadata={'@type':'NewsArticle',publisher:{name:publisher},author:{name:author},datePublished:date,headline:'Synthetic fixture: diesel market supply review'};
  const text=body??'Synthetic bridge fixture: diesel traders reviewed refinery supply and oil demand across several regions. The report discusses a potential change in fuel supply rather than a confirmed disruption.';
  return `<script type="application/ld+json">${JSON.stringify(metadata)}</script><div class="story__content"><p>${text}</p></div>`;
}

// Both transports are injected. No real source/model network or environment credentials.
export function bridgeScenario(fixture,makeOutput,{role=null,mutateOutput,html=bridgeHtml(),pack=fixture.pack}={}) {
  const counts={source:0,model:0,collect:0};let modelInput=null;
  const options={newsUrl:bridgeUrl,clock:()=>new Date(fixture.now),refreshAuthorized:true,
    resolveOptions:{fetchImpl:async()=>{counts.source++;return new Response(html);}},
    collect:async()=>{counts.collect++;return {pack:structuredClone(pack)};},
    providerOptions:{mock:true,environment:{DASHSCOPE_API_KEY:'test'},clock:()=>new Date(fixture.now),wait:async()=>{},fetchImpl:async(_url,request)=>{
      counts.model++;const content=JSON.parse(request.body).messages[1].content;
      modelInput=JSON.parse(content.slice(content.indexOf('\n')+1));
      const output=makeOutput(modelInput), document=modelInput.newsDocuments.find(d=>d.documentId==='br-999000');
      if(role&&document){
        const evidenceId=`${document.documentId}:${document.segments[0].segmentId}`;
        output.newsAssessments.push({evidenceId,impact:role==='main'?'UP':'DOWN',kind:'RISK',title:'柴油供需变化风险',summary:'报道讨论柴油供需变化的可能影响。',strength:'MEDIUM'});
        output[role==='main'?'mainReasonEvidenceIds':'counterReasonEvidenceIds'].push(evidenceId);
      }
      mutateOutput?.(output,modelInput);
      return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(output)}}],usage:{prompt_tokens:100,completion_tokens:50}}));
    }}};
  return {counts,options,get modelInput(){return modelInput;},run:extra=>runManualBridge({...options,...extra})};
}
