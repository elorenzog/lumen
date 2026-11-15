import { readFile,readdir,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';

const directory=path.resolve(process.argv[2]??'release');const {version}=JSON.parse(await readFile('package.json','utf8'));
const files=(await readdir(directory)).filter(file=>/\.(exe|blockmap)$/.test(file)||file==='latest.yml').sort();
assert.ok(files.includes(`LUMEN-Setup-${version}-x64.exe`),'Installer missing');
assert.ok(files.includes(`LUMEN-Portable-${version}-x64.exe`),'Portable missing');assert.ok(files.includes('latest.yml'),'Updater manifest missing');
const lines=[];for(const file of files)lines.push(`${createHash('sha256').update(await readFile(path.join(directory,file))).digest('hex')}  ${file}`);
await writeFile(path.join(directory,'SHA256SUMS.txt'),`${lines.join('\n')}\n`);
const changelog=await readFile('CHANGELOG.md','utf8');const heading=`## ${version}`;const section=changelog.split(heading)[1]?.split('\n## ')[0]?.trim();assert.ok(section,'CHANGELOG section missing');
await writeFile(path.join(directory,'release-notes.md'),`${section}\n\n### Descargas\n\n- **LUMEN-Setup**: instalador de Windows con actualizaciones desde GitHub.\n- **LUMEN-Portable**: ejecución sin instalar; reemplazo manual para actualizar.\n- Se incluyen RV1909 y BLL. Las demás Biblias se importan desde archivos locales. Los videos de himnos no se distribuyen.\n\nLas sumas SHA-256 están en SHA256SUMS.txt. El instalador de esta versión no lleva certificado Authenticode.\n`);
console.log(`Release ${version}: ${files.length} artifacts verified.`);
