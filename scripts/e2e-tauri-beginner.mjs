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
const evidence=path.resolve(process.env.LUMEN_E2E_EVIDENCE??'test-results/beginner');
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

try{
  const page=await launch();await page.setViewportSize({width:1500,height:1000});
  for(const id of ['range-options','comparison-options','appearance-options','keyboard-options'])assert.equal(await page.locator(`#${id}`).evaluate(element=>element.open),false,`${id} starts collapsed`);
  await page.locator('[data-action="book"][data-id="14"]').click();
  await page.locator('[data-action="chapter-pick"][data-id="6"]').click();
  await page.locator('.verse-grid [data-id="19"]').click();
  assert.equal(await page.locator('.inspector .project-button').textContent(),'Mostrar en pantalla');
  await page.locator('.inspector .project-button').click();
  await page.locator('.live-identity strong').filter({hasText:'6:19'}).waitFor();
  results.push('choose book, chapter, verse and show the selected passage');
  await page.locator('[data-action="close-output"]').click();
  await page.locator('#range-options > summary').click();
  await page.locator('#verse-range').fill('30-32');await page.locator('[data-action="select-range"]').click();
  assert.equal(await page.locator('#range-options').evaluate(element=>element.open),true,'Range options stay open through selection rerender');
  assert.equal(await page.locator('.verses .verse.selected').count(),3);
  await page.locator('#range-options > summary').click();
  await page.locator('#comparison-options > summary').click();await page.selectOption('#comparison-translation','spa_bll');
  await page.locator('.comparison-grid').waitFor();
  assert.equal(await page.locator('#comparison-options').evaluate(element=>element.open),true,'Comparison remains open after loading');
  await page.locator('#comparison-options > summary').click();
  await page.locator('#appearance-options > summary').click();await page.selectOption('#theme','amanecer');
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(await page.locator('#appearance-options').evaluate(element=>element.open),true,'Appearance remains open across settings snapshots');
  await page.locator('#appearance-options > summary').click();
  results.push('ranges, comparison and appearance remain accessible and open during edits');
  await page.locator('.verse-grid [data-id="19"]').click();
  for(const width of [1500,1280,768,375]){
    await page.setViewportSize({width,height:1000});await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
    await page.locator('.inspector').evaluate(element=>element.scrollTo({top:0,behavior:'instant'}));
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    assert.equal(await page.locator('[data-action="view-biblia"] > span').isVisible(),true,'Navigation keeps its name');
    await page.screenshot({path:path.join(evidence,`bible-${width}.png`),fullPage:width<1000});
  }
  await page.setViewportSize({width:1500,height:1000});await page.locator('[data-action="view-himnario"]').click();
  await page.screenshot({path:path.join(evidence,'hymnal-empty.png')});
  await writeFile(path.join(evidence,'result.json'),JSON.stringify({result:'PASS',runtime:'Native Tauri/WebView2',isolatedProfile:true,results,widths:[1500,1280,768,375]},null,2));
  console.log('PASS: guided show flow, accessible additional features, disclosure persistence and labelled navigation.');
}catch(error){await writeFile(path.join(evidence,'result.json'),JSON.stringify({result:'FAIL',error:String(error),results},null,2));throw error;}
finally{if(native&&native.exitCode===null)native.kill();await browser?.close();}
