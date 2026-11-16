import { copyFile, mkdir, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const require=createRequire(import.meta.url);
const directory=path.resolve('src-tauri/tools');
await mkdir(directory,{recursive:true});
const extension=process.platform==='win32'?'.exe':'';
const binaries=[['ffmpeg',require('ffmpeg-static')],['ffprobe',require('ffprobe-static').path]];
for(const [name,source] of binaries){
  if(typeof source!=='string')throw new Error(`No se encontró ${name} para este sistema.`);
  const target=path.join(directory,`${name}${extension}`);
  let current;
  try{current=await stat(target);}catch(error){if(!(error instanceof Error&&'code'in error&&error.code==='ENOENT'))throw error;}
  if(current?.size!==(await stat(source)).size)await copyFile(source,target);
}
console.log('Herramientas multimedia nativas preparadas.');
