import { readdir,readFile,stat } from 'node:fs/promises';
import path from 'node:path';
import { LumenError,bibleSchema } from '../src/shared/contracts';
import type { Bible } from '../src/shared/contracts';

type Destination={readonly has:(id:string)=>boolean;readonly install:(bible:Bible)=>Promise<void>;readonly status:(message:string)=>void};
export async function importBibleDirectory(directory:string,destination:Destination):Promise<{readonly imported:number;readonly skipped:number;readonly errors:readonly string[]}>{
  const files=(await readdir(directory,{withFileTypes:true})).filter(entry=>entry.isFile()&&entry.name.toLowerCase().endsWith('.json')&&entry.name!=='catalog.json');
  if(!files.length)throw new LumenError('bible-folder','La carpeta no contiene Biblias JSON de LUMEN.');
  if(files.length>100)throw new LumenError('bible-folder','Importa como máximo 100 Biblias por carpeta.');
  let imported=0;let skipped=0;const errors:string[]=[];
  for(const [index,file]of files.entries()){
    try{const full=path.join(directory,file.name);if((await stat(full)).size>40_000_000)throw new LumenError('bible-size','La Biblia supera el límite de 40 MB.');const bible=bibleSchema.parse(JSON.parse(await readFile(full,'utf8')));if(destination.has(bible.id))skipped++;else{await destination.install(bible);imported++;}}
    catch(error){if(error instanceof Error)errors.push(`${file.name}: ${error.message}`);else throw error;}
    destination.status(`Importando Biblias · ${index+1}/${files.length}`);
  }
  return {imported,skipped,errors};
}
