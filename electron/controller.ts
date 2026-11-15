import { BrowserWindow, dialog, screen, shell } from 'electron';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { importBibleFiles } from './bible-files';
import { importBibleDirectory } from './bible-directory';
import { catalog,downloadBible } from './catalog';
import { mergeImportedHymns } from './hymn-import';
import { importBackground } from './backgrounds';
import type { Hymn } from '../src/shared/contracts';
import { inspectHymn, prepareHymn } from './media';
import { HymnPlayback } from './hymn-playback';
import { playbackPosition } from '../src/shared/domain';
import { LumenError, welcome,hymnMetadataSchema } from '../src/shared/contracts';
import type { Action, Output, Snapshot } from '../src/shared/contracts';
import type { Store } from './store';
import type { MediaServer } from './media-server';
import type { RemoteServer } from './remote-server';
import { disabledRemote } from '../src/shared/remote-info';
import type { Updates } from './updates';
import { initialUpdateInfo } from '../src/shared/update-info';
import { releaseRepository } from '../src/shared/app-info';

export class Controller {
  remote:RemoteServer|undefined;
  updates:Updates|undefined;
  output:Output={slide:welcome,preparing:null,blackout:false,playing:false,position:0,updatedAt:Date.now(),connected:false,displayId:null,revision:0};
  projection:BrowserWindow|undefined;
  private readonly hymns=new HymnPlayback({
    current:()=>this.output,update:value=>this.update(value),
    prepare:(hymn,track,signal)=>prepareHymn(hymn,track,{cache:path.join(this.store.directory,'media-cache'),status:message=>this.status(message),signal}),
    register:file=>this.media.register(file),revoke:url=>this.media.revoke(url),
    ready:slide=>this.recordHistory(slide),status:message=>this.status(message),
  });
  private downloading=false;
  private importing=false;
  private importingBibles=false;
  private readonly removedDuringImport=new Set<string>();
  constructor(readonly store:Store,readonly media:MediaServer,readonly main:BrowserWindow,readonly load:(window:BrowserWindow,projection:boolean)=>Promise<void>,readonly preload:string){}
  snapshot():Snapshot {
    return {...this.store.saved,updates:this.updates?.snapshot()??{...initialUpdateInfo},remote:this.remote?.info()??{...disabledRemote},oldHymnCatalog:[...this.store.oldHymnCatalog],backgroundMedia:this.store.saved.backgrounds.map(({file,...asset})=>({...asset,url:this.media.register(path.join(this.store.directory,'backgrounds',file))})),output:this.output,bibles:this.store.infos(),displays:screen.getAllDisplays().map((d,index)=>({id:d.id,label:d.label||`Pantalla ${index+1}`,width:d.size.width,height:d.size.height,primary:d.id===screen.getPrimaryDisplay().id}))};
  }
  broadcast():void{const value=this.snapshot();for(const win of [this.main,this.projection])if(win&&!win.isDestroyed())win.webContents.send('lumen:snapshot',value);}
  status(message:string):void{if(!this.main.isDestroyed())this.main.webContents.send('lumen:status',message);}
  update(value:Partial<Output>):void{this.output={...this.output,...value};this.broadcast();}
  async open(displayId:number):Promise<void>{
    const display=screen.getAllDisplays().find(d=>d.id===displayId);
    if(!display)throw new LumenError('display','La pantalla seleccionada ya no está conectada.');
    if(this.projection&&!this.projection.isDestroyed()){
      this.projection.setFullScreen(false);this.projection.setBounds(display.bounds);
      this.projection.setFullScreen(true);this.projection.showInactive();this.update({connected:true,displayId});return;
    }
    const win=new BrowserWindow({...display.bounds,frame:false,title:'LUMEN · Proyección',autoHideMenuBar:true,backgroundColor:'#000000',show:false,webPreferences:{preload:this.preload,sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
    this.projection=win;win.setMenu(null);
    win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',event=>event.preventDefault());
    win.on('closed',()=>{this.hymns.stop();this.projection=undefined;this.update({connected:false,displayId:null});});
    win.on('enter-full-screen',()=>this.broadcast());
    this.output={...this.output,connected:true,displayId};
    await this.load(win,true);
    if(win.isDestroyed()||this.projection!==win)return;
    win.setFullScreen(true);win.showInactive();this.broadcast();
  }
  async action(action:Action,fromOutput=false):Promise<unknown>{
    if(fromOutput&&!['snapshot','playback','media-error','background-error','close-output'].includes(action.type))throw new LumenError('permission','Acción no permitida desde la salida.');
    switch(action.type){
      case 'updates':{
        if(action.operation==='releases'){await shell.openExternal(releaseRepository.releases);return null;}
        if(!this.updates)throw new LumenError('updater','Actualizaciones no disponibles en esta sesión.');
        switch(action.operation){case 'check':await this.updates.check();break;case 'download':await this.updates.download();break;case 'install':this.updates.install();break;default:action.operation satisfies never;}return this.updates.snapshot();
      }
      case 'update-preference':if(!this.updates)throw new LumenError('updater','Actualizaciones no disponibles en esta sesión.');await this.updates.preference(action.checkAtStartup);return null;
      case 'remote-control':if(!this.remote)throw new LumenError('remote','Control remoto no disponible.');if(action.operation==='enable')return this.remote.start();if(action.operation==='rotate')return this.remote.rotate();this.remote.close();return this.remote.info();
      case 'snapshot':return this.snapshot();
      case 'bible':{const bible=this.store.bible(action.id);if(!bible)throw new LumenError('bible','Biblia no encontrada.');return bible;}
      case 'bible-search':return this.store.search(action.id,action.query);
      case 'bible-catalog':return catalog();
      case 'background-error':this.status(action.message);return null;
      case 'import-background':{
        if(this.store.saved.backgrounds.length>=200)throw new LumenError('background-limit','Se ha alcanzado el máximo de 200 fondos.');
        const asset=await importBackground(this.main,this.store.directory,action.kind);if(!asset)return null;
        await this.store.save({...this.store.saved,backgrounds:[...this.store.saved.backgrounds,asset]});this.broadcast();return asset.id;
      }
      case 'download-bible':{
        if(this.downloading)throw new LumenError('download-busy','Ya hay una traducción descargándose.');this.downloading=true;
        try{const bible=await downloadBible(action.id,message=>this.status(message));await this.store.addBible(bible);this.broadcast();this.status(`${bible.name} instalada para uso sin conexión.`);return bible.id;}finally{this.downloading=false;}
      }
      case 'import-bible':{
        const result=await dialog.showOpenDialog(this.main,{title:'Importar una traducción · JSON, XML o USFM',properties:['openFile','multiSelections'],filters:[{name:'Biblia',extensions:['json','xml','usfm','sfm','zip']}]});
        if(result.canceled||!result.filePaths[0])return null;
        const bible=await importBibleFiles(result.filePaths);
        await this.store.addBible(bible);this.broadcast();return bible.id;
      }
      case 'import-bible-folder':{
        if(this.importingBibles)throw new LumenError('bible-folder','Ya se está importando una carpeta de Biblias.');
        this.importingBibles=true;
        try{
          const result=await dialog.showOpenDialog(this.main,{title:'Importar carpeta de Biblias JSON',properties:['openDirectory']});const directory=result.filePaths[0];if(result.canceled||!directory)return null;
          const outcome=await importBibleDirectory(directory,{has:id=>this.store.infos().some(bible=>bible.id===id),install:bible=>this.store.addBible(bible),status:message=>this.status(message)});
          this.broadcast();this.status(`${outcome.imported} Biblias importadas; ${outcome.skipped} ya estaban instaladas.${outcome.errors.length?` ${outcome.errors.length} archivo(s) omitido(s).`:''}`);return outcome;
        }finally{this.importingBibles=false;}
      }
      case 'import-hymns':{
        if(this.importing)throw new LumenError('import-busy','Ya hay una importación de himnos en curso.');
        this.importing=true;this.removedDuringImport.clear();
        try{return await this.importHymns(action.folder,action.edition);}finally{this.importing=false;this.removedDuringImport.clear();}
      }
      case 'hymn-metadata':{
        const hymn=this.store.saved.hymns.find(h=>h.id===action.id);if(!hymn)throw new LumenError('hymn','Himno no encontrado.');
        const {sungTrack,instrumentalTrack}=action.metadata;
        if([sungTrack,instrumentalTrack].some(track=>track!==null&&!hymn.tracks.some(t=>t.index===track))||(sungTrack!==null&&sungTrack===instrumentalTrack))throw new LumenError('track-mapping','Asigna pistas de audio existentes y diferentes para cantado e instrumental.');
        await this.store.save({...this.store.saved,hymns:this.store.saved.hymns.map(h=>h.id===action.id?{...h,...action.metadata}:h)});this.broadcast();return null;
      }
      case 'remove-hymn':if(this.hymns.has(action.id))this.hymns.stop();if(this.importing)this.removedDuringImport.add(action.id);await this.store.save({...this.store.saved,hymns:this.store.saved.hymns.filter(h=>h.id!==action.id)});this.broadcast();return null;
      case 'open-output':await this.open(action.displayId);return null;
      case 'close-output':this.hymns.stop();if(this.projection)this.projection.close();else this.update({connected:false,displayId:null});return null;
      case 'project':
        if(action.slide.kind==='hymn')throw new LumenError('media','Inicia los himnos desde la biblioteca.');
        this.hymns.cancel();if(this.output.slide.kind==='hymn')this.media.revoke(this.output.slide.mediaUrl);this.update({slide:action.slide,preparing:null,blackout:false,playing:false,position:0,updatedAt:Date.now(),revision:this.output.revision+1});await this.recordHistory(action.slide);return null;
      case 'play-hymn':{
        const hymn=this.store.saved.hymns.find(h=>h.id===action.id);if(!hymn)throw new LumenError('hymn','Himno no encontrado.');
        await this.hymns.play(hymn,action.track);return null;
      }
      case 'stop-hymn':this.hymns.stop();return null;
      case 'playback':{
        if(action.revision!==undefined&&action.revision!==this.output.revision)return null;
        if(this.output.slide.kind!=='hymn')return null;
        if(action.ended){this.hymns.stop();return null;}
        const id=this.output.slide.hymnId;const duration=this.store.saved.hymns.find(h=>h.id===id)?.duration??0;
        this.update({position:Math.min(action.position??playbackPosition(this.output),duration),playing:this.output.connected&&(action.ended?false:action.playing??this.output.playing),updatedAt:Date.now()});return null;
      }
      case 'blackout':this.update({position:playbackPosition(this.output),blackout:action.value,updatedAt:Date.now()});return null;
      case 'media-error':if(action.revision===this.output.revision){this.hymns.stop();this.status(`Error de reproducción: ${action.message}`);}return null;
      case 'settings':if(action.settings.baseScreen.imageId&&!this.store.saved.backgrounds.some(asset=>asset.id===action.settings.baseScreen.imageId&&asset.kind==='image'))throw new LumenError('base-image','La imagen de la pantalla base no está disponible.');await this.store.save({...this.store.saved,settings:action.settings});this.broadcast();return null;
      case 'program':await this.store.save({...this.store.saved,program:action.program});this.broadcast();return null;
      default:action satisfies never;return null;
    }
  }
  private async recordHistory(slide:Snapshot['output']['slide']):Promise<void>{
    if(slide.kind==='welcome')return;
    const clean=slide.kind==='hymn'?{...slide,mediaUrl:''}:slide;
    const title=slide.kind==='verse'?`${slide.reference} · ${slide.translation}`:slide.title;
    const history=[{id:randomUUID(),title,slide:clean,projectedAt:Date.now()},...this.store.saved.history.filter(item=>item.title!==title)].slice(0,30);
    await this.store.save({...this.store.saved,history});this.broadcast();
  }
  private async importHymns(folder:boolean,edition:'1962'|'2009'|'unknown'):Promise<unknown>{
    const result=await dialog.showOpenDialog(this.main,{title:folder?'Seleccionar carpeta de himnos':'Importar himnos MKV',properties:folder?['openDirectory']:['openFile','multiSelections'],filters:[{name:'Himnos MKV',extensions:['mkv']}]});
    const first=result.filePaths[0];if(result.canceled||!first)return null;
    const files=folder?(await readdir(first,{withFileTypes:true})).filter(e=>e.isFile()&&e.name.toLowerCase().endsWith('.mkv')).map(e=>path.join(first,e.name)):result.filePaths;
    const incoming:Hymn[]=[];const errors:string[]=[];let imported=0;
    for(const file of files){
      try{const hymn={...await inspectHymn(file),...hymnMetadataSchema.parse({edition})};incoming.push(hymn);imported++;this.status(`Analizando himnos · ${imported}/${files.length}`);}
      catch(error){if(error instanceof Error)errors.push(`${path.basename(file)}: ${error.message}`);else throw error;}
    }
    imported=incoming.filter(hymn=>!this.removedDuringImport.has(hymn.id)).length;
    const hymns=this.store.annotateHymns(mergeImportedHymns(this.store.saved.hymns,incoming,this.removedDuringImport));
    await this.store.save({...this.store.saved,hymns});this.broadcast();
    this.status(`${imported} himno(s) importado(s).${errors.length?` ${errors.length} archivo(s) omitido(s).`:''}`);
    return {imported,errors};
  }
}
