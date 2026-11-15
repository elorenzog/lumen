import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { parseOldHymnCatalog } from '../electron/old-hymn-catalog';
import { defaults, hymnSchema } from '../src/shared/contracts';
import { Store } from '../electron/store';

const raw: unknown = JSON.parse(await readFile('resources/hymnal-1962.json', 'utf8'));
const complete = { version: 1, edition: '1962', source: 'https://himnarioantiguo.advenz.com/', entries: Array.from({ length: 527 }, (_, index) => ({ number: index + 1, title: `Himno ${index + 1}` })) };
describe('Given the complete old hymnal metadata catalogue', () => {
  it('loads exactly one title for every old number without fabricating playback fields', () => {
    const entries = parseOldHymnCatalog(raw);
    expect(entries).toHaveLength(527);
    expect(entries.map(entry => entry.number)).toEqual(Array.from({ length: 527 }, (_, index) => index + 1));
    expect(entries[0]).toEqual({ number: 1, title: 'Cantad alegres al Señor' });
    expect(entries.at(-1)).toEqual({ number: 527, title: '¿Para quién será el ay?' });
    expect(entries.every(entry => Object.keys(entry).toSorted().join(',') === 'number,title')).toBe(true);
  });
  it('rejects missing and duplicate old numbers', () => {
    expect(() => parseOldHymnCatalog({ ...complete, entries: complete.entries.slice(1) })).toThrow();
    expect(() => parseOldHymnCatalog({ ...complete, entries: [complete.entries[0], ...complete.entries.slice(0, 526)] })).toThrow();
  });
  it('rejects empty titles and numbers outside1..527', () => {
    expect(() => parseOldHymnCatalog({ ...complete, entries: complete.entries.map(entry => entry.number === 1 ? { ...entry, title: '  ' } : entry) })).toThrow();
    expect(() => parseOldHymnCatalog({ ...complete, entries: complete.entries.map(entry => entry.number === 1 ? { ...entry, number: 528 } : entry) })).toThrow();
  });
  it('returns a stable numeric order for valid unsorted input', () => {
    expect(parseOldHymnCatalog({ ...complete, entries: [...complete.entries].reverse() }).map(entry => entry.number)).toEqual(complete.entries.map(entry => entry.number));
  });
  it('loads the bundled catalogue without inserting missing titles into the media library', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'lumen-old-catalog-'));
    const assets = path.join(directory, 'assets'); await mkdir(assets);
    const bible = { id: 'first', name: 'Biblia', abbreviation: 'B', source: 'fixture', license: 'fixture', verses: [{ book: 1, chapter: 1, verse: 1, text: 'Texto' }] };
    await writeFile(path.join(assets, 'rv1909.json'), JSON.stringify(bible));
    await writeFile(path.join(assets, 'bll.json'), JSON.stringify({ ...bible, id: 'second' }));
    await writeFile(path.join(assets, 'hymnal-1962.json'), JSON.stringify(raw));
    const hymn = hymnSchema.parse({ id: 'media3', number: 3, title: 'Unidos en espíritu', path: 'source.mkv', duration: 120, tracks: [{ index: 1, label: 'Cantado', language: 'spa' }], size: 100, modified: 1, number1962: 11, number2009: 3, edition: '2009', favorite: true });
    const original = JSON.stringify({ ...defaults, hymns: [hymn], program: [{ id: 'p1', title: 'Programa propio', slide: { kind: 'verse', text: 'Texto', reference: 'Juan 3:16', translation: 'B' } }] });
    await writeFile(path.join(directory, 'library.json'), original);
    const store = new Store(directory);
    try {
      await store.initialize(path.join(assets, 'rv1909.json'));
      expect(store.oldHymnCatalog).toHaveLength(527);
      expect(store.saved.hymns).toEqual([hymn]);
      expect(await readFile(path.join(directory, 'library.json'), 'utf8')).toBe(original);
      store.close(); await store.initialize(path.join(assets, 'rv1909.json'));
      expect(store.oldHymnCatalog).toHaveLength(527);
      expect(await readFile(path.join(directory, 'library.json'), 'utf8')).toBe(original);
      store.close(); await writeFile(path.join(assets, 'hymnal-1962.json'), JSON.stringify({ ...complete, entries: [] }));
      await expect(store.initialize(path.join(assets, 'rv1909.json'))).rejects.toThrow();
      expect(await readFile(path.join(directory, 'library.json'), 'utf8')).toBe(original);
    } finally { store.close(); await rm(directory, { recursive: true, force: true }); }
  });
  it('rejects an unsupported version instead of silently claiming a complete collection', () => {
    expect(() => parseOldHymnCatalog({ ...complete, version: 2 })).toThrow();
    expect(() => parseOldHymnCatalog({ ...complete, entries: [] })).toThrow();
  });
});
