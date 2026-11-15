import { createHash } from 'node:crypto';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { hymnName } from '../src/shared/domain';
import { LumenError,hymnMetadataSchema } from '../src/shared/contracts';
import type { Hymn } from '../src/shared/contracts';
import { readMediaInfo } from './media-preparation';
export { prepareHymn } from './media-preparation';
export type { PreparationContext } from './media-preparation';
export { run, stopMedia, isCancellationError } from './media-process';

export async function inspectHymn(file: string): Promise<Hymn> {
  const name = hymnName(path.basename(file));
  if (!name) throw new LumenError('hymn-name', `Nombre no reconocido: ${path.basename(file)}. Usa «001 Nombre del himno.mkv».`);
  const info = await stat(file);
  const probe = await readMediaInfo(file);
  if (!probe.streams.some(s=>s.codec_type==='video')) throw new LumenError('video','El MKV no contiene vídeo.');
  const tracks = probe.streams.filter(s=>s.codec_type==='audio').map((s,index)=>({index:s.index,label:s.tags?.title ?? `Audio ${index+1}`,language:s.tags?.language ?? 'und'}));
  if (!tracks.length) throw new LumenError('audio','El MKV no contiene pistas de audio.');
  return {id:createHash('sha256').update(path.resolve(file)).digest('hex').slice(0,24),...name,path:file,duration:probe.format.duration,tracks,size:info.size,modified:info.mtimeMs,...hymnMetadataSchema.parse({})};
}
