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
const notices=[
  ['ffmpeg-static','LICENSE','ffmpeg-static-LICENSE.txt'],
  ['ffmpeg-static',`ffmpeg${extension}.LICENSE`,'ffmpeg-binary-LICENSE.txt'],
  ['ffmpeg-static',`ffmpeg${extension}.README`,'ffmpeg-binary-README.txt'],
  ['ffprobe-static','LICENSE','ffprobe-static-LICENSE.txt'],
  ['ffprobe-static','README.md','ffprobe-static-README.md'],
];
for(const [dependency,file,target] of notices){
  const root=path.dirname(require.resolve(`${dependency}/package.json`));
  await copyFile(path.join(root,file),path.join(directory,target));
}
console.log('Herramientas multimedia nativas preparadas.');
