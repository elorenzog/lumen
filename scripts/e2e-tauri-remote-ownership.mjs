import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { invoke, snapshot } from './e2e-tauri-native.mjs';

const cwd=process.cwd();
const data=await mkdtemp(path.join(tmpdir(),'lumen-remote-ownership-'));
const evidence=path.resolve(process.env.LUMEN_E2E_EVIDENCE??'test-results/tauri-remote-ownership');
await mkdir(evidence,{recursive:true});
const dialogs=path.join(data,'dialogs.json');
const fixture=path.join(data,'001 Remote ownership.mkv');
const results=[];
let native,browser,log='';

async function createFixture(){
  const ffmpeg=process.env.LUMEN_E2E_FFMPEG??path.join(cwd,'src-tauri','tools','ffmpeg.exe');
  const child=spawn(ffmpeg,['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=s=1280x720:r=24:d=20','-f','lavfi','-i','sine=frequency=440:duration=20','-f','lavfi','-i','sine=frequency=880:duration=20','-map','0:v','-map','1:a','-map','2:a','-c:v','mpeg4','-q:v','8','-c:a','aac','-shortest',fixture],{windowsHide:true});
  let stderr='';child.stderr.on('data',chunk=>{stderr+=chunk;});
  child.once('error',error=>{stderr+=error.message;});
  const [code]=await once(child,'exit');
  assert.equal(code,0,stderr);
}

async function launch(){
  const server=createServer();server.listen(0,'127.0.0.1');await once(server,'listening');
  const address=server.address();assert.ok(address&&typeof address==='object');
  await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  native=spawn(process.env.LUMEN_E2E_EXECUTABLE??path.join(cwd,'src-tauri','target','debug','lumen.exe'),[],{cwd,windowsHide:true,env:{...process.env,LUMEN_DATA_DIR:data,LUMEN_HEADLESS:'1',LUMEN_E2E_DIALOGS_FILE:dialogs,WEBVIEW2_USER_DATA_FOLDER:path.join(data,'webview2'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${address.port} --autoplay-policy=no-user-gesture-required`}});
  native.stdout.on('data',chunk=>{log=(log+chunk).slice(-16000);});
  native.stderr.on('data',chunk=>{log=(log+chunk).slice(-16000);});
  for(let attempt=0;attempt<120;attempt++){
    if(native.exitCode!==null)throw new Error(`Native exited: ${native.exitCode}: ${log}`);
    try{browser=await chromium.connectOverCDP(`http://127.0.0.1:${address.port}`,{timeout:1000});break;}
    catch(error){if(!(error instanceof Error))throw error;await delay(250);}
  }
  assert.ok(browser,'Native CDP endpoint starts');
  for(let attempt=0;attempt<120;attempt++){
    const page=browser.contexts().flatMap(context=>context.pages()).find(page=>page.url()!=='about:blank'&&!new URL(page.url()).searchParams.has('output'));
    if(page){await page.locator('.brand-name').waitFor({timeout:30000});return page;}
    await delay(250);
  }
  throw new Error('Native operator webview did not appear');
}

async function pair(page){
  await invoke(page,{type:'remote-control',operation:'enable'});
  const {remote}=await snapshot(page);
  const origin=`http://127.0.0.1:${new URL(remote.urls[0]).port}`;
  const response=await fetch(`${origin}/api/pair`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({pin:remote.pin})});
  assert.equal(response.status,200,'Pair through real HTTP with native PIN');
  const cookie=response.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie);
  return {origin,cookie};
}

async function interrupt(page,hymn,track,stop){
  const session=await pair(page);
  await page.evaluate(({id,stop})=>{
    window.ownershipEvents=[];
    window.ownershipInterrupted=new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>{unsubscribe();reject(new Error('Native preparation event was not received'));},15000);
      const unsubscribe=window.lumen.subscribe(async value=>{
        window.ownershipEvents.push({at:Date.now(),preparing:Boolean(value.output.preparing),kind:value.output.slide.kind,revision:value.output.revision});
        if(value.output.preparing?.hymnId!==id)return;
        unsubscribe();clearTimeout(timeout);
        try{
          const disabled=await window.lumen.invoke({type:'remote-control',operation:'disable'});
          if(!disabled.ok)throw new Error(disabled.error);
          if(stop){const stopped=await window.lumen.invoke({type:'stop-hymn'});if(!stopped.ok)throw new Error(stopped.error);}
          resolve();
        }catch(error){reject(error);}
      });
    });
  },{id:hymn.id,stop});
  const request=fetch(`${session.origin}/api/command`,{method:'POST',headers:{Origin:session.origin,Cookie:session.cookie,'Content-Type':'application/json'},body:JSON.stringify({type:'hymn',id:hymn.id,track}),signal:AbortSignal.timeout(30000)}).then(response=>({status:response.status}),error=>({disconnected:error instanceof Error?error.name:String(error)}));
  await page.evaluate(()=>window.ownershipInterrupted);
  const disconnected=await request;
  assert.ok(disconnected.disconnected||disconnected.status===503,'Disabling remote interrupts the in-flight HTTP response');
  assert.equal((await snapshot(page)).remote.enabled,false,'Native disable closes the remote listener');
  return disconnected;
}

