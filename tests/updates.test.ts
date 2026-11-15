import { afterEach,describe,expect,it } from 'vitest';
import { mkdtemp,readFile,rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { Updates } from '../electron/updates';
import type { UpdateEngine,UpdateEvent } from '../electron/updates';

class Engine implements UpdateEngine{
  readonly listeners=new Map<UpdateEvent,((value?:unknown)=>void)[]>();checks=0;downloads=0;installs=0;
  listen(event:UpdateEvent,listener:(value?:unknown)=>void):void{this.listeners.set(event,[...this.listeners.get(event)??[],listener]);}
  emit(event:UpdateEvent,value?:unknown):void{for(const listener of this.listeners.get(event)??[])listener(value);}
  async check():Promise<unknown>{this.checks++;this.emit('update-available',{version:'9.0.0',releaseNotes:'Release notes'});return {};}
  async download():Promise<unknown>{this.downloads++;this.emit('download-progress',{percent:45.9});this.emit('update-downloaded');return [];}
  install():void{this.installs++;}
}
const directories:string[]=[];
afterEach(async()=>{for(const dir of directories)await rm(dir,{recursive:true,force:true});directories.length=0;});
async function fixture(installable=true){const directory=await mkdtemp(path.join(tmpdir(),'lumen-updates-'));directories.push(directory);const engine=new Engine();const state={blocked:false,changes:0};const updates=new Updates(engine,{directory,installable,blocked:()=>state.blocked,changed:()=>{state.changes++;}});await updates.initialize();return {updates,engine,state,directory};}
describe('Given GitHub release updates',()=>{
  it('offers a new version without downloading or restarting',async()=>{const {updates,engine}=await fixture();await updates.check();expect(updates.snapshot()).toMatchObject({status:'available',version:'9.0.0'});expect([engine.downloads,engine.installs]).toEqual([0,0]);});
  it('downloads only after the explicit action and waits to install',async()=>{const {updates,engine}=await fixture();await updates.check();await updates.download();expect(updates.snapshot()).toMatchObject({status:'downloaded',progress:100});expect([engine.downloads,engine.installs]).toEqual([1,0]);});
  it('blocks installation while projection is open',async()=>{const {updates,engine,state}=await fixture();await updates.check();await updates.download();state.blocked=true;expect(()=>updates.install()).toThrow();expect(engine.installs).toBe(0);});
  it('installs an explicitly requested ready download when output is closed',async()=>{const {updates,engine}=await fixture();await updates.check();await updates.download();updates.install();expect(engine.installs).toBe(1);});
  it('rejects installation before a complete download',async()=>{const {updates,engine}=await fixture();await updates.check();expect(()=>updates.install()).toThrow();expect(engine.installs).toBe(0);});
  it('persists the startup preference in a separate file',async()=>{const {updates,engine,directory}=await fixture();await updates.preference(false);expect(JSON.parse(await readFile(path.join(directory,'updates.json'),'utf8'))).toEqual({checkAtStartup:false});const reopened=new Updates(engine,{directory,installable:true,blocked:()=>false,changed:()=>{}});await reopened.initialize();expect(reopened.snapshot().checkAtStartup).toBe(false);});
  it('leaves portable builds to the release installer',async()=>{const {updates,engine}=await fixture(false);await updates.check();expect(()=>updates.download()).toThrow();expect(engine.downloads).toBe(0);});
  it('turns network failures into a retryable state without diagnostics',async()=>{const {updates,engine}=await fixture();engine.check=async()=>{throw new Error('private-network-diagnostic');};await updates.check();expect(updates.snapshot().status).toBe('error');expect(updates.snapshot().message).not.toContain('private-network-diagnostic');});
  it('does not emit duplicate progress updates for the same whole percentage',async()=>{const {updates,engine,state}=await fixture();engine.emit('download-progress',{percent:20.1});const changes=state.changes;engine.emit('download-progress',{percent:20.9});expect(state.changes).toBe(changes);expect(updates.snapshot().progress).toBe(20);});
});
