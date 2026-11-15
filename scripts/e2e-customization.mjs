import assert from 'node:assert/strict';
import { writeFile,unlink } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';

async function snapshot(page){return page.evaluate(async()=>{const r=await window.lumen.invoke({type:'snapshot'});if(!r.ok)throw new Error(r.error);return r.data;});}
async function setControl(page,id,value){await page.locator(id).evaluate((el,value)=>{el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));},value);}
async function background(page,app,file,kind){
  await page.locator('#ap-mode').selectOption(kind);
  await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);
  await page.locator('[data-action="appearance-import"]').click();
  await page.waitForFunction(()=>document.querySelector('.editor-notice')?.textContent?.includes('Archivo guardado'));
  return (await snapshot(page)).backgrounds.at(-1);
}
export async function exerciseCustomization({app,page,output,data,evidence}){
  await page.locator('#auto-project').uncheck();
  const before=(await snapshot(page)).output.slide;
  await page.getByRole('button',{name:'Salmos',exact:true}).click();
  await page.getByRole('button',{name:'Capítulo 119',exact:true}).click();
  assert.equal(await page.locator('.verse-grid .number-button').count(),176);
  await page.getByRole('button',{name:'Versículo 176',exact:true}).click();
  assert.deepEqual((await snapshot(page)).output.slide,before,'Manual quick selection keeps live output');
  await page.getByRole('button',{name:'Juan',exact:true}).click();
  await page.getByRole('button',{name:'Capítulo 3',exact:true}).click();
  await page.getByRole('button',{name:'Versículo 17',exact:true}).dblclick();
  assert.match((await snapshot(page)).output.slide.reference,/3:17/,'Double click projects in manual mode across DOM rerenders');
  await page.getByRole('button',{name:'Versículo 16',exact:true}).click();
  await page.getByRole('button',{name:'Versículo 18',exact:true}).click({modifiers:['Shift']});
  assert.equal(await page.locator('.verse-grid [aria-pressed="true"]').count(),3);
  await page.locator('#verse-range').fill('17-18');await page.locator('#verse-range').press('Enter');
  assert.equal(await page.locator('.verse-grid [aria-pressed="true"]').count(),2);
  await page.locator('#verse-range').fill('16-18');await page.locator('[data-action="select-range"]').click();
  await page.locator('.project-button').click();
  assert.match((await snapshot(page)).output.slide.reference,/3:16[–-]18/);
  await output.waitForFunction(()=>/3:16[–-]18/.test(document.querySelector('.stage-reference')?.textContent??''));
  await page.screenshot({path:path.join(evidence,'v03-selector-desktop.png')});
  await page.keyboard.press('Control+l');assert.equal(await page.locator('#global-search').evaluate(el=>el===document.activeElement),true);
  await page.locator('[data-action="appearance-open"]').click();
  await page.locator('#ap-mode').selectOption('solid');await setControl(page,'#ap-color','#193c30');
  assert.equal((await snapshot(page)).settings.appearance.mode,'preset','Draft never applies live');
  await page.locator('[data-action="appearance-cancel"]').last().click();
  assert.equal((await snapshot(page)).settings.appearance.mode,'preset');
  await page.locator('[data-action="appearance-open"]').click();
  await page.locator('#ap-mode').selectOption('gradient');
  await setControl(page,'#ap-color','#162e3d');await setControl(page,'#ap-secondary','#596e51');
  await page.locator('#ap-align').selectOption('left');await page.locator('#ap-vertical').selectOption('bottom');
  await page.locator('#ap-fontFamily').selectOption('segoe');await page.locator('#ap-bold').check();
  await setControl(page,'#ap-shadow',4);await setControl(page,'#ap-outline',1);await setControl(page,'#ap-margin',12);
  await page.locator('#appearance-name').fill('Culto de sábado');await page.locator('[data-action="appearance-save-preset"]').click();
  await page.waitForFunction(()=>document.querySelector('.editor-notice')?.textContent==='Tema guardado.');
  assert.equal((await snapshot(page)).settings.appearance.mode,'preset','Saving a theme does not apply draft');
  await page.screenshot({path:path.join(evidence,'v03-editor-desktop.png')});
  await page.locator('[data-action="appearance-apply"]').click();
  await output.waitForFunction(()=>document.querySelector('.stage')?.style.getPropertyValue('--stage-align')==='left');
  assert.equal(await output.locator('.stage-text').evaluate(el=>getComputedStyle(el).fontWeight),'700');
  assert.equal(await output.locator('.stage-text').evaluate(el=>{const text=el.getBoundingClientRect();const stage=el.closest('.stage').getBoundingClientRect();return text.top>=stage.top&&text.bottom<=stage.bottom;}),true,'Long scripture remains inside the output with bottom alignment');
  await output.screenshot({path:path.join(evidence,'v03-proyeccion-degradado.png')});
  const image=path.join(data,'Fondo con espacios.png');
  await page.screenshot({path:image});
  await page.locator('[data-action="appearance-open"]').click();
  const imageAsset=await background(page,app,image,'image');assert.equal(imageAsset.kind,'image');
  await unlink(image);
  await page.waitForFunction(()=>{const img=document.querySelector('#appearance-preview img');return img?.complete&&img.naturalWidth>0;});
  await page.locator('[data-action="appearance-apply"]').click();
  await output.waitForFunction(()=>{const img=document.querySelector('.stage-background');return img instanceof HTMLImageElement&&img.complete&&img.naturalWidth>0;});
  const video=path.join(data,'Fondo de vídeo.mp4');
  await new Promise((resolve,reject)=>{const child=spawn(ffmpeg,['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=teal:s=640x360:d=2','-f','lavfi','-i','sine=frequency=440:duration=2','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',video],{windowsHide:true});let error='';child.stderr.on('data',chunk=>error+=chunk);child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(error)));});
  await page.locator('[data-action="appearance-open"]').click();await background(page,app,video,'video');await unlink(video);
  await page.locator('[data-action="appearance-apply"]').click();
  await output.waitForFunction(()=>{const v=document.querySelector('video.stage-background');return v&&v.muted&&v.loop&&!v.paused&&v.currentTime>0.2;});
  await page.locator('[data-action="blackout"]').click();await output.waitForFunction(()=>document.querySelector('video.stage-background')?.paused);
  await page.locator('[data-action="blackout"]').click();await output.waitForFunction(()=>!document.querySelector('video.stage-background')?.paused);
  await output.screenshot({path:path.join(evidence,'v03-proyeccion-video.png')});
  await page.locator('[data-action="appearance-open"]').click();
  for(const [width,height,label] of [[768,1024,'tablet'],[375,900,'mobile']]){
    await page.setViewportSize({width,height});
    assert.equal(await page.locator('#appearance-dialog').evaluate(el=>el.scrollWidth>el.clientWidth),false,'Dialog never overflows horizontally');
    await page.screenshot({path:path.join(evidence,`v03-editor-${label}.png`)});
  }
  await page.locator('#appearance-preset').selectOption({label:'Culto de sábado'});
  await page.locator('[data-action="appearance-apply"]').click();
  await page.setViewportSize({width:1280,height:900});await page.screenshot({path:path.join(evidence,'v03-selector-1280.png')});
  await page.setViewportSize({width:1500,height:960});
  await page.locator('#auto-project').check();await page.getByRole('button',{name:'Versículo 19',exact:true}).click();
  await output.waitForFunction(()=>document.querySelector('.stage-reference')?.textContent?.includes('3:19'));
  assert.equal((await snapshot(page)).settings.appearance.mode,'gradient');
  await writeFile(path.join(evidence,'customization-result.json'),JSON.stringify({result:'PASS',scenarios:['button book/chapter/verse navigation','Psalm 119:176','manual and automatic output','Shift range and typed range','Ctrl+L focus','draft cancel isolation','gradient/font/layout/shadow/outline','named theme save/load','offline image copy','silent loop video with audio source','background blackout pause/resume','responsive editor 375/768 and selector 1280']},null,2));
}
