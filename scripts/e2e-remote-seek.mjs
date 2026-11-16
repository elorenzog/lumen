import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

const evidence=path.resolve('test-results/remote-seek');await mkdir(evidence,{recursive:true});
const commands=[];
const hymn={id:'song',number:1,title:'Himno de prueba',number1962:1,number2009:1,tracks:[{index:1,label:'Cantado'}],duration:120};
const state={output:{slide:{kind:'hymn',hymnId:'song',title:hymn.title,track:1,mediaUrl:'http://127.0.0.1/fixture.mp4'},playing:true,blackout:false,connected:true,displayId:1,position:10,updatedAt:Date.now(),revision:1,preparing:null},volume:0.8,bibles:[],displays:[],program:[]};
const server=createServer(async(request,response)=>{
  try{
    response.setHeader('Content-Type','application/json');
    if(request.url==='/api/state'){response.end(JSON.stringify(state));return;}
    if(request.url==='/api/library'){response.end(JSON.stringify({hymns:[hymn],old:[]}));return;}
    if(request.url==='/api/command'){
      const chunks=[];for await(const chunk of request)chunks.push(chunk);
      const command=JSON.parse(Buffer.concat(chunks).toString());commands.push(command);
      if(command.position!==undefined){state.output.position=command.position;state.output.updatedAt=Date.now();state.output.revision++;}
      response.end(JSON.stringify(state));return;
    }
    const file=request.url==='/remote.js'?'remote.js':request.url==='/remote.css'?'remote.css':'index.html';
    response.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');
    response.end(await readFile(path.join('dist/remote',file)));
  }catch(error){response.statusCode=500;response.end(String(error));}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const address=server.address();assert.ok(address&&typeof address==='object');
let browser;
try{
  browser=await chromium.launch({channel:'msedge',headless:true});
  const context=await browser.newContext({viewport:{width:375,height:812},isMobile:true,hasTouch:true});
  const page=await context.newPage();await page.goto(`http://127.0.0.1:${address.port}`);
  await page.locator('.remote-live h2').waitFor();
  assert.equal(await page.locator('#remote-seek').count(),0,'Scrolling must not expose an active seek slider by default');
  const cdp=await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:180,y:450}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:180,y:200}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.equal(commands.length,0,'A vertical swipe sends no playback command');
  await page.waitForTimeout(700); // Let the browser finish kinetic touch scrolling before visual captures.
  for(const width of [375,768,1280]){await page.setViewportSize({width,height:900});await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await page.locator('[data-action="seek-open"]').scrollIntoViewIfNeeded();await page.waitForTimeout(150);await page.screenshot({path:path.join(evidence,`locked-${width}.png`)});}
  await page.setViewportSize({width:375,height:900});
  await page.locator('[data-action="seek-open"]').click();
  await page.locator('#remote-seek').evaluate(input=>{input.value='70';input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));});
  assert.equal(commands.length,0,'Even editing the slider sends no immediate seek');
  assert.equal(await page.locator('#remote-seek-value').textContent(),'1:10');
  await page.screenshot({path:path.join(evidence,'edit-375.png')});
  await page.locator('[data-action="seek-cancel"]').click();assert.equal(commands.length,0,'Cancel does not seek');
  await page.locator('[data-action="seek-open"]').click();
  await page.locator('#remote-seek').evaluate(input=>{input.value='65';input.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.locator('[data-action="seek-apply"]').click();
  await page.waitForFunction(()=>!document.querySelector('[data-action="seek-apply"]'));
  assert.deepEqual(commands,[{type:'playback',position:65}],'Only explicit confirmation changes position, once');
  await page.locator('[data-action="seek-open"]').click();
  await page.locator('#remote-seek').focus();
  const polled=page.waitForResponse(response=>response.url().endsWith('/api/state'));
  state.output.revision++;state.output.slide.track=2;
  await polled;await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.locator('[data-action="seek-apply"]').click();
  assert.equal(commands.length,1,'An edit from an earlier playback revision cannot seek the new track');
  await page.locator('#remote-message').filter({hasText:'La reproducción cambió'}).waitFor();
  await writeFile(path.join(evidence,'result.json'),JSON.stringify({result:'PASS',runtime:'Real Edge touch browser, production remote client, isolated HTTP fixture',scenarios:['read-only position by default','vertical touch swipe sends no command','draft edits send no command','cancel sends no command','explicit confirm sends exactly one seek','stale edit rejected after output changes'],widths:[375,768,1280]},null,2));
  console.log('PASS: scroll-safe remote seek, draft, cancel, explicit confirmation and stale edit rejection.');
}catch(error){await writeFile(path.join(evidence,'result.json'),JSON.stringify({result:'FAIL',error:String(error)},null,2));throw error;}
finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
