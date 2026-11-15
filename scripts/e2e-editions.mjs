import { _electron as electron } from 'playwright';
import electronPath from 'electron';
import { readFile, writeFile, mkdtemp, mkdir, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';

const data=await mkdtemp(path.join(tmpdir(),'lumen-editions-'));
const evidence=path.resolve('test-results/hymn-editions-fix/current');await mkdir(evidence,{recursive:true});
const catalog=JSON.parse(await readFile('resources/hymn-numbering.json','utf8'));
const media=path.join(data,'003 Unidos en espíritu.mkv');
await new Promise((resolve,reject)=>{
  const child=spawn(ffmpeg,['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=navy:s=640x360:d=12','-f','lavfi','-i','sine=frequency=440:duration=12','-f','lavfi','-i','sine=frequency=660:duration=12','-map','0:v','-map','1:a','-map','2:a','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-shortest',media],{windowsHide:true});let error='';child.stderr.on('data',chunk=>{error+=chunk;});child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error(error)));
});
const hymn=(number,title)=>({id:`h${number}`,number,title,path:number===3?media:path.join(data,`${number} ${title}.mkv`),duration:12,tracks:[{index:1,label:'Cantado',language:'spa'},{index:2,label:'Instrumental',language:'spa'}],size:1,modified:0,favorite:number===3});
const hymns=catalog.entries.map(row=>hymn(row.number2009,row.titles[0]));hymns.push(hymn(777,'Archivo personal'));
const seed=JSON.stringify({hymns,program:[{id:'p1',title:'Juan 3:16',slide:{kind:'verse',reference:'Juan 3:16',translation:'RV1909',text:'Texto para el programa.'}}],settings:{theme:'noche',fontSize:52,autoProject:false,volume:.7}});
await writeFile(path.join(data,'library.json'),seed);
const executable=process.env.LUMEN_E2E_EXECUTABLE??electronPath;
const env={...process.env,LUMEN_DATA_DIR:data,LUMEN_HEADLESS:'1'};delete env.ELECTRON_RUN_AS_NODE;
let app;const errors=[];const captures=[];
const invoke=(page,action)=>page.evaluate(async action=>{const r=await window.lumen.invoke(action);if(!r.ok)throw new Error(r.error);return r.data;},action);
const state=page=>invoke(page,{type:'snapshot'});
const edition=(page,value)=>page.locator(`[data-action="hymn-edition"][data-id="${value}"]`).click();
const search=async(page,text)=>{await page.locator('#global-search').fill(text);await page.locator('#global-search').press('Enter');};
async function launch(){
  app=await electron.launch({executablePath:executable,args:executable===electronPath?['.']:[],cwd:process.cwd(),env,timeout:60000});const page=await app.firstWindow();await page.locator('.brand-name').waitFor();
  await app.evaluate(({BrowserWindow})=>{for(const window of BrowserWindow.getAllWindows())window.showInactive();});page.on('pageerror',error=>errors.push(error.message));return page;
}
async function capture(page,view,width,file){await page.screenshot({path:path.join(evidence,file),fullPage:true});captures.push({view,width,file});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${file} fits viewport`);}
try{
  let page=await launch();await page.setViewportSize({width:1920,height:1000});await page.locator('[data-action="view-himnario"]').click();
  const migrated=await state(page);assert.equal(migrated.hymns.length,614);assert.equal(migrated.hymns.filter(h=>h.number2009!==null).length,613);assert.equal(migrated.hymns.filter(h=>h.number1962!==null).length,367);
  const backups=await readdir(path.join(data,'backups'));assert.equal(backups.length,1);assert.equal(await readFile(path.join(data,'backups',backups[0]),'utf8'),seed);
  await page.locator('#hymn-search-scope').selectOption('title');await edition(page,'1962');assert.equal(await page.locator('.hymn-row').count(),527);
  await search(page,'11');await page.locator('.hymn-row[data-media-id="h3"],.hymn-row[data-id="h3"]').click();assert.equal(await page.locator('.large-number').innerText(),'011');assert.equal(await page.locator('[data-numbering="2009"] strong').innerText(),'003');assert.equal(await page.locator('.hymn-row[data-id="h11"]').count(),0);
  await capture(page,'antiguo-busqueda',1920,'antiguo-busqueda-1920.png');
  await edition(page,'2009');await page.locator('.hymn-row[data-id="h11"]').click();assert.match(await page.locator('[data-numbering="1962"]').innerText(),/Sin equivalencia disponible/);await capture(page,'sin-equivalencia',1920,'sin-equivalencia-1920.png');
  await search(page,'');await page.locator('.hymn-row[data-media-id="h3"],.hymn-row[data-id="h3"]').click();await edition(page,'1962');assert.equal(await page.locator('.large-number').innerText(),'011');
  const outputPromise=app.waitForEvent('window');await page.locator('.project-button').click();const output=await outputPromise;
  await output.waitForFunction(()=>{const video=document.querySelector('.stage-video');return video&&!video.paused&&!video.muted&&video.currentTime>.4;});
  const live=(await state(page)).output;assert.equal(live.slide.hymnId,'h3');const audioDeadline=performance.now()+5000;let audible=false;
  do{audible=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().some(w=>w.webContents.getURL().includes('output=1')&&w.webContents.isCurrentlyAudible()));if(audible)break;await new Promise(resolve=>setTimeout(resolve,100));}while(performance.now()<audioDeadline);assert.equal(audible,true);
  await edition(page,'2009');assert.equal((await state(page)).output.revision,live.revision,'Edition browsing must not restart the live hymn');
  await invoke(page,{type:'stop-hymn'});await output.locator('.stage-video').waitFor({state:'detached'});
  await edition(page,'1962');await search(page,'190');assert.equal(await page.locator('.hymn-row').count(),1);await page.locator('.hymn-row[data-id="old1962:190"]').click();assert.equal(await page.locator('.numbering-warning').count(),1);await capture(page,'conflicto190',1920,'conflicto-190.png');
  await search(page,'');await edition(page,'unknown');assert.equal(await page.locator('.hymn-row').count(),1);await page.locator('.hymn-row').click();
  await page.locator('.metadata-editor summary').click();await page.locator('#hm-number1962').fill('527');await page.locator('[data-action="save-hymn-metadata"]').click();
  assert.equal((await state(page)).hymns.find(h=>h.id==='h777').numberingSource,'manual');
  await app.close();app=undefined;page=await launch();await page.setViewportSize({width:1920,height:1000});
  const persisted=await state(page);assert.equal(persisted.hymns.find(h=>h.id==='h777').number1962,527);assert.equal(persisted.hymns.find(h=>h.id==='h3').favorite,true);assert.equal(persisted.program[0].id,'p1');assert.equal((await readdir(path.join(data,'backups'))).length,1);
  await page.locator('[data-action="view-himnario"]').click();await edition(page,'1962');await search(page,'527');assert.equal(await page.locator('.hymn-row[data-media-id="h777"],.hymn-row[data-id="h777"]').count(),1);await search(page,'');
  for(const [width,height]of [[1920,1000],[1100,900],[375,900]]){
    await page.setViewportSize({width,height});
    for(const view of ['biblia','himnario','programa','ajustes']){
      await page.locator(`[data-action="view-${view}"]`).click();
      if(view==='himnario'){await edition(page,'1962');await page.locator('.hymn-row[data-media-id="h3"],.hymn-row[data-id="h3"]').click();}
      await capture(page,view,width,`${view}-${width}.png`);
      if(view==='himnario'){await edition(page,'2009');await capture(page,'himnario-nuevo',width,`himnario-nuevo-${width}.png`);}
    }
  }
  assert.deepEqual(errors,[]);await writeFile(path.join(evidence,'captures.json'),JSON.stringify(captures,null,2));
  await writeFile(path.join(evidence,'result.json'),JSON.stringify({result:'PASS',migrated:{total:614,new:613,old:367,unknown:1,conflict:2},manualAliasPersists:true,audible,sameMediaAcrossViews:true,originalBackupPreserved:true,scenarios:['old/new edition names and counts','old11 maps to new3','search respects edition','no old equivalence explicit','twoold190records retained','manual numbering and favorites survive restart','same video with audible audio','edition toggle keeps live revision','stop unload','responsive fourviews at1920/1100/375'],rendererErrors:errors},null,2));console.log('PASS: numeración antigua/nueva, búsqueda, migración, audios, persistencia y diseño.');
}finally{await app?.close();await rm(data,{recursive:true,force:true});}
