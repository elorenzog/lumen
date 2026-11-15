import { describe,it,expect,vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BibleDatabase } from '../electron/bible-database';
import type { Bible } from '../src/shared/contracts';
const bible:Bible={id:'one',name:'Primera',abbreviation:'P',source:'fixture',license:'Public domain',verses:[{book:43,chapter:3,verse:16,text:'Dios amó al mundo.'},{book:43,chapter:3,verse:17,text:'Su Hijo salva al mundo.'}]};
describe('Given the local translation database',()=>{
  it('keeps translations separate and searches without accents',()=>{const db=new BibleDatabase(':memory:');try{db.add(bible);db.add({...bible,id:'two',verses:[{book:43,chapter:3,verse:16,text:'Otra traducción.'}]});expect(db.search('one','amo')).toEqual([bible.verses[0]]);expect(db.get('two')?.verses[0]?.text).toBe('Otra traducción.');}finally{db.close();}});
  it('rolls back invalid duplicate references without destroying an installed translation',()=>{const db=new BibleDatabase(':memory:');try{db.add(bible);expect(()=>db.add({...bible,verses:[...bible.verses,...bible.verses]})).toThrow();expect(db.get('one')?.verses).toEqual(bible.verses);}finally{db.close();}});
  it('finds a requested verse inside an original verse bridge',()=>{const db=new BibleDatabase(':memory:');try{db.add({...bible,verses:[{book:43,chapter:3,verse:16,endVerse:17,text:'Texto combinado original.'}]});expect(db.search('one','Juan 3:17')).toHaveLength(1);}finally{db.close();}});
  it('does not recount every verse when successive playback snapshots request the same catalogue',()=>{
    const db=new BibleDatabase(':memory:');db.add(bible);
    const prepare=vi.spyOn(DatabaseSync.prototype,'prepare');
    try{db.infos();db.infos();expect(prepare.mock.calls.filter(([sql])=>/count\(/i.test(sql))).toHaveLength(1);}
    finally{prepare.mockRestore();db.close();}
  });
  it('refreshes cached counts after a translation is replaced',()=>{
    const db=new BibleDatabase(':memory:');
    try{db.add(bible);db.infos();db.add({...bible,verses:[{book:1,chapter:1,verse:1,text:'Texto nuevo.'}]});expect(db.infos()[0]?.count).toBe(1);}
    finally{db.close();}
  });
  it('refreshes cached editions after another connection imports a Bible',()=>{
    const directory=mkdtempSync(path.join(tmpdir(),'lumen-catalog-cache-'));const file=path.join(directory,'library.sqlite');
    const first=new BibleDatabase(file);const second=new BibleDatabase(file);
    try{first.add(bible);expect(first.infos()).toHaveLength(1);second.add({...bible,id:'external'});expect(first.infos()).toHaveLength(2);}
    finally{second.close();first.close();rmSync(directory,{recursive:true,force:true});}
  });
});
