import { readFile, mkdtemp, mkdir, writeFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { annotateHymnNumbering, parseNumberingCatalog } from '../electron/hymn-numbering';
import { hymnSchema } from '../src/shared/contracts';
import { mergeImportedHymns } from '../electron/hymn-import';
import { Store } from '../electron/store';

const catalog = parseNumberingCatalog(JSON.parse(await readFile('resources/hymn-numbering.json', 'utf8')));
const fixture = (number: number, title: string) => hymnSchema.parse({ id: `h-${number}`, number, title, path: `${number} ${title}.mkv`, duration: 60, tracks: [{ index: 1, label: 'Cantado', language: 'spa' }], size: 100, modified: 1 });

describe('Given the installed hymn numbering catalogue', () => {
  it('keeps every media identity while attaching both available numbering references', () => {
    const hymns = catalog.entries.map(row => fixture(row.number2009, row.titles[0] ?? ''));
    const result = annotateHymnNumbering(hymns, catalog);
    expect(result).toHaveLength(613);
    expect(result.filter(h => h.number2009 !== null)).toHaveLength(613);
    expect(result.filter(h => h.number1962 !== null)).toHaveLength(367);
    expect(result.filter(h => h.number1962 === null)).toHaveLength(246);
    expect(result.filter(h => h.numberingConflict).map(h => h.number)).toEqual([193, 293]);
    expect(result.map(h => [h.id, h.number, h.path])).toEqual(hymns.map(h => [h.id, h.number, h.path]));
  });
  it('uses the title as well as the number and leaves unknown titles unclassified', () => {
    const wrongTitle = fixture(3, 'Otra canción de un catálogo distinto');
    expect(annotateHymnNumbering([wrongTitle], catalog)[0]).toBe(wrongTitle);
    const matched = annotateHymnNumbering([fixture(3, 'UNIDOS EN ESPIRITU')], catalog)[0];
    expect(matched).toMatchObject({ edition: '2009', number1962: 11, number2009: 3 });
  });
  it('recognizes an explicitly imported old-number file without renaming the file number', () => {
    const old = { ...fixture(11, 'Unidos en espíritu'), edition: '1962' as const };
    expect(annotateHymnNumbering([old], catalog)[0]).toMatchObject({ number: 11, edition: '1962', number1962: 11, number2009: 3, path: old.path });
  });
  it('does not overwrite manual references or annotated metadata on repeated migration', () => {
    const manual = { ...fixture(3, 'Unidos en espíritu'), number1962: 99, lyrics: 'Letra personal', favorite: true };
    expect(annotateHymnNumbering([manual], catalog)[0]).toBe(manual);
    const annotated = annotateHymnNumbering([fixture(3, 'Unidos en espíritu')], catalog);
    expect(annotateHymnNumbering(annotated, catalog)[0]).toBe(annotated[0]);
  });
  it('preserves user references, favorites and text when reimporting the same media', () => {
    const current = { ...fixture(3, 'Unidos en espíritu'), number1962: 99, number2009: 3, numberingSource: 'manual', favorite: true, lyrics: 'Texto propio' };
    const merged = mergeImportedHymns([current], [{ ...fixture(3, 'Unidos en espíritu'), modified: 2 }], new Set());
    expect(annotateHymnNumbering(merged, catalog)[0]).toEqual({ ...current, modified: 2 });
  });
  it('rejects duplicate canonical numbers rather than choosing an arbitrary match', () => {
    const row = catalog.entries[0];
    expect(() => parseNumberingCatalog({ ...catalog, entries: [row, row] })).toThrow();
  });
  it('backs up and migrates a saved library once while preserving every unrelated value', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'lumen-numbering-'));
    const assets = path.join(directory, 'assets'); await mkdir(assets);
    const bible = { id: 'first', name: 'Biblia', abbreviation: 'B', source: 'fixture', license: 'fixture', verses: [{ book: 1, chapter: 1, verse: 1, text: 'Texto' }] };
    await writeFile(path.join(assets, 'rv1909.json'), JSON.stringify(bible));
    await writeFile(path.join(assets, 'bll.json'), JSON.stringify({ ...bible, id: 'second' }));
    await writeFile(path.join(assets, 'hymn-numbering.json'), JSON.stringify(catalog));
    const library = { hymns: [{ ...fixture(3, 'Unidos en espíritu'), favorite: true, lyrics: 'Texto personal' }], program: [{ id: 'p', title: 'Sin cambios', slide: { kind: 'verse', text: 'Texto', reference: 'Génesis 1:1', translation: 'B' } }], history: [], backgrounds: [], settings: { theme: 'negro', fontSize: 60, volume: .4, autoProject: true } };
    const original = JSON.stringify(library); await writeFile(path.join(directory, 'library.json'), original);
    const store = new Store(directory);
    try {
      await store.initialize(path.join(assets, 'rv1909.json'));
      expect(store.saved.hymns[0]).toMatchObject({ number1962: 11, number2009: 3, favorite: true, lyrics: 'Texto personal' });
      expect(store.saved.program).toEqual(library.program);
      expect(store.saved.settings).toMatchObject(library.settings);
      const backups = await readdir(path.join(directory, 'backups'));
      expect(backups).toHaveLength(1);
      expect(await readFile(path.join(directory, 'backups', backups[0] ?? ''), 'utf8')).toBe(original);
      store.close();
      await store.initialize(path.join(assets, 'rv1909.json'));
      expect(await readdir(path.join(directory, 'backups'))).toEqual(backups);
      expect(store.annotateHymns([fixture(4, 'Alabanzas sin cesar')])[0]).toMatchObject({ number1962: 22, number2009: 4 });
    } finally { store.close(); await rm(directory, { recursive: true, force: true }); }
  });
});
