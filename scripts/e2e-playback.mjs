import { _electron as electron } from 'playwright';
import electronPath from 'electron';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';

const baseline = process.env.LUMEN_PLAYBACK_BASELINE === '1';
const data = await mkdtemp(path.join(tmpdir(), 'lumen-playback-'));
const evidence = path.resolve('test-results/hymn-playback-fix', baseline ? 'baseline' : 'current');
await mkdir(evidence, { recursive: true });
const executable = process.env.LUMEN_E2E_EXECUTABLE ?? electronPath;
const failures = [];
let app;
const invoke = (page, action) => page.evaluate(async action => {
  const response = await window.lumen.invoke(action);
  if (!response.ok) throw new Error(response.error);
  return response.data;
}, action);
const state = page => invoke(page, { type: 'snapshot' });
async function fixture(number, color, frequency) {
  const file = path.join(data, `${String(number).padStart(3, '0')} Prueba.mkv`);
  await new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', `color=c=${color}:s=640x360:d=15`, '-f', 'lavfi', '-i', `sine=frequency=${frequency}:duration=15`, '-f', 'lavfi', '-i', `sine=frequency=${frequency * 2}:duration=15`, '-map', '0:v', '-map', '1:a', '-map', '2:a', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', file], { windowsHide: true });
    let error = ''; child.stderr.on('data', chunk => { error += chunk.toString(); });
    child.on('error', reject); child.on('close', code => code === 0 ? resolve() : reject(new Error(error)));
  });
  return { id: `fixture-${number}`, number, title: `Prueba ${number}`, path: file, duration: 15, tracks: [{ index: 1, label: 'Cantado', language: 'spa' }, { index: 2, label: 'Instrumental', language: 'und' }], size: 1, modified: 0, edition: '2009', favorite: false, topic: '', lyrics: '', lyricist: '', composer: '', references: '', sungTrack: 1, instrumentalTrack: 2 };
}
try {
  const hymns = [await fixture(1, 'navy', 440), await fixture(2, 'green', 660)];
  await writeFile(path.join(data, 'library.json'), JSON.stringify({ hymns, program: [], history: [], backgrounds: [], settings: { theme: 'noche', fontSize: 52, autoProject: false, volume: 0.7 } }));
  const env = { ...process.env, LUMEN_DATA_DIR: data, LUMEN_HEADLESS: '1' }; delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ executablePath: executable, args: executable === electronPath ? ['.'] : [], cwd: process.cwd(), env, timeout: 60000 });
  const page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) window.showInactive(); });
  page.on('pageerror', error => failures.push(error.message));
  await page.locator('.brand-name').waitFor();
  await page.setViewportSize({ width: 1500, height: 960 });
  await page.locator('[data-action="view-himnario"]').click();
  await page.locator('.hymn-row').first().click();
  const windowPromise = app.waitForEvent('window');
  const started = performance.now();
  await page.locator('.project-button').click();
  const output = await windowPromise;
  output.on('pageerror', error => failures.push(error.message));
  await output.waitForFunction(() => { const video = document.querySelector('.stage-video'); return video && !video.paused && video.currentTime > 0.4; }, { timeout: 30000 });
  const firstReadyMs = Math.round(performance.now() - started);
  await page.locator('[data-action="toggle-play"]').click();
  await output.waitForFunction(() => document.querySelector('.stage-video')?.paused);
  const paused = (await state(page)).output.position;
  assert.ok(paused > 0, 'Pause retains a nonzero position');
  await page.locator('[data-action="toggle-play"]').click();
  await output.waitForFunction(position => { const video = document.querySelector('.stage-video'); return video && !video.paused && video.currentTime > position; }, paused);
  await page.locator('[data-action="stop"]').click();
  await page.waitForFunction(async () => { const response = await window.lumen.invoke({ type: 'snapshot' }); return response.ok && !response.data.output.playing; });
  if (baseline) {
    await page.screenshot({ path: path.join(evidence, 'stop-before-fix.png') });
    await writeFile(path.join(evidence, 'observed.json'), JSON.stringify({ firstReadyMs, output: (await state(page)).output, mediaElementsAfterStop: await output.locator('.stage-video').count() }, null, 2));
    assert.equal(await output.locator('.stage-video').count(), 0, 'Stopping must unload the previous hymn from the projection');
  }
  await output.locator('.stage-video').waitFor({ state: 'detached' });
  assert.equal((await state(page)).output.slide.kind, 'welcome');
  assert.equal((await state(page)).output.position, 0);
  await page.locator('.hymn-row').nth(1).click();
  await page.locator('.project-button').click();
  await output.waitForFunction(() => { const video = document.querySelector('.stage-video'); return video && !video.paused && !video.muted && video.volume > 0 && video.currentTime > 0.4; });
  assert.equal((await state(page)).output.slide.hymnId, 'fixture-2');
  await page.evaluate(() => { window.__monitorVideo = document.querySelector('[data-live-preview] .stage-video'); window.__hymnRow = document.querySelector('.hymn-row'); });
  await invoke(page, { type: 'playback', playing: false });
  await output.waitForFunction(() => document.querySelector('.stage-video')?.paused);
  assert.equal(await page.evaluate(() => window.__monitorVideo === document.querySelector('[data-live-preview] .stage-video')), true, 'Pause snapshots retain the monitor video element');
  assert.equal(await page.evaluate(() => window.__hymnRow === document.querySelector('.hymn-row')), true, 'Playback snapshots keep the hymn library DOM');
  await invoke(page, { type: 'playback', playing: true });
  await output.waitForFunction(() => !document.querySelector('.stage-video')?.paused);
  await page.locator('.audio-option').nth(1).click();
  await page.waitForFunction(async () => { const response = await window.lumen.invoke({ type: 'snapshot' }); return response.ok && response.data.output.slide.track === 2 && !response.data.output.preparing; });
  await output.waitForFunction(() => { const video = document.querySelector('.stage-video'); return video && !video.paused && video.currentTime > 0.3; });
  let audible = [];
  const audioDeadline = performance.now() + 5000;
  do {
    audible = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter(window => window.webContents.getURL().includes('output=1')).map(window => window.webContents.isCurrentlyAudible()));
    if (audible.some(Boolean)) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  } while (performance.now() < audioDeadline);
  if (!audible.some(Boolean)) {
    await writeFile(path.join(evidence, 'audio-diagnostic.json'), JSON.stringify({
      windows: await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(window => ({ url: window.webContents.getURL(), audible: window.webContents.isCurrentlyAudible(), muted: window.webContents.isAudioMuted(), visible: window.isVisible() }))),
      video: await output.evaluate(() => { const video = document.querySelector('.stage-video'); return video ? { source: video.currentSrc, time: video.currentTime, paused: video.paused, muted: video.muted, volume: video.volume, decodedAudio: video.webkitAudioDecodedByteCount, decodedVideo: video.webkitVideoDecodedByteCount, error: video.error?.message } : null; }),
    }, null, 2));
  }
  assert.ok(audible.some(Boolean), 'Chromium reports decoded audible audio in the projection');
  assert.equal(await page.locator('.inspector #auto-project').count(), 0);
  assert.equal(await page.locator('.inspector #font-size').count(), 0);
  await page.screenshot({ path: path.join(evidence, 'himnario-playing.png') });
  await page.locator('[data-action="view-biblia"]').click();
  assert.equal(await page.locator('.inspector #auto-project').count(), 1);
  await page.screenshot({ path: path.join(evidence, 'biblia-hymn-live.png') });
  await invoke(page, { type: 'stop-hymn' });
  await page.locator('[data-action="view-himnario"]').click();
  await page.screenshot({ path: path.join(evidence, 'himnario-stopped.png') });
  const races = await page.evaluate(async () => Promise.all([
    window.lumen.invoke({ type: 'play-hymn', id: 'fixture-1', track: 1 }),
    window.lumen.invoke({ type: 'stop-hymn' }),
    window.lumen.invoke({ type: 'play-hymn', id: 'fixture-2', track: 2 }),
  ]));
  assert.ok(races.every(result => result.ok), 'Rapid requests cancel older preparation cleanly');
  await page.waitForFunction(async () => { const response = await window.lumen.invoke({ type: 'snapshot' }); return response.ok && response.data.output.slide.hymnId === 'fixture-2' && response.data.output.slide.track === 2 && !response.data.output.preparing; });
  await output.waitForFunction(() => { const video = document.querySelector('.stage-video'); return video && !video.paused && video.currentTime > 0.4; });
  await invoke(page, { type: 'stop-hymn' });
  await output.locator('.stage-video').waitFor({ state: 'detached' });
  await page.setViewportSize({ width: 768, height: 1024 }); await page.screenshot({ path: path.join(evidence, 'himnario-tablet.png'), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.setViewportSize({ width: 375, height: 900 }); await page.screenshot({ path: path.join(evidence, 'himnario-mobile.png'), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  const captures=[];
  for(const [width,height] of [[1500,960],[768,1024],[375,900]]) {
    await page.setViewportSize({width,height});
    for(const view of ['biblia','himnario','programa','ajustes']) {
      await page.locator(`[data-action="view-${view}"]`).click();
      const file=`${view}-${width}.png`;
      await page.screenshot({path:path.join(evidence,file),fullPage:true});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${view} fits ${width}px`);
      captures.push({view,width,height,file});
    }
  }
  await writeFile(path.join(evidence,'captures.json'),JSON.stringify(captures,null,2));
  assert.deepEqual(failures, []);
  await writeFile(path.join(evidence, 'result.json'), JSON.stringify({ result: 'PASS', firstReadyMs, pausedPosition: paused, audible, scenarios: ['pause/resume', 'stop unload', 'next hymn starts with audio', 'monitor DOM identity', 'audio track switch', 'Bible/hymnal contextual controls', 'rapid A-stop-B', 'responsive 375/768/1500'], rendererErrors: failures }, null, 2));
  console.log('PASS: stop, pause, switching, real audible audio, retained monitor and contextual controls.');
} finally { await app?.close(); await rm(data, { recursive: true, force: true }); }
