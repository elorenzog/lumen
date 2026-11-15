import { createServer } from 'node:http';
import type { IncomingMessage,Server,ServerResponse } from 'node:http';
import { networkInterfaces } from 'node:os';
import { randomBytes,randomInt,timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { LumenError } from '../src/shared/contracts';
import type { RemoteInfo } from '../src/shared/remote-info';
import { remoteCommandSchema } from '../src/shared/remote-contracts';
import type { RemoteCommand } from '../src/shared/remote-contracts';

export type RemoteHandlers={readonly state:()=>unknown;readonly library:()=>unknown;readonly search:(input:unknown)=>unknown;readonly command:(input:RemoteCommand)=>Promise<unknown>};
class RemoteError extends LumenError{constructor(readonly status:number,message:string){super('remote',message);}}
const localAddress=(ip:string):boolean=>/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
const pairSchema=z.object({pin:z.string().max(20)}).strict();
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'; object-src 'none'"} as const;
export class RemoteServer{
  private server:Server|undefined;
  private port=0;
  private pin='';
  private starting:Promise<RemoteInfo>|undefined;
  private readonly sessions=new Map<string,number>();
  private readonly attempts=new Map<string,{count:number;until:number}>();
  constructor(readonly directory:string,readonly handlers:RemoteHandlers,readonly changed:()=>void=()=>{}){}
  info():RemoteInfo{
    this.expire();
    const priority=(name:string):number=>/virtual|vmware|vethernet|hyper-v|docker|wsl|tunnel/i.test(name)?2:/wi-?fi|wlan/i.test(name)?0:1;
    const addresses=Object.entries(networkInterfaces()).sort(([a],[b])=>priority(a)-priority(b)).flatMap(([,entries])=>entries??[]).filter(entry=>entry.family==='IPv4'&&!entry.internal&&localAddress(entry.address)).map(entry=>entry.address);
    return {enabled:this.port>0,urls:this.port?[...new Set(addresses.length?addresses:['127.0.0.1'])].map(ip=>`http://${ip}:${this.port}`):[],pin:this.pin,devices:this.sessions.size};
  }
  start():Promise<RemoteInfo>{
    if(this.port)return Promise.resolve(this.info());
    if(this.starting)return this.starting;
    this.starting=this.listen().finally(()=>{this.starting=undefined;});return this.starting;
  }
  private async listen():Promise<RemoteInfo>{
    this.rotate();
    const server=createServer({requestTimeout:15000,headersTimeout:10000,maxHeaderSize:8192},(request,response)=>{
      void this.handle(request,response).catch((error:unknown)=>{
        if(error instanceof RemoteError){this.json(response,error.status,{error:error.message});return;}
        if(error instanceof z.ZodError){this.json(response,400,{error:'Los datos enviados no son válidos.'});return;}
        if(error instanceof LumenError){const safe=['output','display','reference','bible','range','hymn','program','track'].includes(error.code);if(!safe)console.error('remote.command.failed',error);this.json(response,400,{error:safe?error.message:'No se pudo preparar el contenido. Revisa el archivo desde LUMEN en la computadora.'});return;}
        if(error instanceof Error){console.error('remote.request.failed',error);this.json(response,500,{error:'No se pudo completar la acción. Reintenta desde el teléfono.'});return;}
        response.destroy();
      });
    });
    this.server=server;
    try{await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'0.0.0.0',()=>{server.removeListener('error',reject);resolve();});});}
    catch(error){this.close();if(error instanceof Error)throw new LumenError('remote-listen','No se pudo activar el control remoto. Revisa la conexión de red.');throw error;}
    const address=server.address();if(!address||typeof address==='string')throw new LumenError('remote-listen','No se pudo obtener la dirección del control remoto.');
    this.port=address.port;this.changed();return this.info();
  }
  rotate():RemoteInfo{const previous=this.pin;do{this.pin=String(randomInt(100000,1000000));}while(this.pin===previous);this.sessions.clear();this.attempts.clear();this.changed();return this.info();}
  close():void{this.server?.close();this.server?.closeAllConnections();this.server=undefined;this.port=0;this.pin='';this.sessions.clear();this.attempts.clear();this.changed();}
  private expire():void{for(const [key,until] of this.sessions)if(until<Date.now())this.sessions.delete(key);for(const [key,entry]of this.attempts)if(entry.until<Date.now())this.attempts.delete(key);}
  private json(response:ServerResponse,status:number,value:unknown,cookie?:string):void{if(response.destroyed||response.writableEnded)return;response.writeHead(status,{...headers,'Content-Type':'application/json; charset=utf-8',...(cookie?{'Set-Cookie':cookie}:{})});response.end(JSON.stringify(value));}
  private async body(request:IncomingMessage):Promise<unknown>{
    if(!/^application\/json(?:;|$)/i.test(request.headers['content-type']??''))throw new RemoteError(415,'Envía datos JSON.');
    let bytes=0;const chunks:Buffer[]=[];
    for await(const raw of request){const chunk=Buffer.isBuffer(raw)?raw:Buffer.from(raw);bytes+=chunk.length;if(bytes>8192)throw new RemoteError(413,'La solicitud es demasiado grande.');chunks.push(chunk);}
    try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch(error){if(error instanceof SyntaxError)throw new RemoteError(400,'JSON no válido.');throw error;}
  }
  private async handle(request:IncomingMessage,response:ServerResponse):Promise<void>{
    const host=request.headers.host??'';const parsedHost=/^(127\.0\.0\.1|\d+\.\d+\.\d+\.\d+):(\d+)$/.exec(host);
    const localHosts=Object.values(networkInterfaces()).flatMap(entries=>entries??[]).map(entry=>entry.address);
    if(!parsedHost?.[1]||Number(parsedHost[2])!==this.port||!['127.0.0.1',...localHosts].includes(parsedHost[1]))throw new RemoteError(403,'Dirección no permitida.');
    const remote=(request.socket.remoteAddress??'').replace(/^::ffff:/,'');
    if(!localAddress(remote))throw new RemoteError(403,'El control está disponible en la red local.');
    const method=request.method??'';
    if(!['GET','POST'].includes(method))throw new RemoteError(405,'Método no permitido.');
    if((request.headers.origin&&request.headers.origin!==`http://${host}`)||(method==='POST'&&!request.headers.origin))throw new RemoteError(403,'Origen no permitido.');
    const url=new URL(request.url??'/',`http://${host}`);this.expire();
    if(method==='GET'&&['/','/remote.js','/remote.css'].includes(url.pathname)){
      const filename=url.pathname==='/'?'index.html':url.pathname.slice(1);
      try{const bytes=await readFile(path.join(this.directory,filename));response.writeHead(200,{...headers,'Content-Type':filename.endsWith('.js')?'text/javascript':filename.endsWith('.css')?'text/css':'text/html; charset=utf-8'});response.end(bytes);return;}
      catch(error){if(error instanceof Error&&'code'in error&&error.code==='ENOENT')throw new RemoteError(404,'Recurso no disponible.');throw error;}
    }
    if(!url.pathname.startsWith('/api/'))throw new RemoteError(404,'Recurso no disponible.');
    if(method==='POST'&&url.pathname==='/api/pair'){
      const entry=this.attempts.get(remote);if(entry&&entry.count>=5)throw new RemoteError(429,'Demasiados intentos. Espera un minuto antes de volver a intentar.');
      if(this.attempts.size>=128&&!entry)throw new RemoteError(429,'Espera un minuto y reintenta.');
      this.attempts.set(remote,{count:(entry?.count??0)+1,until:entry?.until??Date.now()+60000});
      const {pin}=pairSchema.parse(await this.body(request));
      if(!/^[0-9]{6}$/.test(pin)||!timingSafeEqual(Buffer.from(pin),Buffer.from(this.pin)))throw new RemoteError(401,'PIN incorrecto. Consulta el código en Ajustes de LUMEN.');
      if(this.sessions.size>=20)throw new RemoteError(429,'Ya hay 20 teléfonos vinculados. Renueva el PIN desde LUMEN.');
      this.attempts.delete(remote);const token=randomBytes(32).toString('hex');this.sessions.set(token,Date.now()+8*60*60*1000);this.changed();
      this.json(response,200,{ok:true},`lumen_remote=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`);return;
    }
    const token=/(?:^|;\s*)lumen_remote=([a-f0-9]{64})(?:;|$)/.exec(request.headers.cookie??'')?.[1];
    if(!token||!this.sessions.has(token))throw new RemoteError(401,'Vincula el teléfono con el PIN de LUMEN.');
    switch(`${method} ${url.pathname}`){
      case 'GET /api/state':this.json(response,200,this.handlers.state());return;
      case 'GET /api/library':this.json(response,200,this.handlers.library());return;
      case 'POST /api/search':this.json(response,200,this.handlers.search(await this.body(request)));return;
      case 'POST /api/command':this.json(response,200,await this.handlers.command(remoteCommandSchema.parse(await this.body(request))));return;
      case 'POST /api/logout':this.sessions.delete(token);this.changed();this.json(response,200,{ok:true},'lumen_remote=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return;
      default:throw new RemoteError(404,'Recurso no disponible.');
    }
  }
}
