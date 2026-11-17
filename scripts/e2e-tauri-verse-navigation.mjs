import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright';
import {invoke} from './e2e-tauri-native.mjs';

const root=process.cwd();
const data=await mkdtemp(path.join(tmpdir(),'lumen-verse-navigation-'));
const evidence=path.resolve(process.env.LUMEN_E2E_EVIDENCE??'test-results/verse-navigation');
await mkdir(evidence,{recursive:true});
const results=[];
let native,browser;

async function launch(){
  const server=createServer();server.listen(0,'127.0.0.1');await once(server,'listening');
  const address=server.address();assert.ok(address&&typeof address==='object');
  await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  native=spawn(process.env.LUMEN_E2E_EXECUTABLE??path.join(root,'src-tauri/target/debug/lumen.exe'),[],{cwd:root,windowsHide:true,env:{...process.env,LUMEN_DATA_DIR:data,LUMEN_HEADLESS:'1',WEBVIEW2_USER_DATA_FOLDER:path.join(data,'webview2'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${address.port}`}});
  let log='';native.stderr.on('data',chunk=>{log=(log+chunk).slice(-8000);});
  for(let attempt=0;attempt<160;attempt++){
    if(native.exitCode!==null)throw new Error(`Native launch failed: ${log}`);
    try{browser=await chromium.connectOverCDP(`http://127.0.0.1:${address.port}`,{timeout:1000});break;}
    catch(error){if(!(error instanceof Error))throw error;await delay(200);}
  }
  assert.ok(browser,'WebView2 starts');
  let page;
  for(let attempt=0;attempt<120;attempt++){
    page=browser.contexts().flatMap(context=>context.pages()).find(page=>page.url()!=='about:blank'&&!new URL(page.url()).searchParams.has('output'));
    if(page)break;
    await delay(100);
  }
  assert.ok(page);await page.locator('.brand-name').waitFor({timeout:30000});
  return page;
}

async function assertRevealed(page,verse,label){
  if(label.startsWith('automatic projection')||label.startsWith('project another')||label.startsWith('selection remains')){
    await page.waitForFunction(verse=>new RegExp(`6:${verse}(?:\\D|$)`).test(document.querySelector('.live-identity strong')?.textContent??''),verse,{timeout:10000});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  }
  const geometry=await page.locator('.verses').evaluate((viewport,verse)=>{
    const row=viewport.querySelector(`.verse.selected[data-id="${verse}"]`);
    return {scrollTop:viewport.scrollTop,height:viewport.clientHeight,area:viewport.getBoundingClientRect().toJSON(),row:row?.getBoundingClientRect().toJSON()};
  },verse);
  await writeFile(path.join(evidence,'last-geometry.json'),JSON.stringify({label,verse,geometry},null,2));
  await page.waitForFunction(verse=>{
    const viewport=document.querySelector('.verses');
    const selected=viewport?.querySelector(`.verse.selected[data-id="${verse}"]`);
    if(!viewport||!selected)return false;
    const row=selected.getBoundingClientRect(),area=viewport.getBoundingClientRect();
    return viewport.clientHeight>0&&row.height>0&&row.width>0&&row.top>=area.top-1&&Math.min(row.bottom,row.top+viewport.clientHeight)<=area.bottom+1;
  },verse,{timeout:3000});
  results.push({scenario:label,verse,result:'PASS'});
}

try{
  const page=await launch();
  await page.setViewportSize({width:1500,height:1000});
  await page.selectOption('#translation','rv1909');
  await page.locator('[data-action="book"][data-id="14"]').click();
  await page.locator('[data-action="chapter-pick"][data-id="6"]').click();
  await page.locator('.verse-grid [data-action="verse"][data-id="19"]').click();
  await page.screenshot({path:path.join(evidence,'selected-19.png')});
  await assertRevealed(page,19,'chapter 6 then quick verse 19');
  const selected=await page.locator('.verses .verse.selected').getAttribute('data-id');
  assert.equal(selected,'19');
  const outer=await page.locator('.reader').evaluate(element=>element.scrollTop);
  assert.equal(outer,0,'Quick selection keeps reader controls in place');

  await page.locator('.verse-grid [data-id="2"]').click();
  await assertRevealed(page,2,'select an earlier verse');
  await page.locator('#range-options > summary').click();
  await page.locator('#verse-range').fill('30-32');
  await page.locator('[data-action="select-range"]').click();
  await assertRevealed(page,30,'typed range reveals its beginning');
  assert.equal(await page.locator('.reader').evaluate(element=>element.scrollTop),outer,'Range selection keeps outer reader in place');

  await page.locator('.verse-grid [data-id="19"]').click();
  await page.locator('.verses').evaluate(element=>element.scrollTo({top:0,behavior:'instant'}));
  await delay(550); // A deliberate re-selection, separate from the double-click projection gesture.
  await page.locator('.verse-grid [data-id="19"]').click();
  await assertRevealed(page,19,'reselect the same verse after manual scroll');

  await page.locator('.verses').evaluate(element=>element.scrollTo({top:0,behavior:'instant'}));
  await page.locator('[data-action="book-layout"]').click();
  assert.equal(await page.locator('.verses').evaluate(element=>element.scrollTop),0,'Unrelated full rerender preserves manual scroll');
  await invoke(page,{type:'blackout',value:true});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(await page.locator('.verses').evaluate(element=>element.scrollTop),0,'Live snapshot preserves manual scroll');
  results.push({scenario:'manual scroll preserved by unrelated render and snapshot',result:'PASS'});

  await page.locator('.verse-grid [data-id="19"]').click();
  await page.locator('.verse-grid [data-id="19"]').focus();
  await page.keyboard.press('ArrowRight');
  await assertRevealed(page,20,'keyboard next verse');
  await page.keyboard.press('ArrowLeft');
  await assertRevealed(page,19,'keyboard previous verse');

  for(const width of [1280,768,375]){
    await page.setViewportSize({width,height:1000});
    await page.locator('.verse-grid [data-id="2"]').click();
    await page.locator('.verse-grid [data-id="19"]').click();
    await assertRevealed(page,19,`quick selection at width ${width}`);
    await page.locator('.verses').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(evidence,`selected-19-${width}.png`)});
  }
  await page.setViewportSize({width:1500,height:1000});
  await page.selectOption('#chapter','7');
  await page.locator('.verse-grid [data-id="19"]').click();
  await assertRevealed(page,19,'dropdown chapter change then quick verse');
  await page.selectOption('#translation','spa_bll');
  await assertRevealed(page,19,'translation change retains visible selected verse');
  await page.locator('#global-search').fill('2 Crónicas 6:39');
  await page.locator('#global-search').press('Enter');
  await assertRevealed(page,39,'direct reference search selects and reveals verse');
  await page.locator('[data-action="clear-search"]').click();
  await page.locator('.verse-grid [data-id="19"]').click();
  await page.locator('.inspector [data-action="project"]').click();
  await assertRevealed(page,19,'selection remains visible after projecting');
  await page.screenshot({path:path.join(evidence,'after-projection.png')});
  await page.locator('.verse-grid [data-id="2"]').click();
  await assertRevealed(page,2,'select earlier verse while projection is open');
  await page.locator('.verse-grid [data-id="19"]').click();
  await page.locator('.inspector [data-action="project"]').click();
  await assertRevealed(page,19,'project another verse with output already open');
  const settings=await page.evaluate(async()=>{const response=await window.lumen.invoke({type:'snapshot'});return response.data.settings;});
  await invoke(page,{type:'settings',settings:{...settings,autoProject:true}});
  await page.locator('.verse-grid [data-id="2"]').click();
  await assertRevealed(page,2,'automatic projection reveals earlier verse');
  await page.locator('.verse-grid [data-id="19"]').click();
  await assertRevealed(page,19,'automatic projection reveals later verse');
  await page.screenshot({path:path.join(evidence,'automatic-projection.png')});
  await writeFile(path.join(evidence,'result.json'),JSON.stringify({result:'PASS',isolatedProfile:true,results},null,2));
  console.log(`PASS: ${results.length} native verse navigation scenarios.`);
}catch(error){
  await writeFile(path.join(evidence,'result.json'),JSON.stringify({result:'FAIL',error:error instanceof Error?error.message:String(error),results},null,2));throw error;
}finally{if(native&&native.exitCode===null)native.kill();await browser?.close();}
