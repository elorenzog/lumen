import { build } from 'esbuild';
import { createRequire } from 'node:module';
await build({entryPoints:['electron/bible-files.ts'],bundle:true,platform:'node',format:'cjs',outfile:'test-results/import-check.cjs'});
const require=createRequire(import.meta.url);
const {importBibleFiles}=require('../test-results/import-check.cjs');
const bible=await importBibleFiles([new URL('../test-results/rv1909-usfm.zip',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')]);
console.log({name:bible.name,books:new Set(bible.verses.map(v=>v.book)).size,verses:bible.verses.length,john:bible.verses.find(v=>v.book===43&&v.chapter===3&&v.verse===16)});
