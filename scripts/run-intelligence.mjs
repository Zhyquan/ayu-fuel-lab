import { readFile,writeFile,mkdir,rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashText,reviewIntelligence } from './intelligence-review.mjs';
import { unavailableIntelligence } from '../dist/data/intelligence-contract.js';
const project=fileURLToPath(new URL('../',import.meta.url));
const json=value=>JSON.stringify(value,null,2)+'\n';

export async function saveIntelligenceRun({root=project,now=new Date()}={}) {
  const inputs={},texts={};let review;
  try {
    for (const [key,file] of Object.entries({evidence:'current-evidence',analysis:'current-analysis',sourceReview:'source-review',humanReview:'human-review'})) {
      texts[key]=await readFile(resolve(root,`intelligence/${file}.json`),'utf8');
      inputs[key]=JSON.parse(texts[key]);
    }
    review=reviewIntelligence({...inputs,evidenceHash:hashText(texts.evidence),analysisHash:hashText(texts.analysis),now});
  } catch (error) {
    review={gate:'FAIL',checkedAt:now.toISOString(),issues:['INPUT_READ_OR_VALIDATION_ERROR'],errorCode:error.code||error.name,forecast:unavailableIntelligence('INPUT_READ_OR_VALIDATION_ERROR')};
  }
  const sources=Array.isArray(inputs.evidence?.sources)?inputs.evidence.sources:[];
  const snapshot={schemaVersion:'AYU_INTELLIGENCE_HISTORY_V1',generatedAt:now.toISOString(),...inputs,review,rawInputHashes:Object.fromEntries(Object.entries(texts).map(([key,text])=>[key,hashText(text)])),sourceUrls:sources.filter(s=>typeof s?.sourceUrl==='string').map(s=>s.sourceUrl)};
  const name=`${now.toISOString().replaceAll(':','-')}-intelligence-${hashText(json(snapshot)).slice(0,12)}.json`;
  const history=resolve(root,'data/forecast-history');
  await mkdir(history,{recursive:true});
  // Archive before publishing; exclusive create refuses even an identical second run.
  await writeFile(resolve(history,name),json(snapshot),{flag:'wx'});
  const data=resolve(root,'dist/data');await mkdir(data,{recursive:true});
  const temp=resolve(data,'forecast-cache.json.tmp');
  await writeFile(temp,json(review.forecast));
  await rename(temp,resolve(data,'forecast-cache.json'));
  await writeFile(resolve(root,'intelligence/latest-review.json'),json({...review,historyFile:`data/forecast-history/${name}`}));
  return {...review,historyFile:`data/forecast-history/${name}`};
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const result=await saveIntelligenceRun();
  console.log(JSON.stringify({gate:result.gate,issues:result.issues,historyFile:result.historyFile}));
  if (result.gate!=='PASS') process.exitCode=1;
}
