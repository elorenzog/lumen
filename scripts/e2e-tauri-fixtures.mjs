import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { invoke, snapshot, waitForNative } from './e2e-tauri-native.mjs';

async function dialogs(data,selection){await writeFile(path.join(data,'dialogs.json'),JSON.stringify(selection));}
async function playing(output){
  await output.waitForFunction(()=>{const video=document.querySelector('.stage-video');return video instanceof HTMLVideoElement&&video.readyState>=2&&!video.paused&&video.currentTime>0.3;},null,{timeout:60000});
}
async function videoStats(output){
  return output.locator('.stage-video').evaluate(video=>({currentTime:video.currentTime,duration:video.duration,readyState:video.readyState,paused:video.paused,muted:video.muted,volume:video.volume,width:video.videoWidth,height:video.videoHeight,error:video.error?.message??null}));
}
async function interruptPreparation(page,action){
  await page.evaluate(async action=>{
    let stopListening;
    const preparing=new Promise(resolve=>{stopListening=window.lumen.subscribe(snapshot=>{if(snapshot.output.preparing?.hymnId===action.id)resolve();});});
    const pending=window.lumen.invoke({type:'play-hymn',id:action.id,track:1});
    try{
      await Promise.race([preparing,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Native preparation event was not received')),10000))]);
      const interrupted=await window.lumen.invoke(action);
      if(!interrupted.ok)throw new Error(interrupted.error);
      const completed=await pending;
      if(!completed.ok)throw new Error(completed.error);
    }finally{stopListening();}
  },action);
}
async function createHymn(data){
  const fixture=path.join(data,'001 Himno de prueba.mkv');
  const ffmpeg=process.env.LUMEN_E2E_FFMPEG??path.join(process.cwd(),'src-tauri','tools','ffmpeg.exe');
  await new Promise((resolve,reject)=>{
    const process=spawn(ffmpeg,['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=navy:s=640x360:d=18','-f','lavfi','-i','sine=frequency=440:duration=18','-f','lavfi','-i','sine=frequency=880:duration=18','-map','0:v','-map','1:a','-map','2:a','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-metadata:s:a:0','title=Con voz','-metadata:s:a:1','title=Instrumental','-shortest',fixture],{windowsHide:true});
    let message='';process.stderr.on('data',chunk=>{message+=chunk;});process.once('error',reject);process.once('exit',code=>code===0?resolve():reject(new Error(message)));
  });
  const replacement=path.join(data,'002 Himno de reemplazo.mkv');
  await copyFile(fixture,replacement);
  return {fixture,replacement};
}

export async function importOptionalBibleFolder(page,data){
  const folder=process.env.LUMEN_TEST_BIBLE_FOLDER;
  if(!folder)return null;
  const ids=[];
  for(const file of await readdir(folder)){
    if(!file.toLowerCase().endsWith('.json'))continue;
    const value=JSON.parse(await readFile(path.join(folder,file),'utf8'));
    if(value&&typeof value==='object'&&typeof value.id==='string'&&Array.isArray(value.verses)&&value.verses.length>0)ids.push(value.id);
  }
  assert.equal(new Set(ids).size,13,'Optional real Bible folder contains 13 distinct editions');
  const before=(await snapshot(page)).bibles.map(bible=>bible.id);
  const existing=ids.filter(id=>before.includes(id));
  assert.equal(existing.length,2,'Two real editions are already bundled');
  await dialogs(data,{'import-bible-folder':[folder]});
  await invoke(page,{type:'import-bible-folder'});
  const after=(await snapshot(page)).bibles.map(bible=>bible.id);
  assert.ok(ids.every(id=>after.includes(id)),'Every real Bible ID is installed through the native folder importer');
  const imported=ids.filter(id=>!before.includes(id)&&after.includes(id));
  assert.equal(imported.length,11,'Native folder import adds the other 11 real editions');
  return {editions:13,imported:11,existing:2,ids};
}

export async function exerciseNativeFixtures({page,output,data,evidence}){
  const screenshots=[];
  const capture=async(target,name)=>{const file=`${name}.png`;await target.screenshot({path:path.join(evidence,file),fullPage:true});screenshots.push(file);};
  const verses=[16,17,18].map(verse=>({book:43,chapter:3,verse,text:`Texto local de prueba ${verse}.`}));
  const bible={id:'native-file-test',name:'Biblia local de prueba',abbreviation:'<img src=x>',source:'Native E2E fixture',license:'Test fixture',verses};
  const bibleFile=path.join(data,'Biblia local.json');
  await writeFile(bibleFile,JSON.stringify(bible));
  await dialogs(data,{'import-bible':[bibleFile]});
  await page.locator('.library [data-action="import-bible"]').click();
  await page.waitForFunction(()=>document.querySelector('.status-bar')?.textContent?.includes('<img src=x>'));
  const fileBibleId=await page.locator('#translation').inputValue();
  assert.notEqual(fileBibleId,bible.id,'Single-file import creates an edition identity independent of the source ID');
  assert.ok((await snapshot(page)).bibles.some(item=>item.id===fileBibleId&&item.name===bible.name),'Native single-file import assigns and selects its new edition ID');
  assert.match(await page.locator('.status-bar').innerText(),/<img src=x>/,'Imported abbreviation remains literal text');
  assert.equal(await page.locator('.status-bar img').count(),0,'Imported metadata is escaped');
  const folder=path.join(data,'Biblias de carpeta');
  await mkdir(folder);
  await writeFile(path.join(folder,'local.json'),JSON.stringify({...bible,id:'native-folder-test',name:'Biblia de carpeta',abbreviation:'CARP'}));
  await writeFile(path.join(folder,'duplicate.json'),JSON.stringify({...bible,id:fileBibleId}));
  await writeFile(path.join(folder,'invalid.json'),'{}');
  await dialogs(data,{'import-bible-folder':[folder]});
  await page.locator('[data-action="view-ajustes"]').click();
  await page.locator('[data-action="import-bible-folder"]').click();
  await waitForNative(page,{kind:'bible',id:'native-folder-test'});
  assert.equal((await snapshot(page)).bibles.filter(bible=>bible.id===fileBibleId).length,1,'Folder import skips installed Bible IDs');
  await capture(page,'native-bible-imports');
  await page.locator('[data-action="view-biblia"]').click();
  const gradient=(await snapshot(page)).settings;
  const image=path.join(data,'Fondo local.png');
  await output.screenshot({path:image});
  await dialogs(data,{'import-background':[image]});
  await page.locator('[data-action="appearance-open"]').click();
  await page.locator('#ap-mode').selectOption('image');
  await page.locator('[data-action="appearance-import"]').click();
  await page.waitForFunction(()=>document.querySelector('.editor-notice')?.textContent?.includes('Archivo guardado'));
  const asset=(await snapshot(page)).backgrounds.at(-1);
  assert.equal(asset.kind,'image');
  await unlink(image);
  await page.locator('[data-action="appearance-apply"]').click();
  await output.waitForFunction(()=>{const image=document.querySelector('.stage-background');return image instanceof HTMLImageElement&&image.complete&&image.naturalWidth>0;});
  await capture(output,'native-image-background');
  await invoke(page,{type:'settings',settings:{...gradient,baseScreen:{imageId:asset.id,fit:'contain'}}});
  await invoke(page,{type:'project',slide:{kind:'welcome',title:'LUMEN',subtitle:'Pantalla base'}});
  await output.waitForFunction(()=>{const image=document.querySelector('.stage-base-image');return image instanceof HTMLImageElement&&image.complete&&image.naturalWidth>0;});
  await capture(output,'native-base-image');
  await invoke(page,{type:'settings',settings:gradient});
  const {fixture,replacement}=await createHymn(data);
  await dialogs(data,{'import-hymns':[fixture]});
  await page.locator('[data-action="view-himnario"]').click();
  await page.locator('[data-action="hymn-edition"][data-id="2009"]').click();
  await page.locator('[data-action="import-hymns"]').click();
  await page.locator('.hymn-row').waitFor({timeout:60000});
  await page.locator('.hymn-row').click();
  assert.equal(await page.locator('.audio-option').count(),2,'Native ffprobe finds both audio tracks');
  const hymn=(await snapshot(page)).hymns[0];
  await page.locator('[data-action="favorite-hymn"]').click();
  await page.locator('.project-button').click();
  await playing(output);
  const first=(await snapshot(page)).output;
  const firstStats=await videoStats(output);
  assert.equal(firstStats.muted,false,'Projection owns audible media');
  assert.equal(await page.locator('[data-live-preview] .stage-video').evaluate(video=>video.muted),true,'Operator preview remains muted');
  await capture(output,'native-hymn-first-audio');
  await page.locator('.audio-option').nth(1).click();
  await waitForNative(page,{kind:'track',track:2});
  await playing(output);
  const second=(await snapshot(page)).output;
  assert.ok(second.revision>first.revision,'Track switch starts a new playback revision');
  assert.notEqual(second.slide.mediaUrl,first.slide.mediaUrl,'Track switch uses separately prepared audio');
  await page.locator('[data-action="toggle-play"]').click();
  await output.waitForFunction(()=>document.querySelector('.stage-video')?.paused);
  await invoke(page,{type:'playback',position:3,revision:second.revision});
  await output.waitForFunction(()=>Math.abs((document.querySelector('.stage-video')?.currentTime??0)-3)<0.7);
  await page.locator('[data-action="toggle-play"]').click();
  await playing(output);
  await page.locator('[data-action="blackout"]').click();
  await output.waitForFunction(()=>document.querySelector('.stage-video')?.paused&&document.querySelector('#app')?.classList.contains('blackout'));
  await page.locator('[data-action="blackout"]').click();
  await playing(output);
  const secondStats=await videoStats(output);
  await capture(output,'native-hymn-second-audio');
  await capture(page,'native-hymn-operator');
  await page.locator('[data-action="stop"]').click();
  await output.locator('.stage-video').waitFor({state:'detached'});
  assert.equal((await snapshot(page)).output.slide.kind,'welcome','Stop restores the base screen');
  await dialogs(data,{'import-hymns':[replacement]});
  await page.locator('[data-action="import-hymns"]').click();
  const waiting=await waitForNative(page,{kind:'hymn-count',count:2});
  const waitResult=waiting.hymns.length===2;
  const observations=[];
  for(let index=0;index<6;index++)observations.push(await page.evaluate(async()=>{
    const requestAt=Date.now();
    const response=await window.lumen.invoke({type:'snapshot'});
    return {requestAt,responseAt:Date.now(),url:location.href,title:document.title,window:window.__TAURI_INTERNALS__.metadata.currentWindow.label,response};
  }));
  const imported=observations[0].response.data.hymns;
  await writeFile(path.join(evidence,'native-hymn-identities.json'),JSON.stringify({expectedProfile:data,first:hymn,waitResult,observations,imported},null,2));
  assert.equal(waitResult,true,'Playwright wait actually observed two native hymns');
  const other=imported.find(item=>item.id!==hymn.id);
  assert.ok(other,'Native snapshot exposes a distinct ID for the replacement hymn');
  await invoke(page,{type:'play-hymn',id:hymn.id,track:1});
  await playing(output);
  await invoke(page,{type:'play-hymn',id:other.id,track:2});
  await playing(output);
  assert.equal((await snapshot(page)).output.slide.hymnId,other.id,'A replacement hymn becomes live');
  await interruptPreparation(page,{type:'stop-hymn',id:hymn.id});
  await output.locator('.stage-video').waitFor({state:'detached'});
  assert.equal((await snapshot(page)).output.slide.kind,'welcome','Stop cancels preparation without stale playback');
  await interruptPreparation(page,{type:'remove-hymn',id:hymn.id});
  const removed=await snapshot(page);
  assert.equal(removed.hymns.some(item=>item.id===hymn.id),false,'Native removal persists');
  assert.equal(removed.output.slide.kind,'welcome','Removing a preparing hymn does not resurrect playback');
  await invoke(page,{type:'play-hymn',id:other.id,track:1});
  await playing(output);
  await invoke(page,{type:'playback',position:17.8,playing:true,revision:(await snapshot(page)).output.revision});
  await output.locator('.stage-video').waitFor({state:'detached',timeout:30000});
  assert.equal((await snapshot(page)).output.slide.kind,'welcome','Media end restores the base screen');
  await invoke(page,{type:'play-hymn',id:other.id,track:1});
  await playing(output);
  await capture(output,'native-hymn-replay');
  await invoke(page,{type:'stop-hymn'});
  await page.locator('[data-action="view-biblia"]').click();
  const result={screenshots,firstStats,secondStats,persistedHymnId:other.id,fileBibleId};
  await writeFile(path.join(evidence,'media-result.json'),JSON.stringify(result,null,2));
  return result;
}
