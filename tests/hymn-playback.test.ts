import { describe, expect, it } from 'vitest';
import { HymnPlayback } from '../electron/hymn-playback';
import { hymnMetadataSchema, welcome } from '../src/shared/contracts';
import type { Hymn, Output } from '../src/shared/contracts';

const hymn = (id: string): Hymn => ({ id, number: id === 'a' ? 1 : 2, title: id, path: `${id}.mkv`, duration: 60, tracks: [{ index: 1, label: 'Cantado', language: 'spa' }, { index: 2, label: 'Instrumental', language: 'und' }], size: 1, modified: 1, ...hymnMetadataSchema.parse({}) });
function scenario() {
  let output: Output = { slide: welcome, preparing: null, connected: true, displayId: 1, blackout: false, playing: false, position: 0, updatedAt: Date.now(), revision: 0 };
  const pending = new Map<string, { resolve: (file: string) => void; reject: (error: Error) => void; signal: AbortSignal }>();
  const revoked: string[] = [];
  const registered: string[] = [];
  const playback = new HymnPlayback({
    current: () => output,
    update: patch => { output = { ...output, ...patch }; },
    prepare: (item, track, signal) => new Promise((resolve, reject) => { pending.set(`${item.id}:${track}`, { resolve, reject, signal }); }),
    register: file => { registered.push(file); return `media:${file}`; },
    revoke: url => { revoked.push(url); }, ready: async () => {}, status: () => {},
  });
  return { playback, pending, revoked, registered, current: () => output, set: (patch: Partial<Output>) => { output = { ...output, ...patch }; } };
}

describe('Given asynchronous hymn preparation', () => {
  it('removes the current player and revokes its source when stopped', () => {
    const state = scenario();
    state.set({ slide: { kind: 'hymn', hymnId: 'a', title: 'a', track: 1, mediaUrl: 'media:a' }, playing: true, position: 10 });
    state.playback.stop();
    expect(state.current()).toMatchObject({ slide: welcome, preparing: null, playing: false, position: 0, revision: 1 });
    expect(state.revoked).toEqual(['media:a']);
  });
  it('does not publish A when A finishes after stop and B', async () => {
    const state = scenario();
    const first = state.playback.play(hymn('a'), 1);
    state.playback.stop();
    const second = state.playback.play(hymn('b'), 1);
    state.pending.get('b:1')?.resolve('b'); await second;
    state.pending.get('a:1')?.resolve('a'); await first;
    expect(state.current().slide).toMatchObject({ kind: 'hymn', hymnId: 'b' });
    expect(state.registered).toEqual(['b']);
    expect(state.pending.get('a:1')?.signal.aborted).toBe(true);
  });
  it('lets the newest play replace a preparation without requiring an intermediate stop', async () => {
    const state = scenario();
    const first = state.playback.play(hymn('a'), 1);
    const second = state.playback.play(hymn('b'), 1);
    state.pending.get('a:1')?.resolve('a'); await first;
    expect(state.current()).toMatchObject({ slide: welcome, preparing: { hymnId: 'b' } });
    state.pending.get('b:1')?.resolve('b'); await second;
    expect(state.current().slide).toMatchObject({ kind: 'hymn', hymnId: 'b' });
  });
  it('releases A immediately while preparing B', async () => {
    const state = scenario();
    state.set({ slide: { kind: 'hymn', hymnId: 'a', title: 'a', track: 1, mediaUrl: 'media:a' }, playing: false, position: 12 });
    const next = state.playback.play(hymn('b'), 1);
    expect(state.current()).toMatchObject({ slide: welcome, playing: false, preparing: { hymnId: 'b' } });
    expect(state.revoked).toEqual(['media:a']);
    state.pending.get('b:1')?.resolve('b'); await next;
    expect(state.current().position).toBe(0);
  });
  it('preserves the paused position when changing the same hymn audio track', async () => {
    const state = scenario();
    state.set({ slide: { kind: 'hymn', hymnId: 'a', title: 'a', track: 1, mediaUrl: 'media:a' }, playing: false, position: 12 });
    const next = state.playback.play(hymn('a'), 2);
    state.pending.get('a:2')?.resolve('a-instrumental'); await next;
    expect(state.current()).toMatchObject({ position: 12, playing: true, slide: { hymnId: 'a', track: 2 } });
  });
  it('starts a previously completed hymn from zero', async () => {
    const state = scenario();
    state.set({ slide: { kind: 'hymn', hymnId: 'a', title: 'a', track: 1, mediaUrl: 'media:a' }, playing: false, position: 60 });
    const next = state.playback.play(hymn('a'), 1);
    state.pending.get('a:1')?.resolve('a'); await next;
    expect(state.current().position).toBe(0);
  });
  it('does not report an obsolete preparation failure after stopping', async () => {
    const state = scenario();
    const next = state.playback.play(hymn('a'), 1);
    state.playback.stop(); state.pending.get('a:1')?.reject(new Error('Cancelled source'));
    await expect(next).resolves.toBeUndefined();
    expect(state.current()).toMatchObject({ slide: welcome, preparing: null, playing: false });
  });
});
