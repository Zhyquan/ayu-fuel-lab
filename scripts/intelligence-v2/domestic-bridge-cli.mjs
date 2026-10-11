import { appendFile, copyFile, mkdir, mkdtemp, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DOMESTIC_BRIDGE_REQUEST_PATH, prepareDomesticBridgeRequest } from './domestic-bridge-intake.mjs';

const projectRoot=fileURLToPath(new URL('../../',import.meta.url));
const fail=code=>{throw new Error(code);};
async function scanRequest(bytes) {
  const stage=await mkdtemp(join(tmpdir(),'ayu-domestic-bridge-scan-'));
  try {
    await mkdir(join(stage,'scripts'),{recursive:true});
    await copyFile(new URL('../scan-public-files.mjs',import.meta.url),join(stage,'scripts/scan-public-files.mjs'));
    await mkdir(dirname(join(stage,DOMESTIC_BRIDGE_REQUEST_PATH)),{recursive:true});
    await writeFile(join(stage,DOMESTIC_BRIDGE_REQUEST_PATH),bytes);
    const scan=spawnSync(process.execPath,[join(stage,'scripts/scan-public-files.mjs')],{encoding:'utf8',env:{}});
    let result;try{result=JSON.parse(scan.stdout);}catch{fail('DOMESTIC_BRIDGE_PUBLIC_SCAN_FAILED');}
    if(scan.status!==0||result.gate!=='PASS')fail('DOMESTIC_BRIDGE_PUBLIC_SCAN_FAILED');
  } finally {await rm(stage,{recursive:true,force:true});}
}

export async function runDomesticBridgeCli({root=projectRoot,environment=process.env,now=new Date()}={}) {
  const destination=resolve(root,DOMESTIC_BRIDGE_REQUEST_PATH),directory=resolve(root,'.work/domestic-bridge');
  let result;
  try {
    const mode=environment.BRIDGE_MODE??'VERIFY_ONLY',intakeType=environment.BRIDGE_INTAKE_TYPE??'CHATGPT_SIGNAL_PACKAGE';
    let previousRequest=null;
    if(mode==='REFRESH_CURRENT'&&intakeType==='CHATGPT_SIGNAL_PACKAGE') {
      try{previousRequest=JSON.parse(await readFile(destination,'utf8'));}
      catch(error){if(error.code!=='ENOENT')fail('DOMESTIC_BRIDGE_OUTBOX_INVALID');}
    }
    const prepared=prepareDomesticBridgeRequest({signalPackage:environment.BRIDGE_SIGNAL_PACKAGE,
      intakeType,mode,now,previousRequest});
    const {request,...safe}=prepared;
    if(request&&!prepared.deduplicated) {
      const bytes=JSON.stringify(request,null,2)+'\n';
      await scanRequest(bytes);
      await mkdir(dirname(destination),{recursive:true});
      const temporary=`${destination}.${process.pid}.tmp`;
      try{await writeFile(temporary,bytes,{flag:'wx'});await rename(temporary,destination);}
      finally{await unlink(temporary).catch(()=>{});}
    }
    result={...safe,expiresAt:request?.expiresAt??null,failureCode:null};
  } catch(error) {
    result={status:'REJECTED',noQwen:true,deduplicated:false,requestId:null,packageHash:null,expiresAt:null,
      failureCode:/^[A-Z0-9_]{1,80}$/.test(error.message)?error.message:'DOMESTIC_BRIDGE_INTAKE_FAILED'};
  }
  await mkdir(directory,{recursive:true});
  await writeFile(join(directory,'result.json'),JSON.stringify(result,null,2)+'\n');
  const ready=result.status==='QUEUED'&&!result.deduplicated;
  if(environment.GITHUB_OUTPUT)await appendFile(environment.GITHUB_OUTPUT,`ready=${ready}\nqueued=${ready}\nrequest_id=${result.requestId??''}\n`);
  if(environment.GITHUB_STEP_SUMMARY) {
    const message=result.failureCode==='DOMESTIC_BRIDGE_SIGNAL_PACKAGE_REQUIRED'?'国内 Test 当前仅支持合法分析包；NEWS_URL 不会进入队列。':result.failureCode??(result.deduplicated?'相同内容请求已存在，未重复入队。':result.status==='VERIFIED'?'免费验证通过，未入队。':'国内 Test 请求已入队，尚未生成预测。');
    await appendFile(environment.GITHUB_STEP_SUMMARY,`## 国内 Test 情报桥\n\n${message}\n\nQwen 调用：0。\n`);
  }
  return result;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const result=await runDomesticBridgeCli();
  console.log(JSON.stringify(result));
  if(result.status==='REJECTED')process.exitCode=1;
}
