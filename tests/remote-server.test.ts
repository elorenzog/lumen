import { afterEach,describe,expect,it } from 'vitest';
import { request } from 'node:http';
import { RemoteServer } from '../electron/remote-server';
import { LumenError } from '../src/shared/contracts';

const servers:RemoteServer[]=[];
afterEach(()=>{for(const server of servers)server.close();servers.length=0;});
function http(url:string,method='GET',body?:unknown,cookie?:string,origin?:string):Promise<{status:number;body:string;cookie:string}>{
  return new Promise((resolve,reject)=>{const data=body===undefined?undefined:JSON.stringify(body);const req=request(url,{method,headers:{...(data?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)}:{}),...(cookie?{Cookie:cookie}:{}),...(method==='POST'?{Origin:origin??new URL(url).origin}:{})}},res=>{let body='';res.on('data',(data:Buffer)=>{body+=data.toString();});res.on('end',()=>resolve({status:res.statusCode??0,body,cookie:res.headers['set-cookie']?.[0]?.split(';')[0]??''}));});req.on('error',reject);req.end(data);});
}
async function fixture(){const commands:unknown[]=[];const server=new RemoteServer('dist/remote',{state:()=>({connected:true}),library:()=>({hymns:[]}),search:()=>[],command:async command=>{commands.push(command);return null;}});servers.push(server);const info=await server.start();const port=new URL(info.urls[0]??'').port;const url=`http://127.0.0.1:${port}`;return {server,info,url,commands};}
describe('Given a LAN remote control server',()=>{
  it('requires pairing before returning state',async()=>{const {url}=await fixture();expect((await http(`${url}/api/state`)).status).toBe(401);});
  it('pairs with its current PIN and dispatches an allowed command',async()=>{const {url,info,commands}=await fixture();const pair=await http(`${url}/api/pair`,'POST',{pin:info.pin});expect(pair.status).toBe(200);expect(pair.cookie).toMatch(/^lumen_remote=/);expect((await http(`${url}/api/command`,'POST',{type:'blackout',value:true},pair.cookie)).status).toBe(200);expect(commands).toEqual([{type:'blackout',value:true}]);});
  it('rejects wrong PIN and cross-origin pairing',async()=>{const {url,info}=await fixture();expect((await http(`${url}/api/pair`,'POST',{pin:'invalid'})).status).toBe(401);expect((await http(`${url}/api/pair`,'POST',{pin:info.pin},undefined,'https://example.com')).status).toBe(403);});
  it('does not expose desktop imports or settings through the remote API',async()=>{const {url,info,commands}=await fixture();const pair=await http(`${url}/api/pair`,'POST',{pin:info.pin});expect((await http(`${url}/api/command`,'POST',{type:'import-hymns',folder:true},pair.cookie)).status).toBe(400);expect((await http(`${url}/api/command`,'POST',{type:'volume',value:2},pair.cookie)).status).toBe(400);expect(commands).toEqual([]);});
  it('revokes paired sessions when the PIN is rotated',async()=>{const {server,url,info}=await fixture();const pair=await http(`${url}/api/pair`,'POST',{pin:info.pin});server.rotate();expect((await http(`${url}/api/state`,'GET',undefined,pair.cookie)).status).toBe(401);});
  it('limits repeated incorrect PIN attempts',async()=>{const {url}=await fixture();for(let i=0;i<5;i++)await http(`${url}/api/pair`,'POST',{pin:'000000'});expect((await http(`${url}/api/pair`,'POST',{pin:'000000'})).status).toBe(429);});
  it('does not serve arbitrary files or CORS access',async()=>{const {url}=await fixture();expect((await http(`${url}/../package.json`)).status).toBe(404);expect((await http(`${url}/api/state`,'OPTIONS')).status).toBe(405);});
  it('invalidates a session on logout',async()=>{const {url,info}=await fixture();const pair=await http(`${url}/api/pair`,'POST',{pin:info.pin});expect((await http(`${url}/api/logout`,'POST',{},pair.cookie)).status).toBe(200);expect((await http(`${url}/api/state`,'GET',undefined,pair.cookie)).status).toBe(401);});
  it('rejects Unicode PIN bytes without a server exception',async()=>{const {url}=await fixture();expect((await http(`${url}/api/pair`,'POST',{pin:'éééééé'})).status).toBe(401);});
  it('bounds incoming payload size',async()=>{const {url}=await fixture();expect((await http(`${url}/api/pair`,'POST',{pin:'1'.repeat(9000)})).status).toBe(413);});
  it('does not send media diagnostics with local paths to the phone',async()=>{
    const privatePath='C:/private/hymns/example.mkv';const server=new RemoteServer('dist/remote',{state:()=>null,library:()=>null,search:()=>null,command:async()=>{throw new LumenError('media',privatePath);}});servers.push(server);const info=await server.start();const url=`http://127.0.0.1:${new URL(info.urls[0]??'').port}`;const paired=await http(`${url}/api/pair`,'POST',{pin:info.pin});const result=await http(`${url}/api/command`,'POST',{type:'stop'},paired.cookie);expect(result.status).toBe(400);expect(result.body).not.toContain(privatePath);
  });
});
