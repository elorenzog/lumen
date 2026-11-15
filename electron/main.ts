import { app, BrowserWindow, ipcMain, screen, dialog, session } from 'electron';
import path from 'node:path';
import { Controller } from './controller';
import { Store } from './store';
import { MediaServer } from './media-server';
import { stopMedia } from './media';
import { actionSchema, LumenError } from '../src/shared/contracts';
import { z } from 'zod';
import { RemoteServer } from './remote-server';
import { remoteAdapter } from './remote-adapter';
import { Updates } from './updates';
import { githubUpdateEngine } from './updater-engine';

app.setName('LUMEN');
app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');
const dataDirectory=process.env['LUMEN_DATA_DIR'];
if(dataDirectory)app.setPath('userData',dataDirectory);
let controller:Controller|undefined;
const server=new MediaServer();
const development=process.env['LUMEN_DEV_URL'];
const preload=path.join(__dirname,'preload.cjs');
async function load(window:BrowserWindow,projection:boolean):Promise<void>{
  if(development){const url=new URL(development);if(projection)url.searchParams.set('output','1');await window.loadURL(url.toString());}
  else await window.loadFile(path.join(__dirname,'../dist/index.html'),{query:projection?{output:'1'}:{}});
}
async function start():Promise<void>{
  await app.whenReady();
  session.defaultSession.setPermissionRequestHandler((_webContents,_permission,callback)=>callback(false));
  const store=new Store(app.getPath('userData'));
  const bundled=path.join(app.getAppPath(),development?'resources/rv1909.json':'dist/rv1909.json');
  await store.initialize(bundled);await server.start();
  const main=new BrowserWindow({width:1500,height:960,minWidth:960,minHeight:680,title:'LUMEN · Biblia e Himnario Adventista',autoHideMenuBar:true,backgroundColor:'#f6f5f1',show:false,webPreferences:{preload,sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  controller=new Controller(store,server,main,load,preload);
  controller.remote=new RemoteServer(path.join(app.getAppPath(),'dist/remote'),remoteAdapter(controller),()=>controller?.broadcast());
  controller.updates=new Updates(githubUpdateEngine(),{directory:store.directory,installable:app.isPackaged&&process.platform==='win32'&&!process.env['PORTABLE_EXECUTABLE_FILE'],blocked:()=>Boolean(controller?.output.connected||controller?.output.preparing),changed:()=>controller?.broadcast()});
  await controller.updates.initialize();
  main.webContents.setWindowOpenHandler(()=>({action:'deny'}));main.webContents.on('will-navigate',event=>event.preventDefault());
  ipcMain.handle('lumen:action',async(event,raw:unknown)=>{
    try{
      const current=controller;
      if(!current || (event.sender!==main.webContents&&event.sender!==current.projection?.webContents))throw new LumenError('sender','Origen no permitido.');
      const action=actionSchema.parse(raw);
      return {ok:true,data:await current.action(action,event.sender!==main.webContents)};
    }catch(error){
      if(error instanceof z.ZodError)return {ok:false,error:'Los datos no tienen un formato válido.'};
      if(error instanceof Error)return {ok:false,error:error.message};
      throw error;
    }
  });
  screen.on('display-added',()=>controller?.broadcast());
  screen.on('display-removed',()=>{if(controller?.output.displayId!==null&&!screen.getAllDisplays().some(d=>d.id===controller?.output.displayId))controller?.projection?.close();controller?.broadcast();});
  screen.on('display-metrics-changed',()=>controller?.broadcast());
  main.on('closed',()=>{controller?.projection?.close();app.quit();});
  await load(main,false);if(process.env['LUMEN_HEADLESS']!=='1')main.show();
  if(process.env['LUMEN_HEADLESS']!=='1'&&app.isPackaged&&controller.updates.snapshot().checkAtStartup)setTimeout(()=>{void controller?.updates?.check();},5000).unref();
}
app.on('before-quit',()=>{controller?.remote?.close();stopMedia();server.close();controller?.store.close();});
app.on('window-all-closed',()=>app.quit());
void start().catch((error:unknown)=>{const message=error instanceof Error?error.stack??error.message:String(error);console.error(message);if(process.env['LUMEN_HEADLESS']!=='1')dialog.showErrorBox('LUMEN no pudo iniciar',message);app.exit(1);});
