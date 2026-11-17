import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { snapshot } from './e2e-tauri-native.mjs';

const cwd = process.cwd();
const evidence = path.join(cwd, 'test-results', 'selects');
const profile = await mkdtemp(path.join(tmpdir(), 'lumen-selects-'));
await mkdir(evidence, { recursive: true });
console.log(`Isolated profile: ${profile}`);
const server = createServer().listen(0, '127.0.0.1');
await once(server, 'listening');
const address = server.address();
assert.ok(address && typeof address === 'object');
await new Promise(resolve => server.close(resolve));
const executable = process.env.LUMEN_E2E_EXECUTABLE ?? path.join(cwd, 'src-tauri/target/debug/lumen.exe');
const child = spawn(executable, [], { cwd, windowsHide: true, env: {
  ...process.env, LUMEN_DATA_DIR: profile, LUMEN_HEADLESS: '1',
  WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${address.port}`,
} });
let browser;
let launchError;
let log = '';
const errors = [];
const captures = [];
child.on('error', error => { launchError = error; });
child.stderr.on('data', data => { log = (log + data).slice(-4000); });

async function capture(page, name) {
  await page.screenshot({ path: path.join(evidence, `${name}.png`), fullPage: true });
  captures.push(name);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${name}: no page overflow`);
}

async function checkSelects(page, name) {
  const selects = page.locator('select:visible');
  assert.ok(await selects.count(), `${name}: visible selects`);
  for (const select of await selects.all()) {
    assert.equal(await select.evaluate(element => getComputedStyle(element).appearance), 'base-select', `${name}: application select`);
    const style = await select.evaluate(element => {
      const picker = getComputedStyle(element, '::picker(select)');
      return { picker: picker.backgroundColor, control: getComputedStyle(element).backgroundColor, radius: picker.borderRadius };
    });
    assert.equal(style.picker, style.control, `${name}: themed menu surface`);
    assert.equal(style.radius, '10px', `${name}: application menu radius`);
  }
}

try {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (launchError) throw launchError;
    assert.equal(child.exitCode, null, log);
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${address.port}`, { timeout: 700 });
      break;
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      await delay(150);
    }
  }
  assert.ok(browser, 'Native WebView2 connection');
  const page = browser.contexts()[0]?.pages()[0];
  assert.ok(page);
  page.on('pageerror', error => errors.push(error.message));
  await page.locator('.brand-name').waitFor();
  console.log(await page.evaluate(() => JSON.stringify({ url: location.href, userAgent: navigator.userAgent, supports: CSS.supports('appearance', 'base-select') })));
  assert.equal(await page.evaluate(() => CSS.supports('appearance', 'base-select')), true, 'Installed WebView2 supports custom pickers');
  const original = await snapshot(page);
  for (const theme of ['light', 'dark']) {
    await page.locator('[data-action="view-ajustes"]').click();
    await page.locator('#settings-tab-general').click();
    await page.locator(`[data-theme-choice=${theme}]`).click();
    for (const width of [375, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.locator('[data-action="view-himnario"]').click();
      await checkSelects(page, `${theme}-hymnal-${width}`);
      const scope = page.locator('#hymn-search-scope');
      await scope.click();
      assert.equal(await scope.evaluate(element => element.matches(':open')), true, 'Custom picker opens');
      const firstOption = scope.locator('option').first();
      await firstOption.hover();
      assert.equal(await firstOption.evaluate(element => getComputedStyle(element).backgroundColor), theme === 'light' ? 'rgb(240, 239, 235)' : 'rgb(37, 46, 58)', 'Hover uses application inset surface');
      await capture(page, `${theme}-hymnal-open-${width}`);
      await page.keyboard.press('Escape');
      assert.equal(await scope.evaluate(element => element.matches(':open')), false, 'Escape dismisses picker');
      assert.equal(await scope.evaluate(element => element === document.activeElement), true, 'Picker restores focus');
      await scope.click();
      await page.keyboard.press('End');
      await page.keyboard.press('Enter');
      assert.equal(await scope.inputValue(), await scope.locator('option').last().getAttribute('value'), 'Keyboard selection survives rerender');
      await page.locator('[data-action="view-biblia"]').click();
      await checkSelects(page, `${theme}-bible-${width}`);
      await page.locator('#translation').click();
      await capture(page, `${theme}-bible-open-${width}`);
      await page.keyboard.press('Escape');
      await page.locator('[data-action="view-ajustes"]').click();
      await page.locator('#settings-tab-proyeccion').click();
      await checkSelects(page, `${theme}-settings-${width}`);
      await page.locator('#display').click();
      await capture(page, `${theme}-settings-open-${width}`);
      await page.keyboard.press('Escape');
      await page.locator('#appearance-options > summary').click();
      await page.locator('[data-action="appearance-open"]').click();
      await page.locator('#appearance-dialog[open]').waitFor();
      await checkSelects(page, `${theme}-appearance-${width}`);
      await page.locator('#ap-fontFamily').click();
      await capture(page, `${theme}-appearance-open-${width}`);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#appearance-dialog').evaluate(element => element.open), true, 'Escape dismisses menu without closing its modal');
      await page.locator('[data-action="appearance-cancel"]').first().click();
      await page.locator('#appearance-options > summary').click();
    }
    await page.setViewportSize({ width: 1280, height: 900 });
  }
  await page.locator('#settings-tab-general').click();
  for (const size of ['large', 'larger', 'normal']) {
    await page.locator(`[data-size-choice=${size}]`).click();
    await page.locator('#settings-tab-proyeccion').click();
    await page.locator('#display').click();
    await capture(page, `dark-settings-${size}`);
    await page.keyboard.press('Escape');
    await page.locator('#settings-tab-general').click();
  }
  assert.deepEqual((await snapshot(page)).output, original.output, 'Browsing selectors never changes live output');
  assert.deepEqual(errors, []);
  await writeFile(path.join(evidence, 'result.json'), JSON.stringify({ status: 'PASS', captures, profile }, null, 2));
  console.log('PASS: themed native selects, light/dark, 375/768/1280, modal, interface sizes, keyboard, focus and unchanged live output.');
} finally {
  if (browser) await browser.close();
  if (child.exitCode === null && child.pid) {
    const exited = once(child, 'exit');
    child.kill();
    await exited;
  }
}
