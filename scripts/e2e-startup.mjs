import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { once } from 'node:events';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { invoke, snapshot } from './e2e-tauri-native.mjs';

const run = promisify(execFile);
const cwd = process.cwd();
const executable = path.join(cwd, 'src-tauri/target/debug/lumen.exe');
const profile = await mkdtemp(path.join(tmpdir(), 'lumen-startup-'));
const key = `Software\\LUMEN\\Tests\\Startup\\${randomUUID()}`;
const evidence = path.join(cwd, 'test-results/startup');
await mkdir(evidence, { recursive: true });
console.log(`Isolated profile: ${profile}\nIsolated registry key: HKCU\\${key}`);
let child;
let browser;
const errors = [];

async function launch(startup = false) {
  const server = createServer().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  await new Promise(resolve => server.close(resolve));
  child = spawn(executable, startup ? ['--autostart', '--profile', profile] : [], {
    cwd, windowsHide: true, env: { ...process.env,
      LUMEN_DATA_DIR: startup ? path.join(profile, 'wrong-profile') : profile,
      LUMEN_HEADLESS: startup ? '0' : '1', LUMEN_E2E_STARTUP_KEY: key,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${address.port}`,
    },
  });
  child.on('error', error => errors.push(error.message));
  for (let attempt = 0; attempt < 100; attempt++) {
    assert.equal(child.exitCode, null);
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${address.port}`, { timeout: 700 });
      break;
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      await delay(150);
    }
  }
  assert.ok(browser);
  const page = browser.contexts()[0]?.pages()[0];
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

try {
  let page = await launch();
  const original = await snapshot(page);
  assert.deepEqual(original.startup, { supported: true, enabled: false, error: null });
  await page.locator('[data-action="view-ajustes"]').click();
  await invoke(page, { type: 'startup-preference', enabled: true });
  await page.waitForFunction(() => document.querySelector('#start-with-windows')?.checked === true, null, { timeout: 3000 });
  await invoke(page, { type: 'startup-preference', enabled: false });
  await page.waitForFunction(() => document.querySelector('#start-with-windows')?.checked === false, null, { timeout: 3000 });
  await page.locator('#settings-tab-acerca').click();
  await invoke(page, { type: 'update-preference', checkAtStartup: false });
  await page.waitForFunction(() => document.querySelector('#check-updates-startup')?.checked === false);
  await invoke(page, { type: 'update-preference', checkAtStartup: true });
  await page.waitForFunction(() => document.querySelector('#check-updates-startup')?.checked === true);
  assert.equal(await page.locator('#settings-tab-acerca').getAttribute('aria-selected'), 'true', 'Backend changes retain the active settings tab');
  await page.locator('#settings-tab-general').click();
  await page.locator('#start-with-windows').check();
  await page.waitForFunction(() => document.querySelector('#start-with-windows')?.disabled === false);
  assert.equal((await snapshot(page)).startup.enabled, true);
  const registration = await run('reg.exe', ['query', `HKCU\\${key}`, '/v', 'LUMEN'], { windowsHide: true });
  assert.ok(registration.stdout.includes(`"${executable}" --autostart --profile "${profile}"`));
  await page.reload();
  await page.locator('[data-action="view-ajustes"]').click();
  assert.equal(await page.locator('#start-with-windows').isChecked(), true, 'OS registration survives reload');
  for (const theme of ['light', 'dark']) {
    await page.locator(`[data-theme-choice=${theme}]`).click();
    for (const width of [375, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.locator('#start-with-windows').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(evidence, `${theme}-${width}.png`), fullPage: true });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    }
  }
  await page.locator('#start-with-windows').uncheck();
  await page.waitForFunction(() => document.querySelector('#start-with-windows')?.disabled === false);
  assert.equal((await snapshot(page)).startup.enabled, false);
  const after = await snapshot(page);
  assert.deepEqual(after.settings, original.settings);
  assert.deepEqual(after.output, original.output);
  assert.equal(after.remote.enabled, false);
  await stop();
  page = await launch(true);
  // Native window state is checked before CDP viewport changes can restore a window.
  const probe = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    `Add-Type -Namespace LumenTest -Name Window -MemberDefinition '[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool IsIconic(System.IntPtr hWnd);'; $p=Get-Process -Id ${child.pid}; [LumenTest.Window]::IsIconic($p.MainWindowHandle)`], { windowsHide: true });
  assert.equal(probe.stdout.trim(), 'True', 'Autostart is genuinely minimized in the Windows taskbar');
  const started = await snapshot(page);
  assert.equal(started.output.connected, false);
  assert.equal(started.remote.enabled, false);
  assert.deepEqual(started.bibles, original.bibles);
  assert.equal(await page.evaluate(() => localStorage.getItem('lumen.ui-theme')), 'dark', 'Explicit startup profile retains the same WebView preferences');
  await invoke(page, { type: 'startup-preference', enabled: false });
  assert.deepEqual(errors, []);
  await writeFile(path.join(evidence, 'result.json'), JSON.stringify({ status: 'PASS', profile, key, checks: ['enable/disable', 'same profile', 'native minimized state', 'no output/remote', 'six responsive theme captures'] }, null, 2));
  console.log('PASS: reversible per-user startup, actual minimized window, same profile, projection/remote closed.');
} finally {
  await stop();
  const cleanup = await run('reg.exe', ['delete', `HKCU\\${key}`, '/f'], { windowsHide: true }).catch(error => {
    if (error instanceof Error) console.warn('Temporary registry cleanup needs checking:', error.message);
    else throw error;
  });
  void cleanup;
}
