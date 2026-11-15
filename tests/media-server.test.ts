import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { get } from 'node:http';
import { MediaServer } from '../electron/media-server';

const servers:MediaServer[]=[];
const directories:string[]=[];
afterEach(async()=>{for(const server of servers)server.close();for(const directory of directories)await rm(directory,{recursive:true,force:true});servers.length=0;directories.length=0;});
function request(url:string,range?:string):Promise<{readonly status:number;readonly body:string}>{
  return new Promise((resolve,reject)=>{get(url,{headers:range?{Range:range}:{}},response=>{let body='';response.on('data',(chunk:Buffer)=>{body+=chunk.toString();});response.on('end',()=>resolve({status:response.statusCode??0,body}));}).on('error',reject);});
}
async function fixture():Promise<{readonly url:string;readonly server:MediaServer;readonly file:string}>{
  const directory=await mkdtemp(path.join(tmpdir(),'lumen-media-test-'));directories.push(directory);
  const file=path.join(directory,'fixture.mp4');await writeFile(file,'0123456789');
  const server=new MediaServer();servers.push(server);await server.start();return {url:server.register(file),server,file};
}
describe('Given the loopback media server',()=>{
  it('serves a byte range when Chromium seeks within registered media',async()=>{const {url}=await fixture();expect(await request(url,'bytes=3-5')).toEqual({status:206,body:'345'});});
  it('rejects requests without the unguessable token',async()=>{const {url}=await fixture();expect((await request(url.split('?')[0]??'')).status).toBe(404);});
  it('rejects out-of-bounds ranges without reading arbitrary bytes',async()=>{const {url}=await fixture();expect((await request(url,'bytes=10-20')).status).toBe(416);});
  it('revokes an old hymn URL and assigns a fresh URL when replayed',async()=>{
    const {url,server,file}=await fixture();
    server.revoke(url);
    expect(server.has(url)).toBe(false);
    expect((await request(url)).status).toBe(404);
    const fresh=server.register(file);
    expect(fresh).not.toBe(url);
    expect((await request(fresh)).body).toBe('0123456789');
  });
});
