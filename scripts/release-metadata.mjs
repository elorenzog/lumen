import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';

const args = process.argv.slice(2);
const unsigned = args.includes('--unsigned');
assert.ok(args.every(arg => !arg.startsWith('--') || arg === '--unsigned'), 'Unknown option');
const positional = args.filter(arg => arg !== '--unsigned');
assert.ok(positional.length <= 2, 'Usage: release-metadata.mjs [NSIS directory] [output directory] [--unsigned]');
const source = path.resolve(positional[0] ?? 'src-tauri/target/release/bundle/nsis');
const output = path.resolve(positional[1] ?? 'release/tauri');
assert.notEqual(source, output, 'Source and output directories must differ');
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
assert.match(version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, 'Invalid release version');
const repository = process.env.GITHUB_REPOSITORY ?? 'elorenzog/lumen';
assert.match(repository, /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, 'Invalid GitHub repository');
const installers = (await readdir(source)).filter(file => file.endsWith('.exe'));
assert.equal(installers.length, 1, 'Expected exactly one NSIS installer');
const [installer] = installers;
assert.ok(installer.includes(`_${version}_x64-setup.exe`), 'Expected the current Windows x64 NSIS installer');

const changelog = (await readFile('CHANGELOG.md', 'utf8')).replaceAll('\r\n', '\n');
const section = changelog.split(`## ${version}\n`)[1]?.split('\n## ')[0]?.trim();
assert.ok(section, 'CHANGELOG section missing');
const signatureFile = `${installer}.sig`;
const signature = unsigned ? undefined : (await readFile(path.join(source, signatureFile), 'utf8')).trim();
if (!unsigned) assert.ok(signature?.length, 'Updater signature is empty');
const notes = `${section}\n\n### Instalación y actualizaciones\n\n` +
  'La primera instalación de Tauri se realiza manualmente. Las versiones 0.8.x no pueden usar este canal. ' +
  'Las siguientes actualizaciones Tauri verifican la firma con la clave pública incluida en LUMEN.\n\n' +
  'Se incluyen RV1909 y BLL. Las demás Biblias se importan desde archivos locales; los videos de himnos no se distribuyen.\n\n' +
  'Las sumas SHA-256 están en SHA256SUMS.txt. La firma del actualizador no es un certificado Authenticode de Windows.\n' +
  (unsigned ? '\nCompilación de revisión sin firma del actualizador: no publicar como actualización automática.\n' : '');

await mkdir(output, { recursive: true });
assert.equal((await readdir(output)).length, 0, 'Output directory must be empty; use a new directory for each build');
await copyFile(path.join(source, installer), path.join(output, installer));
await writeFile(path.join(output, 'release-notes.md'), notes);
const assets = [installer, 'release-notes.md'];
if (!unsigned) {
  await copyFile(path.join(source, signatureFile), path.join(output, signatureFile));
  const manifest = {
    version,
    notes: section,
    pub_date: new Date().toISOString(),
    platforms: {
      'windows-x86_64': {
        url: `https://github.com/${repository}/releases/download/v${version}/${encodeURIComponent(installer)}`,
        signature,
      },
    },
  };
  await writeFile(path.join(output, 'latest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  assets.push(signatureFile, 'latest.json');
}
const checksums = [];
for (const file of assets.sort()) {
  const bytes = await readFile(path.join(output, file));
  checksums.push(`${createHash('sha256').update(bytes).digest('hex')}  ${file}`);
}
await writeFile(path.join(output, 'SHA256SUMS.txt'), `${checksums.join('\n')}\n`);
console.log(`Tauri ${version}: ${unsigned ? 'unsigned review' : 'signed updater'} metadata prepared.`);
