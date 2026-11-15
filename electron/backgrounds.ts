import { dialog, nativeImage } from 'electron';
import type { BrowserWindow } from 'electron';
import { copyFile, mkdir, stat, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import ffprobe from 'ffprobe-static';
import { z } from 'zod';
import { run } from './media';
import { LumenError } from '../src/shared/contracts';
import type { BackgroundAsset } from '../src/shared/appearance';

export async function importBackground(window:BrowserWindow,directory:string,kind:'image'|'video'):Promise<BackgroundAsset|null>{
  const result=await dialog.showOpenDialog(window,{title:kind==='image'?'Elegir imagen de fondo':'Elegir vídeo de fondo (sin audio)',properties:['openFile'],filters:[{name:kind==='image'?'Imágenes':'Vídeos',extensions:kind==='image'?['png','jpg','jpeg','webp']:['mp4','webm']}]});
  const source=result.filePaths[0];if(result.canceled||!source)return null;
  const info=await stat(source);const extension=path.extname(source).toLowerCase();
  if(!info.isFile()||info.size>(kind==='image'?30:500)*1024*1024)throw new LumenError('background-size','Elige una imagen de hasta 30 MB o un vídeo de hasta 500 MB.');
  const id=randomUUID();const folder=path.join(directory,'backgrounds');await mkdir(folder,{recursive:true});
  let file:string;
  if(kind==='image'){
    if(!['.png','.jpg','.jpeg','.webp'].includes(extension))throw new LumenError('background-format','Usa PNG, JPG o WebP.');
    const image=nativeImage.createFromPath(source);const size=image.getSize();
    if(image.isEmpty()||size.width*size.height>40000000)throw new LumenError('background-image','No se pudo abrir la imagen o supera los 40 megapíxeles.');
    file=`${id}.png`;await writeFile(path.join(folder,file),image.toPNG());
  }else{
    if(!['.mp4','.webm'].includes(extension))throw new LumenError('background-format','Usa MP4 (H.264) o WebM para el fondo de vídeo.');
    const probe=z.object({streams:z.array(z.object({codec_name:z.string()}))}).parse(JSON.parse(await run(ffprobe.path,['-v','error','-select_streams','v:0','-show_entries','stream=codec_name','-of','json',source])));
    const codec=probe.streams[0]?.codec_name;
    if(!codec||!(extension==='.mp4'?['h264','av1']:['vp8','vp9','av1']).includes(codec))throw new LumenError('background-codec','Este vídeo no tiene un formato compatible. Usa MP4 con H.264 o WebM con VP8/VP9.');
    file=`${id}${extension}`;await copyFile(source,path.join(folder,file));
  }
  return {id,name:path.basename(source).slice(0,255),kind,file};
}
