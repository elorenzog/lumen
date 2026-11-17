import { build } from 'esbuild';
import { mkdir, readFile, readdir, writeFile, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const input = path.resolve(process.argv[2] ?? 'test-results/bibleshow-interop');
const output = path.resolve(process.argv[3] ?? 'imports');
const archive = path.join(output, 'bibleshow-source');
const compiled = await build({ entryPoints: ['tools/bibleshow-conversion.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
const module = compiled.outputFiles[0];
if (!module) throw new Error('No se generó el conversor.');
const { convertBibleShow } = await import(`data:text/javascript;base64,${Buffer.from(module.contents).toString('base64')}`);
await mkdir(archive, { recursive: true });
const results = [];
for (const file of (await readdir(input)).filter(file => /^[A-Z]+\d+-raw\.json$/.test(file)).sort()) {
  const content = await readFile(path.join(input, file));
  const source = JSON.parse(content.toString('utf8'));
  let converted;
  try { converted = convertBibleShow(source); }
  catch (error) {
    if (!(error instanceof Error)) throw error;
    console.error(JSON.stringify({ source: source.file, error: error.message }));
    process.exit(1);
  }
  const destination = path.join(output, source.file.replace(/\.bib$/, '-lumen.json'));
  await writeFile(destination, JSON.stringify(converted.bible));
  await copyFile(path.join(input, file), path.join(archive, file));
  const receipt = { source: source.file, originalRows: source.rows.length, importedRows: converted.bible.verses.length, books: new Set(converted.bible.verses.map(verse => verse.book)).size, additionalRows: converted.additional.length, empty: converted.empty, conflicts: converted.conflicts, rawSha256: createHash('sha256').update(content).digest('hex'), normalizedSha256: createHash('sha256').update(JSON.stringify(converted.bible.verses)).digest('hex') };
  await writeFile(path.join(archive, file.replace('-raw.json', '-conversion.json')), JSON.stringify(receipt, null, 2));
  results.push(receipt);
  console.log(JSON.stringify({ source: receipt.source, rows: receipt.importedRows, books: receipt.books, additional: receipt.additionalRows, empty: receipt.empty.length, conflicts: receipt.conflicts.length }));
}
await writeFile(path.join(archive, 'conversion-summary.json'), JSON.stringify(results, null, 2));
