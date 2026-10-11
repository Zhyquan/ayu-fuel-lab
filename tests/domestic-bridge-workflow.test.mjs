import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const workflow=await readFile(new URL('../.github/workflows/manual-intelligence-bridge.yml',import.meta.url),'utf8');
const commit=workflow.split('- name: 受控提交国内 Test 请求')[1].split('- name: 脱敏验证结果')[0];
const inline=commit.split("node --input-type=module <<'NODE'\n")[1].split('\n          NODE')[0].split('\n').map(line=>line.slice(10)).join('\n');

test('GitHub domestic ingress only calls the new free CLI and never a model or the international Current writer',()=>{
  assert.doesNotMatch(workflow,/DASHSCOPE|secrets\.|manual-bridge-cli\.mjs|commit-current-bridge\.mjs|runDomesticForecast|generateForecast/);
  assert.equal((workflow.match(/run: node scripts\/intelligence-v2\/domestic-bridge-cli\.mjs/g)??[]).length,2);
  assert.doesNotMatch(workflow,/forecast-cache\.json|forecast-history|current-forecast-origin|CURRENT_FORECAST/);
  const free=workflow.split('- name: 免费验证新闻')[1].split('- name: 刷新条件')[0];
  assert.match(free,/BRIDGE_MODE: VERIFY_ONLY/);assert.doesNotMatch(free,/GITHUB_TOKEN|QWEN_API_ACTIVATED/);
  assert.match(workflow,/inputs.mode == 'REFRESH_CURRENT' && vars.QWEN_API_ACTIVATED == 'true' && github.ref == 'refs\/heads\/main' && github.repository == 'Zhyquan\/ayu-fuel-lab'/);
});

test('workflow scans before committing exactly the validated queue path and fails on main movement without force',async()=>{
  assert.ok(workflow.indexOf('- name: Public source scan')<workflow.indexOf('- name: 受控提交国内 Test 请求'));
  assert.match(workflow,/if: steps.queue.outputs.ready == 'true'/);
  assert.match(commit,/validateDomesticBridgeRequest\(JSON\.parse\(await readFile\(DOMESTIC_BRIDGE_REQUEST_PATH/);
  assert.match(commit,/records.length!==1\|\|records\[0\].path!==DOMESTIC_BRIDGE_REQUEST_PATH/);
  assert.match(commit,/git\(\['add','--',DOMESTIC_BRIDGE_REQUEST_PATH\]\)/);
  assert.match(commit,/git\(\['diff','--cached','--name-only'\]\)/);
  assert.match(commit,/git\(\['fetch','origin','main'\]\)/);
  assert.match(commit,/DOMESTIC_BRIDGE_MAIN_MOVED/);
  assert.match(commit,/git\(\['push','origin','HEAD:refs\/heads\/main'\]\)/);
  assert.doesNotMatch(commit,/--force|force-with-lease|pull|rebase|reset|git\(\['config'/);
  const intake=await readFile(new URL('../scripts/intelligence-v2/domestic-bridge-intake.mjs',import.meta.url),'utf8');
  assert.match(intake,/DOMESTIC_BRIDGE_REQUEST_PATH='data\/domestic-test-bridge\/latest-request.json'/);
});

test('commit uses only an in-memory Git header, sanitizes failures and the uploaded artifact includes its hidden directory',()=>{
  assert.match(commit,/GITHUB_TOKEN: \$\{\{ github.token \}\}/);
  assert.match(commit,/GIT_CONFIG_KEY_0:'http.https:\/\/github.com\/\.extraheader'/);
  assert.match(commit,/stdio:\['ignore','pipe','pipe'\]/);
  assert.doesNotMatch(commit,/console\.(?:log|error)\([^\n]*(?:token|env)|https:\/\/[^\s]*@|set -x/);
  assert.match(commit,/status:'REJECTED',failureCode:code/);
  assert.match(workflow,/path: .work\/domestic-bridge\/result.json\n          include-hidden-files: true/);
  const syntax=spawnSync(process.execPath,['--check','--input-type=module'],{input:inline,encoding:'utf8',env:{}});
  assert.equal(syntax.status,0,syntax.stderr);
});
