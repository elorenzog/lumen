import { createHash, randomUUID } from 'node:crypto';
import { mkdir, stat, rename, unlink, readFile, writeFile, open } from 'node:fs/promises';
import path from 'node:path';
import ffmpegBinary from 'ffmpeg-static';
import ffprobeBinary from 'ffprobe-static';
import { z } from 'zod';
import { LumenError } from '../src/shared/contracts';
import type { Hymn } from '../src/shared/contracts';
import { encodingOptions } from './media-encoding';
import { assertMediaActive, isCancellationError, run } from './media-process';

const probeSchema = z.object({
  format: z.object({ duration: z.coerce.number().nonnegative() }),
  streams: z.array(z.object({ index: z.number().int(), codec_type: z.string(), codec_name: z.string().optional(), pix_fmt: z.string().optional(), channels: z.number().int().optional(), profile: z.string().optional(), tags: z.object({ title: z.string().optional(), language: z.string().optional() }).optional() })),
});
const completionSchema = z.object({ version: z.literal(2), size: z.number().int().positive() });
export type PreparationContext = { readonly cache: string; readonly status: (message: string) => void; readonly signal?: AbortSignal };
export async function readMediaInfo(file: string, signal?: AbortSignal): Promise<z.infer<typeof probeSchema>> {
  return probeSchema.parse(JSON.parse(await run(ffprobeBinary.path, ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', file], signal ? { signal } : {})));
}
async function removeTemporary(file: string): Promise<void> {
  try { await unlink(file); }
  catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
}
async function cached(target: string): Promise<boolean> {
  try {
    const record = completionSchema.safeParse(JSON.parse(await readFile(`${target}.json`, 'utf8')));
    if (!record.success || (await stat(target)).size !== record.data.size || record.data.size < 12) return false;
    const file = await open(target, 'r');
    try { const header = Buffer.alloc(12); const { bytesRead } = await file.read(header, 0, 12, 0); return bytesRead === 12 && header.toString('ascii', 4, 8) === 'ftyp'; }
    finally { await file.close(); }
  } catch (error) {
    if (error instanceof SyntaxError || (error instanceof Error && 'code' in error && error.code === 'ENOENT')) return false;
    throw error;
  }
}
export async function prepareHymn(hymn: Hymn, track: number, context: PreparationContext): Promise<string> {
  const { cache, status, signal } = context;
  assertMediaActive(signal);
  if (!hymn.tracks.some(item => item.index === track)) throw new LumenError('track', 'Esta pista de audio no existe.');
  const current = await stat(hymn.path);
  const key = createHash('sha256').update(`${hymn.id}:${current.size}:${current.mtimeMs}:${track}:v2`).digest('hex');
  await mkdir(cache, { recursive: true });
  const target = path.join(cache, `${key}.mp4`);
  if (await cached(target)) { assertMediaActive(signal); return target; }
  if (!ffmpegBinary) throw new LumenError('ffmpeg', 'No se encontró FFmpeg para este sistema.');
  const info = await readMediaInfo(hymn.path, signal);
  const video = info.streams.find(stream => stream.codec_type === 'video');
  const audio = info.streams.find(stream => stream.codec_type === 'audio' && stream.index === track);
  if (!video || !audio) throw new LumenError('track', 'El vídeo o la pista seleccionada ya no están disponibles en el archivo.');
  const options = encodingOptions({ codec: video.codec_name ?? '', ...(video.pix_fmt ? { pixelFormat: video.pix_fmt } : {}) }, { codec: audio.codec_name ?? '', ...(audio.channels === undefined ? {} : { channels: audio.channels }), ...(audio.profile ? { profile: audio.profile } : {}) });
  const temporary = `${target}.${randomUUID()}.tmp`;
  const completionTemporary = `${temporary}.json`;
  status(`Preparando ${hymn.number} · ${hymn.title}…`);
  let progress = ''; let lastPercent = -1;
  const onProgress = (chunk: string): void => {
    progress += chunk;
    const lines = progress.split('\n'); progress = lines.pop() ?? '';
    for (const line of lines) {
      const match = /^out_time_us=(\d+)/.exec(line);
      if (!match?.[1] || signal?.aborted) continue;
      const percent = Math.min(99, Math.round(Number(match[1]) / 1e6 / Math.max(1, hymn.duration) * 100));
      if (percent >= lastPercent + 5) { lastPercent = percent; status(`Preparando himno ${hymn.number} · ${percent}%`); }
    }
  };
  const command = (encoding: readonly string[]): readonly string[] => ['-hide_banner', '-loglevel', 'error', '-y', '-i', hymn.path, '-map', '0:v:0', '-map', `0:${track}`, '-sn', '-dn', ...encoding, '-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', '-f', 'mp4', temporary];
  const processOptions = { onProgress, ...(signal ? { signal } : {}) };
  try {
    try { await run(ffmpegBinary, command(options), processOptions); }
    catch (error) {
      if (isCancellationError(error) || signal?.aborted) { assertMediaActive(signal); throw error; }
      if (!(error instanceof LumenError && error.code === 'media') || options[1] !== 'copy') throw error;
      status(`Adaptando el vídeo del himno ${hymn.number}…`);
      await run(ffmpegBinary, command(encodingOptions({ codec: '' }, { codec: '' })), processOptions);
    }
    assertMediaActive(signal);
    const prepared = await readMediaInfo(temporary, signal);
    if (!prepared.streams.some(stream => stream.codec_type === 'video' && stream.codec_name === 'h264') || !prepared.streams.some(stream => stream.codec_type === 'audio' && stream.codec_name === 'aac')) throw new LumenError('media', 'La preparación no produjo vídeo y audio compatibles.');
    const size = (await stat(temporary)).size;
    if (size < 12) throw new LumenError('media', 'La preparación produjo un archivo incompleto.');
    assertMediaActive(signal);
    await writeFile(completionTemporary, JSON.stringify({ version: 2, size }));
    assertMediaActive(signal);
    await rename(temporary, target);
    assertMediaActive(signal);
    await rename(completionTemporary, `${target}.json`);
    assertMediaActive(signal);
    return target;
  } finally { await Promise.all([removeTemporary(temporary), removeTemporary(completionTemporary)]); }
}
