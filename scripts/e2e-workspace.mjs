import { _electron as electron } from 'playwright';
import electronPath from 'electron';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const baseline=process.env.LUMEN_LAYOUT_BASELINE==='1';
const profile=await mkdtemp(path.join(tmpdir(),'lumen-workspace-'));
const evidence=path.resolve('test-results/workspace-layout-fix',baseline?'baseline':'current');
await mkdir(evidence,{recursive:true});
const executable=process.env.LUMEN_E2E_EXECUTABLE??electronPath;
const hymn=(number,title)=>({id:`hymn-${number}`,number,title,path:path.join(profile,`${number} ${title}.mkv`),duration:120,tracks:[{index:1,label:'Cantado',language:'spa'}],size:1,modified:0});
const hymns=[hymn(34,'En momentos así'),hymn(36,'Oh Dios que oyes cada oración'),hymn(39,'Despide hoy tu grey')];
const program=[...hymns.map((h,index)=>({id:`p${index+1}`,title:`${h.number} · ${h.title}`,slide:{kind:'hymn',hymnId:h.id,title:`${h.number} · ${h.title}`,track:1,mediaUrl:''}})),...['Génesis 1:1','Juan 3:16'].map((reference,index)=>({id:`p${index+4}`,title:reference,slide:{kind:'verse',text:'Texto bíblico de prueba para proyección.',reference,translation:'RV1909'}}))];
await writeFile(path.join(profile,'library.json'),JSON.stringify({hymns,program,settings:{theme:'noche',fontSize:52,autoProject:false,volume:.7}}));
const errors=[];let app;
const invoke=(page,action)=>page.evaluate(async action=>{const r=await window.lumen.invoke(action);if(!r.ok)throw new Error(r.error);return r.data;},action);
const geometry=page=>page.evaluate(()=>{
  const workspace=document.querySelector('.workspace');const reader=workspace.querySelector('.reader');
  const box=element=>{const r=element.getBoundingClientRect();return {x:r.x,width:r.width,client:element.clientWidth,scroll:element.scrollWidth};};
  return {viewport:innerWidth,workspaceClass:workspace.className,columns:getComputedStyle(workspace).gridTemplateColumns,workspace:box(workspace),reader:box(reader),pageOverflow:document.documentElement.scrollWidth>innerWidth};
});
try{
  const env={...process.env,LUMEN_DATA_DIR:profile,LUMEN_HEADLESS:'1'};delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({executablePath:executable,args:executable===electronPath?['.']:[],cwd:process.cwd(),env,timeout:60000});
  const page=await app.firstWindow();await page.locator('.brand-name').waitFor();
  await app.evaluate(({BrowserWindow})=>{for(const window of BrowserWindow.getAllWindows())window.showInactive();});
  page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1920,height:1000});
  await page.locator('[data-action="view-programa"]').click();
  if(baseline){
    const before=await geometry(page);
    await page.screenshot({path:path.join(evidence,'programa-1920.png'),fullPage:true});
    const override=await page.addStyleTag({content:'.workspace.wide-workspace{grid-template-columns:minmax(0,1fr)}'});
    const withSpecificRule=await geometry(page);await override.evaluate(element=>element.remove());
    const afterRemoval=await geometry(page);
    await page.locator('[data-action="view-ajustes"]').click();const settings=await geometry(page);
    await writeFile(path.join(evidence,'geometry.json'),JSON.stringify({before,withSpecificRule,afterRemoval,settings},null,2));
    assert.ok(Math.abs(before.reader.width-before.workspace.width)<1,`Program reader must fill workspace; reader=${before.reader.width}, workspace=${before.workspace.width}, columns=${before.columns}`);
  }
  const measurements=[];
  for(const width of [1920,1650,1649,1500,1281,1280,1100,961,960,768,640,375]){
    await page.setViewportSize({width,height:width<960?1024:1000});
    for(const view of ['programa','ajustes']){
      await page.locator(`[data-action="view-${view}"]`).click();const metric=await geometry(page);
      assert.ok(Math.abs(metric.reader.width-metric.workspace.width)<1,`${view} fills ${width}px workspace: ${JSON.stringify(metric)}`);
      assert.ok(metric.reader.scroll<=metric.reader.client+1,`${view} has no inner horizontal overflow at ${width}px`);
      assert.equal(metric.pageOverflow,false,`${view} page fits ${width}px`);measurements.push({view,...metric});
    }
    if(width>960){
      for(const view of ['biblia','himnario']){
        await page.locator(`[data-action="view-${view}"]`).click();
        assert.equal(await page.locator('.workspace .library').count(),1);
        assert.ok(await page.evaluate(()=>document.querySelector('.workspace .library').getBoundingClientRect().right<=document.querySelector('.workspace .reader').getBoundingClientRect().left+1),`${view} retains library/reader columns at ${width}px`);
      }
    }
  }
  const captures=[];
  for(const [width,height]of [[1920,1000],[1100,900],[375,900]]){
    await page.setViewportSize({width,height});
    for(const view of ['biblia','himnario','programa','ajustes']){
      await page.locator(`[data-action="view-${view}"]`).click();
      if(view==='himnario')await page.locator('.hymn-row').first().click();
      const file=`${view}-${width}.png`;await page.screenshot({path:path.join(evidence,file),fullPage:true});captures.push({view,width,height,file});
    }
  }
  await page.setViewportSize({width:1920,height:1000});await page.locator('[data-action="view-programa"]').click();
  await page.locator('[data-action="program-up"][data-id="p2"]').click();
  assert.equal((await invoke(page,{type:'snapshot'})).program[0].id,'p2');
  await page.locator('[data-action="program-down"][data-id="p2"]').click();
  assert.equal((await invoke(page,{type:'snapshot'})).program[0].id,'p1');
  await page.locator('[data-action="program-remove"][data-id="p5"]').click();
  assert.equal((await invoke(page,{type:'snapshot'})).program.length,4);
  const outputPromise=app.waitForEvent('window');await page.locator('[data-action="program-play"][data-id="p4"]').click();const output=await outputPromise;
  await output.locator('.stage-reference').waitFor();assert.match(await output.locator('.stage-reference').innerText(),/Génesis 1:1/);
  assert.deepEqual(errors,[]);
  await writeFile(path.join(evidence,'captures.json'),JSON.stringify(captures,null,2));
  await writeFile(path.join(evidence,'result.json'),JSON.stringify({result:'PASS',widths:[1920,1650,1649,1500,1281,1280,1100,961,960,768,640,375],measurements,scenarios:['populated program fills workspace','settings fills workspace','Bible and hymnal keep two columns','no horizontal overflow','program reorder','program removal','program verse projection'],rendererErrors:errors},null,2));
  console.log('PASS: Programa y Ajustes ocupan todo el ancho en12tamaños; ordenar, quitar y proyectar funcionan.');
}finally{await app?.close();await rm(profile,{recursive:true,force:true});}
