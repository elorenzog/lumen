import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { BrowserWindow } from 'electron';
import { Controller } from '../electron/controller';
import { Store } from '../electron/store';
import { MediaServer } from '../electron/media-server';
import { remoteAdapter } from '../electron/remote-adapter';
import * as mediaTools from '../electron/media';
import { hymnMetadataSchema, welcome } from '../src/shared/contracts';
import type { Hymn } from '../src/shared/contracts';

const preparation = vi.hoisted(() => ({ jobs: new Map<string, { resolve: (file: string) => void; signal: AbortSignal }>() }));
vi.mock('../electron/media', async importOriginal => ({
  ...await importOriginal<typeof import('../electron/media')>(),
  prepareHymn: (hymn: Hymn, _track: number, context: { readonly signal: AbortSignal }) => new Promise<string>(resolve => { preparation.jobs.set(hymn.id, { resolve, signal: context.signal }); }),
}));
vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events');
  class Window extends EventEmitter {
    private destroyed = false;
    readonly webContents = { send: () => {}, setWindowOpenHandler: () => {}, on: () => {} };
    isDestroyed() { return this.destroyed; }
    close() { this.destroyed = true; this.emit('closed'); }
    setFullScreen() {}
    setBounds() {}
    setMenu() {}
    showInactive() {}
  }
  const display = { id: 1, label: 'Display', bounds: { x: 0, y: 0, width: 1280, height: 720 }, size: { width: 1280, height: 720 } };
  return { BrowserWindow: Window, dialog: {}, screen: { getAllDisplays: () => [display], getPrimaryDisplay: () => display } };
});

const hymn: Hymn = { id: 'a', number: 1, title: 'Fixture', path: 'fixture.mkv', duration: 60, tracks: [{ index: 1, label: 'Cantado', language: 'spa' }], size: 1, modified: 1, ...hymnMetadataSchema.parse({}) };
async function scenario(run: (controller: Controller, media: MediaServer, store: Store) => Promise<void>,load:()=>Promise<void>=async()=>{}) {
  const base = path.join(tmpdir(), 'lumen-controller-');
  const directory = await mkdtemp(base);
  const store = new Store(directory); store.saved.hymns = [hymn];
  const media = new MediaServer();
  const controller = new Controller(store, media, new BrowserWindow({ show: false }), load, 'preload');
  controller.output = { ...controller.output, connected: true, displayId: 1, updatedAt: 1000 };
  try { await run(controller, media, store); }
  finally { media.close(); if (!directory.startsWith(base)) throw new Error('Unexpected test directory'); await rm(directory, { recursive: true, force: true }); }
}
afterEach(() => { preparation.jobs.clear(); vi.restoreAllMocks(); });

