import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright';
import jsQR from 'jsqr';
import {invoke} from './e2e-tauri-native.mjs';

const root=process.cwd();
const data=await mkdtemp(path.join(tmpdir(),'lumen-verse-navigation-'));
const evidence=path.resolve(process.env.LUMEN_E2E_EVIDENCE??'test-results/usability');
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

async function decode(page){
  const image=await page.locator('.remote-qr svg').evaluate(async svg=>{
    const img=new Image();img.src=`data:image/svg+xml;base64,${btoa(new XMLSerializer().serializeToString(svg))}`;
    await img.decode();const canvas=document.createElement('canvas');canvas.width=400;canvas.height=400;
    const context=canvas.getContext('2d');if(!context)throw new Error('Canvas unavailable');
    context.drawImage(img,0,0,400,400);return Array.from(context.getImageData(0,0,400,400).data);
  });
  const decoded=jsQR(Uint8ClampedArray.from(image),400,400);assert.ok(decoded,'Rendered QR can be decoded independently');
  return decoded.data;
}

try{
  const page=await launch();await page.setViewportSize({width:1500,height:1000});
  assert.equal(await page.locator('.navigation [data-action="remote-settings"]').count(),0,'Remote control stays in Settings, without a sidebar shortcut');
  assert.equal(await page.locator('[data-action="book"][data-id="5"] span').textContent(),'Deuteronomio');
  await page.screenshot({path:path.join(evidence,'bible-1500.png')});
  for(const width of [1280,960,768,375]){
    await page.setViewportSize({width,height:1000});
    const overlap=await page.locator('.book-grid .book-row span').evaluateAll(labels=>labels.filter(label=>label.getBoundingClientRect().width>(label.parentElement?.getBoundingClientRect().width??0)-7).map(label=>label.textContent));
    assert.deepEqual(overlap,[],`Full book names fit their cells at ${width}px`);
    await page.screenshot({path:path.join(evidence,`bible-${width}.png`)});
  }
  results.push({scenario:'full book names fit at desktop, tablet and phone widths',result:'PASS'});
  await page.setViewportSize({width:1500,height:1000});
  await page.locator('[data-action="view-ajustes"]').click();
  await page.locator('[data-action="remote-enable"]').click();
  await page.locator('.remote-qr svg').waitFor();
  const snapshot=await invoke(page,{type:'snapshot'});
  const url=await decode(page);assert.ok(snapshot.remote.urls.includes(url));
  if(snapshot.remote.urls.length>1){
    await page.selectOption('#remote-address',snapshot.remote.urls[1]);
    assert.equal(await decode(page),snapshot.remote.urls[1],'Network selection changes the encoded destination');
    await page.selectOption('#remote-address',url);
    results.push({scenario:'network selector updates QR destination',result:'PASS'});
  }
  assert.equal(new URL(url).search,'','QR contains no PIN or session token');
  assert.equal(url,await page.locator('#remote-url').inputValue());
  const origin=new URL(url).origin;
  const paired=await fetch(new URL('/api/pair',origin),{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({pin:snapshot.remote.pin})});
  assert.equal(paired.status,200,'Decoded QR destination accepts real phone pairing');
  const remoteClient=await fetch(new URL('/remote.js',origin));
  assert.equal(remoteClient.status,200);assert.ok((await remoteClient.text()).includes('seek-apply'),'Native server serves the scroll-safe phone controls');
  const cookie=paired.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie);
  await page.waitForFunction(()=>document.querySelector('.remote-enabled')?.textContent?.includes('1 teléfono conectado'));
  results.push({scenario:'scan rendered QR and pair with PIN over actual HTTP',result:'PASS'});
  for(const width of [1500,1280,768,375]){
    await page.setViewportSize({width,height:1000});
    await page.locator('.remote-qr').scrollIntoViewIfNeeded();
    assert.equal(await decode(page),url,`QR readable at ${width}px`);
    const bounds=await page.locator('.remote-pairing').boundingBox();assert.ok(bounds&&bounds.x>=0&&bounds.x+bounds.width<=width);
    await page.screenshot({path:path.join(evidence,`remote-${width}.png`)});
    results.push({scenario:`responsive QR at ${width}px`,result:'PASS'});
  }
  await page.locator('[data-action="remote-rotate"]').click();
  await page.waitForFunction(pin=>document.querySelector('.remote-pin')?.textContent!==pin,snapshot.remote.pin);
  assert.equal(await decode(page),url,'QR remains valid when PIN changes');
  const denied=await fetch(new URL('/api/state',origin),{headers:{Origin:origin,Cookie:cookie}});
  assert.equal(denied.status,401,'Rotating PIN revokes previous phone access');
  await page.locator('[data-action="remote-disable"]').click();
  await page.locator('[data-action="remote-enable"]').waitFor();
  assert.equal(await page.locator('.remote-qr').count(),0,'Disabled control has no stale QR');
  results.push({scenario:'PIN rotation revokes old phone and disabling removes QR',result:'PASS'});
  await writeFile(path.join(evidence,'result.json'),JSON.stringify({result:'PASS',isolatedProfile:true,results},null,2));
  console.log(`PASS: ${results.length} native usability/QR scenarios.`);
}catch(error){
  await writeFile(path.join(evidence,'result.json'),JSON.stringify({result:'FAIL',error:error instanceof Error?error.message:String(error),results},null,2));throw error;
}finally{if(native&&native.exitCode===null)native.kill();await browser?.close();}
