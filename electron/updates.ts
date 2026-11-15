import { readFile,writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { LumenError } from '../src/shared/contracts';
import { initialUpdateInfo } from '../src/shared/update-info';
import type { UpdateInfo } from '../src/shared/update-info';

export type UpdateEvent='checking-for-update'|'update-available'|'update-not-available'|'download-progress'|'update-downloaded'|'error';
export type UpdateEngine={readonly listen:(event:UpdateEvent,listener:(value?:unknown)=>void)=>void;readonly check:()=>Promise<unknown>;readonly download:()=>Promise<unknown>;readonly install:()=>void};
type Context={readonly directory:string;readonly installable:boolean;readonly blocked:()=>boolean;readonly changed:()=>void};
const preferenceSchema=z.object({checkAtStartup:z.boolean()});
const availableSchema=z.object({version:z.string().max(100),releaseNotes:z.union([z.string().max(200000),z.array(z.object({note:z.string().nullable().optional()}))]).nullable().optional()});
export class Updates{
  private info:UpdateInfo;
  private operation:Promise<void>|undefined;
  constructor(private readonly engine:UpdateEngine,private readonly context:Context){
    this.info={...initialUpdateInfo,installable:context.installable};
    engine.listen('checking-for-update',()=>this.update({status:'checking',message:'Buscando actualizaciones.'}));
    engine.listen('update-not-available',()=>this.update({status:'current',message:'LUMEN está actualizado.'}));
    engine.listen('update-available',raw=>{const value=availableSchema.parse(raw);this.update({status:'available',version:value.version,notes:typeof value.releaseNotes==='string'?value.releaseNotes:value.releaseNotes?.map(note=>note.note??'').join('\n')??'',message:`Disponible LUMEN ${value.version}.`});});
    engine.listen('download-progress',raw=>{const value=z.object({percent:z.number()}).parse(raw);const progress=Math.max(0,Math.min(100,Math.floor(value.percent)));if(progress!==this.info.progress)this.update({status:'downloading',progress,message:`Descargando actualización · ${progress}%`});});
    engine.listen('update-downloaded',()=>this.update({status:'downloaded',progress:100,message:'Actualización lista. Instálala cuando termine la proyección.'}));
    engine.listen('error',()=>this.update({status:'error',message:'No se pudo consultar o descargar la actualización. Comprueba la conexión y vuelve a intentar.'}));
  }
  snapshot():UpdateInfo{return {...this.info};}
  private update(value:Partial<UpdateInfo>):void{this.info={...this.info,...value};this.context.changed();}
  async initialize():Promise<void>{
    try{const value=preferenceSchema.parse(JSON.parse(await readFile(path.join(this.context.directory,'updates.json'),'utf8')));this.info={...this.info,...value};}
    catch(error){if(error instanceof Error&&'code'in error&&error.code==='ENOENT')return;if(error instanceof Error){this.update({message:'No se pudo leer la preferencia de actualizaciones. Puedes elegirla de nuevo en Acerca de.'});return;}throw error;}
  }
  async preference(checkAtStartup:boolean):Promise<void>{await writeFile(path.join(this.context.directory,'updates.json'),JSON.stringify({checkAtStartup}),'utf8');this.update({checkAtStartup});}
  check():Promise<void>{
    if(this.operation)return this.operation;
    if(this.info.status==='downloaded')return Promise.resolve();
    this.update({status:'checking',message:'Buscando actualizaciones.'});
    this.operation=this.engine.check().then(result=>{if(result===null&&this.info.status==='checking')this.update({status:'idle',message:'En modo desarrollo, usa el instalador publicado en GitHub.'});}).catch((error:unknown)=>{if(error instanceof Error){this.update({status:'error',message:'No se pudo buscar una nueva versión. Comprueba la conexión o abre las publicaciones de GitHub.'});return;}throw error;}).finally(()=>{this.operation=undefined;});return this.operation;
  }
  download():Promise<void>{
    if(this.operation)return this.operation;
    if(!this.context.installable)throw new LumenError('updater-mode','Usa el instalador de GitHub para recibir actualizaciones dentro de LUMEN.');
    if(this.info.status!=='available')throw new LumenError('updater-state','Busca primero una actualización disponible.');
    this.update({status:'downloading',progress:0,message:'Descargando actualización.'});
    this.operation=this.engine.download().then(()=>{}).catch((error:unknown)=>{if(error instanceof Error){this.update({status:'error',message:'La descarga no se completó. Vuelve a buscar la actualización para reintentar.'});return;}throw error;}).finally(()=>{this.operation=undefined;});return this.operation;
  }
  install():void{
    if(!this.context.installable||this.info.status!=='downloaded')throw new LumenError('updater-state','La actualización aún no está lista para instalar.');
    if(this.context.blocked())throw new LumenError('updater-live','Cierra la pantalla de proyección antes de instalar la actualización.');
    this.engine.install();
  }
}
