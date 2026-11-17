import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { invoke, snapshot } from './e2e-tauri-native.mjs';

const cwd = process.cwd();
const evidence = path.join(cwd, 'test-results', 'ui-theme');
const profile = await mkdtemp(path.join(tmpdir(), 'lumen-ui-theme-'));
await mkdir(evidence, { recursive: true });
const executable = process.env.LUMEN_E2E_EXECUTABLE ?? path.join(cwd, 'src-tauri/target/debug/lumen.exe');
const errors = [];
const screenshots = [];
let child;
let browser;
let log = '';

async function launch() {
  const server = createServer().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  await new Promise(resolve => server.close(resolve));
  child = spawn(executable, [], { cwd, windowsHide: true, env: {
    ...process.env, LUMEN_DATA_DIR: profile, LUMEN_HEADLESS: '1',
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${address.port}`,
  } });
  child.on('error', error => errors.push(error.message));
  child.stderr.on('data', data => { log = (log + data).slice(-8000); });
  for (let attempt = 0; attempt < 100; attempt++) {
    assert.equal(child.exitCode, null, log);
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${address.port}`, { timeout: 700 });
      break;
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      await delay(150);
    }
  }
  assert.ok(browser, 'Native browser connection');
  const context = browser.contexts()[0];
  assert.ok(context);
  let page;
  for (let attempt = 0; attempt < 100; attempt++) {
    page = context.pages().find(item => item.url() !== 'about:blank' && !item.url().includes('output=1'));
    if (page) break;
    await delay(100);
  }
  assert.ok(page);
  page.on('pageerror', error => errors.push(error.message));
  await page.locator('.brand-name').waitFor();
  return page;
}

async function stop() {
  if (browser) await browser.close();
  browser = undefined;
  if (child && child.exitCode === null) {
    const exited = once(child, 'exit');
    child.kill();
    await exited;
  }
}

async function expectTheme(page, expected) {
  await page.waitForFunction(expected => document.documentElement.dataset.uiTheme === expected, expected);
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme), expected);
}

