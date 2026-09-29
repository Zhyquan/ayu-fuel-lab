import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { collectFuelPrices } from '../scripts/update-fuel-prices.mjs';
import { validatePublicData } from '../scripts/public-data-gate.mjs';

const workflow=await readFile(new URL('../.github/workflows/update-and-deploy.yml',import.meta.url),'utf8');
const job=name=>workflow.split(`  ${name}:\n`)[1]?.split(/\n  [\w-]+:\n/)[0]??'';
const step=name=>job('daily-delivery').split(`      - name: ${name}\n`)[1]?.split(/\n      - /)[0]??'';
const value=(text,key,indent)=>{
  const match=text.match(new RegExp(`^${' '.repeat(indent)}${key}: (.+)$`,'m'));
  assert.ok(match,`Missing workflow expression: ${key}`);
  return match[1];
};
// Only the boolean/string expression subset used by this workflow is evaluated.
const evaluate=(input,context)=>Function('github','needs','steps','always','cancelled',`return (${input.replace(/^\$\{\{\s*|\s*\}\}$/g,'').replaceAll('needs.daily-delivery',"needs['daily-delivery']")});`)(context.github,context.needs,context.steps,()=>true,()=>context.cancelled);
function delivery({event='push',ref='refs/heads/main',conclusion='success',branch='main',sourceRepo='Zhyquan/ayu-fuel-lab',verifiedReady='true',dailyResult='success',buildResult='success',cancelled=false}={}) {
  const context={github:{repository:'Zhyquan/ayu-fuel-lab',event_name:event,ref,event:{workflow_run:{conclusion,head_branch:branch,head_repository:{full_name:sourceRepo}}}},steps:{},needs:{},cancelled};
  const main=String(evaluate(value(step('Identify main delivery'),'IS_MAIN_DELIVERY',10),context));
  context.steps.identity={outputs:{is_main_delivery:main}};
  context.steps.passthrough={outputs:{ready:evaluate(value(step('Ordinary price delivery'),'if',8),context)?'true':''}};
  context.steps.ready={outputs:{ready:evaluate(value(step('Verify this trusted Official Daily commit and fresh cache'),'if',8),context)?verifiedReady:''}};
  const ready=evaluate(value(job('daily-delivery'),'ready',6),context);
  context.needs['daily-delivery']={result:dailyResult,outputs:{ready,is_main_delivery:main}};
  const build=Boolean(evaluate(value(job('build'),'if',4),context));
  context.needs.build={result:build?buildResult:'skipped'};
  const deploy=Boolean(evaluate(value(job('deploy'),'if',4),context));
  return {main,ready,build,deploy};
}

test('Pages daily-delivery has no job skip; build/deploy use explicit results and status checks',()=>{
  assert.doesNotMatch(job('daily-delivery'),/^    if:/m);
  assert.equal(value(job('daily-delivery'),'is_main_delivery',6),'${{ steps.identity.outputs.is_main_delivery }}');
  assert.match(step('Ordinary price delivery'),/id: passthrough/);
  assert.match(step('Ordinary price delivery'),/echo "ready=true" >> "\$GITHUB_OUTPUT"/);
  assert.match(job('build'),/!cancelled\(\).*needs\.daily-delivery\.result == 'success'.*needs\.daily-delivery\.outputs\.ready == 'true'/);
  assert.match(job('deploy'),/always\(\).* !cancelled\(\).*needs\.build\.result == 'success'/);
  assert.match(job('deploy'),/needs: \[daily-delivery, build\]/);
  assert.match(job('deploy'),/needs\.daily-delivery\.outputs\.is_main_delivery == 'true'/);
  assert.equal((job('build').match(/if:.*outputs\.is_main_delivery == 'true'/g)??[]).length,2);
  for(const name of ['Checkout trusted main','Setup trusted Node','Verify this trusted Official Daily commit and fresh cache'])assert.match(step(name),/if: github\.event_name == 'workflow_run' && steps\.identity\.outputs\.is_main_delivery == 'true'/);
});
for(const event of ['push','schedule','workflow_dispatch'])test(`Pages ${event} main passes through and deploys`,()=>{
  assert.deepEqual(delivery({event}),{main:'true',ready:'true',build:true,deploy:true});
});
test('Pages feature branch dispatch can validate prices but cannot deploy',()=>{
  assert.deepEqual(delivery({event:'workflow_dispatch',ref:'refs/heads/hotfix/pages-dependency-skip'}),{main:'false',ready:'true',build:true,deploy:false});
});
test('Pages trusted workflow_run uses head identity and requires readiness',()=>{
  assert.deepEqual(delivery({event:'workflow_run',ref:'refs/heads/other'}),{main:'true',ready:'true',build:true,deploy:true});
  assert.deepEqual(delivery({event:'workflow_run',verifiedReady:'false'}),{main:'true',ready:'false',build:false,deploy:false});
});
for(const [name,change] of [['failed conclusion',{conclusion:'failure'}],['foreign repo',{sourceRepo:'other/fuel'}],['non-main head',{branch:'feature/other'}]])test(`Pages workflow_run ${name} fails closed before build`,()=>{
  assert.deepEqual(delivery({event:'workflow_run',...change}),{main:'false',ready:'false',build:false,deploy:false});
});
test('Pages delivery verification failure blocks build and deploy',()=>{
  assert.equal(delivery({dailyResult:'failure'}).build,false);
  assert.equal(delivery({dailyResult:'failure'}).deploy,false);
});
for(const buildResult of ['failure','skipped','cancelled'])test(`Pages build ${buildResult} cannot deploy`,()=>{
  assert.equal(delivery({buildResult}).deploy,false);
});
test('Pages cancellation blocks build and deploy even with successful metadata',()=>{
  assert.equal(delivery({cancelled:true}).build,false);
  assert.equal(delivery({cancelled:true}).deploy,false);
});
test('Pages simulate_failure produces invalid prices and blocks deployment',async()=>{
  assert.match(workflow,/SIMULATE_API_FAILURE: \$\{\{ inputs\.simulate_failure && '1' \|\| '0' \}\}/);
  const result=await collectFuelPrices({fetchImpl:async()=>new Response('Failure drill',{status:503}),wait:async()=>{},onProgress:()=>{}});
  const gate=validatePublicData(result.cache,{startedAt:result.cache.generatedAt});
  assert.equal(result.summary.failed,31);assert.equal(gate.gate,'FAIL');
  assert.equal(delivery({buildResult:gate.gate==='PASS'?'success':'failure'}).deploy,false);
});
