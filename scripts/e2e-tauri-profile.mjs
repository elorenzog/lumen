import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {once} from 'node:events';
import {mkdtemp,readFile,writeFile,cp} from 'node:fs/promises';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {DatabaseSync,backup} from 'node:sqlite';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright';

const source=path.resolve(process.env.LUMEN_TEST_PROFILE??'recovery-profile');
const data=await mkdtemp(path.join(tmpdir(),'lumen-tauri-profile-'));
const evidence=path.resolve('test-results/tauri');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const original=await readFile(path.join(source,'library.json'));
const saved=JSON.parse(original);
await writeFile(path.join(data,'library.json'),original);
await cp(path.join(source,'backgrounds'),path.join(data,'backgrounds'),{recursive:true});
const database=new DatabaseSync(path.join(source,'translations.sqlite'),{readOnly:true});
let expected;
try{
  expected=database.prepare('SELECT id,metadata,(SELECT COUNT(*) FROM verses WHERE translation_id=translations.id) count FROM translations ORDER BY id').all().map(row=>({...row,metadata:JSON.parse(row.metadata)}));
  await backup(database,path.join(data,'translations.sqlite'));
}finally{database.close();}
const listener=createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const address=listener.address();assert.ok(address&&typeof address==='object');await new Promise(resolve=>listener.close(resolve));
const endpoint=`http://127.0.0.1:${address.port}`;
const executable=path.resolve(process.env.LUMEN_E2E_EXECUTABLE??'src-tauri/target/debug/lumen.exe');
const child=spawn(executable,[],{windowsHide:true,env:{...process.env,LUMEN_DATA_DIR:data,LUMEN_HEADLESS:'1',WEBVIEW2_USER_DATA_FOLDER:path.join(data,'webview2'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${address.port} --autoplay-policy=no-user-gesture-required`}});
let log='';child.stdout.on('data',chunk=>{log=(log+chunk).slice(-8000);});child.stderr.on('data',chunk=>{log=(log+chunk).slice(-8000);});
let browser;
try{
  for(let attempt=0;attempt<120;attempt++){
    if(child.exitCode!==null)throw new Error(`Native profile startup failed: ${log}`);
    try{browser=await chromium.connectOverCDP(endpoint,{timeout:1000});break;}catch(error){if(!(error instanceof Error))throw error;await delay(250);}
  }
  assert.ok(browser,'WebView2 CDP became available');
  const context=browser.contexts()[0];assert.ok(context);
  let page;
  for(let attempt=0;attempt<80;attempt++){page=context.pages().find(p=>!p.url().includes('output=1'));if(page&&await page.locator('.brand-name').count())break;await delay(250);}
  assert.ok(page);await page.locator('.brand-name').waitFor({timeout:30000});
  const invoke=(action)=>page.evaluate(async action=>{const response=await window.lumen.invoke(action);if(!response.ok)throw new Error(response.error);return response.data;},action);
  const snapshot=await invoke({type:'snapshot'});
  assert.equal(snapshot.bibles.length,expected.length);
  assert.deepEqual(snapshot.hymns,saved.hymns);
  assert.deepEqual(snapshot.program,saved.program);
  assert.deepEqual(snapshot.history,saved.history);
  assert.deepEqual(snapshot.settings,saved.settings);
  assert.deepEqual(snapshot.backgrounds,saved.backgrounds);
  for(const entry of expected){
    const info=snapshot.bibles.find(bible=>bible.id===entry.id);assert.ok(info);assert.equal(info.count,entry.count);
    for(const key of ['name','abbreviation','source','license','provenance'])assert.deepEqual(info[key],entry.metadata[key],`${entry.id} ${key} preserved`);
    const bible=await invoke({type:'bible',id:entry.id});assert.equal(bible.verses.length,entry.count);assert.equal(bible.id,entry.id);
    const passage=await invoke({type:'bible-search',id:entry.id,query:'Juan 3:16'});assert.ok(passage.some(verse=>verse.book===43&&verse.chapter===3&&verse.verse===16),`${info.abbreviation} reference search`);
  }
  assert.equal(hash(await readFile(path.join(data,'library.json'))),hash(original),'Startup leaves existing library bytes unchanged');
  assert.equal(hash(await readFile(path.join(source,'library.json'))),hash(original),'Original profile unchanged');
  await page.setViewportSize({width:1500,height:960});await page.locator('[data-action="view-ajustes"]').click();await page.locator('.bible-info').first().scrollIntoViewIfNeeded();await page.screenshot({path:path.join(evidence,'real-profile-translations.png')});
  const result={result:'PASS',runtime:'Tauri/WebView2',sourceUnchanged:true,libraryBytePreserved:true,profileCopy:data,translations:expected.map(entry=>({id:entry.id,count:entry.count})),hymns:snapshot.hymns.length,program:snapshot.program.length,history:snapshot.history.length,backgrounds:snapshot.backgrounds.length};
  await writeFile(path.join(evidence,'real-profile-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({result:'PASS',translations:expected.length,hymns:snapshot.hymns.length,program:snapshot.program.length,libraryBytePreserved:true}));
}catch(error){await writeFile(path.join(evidence,'real-profile-result.json'),JSON.stringify({result:'FAIL',error:error instanceof Error?error.message:String(error),log,data},null,2));throw error;}
finally{await browser?.close();if(child.exitCode===null){child.kill();await Promise.race([once(child,'exit'),delay(10000)]);}}