async function capture(page, name, fullPage = true) {
  const file = `${name}.png`;
  await page.screenshot({ path: path.join(evidence, file), fullPage });
  screenshots.push(file);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${name}: no horizontal page overflow`);
}

try {
  let page = await launch();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expectTheme(page, 'light');
  const original = await snapshot(page);
  assert.equal(await page.locator('.navigation nav [data-action="view-ajustes"]').count(), 0);
  assert.equal(await page.locator('.navigation-tools').evaluate(element => element.lastElementChild.dataset.action === 'view-ajustes' && element.firstElementChild.dataset.action === 'show-help'), true);
  assert.equal(await page.locator('[data-action="view-ajustes"]').evaluate(element => element.getBoundingClientRect().bottom > element.closest('.navigation').getBoundingClientRect().bottom - 40), true, 'Settings anchored at sidebar bottom');
  await page.locator('[data-action="view-ajustes"]').click();
  await page.locator('[data-theme-choice=dark]').focus();
  await page.locator('[data-theme-choice=dark]').click();
  await expectTheme(page, 'dark');
  assert.equal(await page.locator('[data-theme-choice=dark]').evaluate(element => element === document.activeElement), true, 'Theme control retains keyboard focus');
  assert.deepEqual((await snapshot(page)).settings, original.settings, 'Audience appearance and audio settings unchanged');
  for (const theme of ['light', 'dark']) {
    await page.locator(`[data-theme-choice=${theme}]`).click();
    await expectTheme(page, theme);
    for (const view of ['biblia', 'himnario', 'programa', 'ajustes']) {
      await page.locator(`[data-action="view-${view}"]`).click();
      await capture(page, `${theme}-${view}-1280`);
    }
  }
  for (const width of [375, 768]) {
    await page.setViewportSize({ width, height: 900 });
    for (const view of ['biblia', 'himnario', 'programa', 'ajustes']) {
      await page.locator(`[data-action="view-${view}"]`).click();
      await capture(page, `dark-${view}-${width}`);
    }
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const theme of ['light', 'dark']) {
    await page.locator('[data-theme-choice=' + theme + ']').click();
    for (const tab of ['general', 'biblioteca', 'proyeccion', 'remoto', 'acerca']) {
      await page.locator('#settings-tab-' + tab).click();
      assert.equal(await page.locator('[role=tabpanel]').count(), 1);
      assert.equal(await page.locator('.inspector').isVisible(), false);
      await capture(page, `${theme}-settings-${tab}-1280`);
    }
    assert.equal(await page.locator('.developer-profile').count(), 2);
    assert.equal(await page.locator('[data-action="open-credit"][data-id="elorenzog"]').getAttribute('aria-label'), 'Perfil de GitHub de Eliezer Lorenzo');
    assert.equal(await page.locator('[data-action="open-credit"][data-id="xlCyanz"]').getAttribute('title'), 'https://github.com/xlCyanz');
    for (const width of [375, 768]) {
      await page.setViewportSize({ width, height: 900 });
      await capture(page, `${theme}-credits-${width}`);
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.locator('#settings-tab-general').click();
    for (const width of [375, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.locator('[data-action="show-help"]').click();
      await page.locator('#help-dialog[open]').waitFor();
      assert.equal(await page.locator('.help-steps li').count(), 4);
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => Boolean(document.activeElement.closest('#help-dialog'))), true, 'Help traps keyboard focus');
      const beforeHelp = (await snapshot(page)).output;
      await page.keyboard.press('b');
      assert.deepEqual((await snapshot(page)).output, beforeHelp, 'Help reading never triggers projection shortcuts');
      await capture(page, `${theme}-help-${width}`, false);
      await page.keyboard.press('Escape');
      await page.locator('#help-dialog').waitFor({ state: 'detached' });
      assert.equal(await page.evaluate(() => document.activeElement.dataset.action), 'show-help');
      await page.locator('[data-action="show-help"]').click();
      await page.locator('.help-footer [data-action="close-help"]').click();
      await page.locator('#help-dialog').waitFor({ state: 'detached' });
    }
    await page.setViewportSize({ width: 1280, height: 900 });
  }
  await page.locator('#settings-tab-general').focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#settings-tab-biblioteca').getAttribute('aria-selected'), 'true');
  await page.keyboard.press('Home');
  assert.equal(await page.locator('#settings-tab-general').getAttribute('aria-selected'), 'true');
  for (const size of ['large', 'larger', 'normal']) {
    await page.locator('[data-size-choice=' + size + ']').click();
    assert.equal(await page.evaluate(() => document.documentElement.dataset.uiSize), size);
    assert.equal(await page.evaluate(() => Math.abs(document.querySelector('.app-shell').getBoundingClientRect().right - innerWidth) < 2), true, 'Scaled app fills window width');
    await page.locator('[data-action="show-help"]').click();
    assert.equal(await page.locator('#help-dialog').evaluate(element => { const area = element.getBoundingClientRect(); return area.top >= 0 && area.bottom <= innerHeight && area.left >= 0 && area.right <= innerWidth; }), true, 'Help stays within viewport at each interface size');
    await page.keyboard.press('Escape');
    await capture(page, `settings-size-${size}`);
  }
  await page.keyboard.press('Control+=');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.uiSize), 'large');
  await page.keyboard.press('Control+-');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.uiSize), 'normal');
  await page.locator('#settings-tab-remoto').click();
  await page.locator('[data-action=remote-enable]').click();
  await page.locator('.remote-qr svg').waitFor();
  assert.equal(await page.locator('.remote-qr').evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(255, 255, 255)', 'QR retains its white background in dark mode');
  await page.locator('[data-action=remote-disable]').click();
  await page.locator('[data-action=remote-enable]').waitFor();
  await page.locator('#settings-tab-general').click();
  await page.locator('[data-theme-choice=system]').click();
  await page.emulateMedia({ colorScheme: 'light' });
  await expectTheme(page, 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expectTheme(page, 'dark');
  await page.locator('[data-theme-choice=light]').click();
  await expectTheme(page, 'light');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.locator('[data-theme-choice=dark]').click();
  await page.reload();
  await page.locator('.brand-name').waitFor();
  await expectTheme(page, 'dark');
  await invoke(page, { type: 'open-output', displayId: original.displays[0].id });
  let audience;
  for (let attempt = 0; attempt < 50; attempt++) {
    audience = browser.contexts().flatMap(context => context.pages()).find(item => item.url().includes('output=1'));
    if (audience) break;
    await delay(100);
  }
  assert.ok(audience);
  await audience.locator('.stage').waitFor();
  const forbidden = await audience.evaluate(() => window.lumen.invoke({ type: 'open-credit', github: 'elorenzog' }));
  assert.equal(forbidden.ok, false, 'Audience cannot open developer profiles');
  assert.equal(await audience.evaluate(() => document.documentElement.hasAttribute('data-ui-theme')), false, 'Audience independent from UI theme');
  await invoke(page, { type: 'close-output' });
  await stop();
  page = await launch();
  await expectTheme(page, 'dark');
  await page.locator('[data-action="view-ajustes"]').click();
  assert.equal(await page.locator('[data-theme-choice=dark]').getAttribute('aria-pressed'), 'true', 'Preference survives full native restart');
  assert.deepEqual(errors, []);
  await writeFile(path.join(evidence, 'result.json'), JSON.stringify({ status: 'PASS', screenshots, checks: ['light/dark', 'system changes', 'focus', 'no overflow', 'reload', 'native restart persistence', 'unchanged audience appearance'], at: new Date().toISOString() }, null, 2));
  console.log('PASS: native dark mode, system changes, persistence, responsive pages and independent projection.');
} finally {
  await stop();
}
