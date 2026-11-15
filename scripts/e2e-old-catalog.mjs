import { _electron as electron } from 'playwright';
import electronPath from 'electron';
import { readFile, writeFile, mkdtemp, mkdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';

const data=await mkdtemp(path.join(tmpdir(),'lumen-old-catalog-'));
const evidence=path.resolve('test-results/old-catalog-fix/current');await mkdir(evidence,{recursive:true});
const catalogue=JSON.parse(await readFile('resources/hymn-numbering.json','utf8'));
const media=path.join(data,'003 Unidos en espíritu.mkv');
await new Promise((resolve,reject)=>{const child=spawn(ffmpeg,['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=navy:s=640x360:d=15','-f','lavfi','-i','sine=frequency=440:duration=15','-f','lavfi','-i','sine=frequency=660:duration=15','-map','0:v','-map','1:a','-map','2:a','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-shortest',media],{windowsHide:true});let error='';child.stderr.on('data',chunk=>{error+=chunk;});child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error(error)));});
const hymns=catalogue.entries.map(row=>({id:`h${row.number2009}`,number:row.number2009,title:row.titles[0],path:row.number2009===3?media:path.join(data,`${row.number2009}.mkv`),duration:15,tracks:[{index:1,label:'Cantado',language:'spa'},{index:2,label:'Instrumental',language:'spa'}],size:1,modified:0,edition:'2009',number1962:row.number1962,number2009:row.number2009,numberingSource:'fixture',numberingConflict:row.number1962===190}));
const seed=JSON.stringify({hymns,program:[],settings:{theme:'noche',fontSize:52,autoProject:false,volume:.7}});await writeFile(path.join(data,'library.json'),seed);
const executable=process.env.LUMEN_E2E_EXECUTABLE??electronPath;const env={...process.env,LUMEN_DATA_DIR:data,LUMEN_HEADLESS:'1'};delete env.ELECTRON_RUN_AS_NODE;
let app;const errors=[];const captures=[];
const invoke=(page,action)=>page.evaluate(async action=>{const r=await window.lumen.invoke(action);if(!r.ok)throw new Error(r.error);return r.data;},action);
const snapshot=page=>invoke(page,{type:'snapshot'});
const edition=(page,value)=>page.locator(`[data-action="hymn-edition"][data-id="${value}"]`).click();
const search=async(page,text)=>{await page.locator('#global-search').fill(text);await page.locator('#global-search').press('Enter');};
const choose=async(page,number)=>{await search(page,String(number));await page.locator(`.hymn-row[data-id="old1962:${number}"]`).click();};
async function waitSnapshot(page,predicate){const deadline=performance.now()+15000;do{const value=await snapshot(page);if(predicate(value))return value;await new Promise(resolve=>setTimeout(resolve,40));}while(performance.now()<deadline);throw new Error('Snapshot condition did not become true');}
async function capture(page,view,width,file){await page.screenshot({path:path.join(evidence,file),fullPage:true});captures.push({view,width,file});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${file} fits viewport`);}
async function blockedShortcut(page){await page.locator('.hymn-detail h1').click();await page.keyboard.press('Control+Enter');await page.locator('#error-toast').waitFor({state:'visible'});assert.match(await page.locator('#error-toast').innerText(),/Canción no disponible/);await page.locator('#error-toast button').click();}
try{
  app=await electron.launch({executablePath:executable,args:executable===electronPath?['.']:[],cwd:process.cwd(),env,timeout:60000});const page=await app.firstWindow();await page.locator('.brand-name').waitFor();
  await app.evaluate(({BrowserWindow})=>{for(const window of BrowserWindow.getAllWindows())window.showInactive();});page.on('pageerror',error=>errors.push(error.message));await page.setViewportSize({width:1920,height:1000});
  const initial=await snapshot(page);assert.equal(initial.oldHymnCatalog.length,527);assert.deepEqual(initial.oldHymnCatalog.map(h=>h.number),Array.from({length:527},(_,i)=>i+1));assert.equal(initial.hymns.length,613);assert.equal(await readFile(path.join(data,'library.json'),'utf8'),seed,'Catalogue loading leaves personal library bytes untouched');
  await page.locator('[data-action="view-himnario"]').click();await edition(page,'1962');assert.equal(await page.locator('.hymn-row').count(),527);assert.match(await page.locator('[data-action="hymn-edition"][data-id="1962"]').innerText(),/527 títulos/);
  const available=await page.locator('.catalogue-row[data-availability="available"]').count();const missing=await page.locator('.catalogue-row[data-availability="missing"]').count();assert.equal(available+missing,527);
  await choose(page,527);assert.equal(await page.locator('.song-availability').innerText(),'Canción no disponible');assert.equal(await page.locator('.detail-actions [data-action="project"]').isDisabled(),true);assert.equal(await page.locator('.project-button').isDisabled(),true);assert.equal(await page.locator('.inspector [data-action="add-program"]').isDisabled(),true);assert.equal(await page.locator('.audio-option').count(),0);
  await blockedShortcut(page);assert.equal((await snapshot(page)).output.connected,false);assert.equal((await app.windows()).length,1);await capture(page,'unavailable',1920,'missing-527-1920.png');
  await page.locator('[data-action="view-biblia"]').click();const outputPromise=app.waitForEvent('window');await page.locator('.project-button').click();const output=await outputPromise;await output.locator('.stage-reference').waitFor();const verse=(await snapshot(page)).output;
  await page.locator('[data-action="view-himnario"]').click();await choose(page,527);await blockedShortcut(page);assert.equal((await snapshot(page)).output.revision,verse.revision);assert.equal((await snapshot(page)).output.slide.kind,'verse','Unavailable songs leave current live content intact');
  await choose(page,11);assert.equal(await page.locator('.large-number').innerText(),'011');await page.locator('.project-button').click();await output.waitForFunction(()=>{const v=document.querySelector('.stage-video');return v&&!v.paused&&!v.muted&&v.currentTime>.3;});assert.equal((await snapshot(page)).output.slide.hymnId,'h3');
  await page.locator('.audio-option').nth(1).click();await waitSnapshot(page,s=>s.output.slide.kind==='hymn'&&s.output.slide.track===2&&!s.output.preparing);
  await output.waitForFunction(()=>{const video=document.querySelector('.stage-video');return video&&!video.paused&&video.currentTime>.3;});const live=(await snapshot(page)).output;await choose(page,527);const afterMissing=(await snapshot(page)).output;assert.equal(afterMissing.revision,live.revision);await output.waitForFunction(()=>{const v=document.querySelector('.stage-video');return v&&!v.paused&&v.currentTime>.3;});await capture(page,'unavailable-live',1920,'missing-keeps-live.png');
  await invoke(page,{type:'stop-hymn'});await output.locator('.stage-video').waitFor({state:'detached'});await choose(page,11);await page.locator('.hymn-detail details').last().locator('summary').click();await page.locator('[data-action="remove-hymn"]').click();assert.equal((await snapshot(page)).hymns.length,612);assert.ok((await stat(media)).size>0);await choose(page,11);assert.equal(await page.locator('.song-availability').innerText(),'Canción no disponible');
  await edition(page,'2009');await search(page,'');await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},media);await page.locator('.library [data-action="import-hymns"]').click();await waitSnapshot(page,s=>s.hymns.length===613);assert.equal((await snapshot(page)).hymns.length,613);await edition(page,'1962');await choose(page,11);assert.equal(await page.locator('.project-button').isDisabled(),false,'Import links an existing missing catalogue title');
  await choose(page,190);assert.equal(await page.locator('.hymn-row').count(),1);assert.equal(await page.locator('.numbering-warning').count(),1);await page.locator('.catalogue-media-options summary').click();assert.equal(await page.locator('.catalogue-media-options [data-action="hymn"]').count(),2);await capture(page,'conflict190',1920,'conflict-190.png');
  await search(page,'');
  for(const [width,height]of [[1920,1000],[1100,900],[375,900]]){
    await page.setViewportSize({width,height});
    for(const view of ['biblia','himnario','programa','ajustes']){
      await page.locator(`[data-action="view-${view}"]`).click();if(view==='himnario'){await edition(page,'1962');await choose(page,527);}
      await capture(page,view,width,`${view}-${width}.png`);
      if(view==='himnario'){await choose(page,11);await capture(page,'available',width,`available-${width}.png`);await search(page,'');}
    }
  }
  assert.deepEqual(errors,[]);await writeFile(path.join(evidence,'captures.json'),JSON.stringify(captures,null,2));await writeFile(path.join(evidence,'result.json'),JSON.stringify({result:'PASS',catalogue:527,media:613,available,missing,libraryUnchangedOnLoad:true,scenarios:['527uniqueoldtitlesoffline','missingnumberandtitlesearch','missingprojectionandprogrammebuttonsdisabled','CtrlEnterblockedbeforeopeningoutput','liveverseandhymnnotreplacedbyunavailabletitle','availableold11playssamemedia3','trackchangefromcatalogueselection','removedmediaremainsincatalogueunavailable','importlinksmissingtitle','190canonicalrowkeepsbothreferences','fourviewsresponsive1920/1100/375'],rendererErrors:errors},null,2));console.log('PASS: catálogo527, canciones no disponibles, reproducción protegida e importación vinculada.');
}finally{await app?.close();await rm(data,{recursive:true,force:true});}
