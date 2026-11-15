import { readFile,stat } from 'node:fs/promises';
import path from 'node:path';
import { unzipSync,strFromU8 } from 'fflate';
import { randomUUID } from 'node:crypto';
import { importBible } from './imports';
import { usfmBible } from './usfm';
import { LumenError } from '../src/shared/contracts';
import type { Bible } from '../src/shared/contracts';

export async function importBibleFiles(files:readonly string[]):Promise<Bible>{
  const first=files[0];if(!first)throw new LumenError('file','Selecciona un archivo.');
  for(const file of files){if((await stat(file)).size>40_000_000)throw new LumenError('size','Cada archivo debe medir menos de 40 MB.');}
  const id=randomUUID();
  if(files.length===1&&/\.(json|xml)$/i.test(first))return importBible(await readFile(first,'utf8'),path.basename(first),id);
  let source:{name:string;content:string}[]=[];
  if(files.length===1&&first.toLowerCase().endsWith('.zip')){
    let total=0;let count=0;
    const archive=unzipSync(await readFile(first),{filter:entry=>{
      if(!/\.(usfm|sfm)$/i.test(entry.name))return false;
      total+=entry.originalSize;count++;
      if(total>80_000_000||entry.originalSize>10_000_000||count>100)throw new LumenError('zip-size','El paquete USFM excede el tamaño o número de libros admitido.');
      return true;
    }});
    source=Object.entries(archive).map(([name,data])=>({name,content:strFromU8(data)}));
  }else{
    if(files.some(file=>!(/\.(usfm|sfm)$/i.test(file))))throw new LumenError('files','Selecciona un JSON/XML, un ZIP USFM o varios archivos USFM de la misma traducción.');
    source=await Promise.all(files.map(async file=>({name:path.basename(file),content:await readFile(file,'utf8')})));
    if(source.reduce((sum,file)=>sum+file.content.length,0)>80_000_000)throw new LumenError('usfm-size','El lote USFM supera 80 MB.');
  }
  if(!source.length)throw new LumenError('zip-usfm','No se encontraron archivos .usfm o .sfm en el paquete.');
  const name=files.length>1?path.basename(path.dirname(first)):path.basename(first).replace(/\.(zip|usfm|sfm)$/i,'');
  return usfmBible(source,name,id);
}
