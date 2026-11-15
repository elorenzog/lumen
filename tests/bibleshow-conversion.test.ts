import { describe, expect, it } from 'vitest';
import { convertBibleShow } from '../electron/bibleshow-conversion';

const source = (rows: readonly object[]) => ({
  file: 'DHH1994.bib',
  info: { BibleFullName: 'Edición local', BibleShortName: 'DHH', Copyright: 'Editor local', Protected: '1' },
  structure: [{ BibPosition: 1, ListTitle: 'Génesis' }, { BibPosition: 67, ListTitle: 'Tobit' }],
  rows,
});
const row = (ID: number, Scripture: string, Book = 1) => ({ ID, Book, Chapter: 1, Verse: 1, Scripture, Sync: null });

describe('Given BibleShow records with edition-specific data', () => {
  it('preserves both source texts when duplicate references collide', () => {
    const result = convertBibleShow(source([row(2, 'Segundo'), row(1, 'Primero')]));
    expect(result.bible.verses).toEqual([{ book: 1, chapter: 1, verse: 1, text: 'Primero\nSegundo' }]);
    expect(result.conflicts).toEqual([{ book: 1, chapter: 1, verse: 1, sourceIds: [1, 2] }]);
  });
  it('keeps additional books separately when the current app accepts 66 books', () => {
    const result = convertBibleShow(source([row(1, 'Canónico'), row(2, 'Adicional', 67)]));
    expect(result.additional).toEqual([row(2, 'Adicional', 67)]);
    expect(result.bible.verses.map(verse => verse.book)).toEqual([1]);
  });
  it('accounts for formatting-only records without inventing scripture', () => {
    const result = convertBibleShow(source([row(1, '<p>') , { ...row(2, 'Texto'), Verse: 2 }]));
    expect(result.empty).toEqual([{ id: 1, book: 1, chapter: 1, verse: 1 }]);
    expect(result.bible.verses).toEqual([{ book: 1, chapter: 1, verse: 2, text: 'Texto' }]);
  });
  it('keeps paragraph boundaries and wording when removing known styling', () => {
    const result = convertBibleShow(source([row(1, '<p>Una <i>palabra</i><br>Otra<span class=\'Isus\'> frase</span>')]));
    expect(result.bible.verses[0]?.text).toBe('Una palabra\nOtra frase');
  });
  it('rejects unsupported markup when it could hide content', () => {
    expect(() => convertBibleShow(source([row(1, 'Texto<unknown>oculto</unknown>')]))).toThrow();
  });
  it('retains the enclosed words when an RVG internal link has an empty reference', () => {
    const result = convertBibleShow(source([row(1, "Antes <a href='B: '>palabras completas</a> después")]));
    expect(result.bible.verses[0]?.text).toBe('Antes palabras completas después');
  });
  it('retains bracketed words when the source contains the RVG malformed styling marker', () => {
    const result = convertBibleShow(source([row(1, '[<XXXXX>palabras añadidas] continúan')]));
    expect(result.bible.verses[0]?.text).toBe('[palabras añadidas] continúan');
  });
  it('retains copyright attribution without asserting distribution permission', () => {
    const result = convertBibleShow(source([row(1, 'Texto')]));
    expect(result.bible.license).toBe('Editor local');
    expect(result.bible.provenance?.rights).toBe('unspecified');
    expect(result.bible.provenance?.redistribution).toBe('unspecified');
  });
});
