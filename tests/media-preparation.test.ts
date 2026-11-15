import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import ffmpeg from 'ffmpeg-static';
import { z } from 'zod';
import { inspectHymn, prepareHymn, run } from '../electron/media';
import { readMediaInfo } from '../electron/media-preparation';
import type { Hymn } from '../src/shared/contracts';

vi.mock('node:fs/promises', async importOriginal => {
  const original = await importOriginal<typeof import('node:fs/promises')>();
  return { ...original, rename: vi.fn(original.rename) };
});

let directory = '';
let hymn: Hymn;
beforeAll(async () => {
  if (!ffmpeg) throw new Error('FFmpeg fixture binary unavailable');
  directory = await mkdtemp(path.join(os.tmpdir(), 'lumen-media-'));
  const file = path.join(directory, '001 Fixture dos pistas.mkv');
  await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=160x90:r=10:d=8', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=8', '-f', 'lavfi', '-i', 'sine=frequency=880:duration=8', '-map', '0:v', '-map', '1:a', '-map', '2:a', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a:0', 'aac', '-c:a:1', 'libmp3lame', '-shortest', file]);
  hymn = await inspectHymn(file);
}, 20000);
afterAll(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });

describe('Given a local MKV with H264 and two audio tracks', () => {
  it('prepares one selected AAC track as a readable MP4 and reuses the completed cache', async () => {
    const messages: string[] = [];
    const context = { cache: path.join(directory, 'aac'), status: (value: string) => messages.push(value) };
    const result = await prepareHymn(hymn, 1, context);
    const ready = await readMediaInfo(result);
    const before = await stat(result);
    messages.length = 0;
    const reused = await prepareHymn(hymn, 1, context);
    expect(ready.streams.map(stream => stream.codec_name)).toEqual(['h264', 'aac']);
    expect(reused).toBe(result);
    expect((await stat(reused)).mtimeMs).toBe(before.mtimeMs);
    expect(messages).toEqual([]);
  });
  it('prepares the MP3 instrumental as AAC while preserving the source video packets', async () => {
    if (!ffmpeg) throw new Error('FFmpeg fixture binary unavailable');
    const target = await prepareHymn(hymn, 2, { cache: path.join(directory, 'mp3'), status: () => {} });
    const result = await readMediaInfo(target);
    const sourceVideo = await run(ffmpeg, ['-v', 'error', '-i', hymn.path, '-map', '0:v:0', '-c:v', 'copy', '-bsf:v', 'h264_mp4toannexb', '-f', 'hash', '-hash', 'sha256', '-']);
    const targetVideo = await run(ffmpeg, ['-v', 'error', '-i', target, '-map', '0:v:0', '-c:v', 'copy', '-bsf:v', 'h264_mp4toannexb', '-f', 'hash', '-hash', 'sha256', '-']);
    expect(result.streams.map(stream => stream.codec_name)).toEqual(['h264', 'aac']);
    expect(targetVideo.trim()).toBe(sourceVideo.trim());
  });
  it('rebuilds a truncated nonempty cache instead of replaying damaged media', async () => {
    const context = { cache: path.join(directory, 'damaged'), status: () => {} };
    const target = await prepareHymn(hymn, 1, context);
    await writeFile(target, 'damaged cache');
    const rebuilt = await prepareHymn(hymn, 1, context);
    expect(rebuilt).toBe(target);
    expect((await readMediaInfo(rebuilt)).streams.map(stream => stream.codec_name)).toEqual(['h264', 'aac']);
  });
  it('publishes concurrent preparations once without replacing media already available for playback', async () => {
    const cache = path.join(directory, 'concurrent');
    const before = vi.mocked(rename).mock.calls.length;
    const results = await Promise.all([prepareHymn(hymn, 1, { cache, status: () => {} }), prepareHymn(hymn, 1, { cache, status: () => {} })]);
    expect(results[0]).toBe(results[1]);
    expect(vi.mocked(rename).mock.calls.slice(before).filter(([, target]) => target === results[0])).toHaveLength(1);
    expect((await readMediaInfo(results[0])).streams.map(stream => stream.codec_name)).toEqual(['h264', 'aac']);
    expect((await readdir(cache)).some(name => name.includes('.tmp'))).toBe(false);
  });
  it('allows another concurrent request to finish after a cache writer fails', async () => {
    const cache = path.join(directory, 'failed-writer');
    vi.mocked(rename).mockImplementationOnce(async () => { throw Object.assign(new Error('Publication denied'), { code: 'EPERM' }); });
    const results = await Promise.allSettled([prepareHymn(hymn, 1, { cache, status: () => {} }), prepareHymn(hymn, 1, { cache, status: () => {} })]);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    const ready = results.find(result => result.status === 'fulfilled');
    if (!ready || ready.status !== 'fulfilled') throw new Error('No preparation survived the failed writer');
    expect((await readMediaInfo(ready.value)).streams.map(stream => stream.codec_name)).toEqual(['h264', 'aac']);
    expect((await readdir(cache)).some(name => name.includes('.tmp'))).toBe(false);
  });
  it('keeps cancellation independent when two requests prepare the same track', async () => {
    const controller = new AbortController();
    const cache = path.join(directory, 'independent-cancel');
    const cancelled = prepareHymn(hymn, 2, { cache, signal: controller.signal, status: value => { if (value.endsWith('%')) controller.abort(); } });
    const survivor = prepareHymn(hymn, 2, { cache, status: () => {} });
    await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
    expect((await readMediaInfo(await survivor)).streams.map(stream => stream.codec_name)).toEqual(['h264', 'aac']);
    expect((await readdir(cache)).some(name => name.includes('.tmp'))).toBe(false);
  });
  it('cleans an aborted preparation before a new request can reuse its cache', async () => {
    const controller = new AbortController();
    const cache = path.join(directory, 'cancel');
    const cancelled = prepareHymn(hymn, 2, { cache, signal: controller.signal, status: value => { if (value.endsWith('%')) controller.abort(); } });
    await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
    expect(await readdir(cache)).toEqual([]);
    const next = await prepareHymn(hymn, 2, { cache, status: () => {} });
    expect((await readMediaInfo(next)).streams.map(stream => stream.codec_name)).toEqual(['h264', 'aac']);
  });
  it('transcodes a different video codec when stream copy is not playable', async () => {
    if (!ffmpeg) throw new Error('FFmpeg fixture binary unavailable');
    const source = path.join(directory, '002 Fixture MPEG4.mkv');
    await run(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=160x90:r=10:d=2', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=2', '-map', '0:v', '-map', '1:a', '-c:v', 'mpeg4', '-c:a', 'aac', '-shortest', source]);
    const other = await inspectHymn(source);
    const target = await prepareHymn(other, 1, { cache: path.join(directory, 'mpeg4'), status: () => {} });
    expect((await readMediaInfo(target)).streams.map(stream => stream.codec_name)).toEqual(['h264', 'aac']);
  });
});

describe('Given an active multimedia subprocess', () => {
  it('terminates the actual child and rejects only after it has exited when cancelled', async () => {
    const controller = new AbortController();
    let started = ''; let childPid: number | undefined;
    const pending = run(process.execPath, ['-e', "process.stdout.write(JSON.stringify({pid:process.pid})+'\\n');setInterval(()=>{},1000)"], {
      signal: controller.signal,
      onProgress: chunk => {
        started += chunk;
        if (started.includes('\n')) { childPid = z.object({ pid: z.number().positive() }).parse(JSON.parse(started)).pid; controller.abort(); }
      },
    });
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    const terminated = childPid;
    if (terminated === undefined) throw new Error('Fixture did not start');
    expect(() => process.kill(terminated, 0)).toThrow();
  });
});
