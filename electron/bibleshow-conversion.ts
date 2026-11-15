import { z } from 'zod';
import { bibleSchema, LumenError } from '../src/shared/contracts';
import type { Bible, Verse } from '../src/shared/contracts';

const sourceRowSchema = z.object({
  ID: z.number().int().positive(), Book: z.number().int().min(1).max(82),
  Chapter: z.number().int().positive(), Verse: z.number().int().positive(),
  Scripture: z.string(), Sync: z.union([z.string(), z.number()]).nullable(),
});
const sourceSchema = z.object({
  file: z.string().regex(/^[a-zA-Z0-9_-]+\.bib$/i),
  info: z.record(z.string(), z.string()),
  structure: z.array(z.object({ BibPosition: z.number().int().positive(), ListTitle: z.string() })),
  rows: z.array(sourceRowSchema).min(1).max(50000),
});
type SourceRow = z.infer<typeof sourceRowSchema>;
type Reference = Pick<Verse, 'book' | 'chapter' | 'verse'>;
type Conflict = Reference & { readonly sourceIds: readonly number[] };
type Conversion = {
  readonly bible: Bible;
  readonly additional: readonly SourceRow[];
  readonly empty: readonly (Reference & { readonly id: number })[];
  readonly conflicts: readonly Conflict[];
};
const tags = new Set(['<p>', '<br>', '<i>', '</i>', '</span>', "<span class='Isus'>", "<span style='padding:1em;'>", '</pb>', '<XXXXX>', "<a href='B: '>", '</a>']);

export function convertBibleShow(input: unknown): Conversion {
  const source = sourceSchema.parse(input);
  const positions = new Set(source.structure.map(book => book.BibPosition));
  const ids = new Set<number>();
  // These collections accumulate conversion output in source-ID order.
  const grouped = new Map<string, { reference: Reference; texts: string[]; sourceIds: number[] }>();
  const additional: SourceRow[] = [];
  const empty: (Reference & { readonly id: number })[] = [];
  for (const row of [...source.rows].sort((a, b) => a.ID - b.ID)) {
    if (!positions.has(row.Book) || ids.has(row.ID)) throw new LumenError('source-reference', 'Libro sin correspondencia o ID de origen repetido.');
    ids.add(row.ID);
    if (row.Book > 66) { additional.push(row); continue; }
    const reference = { book: row.Book, chapter: row.Chapter, verse: row.Verse };
    for (const tag of row.Scripture.match(/<[^>]*>/g) ?? []) {
      if (!tags.has(tag)) throw new LumenError('source-markup', `Marca no compatible en ${row.Book}:${row.Chapter}:${row.Verse}.`);
    }
    const text = row.Scripture.replace(/<(?:p|br)>|<\/pb>/g, '\n').replace(/<[^>]*>/g, '').trim();
    if (!text) { empty.push({ ...reference, id: row.ID }); continue; }
    const key = `${row.Book}:${row.Chapter}:${row.Verse}`;
    const existing = grouped.get(key);
    if (existing) { existing.texts.push(text); existing.sourceIds.push(row.ID); }
    else grouped.set(key, { reference, texts: [text], sourceIds: [row.ID] });
  }
  const conflicts = [...grouped.values()].filter(group => group.sourceIds.length > 1).map(group => ({ ...group.reference, sourceIds: group.sourceIds }));
  const verses = [...grouped.values()].map(group => ({ ...group.reference, text: group.texts.join('\n') })).sort((a, b) => a.book - b.book || a.chapter - b.chapter || a.verse - b.verse);
  const publicDomain = source.info['Copyright'] === 'Public Domain';
  const name = source.info['BibleFullName'];
  const abbreviation = source.info['BibleShortName'];
  if (!name || !abbreviation) throw new LumenError('source-metadata', 'Falta el nombre de la edición de origen.');
  const notice = `Copia local de ${source.file}. Vista de 66 libros; ${additional.length} registros adicionales conservados en la extracción íntegra. ${empty.length} registros solo de formato no proyectados. ${conflicts.length} referencias duplicadas conservan ambos textos, en orden de ID, separados por salto de línea; requieren revisión. Se retiran marcas visuales de cursiva, palabras de Cristo y párrafos; se conserva el original. No se infieren rangos de versículos ni permisos de redistribución.`;
  const bible = bibleSchema.parse({
    id: source.file.replace(/\.bib$/i, '').toLowerCase(),
    name: additional.length ? `${name} · 66 libros` : name,
    abbreviation, source: `Importación local de ${source.file} mediante lectura Access de una copia`,
    license: source.info['Copyright'] || 'Derechos no especificados por el módulo',
    provenance: { provider: 'local', rights: publicDomain ? 'public-domain' : 'unspecified', offline: 'unspecified', redistribution: 'unspecified', attribution: source.info['Copyright'] ?? '', licenseUrl: '', retrievedAt: Date.now(), notice },
    verses,
  });
  return { bible, additional, empty, conflicts };
}
