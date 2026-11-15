import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { bibleSchema, verseSchema } from '../src/shared/contracts';
import type { Bible,BibleInfo,Verse } from '../src/shared/contracts';
import { books,referenceQuery } from '../src/shared/domain';

export class BibleDatabase {
  private readonly db:DatabaseSync;
  private catalog:{readonly version:number;readonly entries:readonly BibleInfo[]}|undefined;
  constructor(file:string){
    this.db=new DatabaseSync(file);
    this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS translations(id TEXT PRIMARY KEY, metadata TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS books(id INTEGER PRIMARY KEY,name TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS chapters(translation_id TEXT NOT NULL REFERENCES translations(id) ON DELETE CASCADE,book INTEGER NOT NULL REFERENCES books(id),chapter INTEGER NOT NULL,PRIMARY KEY(translation_id,book,chapter));
      CREATE TABLE IF NOT EXISTS verses(id INTEGER PRIMARY KEY,translation_id TEXT NOT NULL,book INTEGER NOT NULL,chapter INTEGER NOT NULL,verse INTEGER NOT NULL,end_verse INTEGER,text TEXT NOT NULL,UNIQUE(translation_id,book,chapter,verse),FOREIGN KEY(translation_id,book,chapter) REFERENCES chapters(translation_id,book,chapter) ON DELETE CASCADE);
      CREATE VIRTUAL TABLE IF NOT EXISTS verses_fts USING fts5(text,content='verses',content_rowid='id',tokenize='unicode61 remove_diacritics 2');
      CREATE TRIGGER IF NOT EXISTS verses_insert AFTER INSERT ON verses BEGIN INSERT INTO verses_fts(rowid,text) VALUES(new.id,new.text); END;
      CREATE TRIGGER IF NOT EXISTS verses_delete AFTER DELETE ON verses BEGIN INSERT INTO verses_fts(verses_fts,rowid,text) VALUES('delete',old.id,old.text); END;
      CREATE TRIGGER IF NOT EXISTS verses_update AFTER UPDATE ON verses BEGIN INSERT INTO verses_fts(verses_fts,rowid,text) VALUES('delete',old.id,old.text);INSERT INTO verses_fts(rowid,text) VALUES(new.id,new.text);END;
      PRAGMA user_version=1;`);
    const insert=this.db.prepare('INSERT OR IGNORE INTO books(id,name) VALUES(?,?)');
    books.forEach((name,index)=>insert.run(index+1,name));
  }
  has(id:string):boolean{return Boolean(this.db.prepare('SELECT id FROM translations WHERE id=?').get(id));}
  add(bible:Bible):void{
    const {verses,...metadata}=bible;
    this.db.exec('BEGIN IMMEDIATE');
    try{
      this.db.prepare('DELETE FROM translations WHERE id=?').run(bible.id);
      this.db.prepare('INSERT INTO translations(id,metadata) VALUES(?,?)').run(bible.id,JSON.stringify(metadata));
      const chapter=this.db.prepare('INSERT OR IGNORE INTO chapters(translation_id,book,chapter) VALUES(?,?,?)');
      const verse=this.db.prepare('INSERT INTO verses(translation_id,book,chapter,verse,end_verse,text) VALUES(?,?,?,?,?,?)');
      for(const v of verses){chapter.run(bible.id,v.book,v.chapter);verse.run(bible.id,v.book,v.chapter,v.verse,v.endVerse??null,v.text);}
      this.db.exec('COMMIT');
      this.catalog=undefined;
    }catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  private rows(raw:unknown):Verse[]{return z.array(z.object({book:z.number(),chapter:z.number(),verse:z.number(),end_verse:z.number().nullable(),text:z.string()})).parse(raw).map(({end_verse,...v})=>verseSchema.parse({...v,...(end_verse===null?{}:{endVerse:end_verse})}));}
  get(id:string):Bible|undefined{
    const raw=this.db.prepare('SELECT metadata FROM translations WHERE id=?').get(id);if(!raw)return undefined;
    const {metadata}=z.object({metadata:z.string()}).parse(raw);
    return bibleSchema.parse({...z.record(z.string(),z.unknown()).parse(JSON.parse(metadata)),verses:this.rows(this.db.prepare('SELECT book,chapter,verse,end_verse,text FROM verses WHERE translation_id=? ORDER BY book,chapter,verse').all(id))});
  }
  infos():BibleInfo[]{
    const version=z.object({data_version:z.number()}).parse(this.db.prepare('PRAGMA data_version').get()).data_version;
    if(this.catalog?.version===version)return structuredClone([...this.catalog.entries]);
    const entries=this.db.prepare('SELECT t.metadata,count(v.id) AS count FROM translations t JOIN verses v ON v.translation_id=t.id GROUP BY t.id ORDER BY CASE WHEN t.id=\'rv1909\' THEN 0 ELSE 1 END,t.id').all().map(raw=>{
      const row=z.object({metadata:z.string(),count:z.number()}).parse(raw);
      const metadata=bibleSchema.omit({verses:true}).parse(JSON.parse(row.metadata));return {...metadata,count:row.count};
    });
    this.catalog={version,entries};
    return structuredClone(entries);
  }
  search(id:string,query:string):Verse[]{
    const reference=referenceQuery(query);
    if(reference)return this.rows(this.db.prepare('SELECT book,chapter,verse,end_verse,text FROM verses WHERE translation_id=? AND book=? AND chapter=? AND verse<=? AND coalesce(end_verse,verse)>=? ORDER BY verse LIMIT 200').all(id,reference.book,reference.chapter,reference.to,reference.from));
    const terms=query.match(/[\p{L}\p{N}]+/gu)?.slice(0,20);if(!terms?.length)return [];
    const match=terms.map(term=>`"${term}"*`).join(' AND ');
    return this.rows(this.db.prepare('SELECT v.book,v.chapter,v.verse,v.end_verse,v.text FROM verses v JOIN verses_fts f ON f.rowid=v.id WHERE v.translation_id=? AND verses_fts MATCH ? ORDER BY v.book,v.chapter,v.verse LIMIT 100').all(id,match));
  }
  close():void{this.db.close();}
}
