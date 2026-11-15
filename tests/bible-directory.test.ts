import { afterEach,describe,expect,it } from 'vitest';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { importBibleDirectory } from '../electron/bible-directory';
import type { Bible } from '../src/shared/contracts';

const directories:string[]=[];
afterEach(async()=>{for(const directory of directories)await rm(directory,{recursive:true,force:true});directories.length=0;});
const bible=(id:string):Bible=>({id,name:id,abbreviation:id,source:'Fixture',license:'Fixture',verses:[{book:43,chapter:3,verse:16,text:'Texto de prueba.'}]});
describe('Given a local folder of Bible JSON exports',()=>{
  it('imports available translations, skips installed IDs and reports invalid files',async()=>{
    const directory=await mkdtemp(path.join(tmpdir(),'lumen-bible-folder-'));directories.push(directory);
    await Promise.all([writeFile(path.join(directory,'a.json'),JSON.stringify(bible('existing'))),writeFile(path.join(directory,'b.json'),JSON.stringify(bible('new'))),writeFile(path.join(directory,'catalog.json'),'{}'),writeFile(path.join(directory,'invalid.json'),'{invalid')]);
    const installed:Bible[]=[];const result=await importBibleDirectory(directory,{has:id=>id==='existing',install:async value=>{installed.push(value);},status:()=>{}});
    expect(result).toMatchObject({imported:1,skipped:1});expect(result.errors).toHaveLength(1);expect(installed.map(bible=>bible.id)).toEqual(['new']);
  });
  it('rejects an empty folder without modifying the destination',async()=>{
    const directory=await mkdtemp(path.join(tmpdir(),'lumen-bible-empty-'));directories.push(directory);let writes=0;
    await expect(importBibleDirectory(directory,{has:()=>false,install:async()=>{writes++;},status:()=>{}})).rejects.toThrow();expect(writes).toBe(0);
  });
});
