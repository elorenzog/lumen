import {readFile} from 'node:fs/promises';
import {describe,expect,it} from 'vitest';
import {bibleSchema} from '../src/shared/contracts';
import {books} from '../src/shared/domain';

describe('Given the bundled public-domain edition',()=>{
  it('contains all canonical books and no duplicate or blank entries when loaded',async()=>{
    const bible=bibleSchema.parse(JSON.parse(await readFile('resources/rv1909.json','utf8')));
    expect(new Set(bible.verses.map(v=>v.book)).size).toBe(books.length);
    expect(new Set(bible.verses.map(v=>`${v.book}:${v.chapter}:${v.verse}`)).size).toBe(bible.verses.length);
    expect(bible.verses.every(v=>v.text.trim().length>0)).toBe(true);
    expect(bible.verses.find(v=>v.book===43&&v.chapter===3&&v.verse===16)?.text).toMatch(/^Porque de tal manera/);
  });
});
