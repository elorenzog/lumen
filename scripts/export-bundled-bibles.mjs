import { DatabaseSync } from 'node:sqlite';
import { mkdir,writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const input=path.resolve(process.argv[2]??'recovery-profile/translations.sqlite');
const output=path.resolve(process.argv[3]??'Biblias-para-importar');await mkdir(output,{recursive:true});
const database=new DatabaseSync(input,{readOnly:true});const entries=[];
try{
  const rows=database.prepare('SELECT id,metadata FROM translations ORDER BY id').all();
  for(const row of rows){
    if(typeof row.id!=='string'||!/^[A-Za-z0-9_-]+$/.test(row.id)||typeof row.metadata!=='string')throw new Error('Invalid translation metadata.');
    const metadata=JSON.parse(row.metadata);
    if(typeof metadata.source==='string'&&/^(?:[A-Za-z]:[\\/]|file:|\\\\)/.test(metadata.source))metadata.source=`Importación local · ${path.win32.basename(metadata.source)}`;
    const verses=database.prepare('SELECT book,chapter,verse,end_verse,text FROM verses WHERE translation_id=? ORDER BY book,chapter,verse').all(row.id).map(({end_verse,...verse})=>({...verse,...(end_verse===null?{}:{endVerse:end_verse})}));
    const bytes=JSON.stringify({...metadata,verses});const file=`${row.id}.json`;await writeFile(path.join(output,file),bytes);
    entries.push({id:row.id,name:metadata.name,abbreviation:metadata.abbreviation,file,count:verses.length,sha256:createHash('sha256').update(bytes).digest('hex')});
  }
}finally{database.close();}
await writeFile(path.join(output,'catalog.json'),JSON.stringify({version:1,translations:entries},null,2));
console.log(JSON.stringify({count:entries.length,translations:entries.map(({id,abbreviation,count})=>({id,abbreviation,count}))}));
