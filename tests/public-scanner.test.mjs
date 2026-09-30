import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';

const scanner=await readFile(new URL('../scripts/scan-public-files.mjs',import.meta.url),'utf8');
// Construct fake credentials at runtime so test source never embeds a complete one.
const modelToken=['s','k','-','x'.repeat(32)].join('');
const publicArticle='https://www.brecorder.com/news/40441774/julius-baer-seriously-breached-risk-and-money-laundering-rules-swiss-regulator-says';
async function scanFiles(files) {
  const root=await mkdtemp(join(tmpdir(),'ayu-public-scan-'));
  try {
    await mkdir(join(root,'scripts'));
    await writeFile(join(root,'scripts/scan-public-files.mjs'),scanner);
    for(const [name,value]of Object.entries(files)) {
      const path=join(root,name);await mkdir(dirname(path),{recursive:true});await writeFile(path,value);
    }
    const result=spawnSync(process.execPath,[join(root,'scripts/scan-public-files.mjs')],{cwd:root,encoding:'utf8',env:{}});
    assert.equal(result.error,undefined);assert.equal(result.stderr,'');
    return {exitCode:result.status,stdout:result.stdout,...JSON.parse(result.stdout)};
  }finally{await rm(root,{recursive:true,force:true});}
}

for(const [label,value]of [
  ['A','https://example.com/oil-supply-risk-keeps-market-tight-2026-09-29/'],
  ['B','https://example.com/risk-something-with-long-slug/'],
  ['C',publicArticle],
])test(`public URL ${label} ordinary long slug passes without a site whitelist`,async()=>{
  const result=await scanFiles({'dist/data/forecast-cache.json':JSON.stringify({sourceUrl:value})});
  assert.equal(result.gate,'PASS');assert.equal(result.exitCode,0);assert.deepEqual(result.findings,[]);
});
test('public URL D query with a fake token still fails',async()=>{
  const result=await scanFiles({'link.txt':`https://example.com/?token=${modelToken}`});
  assert.equal(result.gate,'FAIL');assert.equal(result.exitCode,1);
  assert.equal(result.findings[0].detector,'OPENAI_STYLE_TOKEN');
});
test('public URL E fake API-key assignment still fails',async()=>{
  const result=await scanFiles({'config.txt':`${['api','key'].join('_')}="${modelToken}"`});
  assert.equal(result.gate,'FAIL');assert.equal(result.exitCode,1);
  assert.equal(result.findings[0].detector,'OPENAI_STYLE_TOKEN');
});
test('SK Energy public article slug is not a token, without exempting URLs or hosts',async()=>{
  const slug='sk-energy-seeks-mideast-oil-for-november-to-february-loading-sources-say';
  const urls=[`https://www.brecorder.com/news/40441954/${slug}`,`https://example.com/${slug}`];
  assert.equal((await scanFiles({'news.json':JSON.stringify({urls})})).gate,'PASS');
});
test('long token bodies and project/service token namespaces remain blocked in text, paths and queries',async()=>{
  const tokens=[modelToken,['sk','proj','fake-body-with-hyphens-and-underscores_123456789'].join('-'),['sk','svcacct','fake-service-token-with-hyphens_123456789'].join('-')];
  const files=Object.fromEntries(tokens.flatMap((token,i)=>[
    [`text-${i}.txt`,`"${token}"`],[`path-${i}.txt`,`https://example.com/${token}`],[`query-${i}.txt`,`https://example.com/?token=${token}`],
  ]));
  const result=await scanFiles(files);assert.equal(result.gate,'FAIL');assert.equal(result.findings.length,Object.keys(files).length);
  assert.ok(result.findings.every(f=>f.detector==='OPENAI_STYLE_TOKEN'));
});
test('fake tokens after spaces, quotes, equals, slash, colon and newlines remain blocked',async()=>{
  const boundaries=[' ', '"', "'", '=', '/', ':', '\n'];
  const files=Object.fromEntries(boundaries.map((prefix,i)=>[`boundary-${i}.txt`,`${prefix}${modelToken}`]));
  const result=await scanFiles(files);
  assert.equal(result.exitCode,1);assert.equal(result.findings.length,boundaries.length);
  assert.ok(result.findings.every(f=>f.detector==='OPENAI_STYLE_TOKEN'));
});
test('fake token-like substrings inside ASCII letters or digits are not complete credentials',async()=>{
  const text=Array.from('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',prefix=>prefix+modelToken).join('\n');
  const result=await scanFiles({'ordinary-words.txt':text});
  assert.equal(result.exitCode,0);assert.equal(result.gate,'PASS');
});
test('all existing credential, private material and project detectors still fail with named findings',async()=>{
  const credentialName=['api','key'].join('_'), credentialValue=['REALISTIC','TEST_SECRET_VALUE'].join('_');
  const files={
    'model.txt':`"${modelToken}"`,
    'assignment.txt':`${credentialName}="${credentialValue}"`,
    'bearer.txt':`Authorization: Bearer ${'fake'.repeat(8)}`,
    'basic.json':JSON.stringify({Authorization:`Basic ${'YW'.repeat(16)}`}),
    'github.txt':['gh','p_','x'.repeat(32)].join(''),
    'github-pat.txt':['github','_pat_','x'.repeat(32)].join(''),
    'aws.txt':['AK','IA','A'.repeat(16)].join(''),
    'private.txt':['-----BEGIN ','PRIVATE KEY-----'].join(''),
    'unix-path.txt':'/'+['Users','fake-user','private.txt'].join('/'),
    'windows-path.txt':'C:'+String.fromCharCode(92)+['Users','fake-user','private.txt'].join(String.fromCharCode(92)),
    'project.txt':['cloud','base'].join(''),
  };
  const expected={
    'model.txt':'OPENAI_STYLE_TOKEN','assignment.txt':'CREDENTIAL_ASSIGNMENT',
    'bearer.txt':'AUTHORIZATION_HEADER','basic.json':'AUTHORIZATION_HEADER',
    'github.txt':'GITHUB_TOKEN','github-pat.txt':'GITHUB_FINE_GRAINED_TOKEN',
    'aws.txt':'AWS_ACCESS_KEY_ID','private.txt':'PRIVATE_KEY',
    'unix-path.txt':'ABSOLUTE_UNIX_PATH','windows-path.txt':'ABSOLUTE_WINDOWS_PATH',
    'project.txt':'PRODUCTION_PROJECT_REFERENCE',
  };
  const result=await scanFiles(files);
  assert.equal(result.exitCode,1);assert.equal(result.gate,'FAIL');assert.equal(result.findings.length,Object.keys(files).length);
  assert.deepEqual(Object.fromEntries(result.findings.map(f=>[f.file,f.detector])),expected);
  for(const finding of result.findings)assert.equal(finding.reason,'SENSITIVE_PATTERN');
});
test('all five generated containers and test files stay scanned for real-looking fake leaks',async()=>{
  const names=['CURRENT_EVIDENCE_V2.json','data/forecast-history-v2/generated.json','dist/data/forecast-cache.json','intelligence-v2/current-evidence.json','intelligence-v2/pending-intelligence-pack.json','tests/leak.txt'];
  const files=Object.fromEntries(names.map(name=>[name,JSON.stringify({sourceUrl:publicArticle,leak:modelToken})]));
  const result=await scanFiles(files);
  assert.equal(result.exitCode,1);assert.equal(result.findings.length,names.length);
  assert.deepEqual(new Set(result.findings.map(f=>f.file)),new Set(names));
  assert.ok(result.findings.every(f=>f.detector==='OPENAI_STYLE_TOKEN'));
});
test('equivalent public evidence payload passes in every previously failed container',async()=>{
  const names=['CURRENT_EVIDENCE_V2.json','data/forecast-history-v2/generated.json','dist/data/forecast-cache.json','intelligence-v2/current-evidence.json','intelligence-v2/pending-intelligence-pack.json'];
  const payload=JSON.stringify({evidencePack:{discovery:{candidates:[{url:publicArticle,status:'IRRELEVANT'}]},exclusions:[{url:publicArticle,reason:'DUPLICATE_DISCOVERY_ARTICLE'}]}});
  const result=await scanFiles(Object.fromEntries(names.map(name=>[name,payload])));
  assert.equal(result.exitCode,0);assert.equal(result.gate,'PASS');assert.equal(result.scanned,6);
});
test('diagnostics expose detector names but never fake secret values or matched contents',async()=>{
  const result=await scanFiles({'opaque.txt':modelToken});
  assert.equal(result.gate,'FAIL');assert.equal(result.stdout.includes(modelToken),false);
  assert.deepEqual(Object.keys(result.findings[0]).sort(),['detector','file','reason']);
  assert.equal(result.findings[0].detector,'OPENAI_STYLE_TOKEN');
});
