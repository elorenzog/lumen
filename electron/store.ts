import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { defaults, savedSchema, bibleSchema, LumenError } from '../src/shared/contracts';
import type { Bible, BibleInfo, Hymn, OldHymnCatalogEntry, Saved } from '../src/shared/contracts';
import { BibleDatabase } from './bible-database';
import { annotateHymnNumbering, parseNumberingCatalog } from './hymn-numbering';
import type { HymnNumberingCatalog } from './hymn-numbering';
import { parseOldHymnCatalog } from './old-hymn-catalog';

export class Store {
  saved: Saved = structuredClone(defaults);
  oldHymnCatalog: readonly OldHymnCatalogEntry[] = [];
  private database: BibleDatabase|undefined;
  private numberingCatalog: HymnNumberingCatalog|undefined;
  private writes = Promise.resolve();
  constructor(readonly directory: string) {}
  async initialize(bundledBible: string): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    this.database=new BibleDatabase(path.join(this.directory,'translations.sqlite'));
    let original: string|undefined;
    try { original=await readFile(path.join(this.directory,'library.json'),'utf8');this.saved = savedSchema.parse(JSON.parse(original)); }
    catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw new LumenError('library', 'No se pudo leer la biblioteca guardada. No se sobrescribió. Revisa library.json en los datos de LUMEN.');
    }
    const bundled = bibleSchema.parse(JSON.parse(await readFile(bundledBible,'utf8')));
    if(!this.database.has(bundled.id))this.database.add({...bundled,provenance:{provider:'ebible',rights:'public-domain',offline:'allowed',redistribution:'allowed',attribution:'Reina-Valera 1909 · eBible.org',licenseUrl:'https://ebible.org/spaRV1909/copyright.htm',retrievedAt:Date.now()}});
    const second=bibleSchema.parse(JSON.parse(await readFile(path.join(path.dirname(bundledBible),'bll.json'),'utf8')));
    if(!this.database.has(second.id))this.database.add(second);
    const { readdir } = await import('node:fs/promises');
    for (const file of await readdir(this.directory)) {
      if (file.startsWith('bible-') && file.endsWith('.json')) {
        const bible = bibleSchema.parse(JSON.parse(await readFile(path.join(this.directory,file),'utf8')));
        if(!this.database.has(bible.id))this.database.add(bible);
      }
    }
    try { this.numberingCatalog=parseNumberingCatalog(JSON.parse(await readFile(path.join(path.dirname(bundledBible),'hymn-numbering.json'),'utf8'))); }
    catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
    try { this.oldHymnCatalog=parseOldHymnCatalog(JSON.parse(await readFile(path.join(path.dirname(bundledBible),'hymnal-1962.json'),'utf8'))); }
    catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
    const hymns=this.annotateHymns(this.saved.hymns);
    if(hymns.some((hymn,index)=>hymn!==this.saved.hymns[index])){
      if(original!==undefined){
        const backups=path.join(this.directory,'backups');await mkdir(backups,{recursive:true});
        await writeFile(path.join(backups,`library-before-numbering-${randomUUID()}.json`),original,{encoding:'utf8',flag:'wx'});
      }
      await this.save({...this.saved,hymns});
    }
  }
  async save(value: Saved): Promise<void> {
    this.saved = value;
    const serialized = JSON.stringify(value);
    const file = path.join(this.directory,'library.json');
    const write = this.writes.then(async () => { await writeFile(`${file}.tmp`, serialized,'utf8'); await rename(`${file}.tmp`,file); });
    this.writes = write.catch((error: unknown) => { if (!(error instanceof Error)) throw error; });
    await write;
  }
  async addBible(bible: Bible): Promise<void> {
    if(!this.database)throw new LumenError('database','La base de traducciones no está abierta.');
    this.database.add(bible);
  }
  annotateHymns(hymns:readonly Hymn[]):Hymn[]{return this.numberingCatalog?annotateHymnNumbering(hymns,this.numberingCatalog):[...hymns];}
  bible(id:string):Bible|undefined{return this.database?.get(id);}
  search(id:string,query:string){return this.database?.search(id,query)??[];}
  infos(): BibleInfo[] { return this.database?.infos()??[]; }
  close():void{this.database?.close();this.database=undefined;}
}
