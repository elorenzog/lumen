import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { exerciseNativeFixtures, importOptionalBibleFolder } from './e2e-tauri-fixtures.mjs';
import { invoke, snapshot, waitForNative } from './e2e-tauri-native.mjs';
import { classifyConsoleErrors, diagnosticReplacer, resourceAddress } from './e2e-tauri-diagnostics.mjs';

const cwd=process.cwd();
const executable=process.env.LUMEN_E2E_EXECUTABLE??path.join(cwd,'src-tauri','target','debug','lumen.exe');
const data=await mkdtemp(path.join(tmpdir(),'lumen-tauri-e2e-'));
const evidence=path.join(cwd,'test-results','tauri');
await mkdir(evidence,{recursive:true});
await writeFile(path.join(data,'dialogs.json'),'{}');
const failures=[];
const resourceFailures=[];
const consoleErrors=[];
const knownHymns=new Map();
const pendingDiagnostics=new Set();
const screenshots=[];
let child;
let browser;
let nativeLog='';

async function launch(){
  const portServer=createServer();
  portServer.listen(0,'127.0.0.1');
  await once(portServer,'listening');
  const address=portServer.address();
  assert.ok(address&&typeof address==='object');
  await new Promise((resolve,reject)=>portServer.close(error=>error?reject(error):resolve()));
  const endpoint=`http://127.0.0.1:${address.port}`;
  child=spawn(executable,[],{cwd,windowsHide:true,env:{...process.env,
    LUMEN_DATA_DIR:data,LUMEN_HEADLESS:'1',LUMEN_E2E_DIALOGS_FILE:path.join(data,'dialogs.json'),
    WEBVIEW2_USER_DATA_FOLDER:path.join(data,'webview2'),
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${address.port} --autoplay-policy=no-user-gesture-required`,
  }});
  const launchErrors=[];
  child.once('error',error=>launchErrors.push(error));
  child.stdout.on('data',chunk=>{nativeLog=(nativeLog+chunk).slice(-16000);});
  child.stderr.on('data',chunk=>{nativeLog=(nativeLog+chunk).slice(-16000);});
  const deadline=Date.now()+60000;
  while(Date.now()<deadline){
    if(launchErrors[0])throw launchErrors[0];
    if(child.exitCode!==null)throw new Error(`LUMEN exited with ${child.exitCode}: ${nativeLog}`);
    try{browser=await chromium.connectOverCDP(endpoint,{timeout:1500});break;}
    catch(error){if(!(error instanceof Error))throw error;await delay(200);}
  }
  assert.ok(browser,'Native WebView2 CDP endpoint was not available within 60 seconds');
  const page=await findPage(false);
  await page.locator('.brand-name').waitFor({timeout:30000});
  await observe(page);
  assert.equal(await page.evaluate(()=>Boolean(window.__TAURI_INTERNALS__)&&!window.__TAURI__),true,'Actual Tauri IPC is present without a global Tauri API');
  return page;
}

async function findPage(output){
  const deadline=Date.now()+30000;
  while(Date.now()<deadline){
    const page=browser.contexts().flatMap(context=>context.pages()).find(page=>page.url()!=='about:blank'&&new URL(page.url()).searchParams.has('output')===output);
    if(page)return page;
    await delay(100);
  }
  throw new Error(`Native ${output?'projection':'operator'} webview did not appear`);
}

async function observe(page){
  page.on('pageerror',error=>failures.push(error.message));
  page.on('console',message=>{
    const text=message.text();
    if(text.startsWith('LUMEN_E2E_HYMN:')){const hymn=JSON.parse(text.slice(15));knownHymns.set(hymn.url,hymn.revision);}
    if(message.type()==='error')consoleErrors.push({message:text,url:resourceAddress(message.location().url),page:page.url()});
  });
  page.on('response',response=>{
    if(response.status()<400)return;
    const detail={at:Date.now(),status:response.status(),url:resourceAddress(response.url()),resourceType:response.request().resourceType(),page:page.url()};
    resourceFailures.push(detail);
    const pending=page.evaluate(async()=>{
      const result=await window.lumen.invoke({type:'snapshot'});
      if(!result.ok)return {error:result.error};
      const output=result.data.output;
      const address=output.slide.kind==='hymn'?new URL(output.slide.mediaUrl):null;
      return {revision:output.revision,kind:output.slide.kind,connected:output.connected,preparing:output.preparing,activeMedia:address?.href??null};
    }).then(native=>{detail.native=native;}).catch(error=>{detail.diagnosticError=error instanceof Error?error.message:String(error);});
    pendingDiagnostics.add(pending);void pending.finally(()=>pendingDiagnostics.delete(pending));
  });
  await page.evaluate(async()=>{
    const record=snapshot=>{if(snapshot.output.slide.kind==='hymn'){const address=new URL(snapshot.output.slide.mediaUrl);console.debug('LUMEN_E2E_HYMN:'+JSON.stringify({url:address.href,revision:snapshot.output.revision}));}};
    window.lumen.subscribe(record);
    const response=await window.lumen.invoke({type:'snapshot'});if(response.ok)record(response.data);
  });
}

async function capture(page,name,fullPage=true){
  const file=`${name}.png`;
  await page.screenshot({path:path.join(evidence,file),fullPage});
  screenshots.push(file);
}

async function stop(){
  const active=child;
  child=undefined;
  if(active&&active.exitCode===null){
    const exited=once(active,'exit');
    active.kill();
    await Promise.race([exited,delay(5000)]);
  }
  if(browser){await browser.close();browser=undefined;}
}

try{
  let page=await launch();
  await page.setViewportSize({width:1500,height:960});
  const initial=await snapshot(page);
  assert.ok(initial.bibles.some(bible=>bible.count>30000),'Bundled Bible is available offline');
  assert.equal(initial.output.connected,false);
  assert.ok(initial.displays.length>0,'Native monitor discovery is available');
  assert.equal(initial.oldHymnCatalog.length,527,'Complete old hymnal catalogue is retained');
  await page.locator('#global-search').fill('Juan 3:16');
  await page.locator('#global-search').press('Enter');
  await page.waitForFunction(()=>document.querySelectorAll('.verse').length===1);
  assert.equal(await page.locator('.verse').count(),1);
  await page.locator('.project-button').click();
  const output=await findPage(true);
  await output.locator('.stage-text').waitFor();
  await observe(output);
  assert.match(await output.locator('.stage-reference').innerText(),/Juan 3:16/);
  await capture(output,'projection-verse');
  const restricted=await output.evaluate(()=>window.lumen.invoke({type:'program',program:[]}));
  assert.equal(restricted.ok,false,'Native backend rejects operator actions from projection');
  await page.locator('[data-action="blackout"]').click();
  await output.locator('#app.blackout').waitFor();
  await page.locator('[data-action="blackout"]').click();
  await output.locator('#app:not(.blackout)').waitFor();
  await page.locator('#appearance-options > summary').click();
  await page.locator('#auto-project').check();
  await page.locator('#global-search').fill('');
  await page.locator('#global-search').press('Enter');
  await page.getByRole('button',{name:'Versículo 17',exact:true}).click();
  await output.waitForFunction(()=>document.querySelector('.stage-reference')?.textContent?.includes('3:17'));
  await page.locator('#auto-project').uncheck();
  await page.locator('#range-options > summary').click();
  await page.locator('#verse-range').fill('16-18');
  await page.locator('[data-action="select-range"]').click();
  await page.locator('.project-button').click();
  await output.waitForFunction(()=>/3:16[–-]18/.test(document.querySelector('.stage-reference')?.textContent??''));
  await capture(output,'projection-range');
  await page.locator('.add-program').click();
  assert.equal((await snapshot(page)).program.length,1);
  if(!await page.locator('#appearance-options').evaluate(element=>element.open))await page.locator('#appearance-options > summary').click();
  await page.locator('[data-action="appearance-open"]').click();
  await page.locator('#ap-mode').selectOption('gradient');
  await page.locator('#ap-align').selectOption('left');
  assert.equal((await snapshot(page)).settings.appearance.mode,'preset','Appearance draft does not change live settings');
  await capture(page,'appearance-desktop');
  await page.locator('[data-action="appearance-apply"]').click();
  await output.waitForFunction(()=>document.querySelector('.stage')?.style.getPropertyValue('--stage-align')==='left');
  const media=await exerciseNativeFixtures({page,output,data,evidence});
  screenshots.push(...media.screenshots);
  await page.locator('[data-action="welcome"]').click();
  await output.locator('.stage-welcome').waitFor();
  await capture(output,'projection-welcome');
  await output.keyboard.press('Escape');
  await waitForNative(page,{kind:'connected',value:false});
  await invoke(page,{type:'update-preference',checkAtStartup:false});
  const subscription=await page.evaluate(async()=>{
    let events=0;
    const unsubscribe=window.lumen.subscribe(()=>{events++;});
    const preference=async checkAtStartup=>{
      const changed=new Promise((resolve,reject)=>{
        const stop=window.lumen.subscribe(snapshot=>{if(snapshot.updates.checkAtStartup===checkAtStartup){clearTimeout(timeout);stop();resolve();}});
        const timeout=setTimeout(()=>{stop();reject(new Error('Native updater preference event was not received'));},60000);
      });
      const result=await window.lumen.invoke({type:'update-preference',checkAtStartup});
      if(!result.ok)throw new Error(result.error);
      await changed;
    };
    await preference(true);
    unsubscribe();
    const subscribed=events;
    await preference(false);
    return {subscribed,after:events};
  });
  assert.ok(subscription.subscribed>0,'Native snapshot events reach renderer subscribers');
  assert.equal(subscription.after,subscription.subscribed,'Subscription cleanup removes the callback');
  for(const [width,height,label] of [[1500,960,'desktop'],[768,1024,'tablet'],[375,900,'mobile']]){
    await page.setViewportSize({width,height});
    for(const view of ['biblia','himnario','programa','ajustes']){
      await page.locator(`[data-action="view-${view}"]`).click();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${view} fits ${width}px`);
      await capture(page,`${view}-${label}`);
    }
    await page.locator('[data-action="show-about"]').click();
    await page.waitForFunction(()=>{
      const about=document.getElementById('about-lumen');
      const heading=document.getElementById('about-heading');
      const reader=about?.closest('.reader');
      const credits=about?.querySelector('.developer-row:last-child');
      if(!heading||!reader||!credits)return false;
      if(innerWidth<=640)return true;
      const frame=reader.getBoundingClientRect();
      return heading.getBoundingClientRect().top>=frame.top&&credits.getBoundingClientRect().bottom<=frame.bottom;
    });
    await capture(page,`about-${label}`,false);
    assert.equal(await page.locator('#check-updates-startup').isChecked(),false);
    assert.equal(await page.locator('.developer-row').count(),2);
  }
  const realEditions=await importOptionalBibleFolder(page,data);
  await stop();
  page=await launch();
  const restored=await snapshot(page);
  assert.equal(restored.program.length,1,'Program persists after native restart');
  assert.equal(restored.settings.appearance.mode,'gradient','Appearance persists after native restart');
  assert.equal(restored.updates.checkAtStartup,false,'Updater preference persists after native restart');
  assert.equal(restored.output.connected,false,'Projection starts closed');
  assert.ok(restored.history.length>0,'Projection history persists');
  assert.ok(restored.hymns.some(hymn=>hymn.id===media.persistedHymnId),'Imported hymn persists after native restart');
  assert.ok(restored.bibles.some(bible=>bible.id===media.fileBibleId)&&restored.bibles.some(bible=>bible.id==='native-folder-test'),'Native file and folder Bible imports persist');
  assert.equal(restored.backgrounds.length,1,'Managed background copy persists after source removal');
  if(realEditions)assert.ok(realEditions.ids.every(id=>restored.bibles.some(bible=>bible.id===id)),'All 13 real editions persist after native restart');
  while(pendingDiagnostics.size)await Promise.all([...pendingDiagnostics]);
  const classified=classifyConsoleErrors({consoleErrors,responses:resourceFailures,knownHymns});
  failures.push(...classified.unexpected.map(error=>error.message));
  assert.deepEqual(failures,[],'No unexpected renderer errors');
  await writeFile(path.join(evidence,'result.json'),JSON.stringify({result:'PASS',runtime:'Tauri/WebView2',isolatedProfile:true,scenarios:['native IPC','native displays','offline Bible','reference search','verse and range projection','projection sender permissions','blackout','automatic projection','appearance draft and apply','program persistence','Escape closes projection','snapshot subscription cleanup','updater preference persistence','old hymnal catalogue','native Bible file and folder imports','managed image and base-screen background','two-audio MKV import and playback','track switch','pause and seek','hymn replacement','stop and removal during preparation','media end and replay','all views at 375/768/1500'],nativeMedia:media,realEditions,screenshots,rendererErrors:failures,expectedCancellationResponses:classified.expectedCancellationResponses,resourceResponses:resourceFailures,consoleErrors},diagnosticReplacer,2));
  console.log('PASS: native Tauri IPC, projection, settings, responsive UI, and restart persistence.');
}catch(error){
  const diagnostics=await Promise.allSettled((browser?.contexts().flatMap(context=>context.pages())??[]).map(async(page,index)=>{
    const state=await page.evaluate(()=>({url:location.href,title:document.title,readyState:document.readyState,text:document.body.innerText.slice(0,6000),width:innerWidth,height:innerHeight,bridge:Boolean(window.lumen),tauri:Boolean(window.__TAURI_INTERNALS__),scripts:[...document.scripts].map(script=>script.src)}));
    await page.screenshot({path:path.join(evidence,`failure-${index}.png`),timeout:5000});
    return state;
  }));
  await writeFile(path.join(evidence,'result.json'),JSON.stringify({result:'FAIL',error:error instanceof Error?error.message:String(error),nativeLog,screenshots,rendererErrors:failures,resourceFailures,consoleErrors,knownHymns:[...knownHymns],diagnostics},diagnosticReplacer,2));
  throw error;
}finally{await stop();}