async function waitSettled(page){
  return page.evaluate(()=>new Promise((resolve,reject)=>{
    const timeout=setTimeout(async()=>{unsubscribe();const response=await window.lumen.invoke({type:'snapshot'});reject(new Error(`Remote request cancellation left preparation stuck: ${JSON.stringify(response.data?.output)}`));},60000);
    const unsubscribe=window.lumen.subscribe(receive);
    function receive(value){if(!value.output.preparing){clearTimeout(timeout);unsubscribe();resolve(value.output);}}
    window.lumen.invoke({type:'snapshot'}).then(response=>{if(response.ok)receive(response.data);else reject(new Error(response.error));},reject);
  }));
}

try{
  await createFixture();await writeFile(dialogs,JSON.stringify({'import-hymns':[fixture]}));
  const page=await launch();
  await invoke(page,{type:'import-hymns',folder:false,edition:'2009'});
  const initial=await snapshot(page);assert.equal(initial.hymns.length,1);
  const hymn=initial.hymns[0];assert.equal(hymn.tracks.length,2);
  await invoke(page,{type:'open-output',displayId:initial.displays[0].id});
  // Given an uncached real MKV, when disabling the remote during preparation,
  // then the native operation settles independently of the aborted HTTP request.
  const disconnected=await interrupt(page,hymn,1,false);
  const settled=await waitSettled(page);
  assert.equal(settled.slide.kind,'hymn','Accepted native playback finishes after remote disable');
  results.push({scenario:'disable during preparation',disconnected,kind:settled.slide.kind,preparing:settled.preparing});
  await invoke(page,{type:'stop-hymn'});
  // Given another uncached track, when explicitly stopping after disabling,
  // then existing cancellation tokens prevent detached work resurrecting playback.
  const stoppedRequest=await interrupt(page,hymn,2,true);
  const stopped=await waitSettled(page);assert.equal(stopped.slide.kind,'welcome');
  await page.evaluate(()=>new Promise((resolve,reject)=>{
    const unsubscribe=window.lumen.subscribe(value=>{if(value.output.slide.kind==='hymn'||value.output.preparing){clearTimeout(timeout);unsubscribe();reject(new Error('Stopped remote operation resurrected playback'));}});
    const timeout=setTimeout(()=>{unsubscribe();resolve();},3000);
  }));
  results.push({scenario:'explicit stop after disable',disconnected:stoppedRequest,kind:(await snapshot(page)).output.slide.kind});
  await writeFile(path.join(evidence,'result.json'),JSON.stringify({result:'PASS',runtime:'native Tauri/WebView2 + real HTTP',isolatedProfile:true,results},null,2));
  console.log('PASS: remote disconnect ownership and explicit Stop cancellation.');
}catch(error){
  await writeFile(path.join(evidence,'result.json'),JSON.stringify({result:'FAIL',error:error instanceof Error?error.message:String(error),isolatedProfile:true,results,log},null,2));
  throw error;
}finally{
  if(native&&native.exitCode===null)native.kill();
  await browser?.close();
}
