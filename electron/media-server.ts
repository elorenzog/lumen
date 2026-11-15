import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import path from 'node:path';
import { LumenError } from '../src/shared/contracts';

export class MediaServer {
  private readonly token=randomBytes(24).toString('hex');
  private readonly files=new Map<string,string>();
  private readonly urls=new Map<string,string>();
  private readonly streams=new Map<string,Set<()=>void>>();
  private server:Server|undefined;
  private port=0;
  async start():Promise<void>{
    this.server=createServer((request,response)=>{ void (async()=>{
      const url=new URL(request.url??'/', 'http://127.0.0.1');
      const id=url.pathname.slice(1);
      const file=url.searchParams.get('token')===this.token?this.files.get(id):undefined;
      if(!file || !['GET','HEAD'].includes(request.method??'')){response.writeHead(404).end();return;}
      const info=await stat(file);
      if(this.files.get(id)!==file){response.writeHead(404).end();return;}
      const range=request.headers.range;
      const match=range?/^bytes=(\d+)-(\d*)$/.exec(range):null;
      const start=match?.[1]?Number(match[1]):0;
      const end=match?.[2]?Math.min(Number(match[2]),info.size-1):info.size-1;
      if((range&&!match)||start>end||start>=info.size){response.writeHead(416,{'Content-Range':`bytes */${info.size}`}).end();return;}
      const mime=path.extname(file)==='.png'?'image/png':path.extname(file)==='.webm'?'video/webm':'video/mp4';
      response.writeHead(range?206:200,{'Content-Type':mime,'X-Content-Type-Options':'nosniff','Accept-Ranges':'bytes','Content-Length':end-start+1,'Cache-Control':'no-store',...(range?{'Content-Range':`bytes ${start}-${end}/${info.size}`}:{})});
      if(request.method==='HEAD'){response.end();return;}
      const stream=createReadStream(file,{start,end});
      const active=this.streams.get(id)??new Set<()=>void>();
      const abort=():void=>{stream.destroy();response.destroy();};
      active.add(abort);this.streams.set(id,active);
      stream.on('error',()=>response.destroy());response.on('close',()=>{active.delete(abort);if(!active.size)this.streams.delete(id);stream.destroy();});stream.pipe(response);
    })().catch((error:unknown)=>{if(error instanceof Error){response.destroy(error);}else{response.destroy();}}); });
    await new Promise<void>((resolve,reject)=>{this.server?.once('error',reject);this.server?.listen(0,'127.0.0.1',()=>resolve());});
    const address=this.server.address();
    if(!address||typeof address==='string')throw new LumenError('server','No se pudo preparar el reproductor local.');
    this.port=address.port;
  }
  register(file:string):string{const existing=this.urls.get(file);if(existing)return existing;const id=randomUUID();this.files.set(id,file);const url=`http://127.0.0.1:${this.port}/${id}?token=${this.token}`;this.urls.set(file,url);return url;}
  revoke(url:string):void{
    if(!this.has(url))return;
    const id=new URL(url).pathname.slice(1);const file=this.files.get(id);
    this.files.delete(id);if(file)this.urls.delete(file);
    for(const abort of this.streams.get(id)??[])abort();this.streams.delete(id);
  }
  has(url:string):boolean{try{const parsed=new URL(url);return parsed.origin===`http://127.0.0.1:${this.port}`&&parsed.searchParams.get('token')===this.token&&this.files.has(parsed.pathname.slice(1));}catch(error){if(error instanceof TypeError)return false;throw error;}}
  close():void{for(const active of this.streams.values())for(const abort of active)abort();this.streams.clear();this.files.clear();this.urls.clear();this.server?.closeAllConnections();this.server?.close();}
}
