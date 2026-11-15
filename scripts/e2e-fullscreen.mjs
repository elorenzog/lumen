import { _electron as electron } from 'playwright';
import electronPath from 'electron';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const baseline=process.env.LUMEN_FULLSCREEN_BASELINE==='1';
const profile=await mkdtemp(path.join(tmpdir(),'lumen-fullscreen-'));const evidence=path.resolve('test-results/fullscreen-fix',baseline?'baseline':'current');await mkdir(evidence,{recursive:true});
const executable=process.env.LUMEN_E2E_EXECUTABLE??electronPath;const env={...process.env,LUMEN_DATA_DIR:profile,LUMEN_HEADLESS:'1'};delete env.ELECTRON_RUN_AS_NODE;
let app;const errors=[];const captures=[];
const invoke=(page,action)=>page.evaluate(async action=>{const r=await window.lumen.invoke(action);if(!r.ok)throw new Error(r.error);return r.data;},action);
async function geometry(){return app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('output=1'));if(!w)throw new Error('Projection not found');const h=w.getNativeWindowHandle();let handle=0n;for(let i=h.length-1;i>=0;i--)handle=(handle<<8n)+BigInt(h[i]);return {id:w.id,bounds:w.getBounds(),contentBounds:w.getContentBounds(),fullscreen:w.isFullScreen(),menuVisible:w.isMenuBarVisible(),handle:handle.toString()};});}
async function nativeCapture(name,state){
  const result=await new Promise((resolve,reject)=>{const child=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File','scripts/capture-projection.ps1','-WindowHandle',state.handle,'-Destination',path.join(evidence,name)],{windowsHide:true});let stdout='',stderr='';child.stdout.on('data',chunk=>{stdout+=chunk;});child.stderr.on('data',chunk=>{stderr+=chunk;});child.on('error',reject);child.on('close',code=>code===0?resolve(JSON.parse(stdout)):reject(new Error(stderr)));});
  captures.push({file:name,...result});return result;
}
async function readyBounds(bounds){const deadline=performance.now()+10000;do{const value=await geometry();if(value.fullscreen&&['x','y','width','height'].every(key=>value.bounds[key]===bounds[key]))return value;await new Promise(resolve=>setTimeout(resolve,40));}while(performance.now()<deadline);await writeFile(path.join(evidence,'geometry-diagnostic.json'),JSON.stringify({expected:bounds,actual:await geometry()},null,2));throw new Error('Fullscreen display bounds did not settle');}
try{
  app=await electron.launch({executablePath:executable,args:executable===electronPath?['.']:[],cwd:process.cwd(),env,timeout:60000});const page=await app.firstWindow();await page.locator('.brand-name').waitFor();await app.evaluate(({BrowserWindow})=>{for(const w of BrowserWindow.getAllWindows())w.showInactive();});page.on('pageerror',error=>errors.push(error.message));
  const displays=await app.evaluate(({screen})=>screen.getAllDisplays().map(d=>({id:d.id,bounds:d.bounds,scaleFactor:d.scaleFactor})));
  const selected=displays.at(-1);assert.ok(selected);
  const outputPromise=app.waitForEvent('window');await invoke(page,{type:'open-output',displayId:selected.id});const output=await outputPromise;output.on('pageerror',error=>errors.push(error.message));await output.locator('.stage').waitFor();
  if(baseline){const value=await geometry();const native=await nativeCapture('windowed-before.png',value);await writeFile(path.join(evidence,'observed.json'),JSON.stringify({selected,actual:value,native},null,2));assert.equal(value.fullscreen,true,'Projection must be fullscreen with a single monitor');}
  const first=await readyBounds(selected.bounds);assert.deepEqual(first.contentBounds,selected.bounds);assert.equal(first.menuVisible,false);const welcome=await nativeCapture('welcome-native.png',first);assert.equal(welcome.hasCaption,false);assert.equal(welcome.hasThickFrame,false);assert.equal(welcome.bottomCovered,true,'Projection covers the Windows taskbar');
  await invoke(page,{type:'open-output',displayId:selected.id});const reused=await readyBounds(selected.bounds);assert.equal(reused.id,first.id,'Reopening reuses the projection window');
  await invoke(page,{type:'project',slide:{kind:'verse',text:'Lámpara es a mis pies tu palabra,\ny lumbrera a mi camino.',reference:'Salmos 119:105',translation:'RV1909'}});await output.locator('.stage-reference').waitFor();await nativeCapture('verse-native.png',await geometry());
  await invoke(page,{type:'blackout',value:true});await output.locator('#app.blackout').waitFor();await nativeCapture('blackout-native.png',await geometry());await invoke(page,{type:'blackout',value:false});
  let changedDisplay=false;
  if(displays.length>1){const other=displays.find(d=>d.id!==selected.id);assert.ok(other);await invoke(page,{type:'open-output',displayId:other.id});const moved=await readyBounds(other.bounds);assert.equal(moved.id,first.id);await nativeCapture('moved-native.png',moved);changedDisplay=true;}
  const closed=output.waitForEvent('close');try{await output.keyboard.press('Escape');}catch(error){if(!(error instanceof Error)||!output.isClosed()||!error.message.includes('closed'))throw error;}await closed;assert.equal(await page.locator('.brand-name').isVisible(),true,'Operator remains open');const snapshot=await invoke(page,{type:'snapshot'});assert.equal(snapshot.output.connected,false);assert.deepEqual(errors,[]);
  await writeFile(path.join(evidence,'captures.json'),JSON.stringify(captures,null,2));await writeFile(path.join(evidence,'result.json'),JSON.stringify({result:'PASS',selected,first,reused,displayCount:displays.length,changedDisplayHardwareTested:changedDisplay,captures,scenarios:['frameless native window','fullscreen selected display','content equals complete display bounds','Windows taskbar covered','no menu','reopen same output window','verse and blackout full screen','Escape closes output only'],rendererErrors:errors},null,2));console.log('PASS: proyección sin bordes ni título, pantalla completa, monitor elegido y Escape.');
}finally{await app?.close();await rm(profile,{recursive:true,force:true});}
