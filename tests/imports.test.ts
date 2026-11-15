import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { importBible } from '../electron/imports';
import { bibleSchema, LumenError } from '../src/shared/contracts';
import { books } from '../src/shared/domain';

describe('Given a Zefania XML Bible',()=>{
  const xml='<XMLBIBLE biblename="Prueba"><BIBLEBOOK bnumber="43"><CHAPTER cnumber="3"><VERS vnumber="16">Texto de prueba</VERS></CHAPTER></BIBLEBOOK></XMLBIBLE>';
  it('imports one-book one-chapter files when their structure is valid',()=>{const result=importBible(xml,'bible.xml','sample');expect(result.verses).toEqual([{book:43,chapter:3,verse:16,text:'Texto de prueba'}]);});
  it('rejects entity declarations when present',()=>{expect(()=>importBible('<!DOCTYPE x [<!ENTITY x SYSTEM "file:///private">]>'+xml,'bible.xml')).toThrow(LumenError);});
  it('rejects nested verse formatting instead of silently losing its text',()=>{expect(()=>importBible(xml.replace('Texto de prueba','Texto <STYLE>importante</STYLE>'),'bible.xml')).toThrow();});
});
describe('Given the bundled public-domain edition',()=>{
  it('contains all canonical books and no duplicate or blank entries when loaded',async()=>{
    const bible=bibleSchema.parse(JSON.parse(await readFile('resources/rv1909.json','utf8')));
    expect(new Set(bible.verses.map(v=>v.book)).size).toBe(books.length);
    expect(new Set(bible.verses.map(v=>`${v.book}:${v.chapter}:${v.verse}`)).size).toBe(bible.verses.length);
    expect(bible.verses.every(v=>v.text.trim().length>0)).toBe(true);
    expect(bible.verses.find(v=>v.book===43&&v.chapter===3&&v.verse===16)?.text).toMatch(/^Porque de tal manera/);
  });
});