describe('Given the real controller playback actions', () => {
  it('keeps a remote Stop effective while the first output window is loading',async()=>{
    let started=()=>{};let released=()=>{};const ready=new Promise<void>(resolve=>{started=resolve;});const loading=new Promise<void>(resolve=>{released=resolve;});
    vi.spyOn(mediaTools,'prepareHymn').mockResolvedValue('fixture.mp4');
    await scenario(async controller=>{controller.output.connected=false;const remote=remoteAdapter(controller);const playing=remote.command({type:'hymn',id:'a',track:1});await ready;await remote.command({type:'stop'});released();await playing;expect(controller.output.slide.kind).toBe('welcome');expect(controller.output.preparing).toBeNull();},async()=>{started();await loading;});
  });
  it('keeps the latest remote base-screen request when two commands await the first output',async()=>{
    let started=()=>{};let released=()=>{};const ready=new Promise<void>(resolve=>{started=resolve;});const loading=new Promise<void>(resolve=>{released=resolve;});
    vi.spyOn(mediaTools,'prepareHymn').mockResolvedValue('fixture.mp4');
    await scenario(async controller=>{controller.output.connected=false;const remote=remoteAdapter(controller);const playing=remote.command({type:'hymn',id:'a',track:1});await ready;const base=remote.command({type:'welcome'});released();await Promise.all([playing,base]);expect(controller.output.slide.kind).toBe('welcome');},async()=>{started();await loading;});
  });
  it('does not restart a pending remote hymn after the desktop operator stops it',async()=>{
    let started=()=>{};let released=()=>{};const ready=new Promise<void>(resolve=>{started=resolve;});const loading=new Promise<void>(resolve=>{released=resolve;});
    vi.spyOn(mediaTools,'prepareHymn').mockResolvedValue('fixture.mp4');
    await scenario(async controller=>{controller.output.connected=false;const remote=remoteAdapter(controller);const playing=remote.command({type:'hymn',id:'a',track:1});await ready;await controller.action({type:'stop-hymn'});released();await playing;expect(controller.output.slide.kind).toBe('welcome');},async()=>{started();await loading;});
  });
  it('rejects a base image that is not a managed image without changing settings',async()=>scenario(async(controller,_media,store)=>{
    const previous=structuredClone(store.saved.settings);
    await expect(controller.action({type:'settings',settings:{...previous,baseScreen:{imageId:'f2579f7b-d92d-4838-a78e-d66d942ad573',fit:'contain'}}})).rejects.toThrow('imagen');
    expect(store.saved.settings).toEqual(previous);
  }));
  it('distinguishes pause from stop and revokes the actual source only on stop', async () => scenario(async (controller, media) => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    const url = media.register('a.mp4');
    const slide = { kind: 'hymn' as const, hymnId: hymn.id, title: 'Fixture', track: 1, mediaUrl: url };
    controller.output = { ...controller.output, slide, playing: true, position: 10 };
    await controller.action({ type: 'playback', playing: false, revision: 0 });
    expect(controller.output).toMatchObject({ slide, position: 10, playing: false });
    expect(media.has(url)).toBe(true);
    await controller.action({ type: 'stop-hymn' });
    expect(controller.output).toMatchObject({ slide: welcome, preparing: null, playing: false, position: 0, revision: 1 });
    expect(media.has(url)).toBe(false);
  }));
  it('ignores an ended event from an obsolete revision', async () => scenario(async controller => {
    controller.output = { ...controller.output, slide: { kind: 'hymn', hymnId: hymn.id, title: 'Fixture', track: 1, mediaUrl: 'media:a' }, playing: true, revision: 4 };
    await controller.action({ type: 'playback', ended: true, revision: 3 });
    expect(controller.output).toMatchObject({ playing: true, slide: { kind: 'hymn' }, revision: 4 });
  }));
  it('unloads a completed current hymn rather than leaving its silent last frame', async () => scenario(async (controller, media) => {
    const url = media.register('a.mp4');
    controller.output = { ...controller.output, slide: { kind: 'hymn', hymnId: hymn.id, title: 'Fixture', track: 1, mediaUrl: url }, playing: true, revision: 4 };
    await controller.action({ type: 'playback', ended: true, revision: 4 });
    expect(controller.output).toMatchObject({ slide: welcome, playing: false, position: 0, revision: 5 });
    expect(media.has(url)).toBe(false);
  }));
  it('unloads a failed current source rather than leaving an unplayable silent frame', async () => scenario(async (controller, media) => {
    const url = media.register('a.mp4');
    controller.output = { ...controller.output, slide: { kind: 'hymn', hymnId: hymn.id, title: 'Fixture', track: 1, mediaUrl: url }, playing: true, revision: 4 };
    await controller.action({ type: 'media-error', message: 'Unsupported source', revision: 4 });
    expect(controller.output).toMatchObject({ slide: welcome, preparing: null, playing: false, position: 0, revision: 5 });
    expect(media.has(url)).toBe(false);
  }));
  it('marks output disconnected when closing an already absent window', async () => scenario(async controller => {
    await controller.action({ type: 'close-output' });
    expect(controller.output).toMatchObject({ connected: false, displayId: null, slide: welcome, playing: false });
  }));
  it('cancels the pending hymn when a verse is projected', async () => scenario(async controller => {
    const pending = controller.action({ type: 'play-hymn', id: hymn.id, track: 1 });
    const verse = { kind: 'verse' as const, text: 'Fixture', reference: 'Juan 3:16', translation: 'Test' };
    await controller.action({ type: 'project', slide: verse });
    preparation.jobs.get(hymn.id)?.resolve('a.mp4'); await pending;
    expect(preparation.jobs.get(hymn.id)?.signal.aborted).toBe(true);
    expect(controller.output).toMatchObject({ slide: verse, preparing: null });
  }));
  it('cancels preparation when its hymn is removed from the catalogue', async () => scenario(async (controller, _media, store) => {
    const pending = controller.action({ type: 'play-hymn', id: hymn.id, track: 1 });
    await controller.action({ type: 'remove-hymn', id: hymn.id });
    preparation.jobs.get(hymn.id)?.resolve('a.mp4'); await pending;
    expect(preparation.jobs.get(hymn.id)?.signal.aborted).toBe(true);
    expect(controller.output).toMatchObject({ slide: welcome, preparing: null, playing: false });
    expect(store.saved.hymns).toHaveLength(0);
  }));
  it('cancels preparation and clears output on projection-window close', async () => scenario(async controller => {
    await controller.open(1);
    const pending = controller.action({ type: 'play-hymn', id: hymn.id, track: 1 });
    await controller.action({ type: 'close-output' });
    preparation.jobs.get(hymn.id)?.resolve('a.mp4'); await pending;
    expect(preparation.jobs.get(hymn.id)?.signal.aborted).toBe(true);
    expect(controller.output).toMatchObject({ slide: welcome, preparing: null, playing: false, connected: false });
  }));
});
