import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const installer = `LUMEN_${version}_x64-setup.exe`;

async function fixture(context, signature = 'c2lnbmF0dXJl') {
  const directory = await mkdtemp(path.join(tmpdir(), 'lumen-release-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const source = path.join(directory, 'nsis');
  const output = path.join(directory, 'release');
  await mkdir(source);
  await writeFile(path.join(source, installer), 'fixture installer bytes');
  if (signature !== null) await writeFile(path.join(source, `${installer}.sig`), `${signature}\n`);
  return { source, output, signature };
}

function generate({ source, output }, unsigned = false) {
  return spawnSync(process.execPath, [
    'scripts/release-metadata.mjs', source, output, ...(unsigned ? ['--unsigned'] : []),
  ], { encoding: 'utf8', env: { ...process.env, GITHUB_REPOSITORY: 'elorenzog/lumen' } });
}

test('generates Tauri feed from the actual installer signature and hashes published bytes', async context => {
  // Given an NSIS bundle and its generated signature.
  const files = await fixture(context);
  // When preparing the release.
  const result = generate(files);
  // Then the updater references these exact bytes and the versioned release URL.
  assert.equal(result.status, 0, result.stderr);
  const manifest = JSON.parse(await readFile(path.join(files.output, 'latest.json'), 'utf8'));
  assert.equal(manifest.version, version);
  assert.equal(manifest.platforms['windows-x86_64'].signature, files.signature);
  assert.equal(manifest.platforms['windows-x86_64'].url,
    `https://github.com/elorenzog/lumen/releases/download/v${version}/${installer}`);
  assert.ok(Number.isFinite(Date.parse(manifest.pub_date)));
  assert.ok(manifest.notes.length > 0);
  const sums = await readFile(path.join(files.output, 'SHA256SUMS.txt'), 'utf8');
  for (const line of sums.trim().split('\n')) {
    const [hash, name] = line.split('  ');
    const bytes = await readFile(path.join(files.output, name));
    assert.equal(hash, createHash('sha256').update(bytes).digest('hex'));
  }
  assert.match(sums, /latest\.json/);
  assert.match(sums, /\.exe\.sig/);
});

test('rejects a signed release when its installer signature is missing', async context => {
  // Given an installer without a signature.
  const files = await fixture(context, null);
  // When preparing a signed release.
  const result = generate(files);
  // Then no update manifest is produced.
  assert.notEqual(result.status, 0);
  await assert.rejects(readFile(path.join(files.output, 'latest.json')));
});

test('prepares an unsigned review artifact without an updater manifest or signature', async context => {
  // Given an unsigned installer.
  const files = await fixture(context, null);
  // When explicitly preparing an unsigned review artifact.
  const result = generate(files, true);
  // Then the output is a checksummed installer without an automatic update feed.
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual((await readdir(files.output)).sort(), [installer, 'SHA256SUMS.txt', 'release-notes.md'].sort());
});
