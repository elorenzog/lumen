import { z } from 'zod';
import type { Hymn } from '../src/shared/contracts';
import { normalize } from '../src/shared/domain';

const catalogSchema = z.object({
  version: z.literal(1),
  source: z.string().min(1).max(200),
  entries: z.array(z.object({ id: z.number().int().positive(), number2009: z.number().int().positive(), number1962: z.number().int().positive().nullable(), titles: z.array(z.string().min(1)).min(1).max(10) })).min(1).max(2000),
}).superRefine((catalog, context) => {
  const ids = new Set<number>(); const numbers = new Set<number>();
  for (const entry of catalog.entries) {
    if (ids.has(entry.id) || numbers.has(entry.number2009)) context.addIssue({ code: 'custom', message: 'Duplicate hymn catalogue identity or new number.' });
    ids.add(entry.id); numbers.add(entry.number2009);
  }
});
export type HymnNumberingCatalog = z.infer<typeof catalogSchema>;
export function parseNumberingCatalog(raw: unknown): HymnNumberingCatalog { return catalogSchema.parse(raw); }
const titleKey = (title: string): string => normalize(title).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export function annotateHymnNumbering(hymns: readonly Hymn[], catalog: HymnNumberingCatalog): Hymn[] {
  type Entry = HymnNumberingCatalog['entries'][number];
  const byNew = new Map<number, Entry>();
  const byOld = new Map<number, Entry[]>();
  for (const entry of catalog.entries) {
    byNew.set(entry.number2009, entry);
    if (entry.number1962 !== null) byOld.set(entry.number1962, [...(byOld.get(entry.number1962) ?? []), entry]);
  }
  return hymns.map(hymn => {
    if (hymn.numberingSource || hymn.number1962 !== null || hymn.number2009 !== null) return hymn;
    const candidate = byNew.get(hymn.number);
    const candidates = hymn.edition === '1962' ? byOld.get(hymn.number) ?? [] : candidate ? [candidate] : [];
    const matches = candidates.filter(entry => entry.titles.some(title => titleKey(title) === titleKey(hymn.title)));
    const match = matches[0];
    if (matches.length !== 1 || !match) return hymn;
    return { ...hymn, edition: hymn.edition === 'unknown' ? '2009' : hymn.edition, number1962: match.number1962, number2009: match.number2009, numberingSource: `${catalog.source}:${match.id}`, numberingConflict: match.number1962 !== null && (byOld.get(match.number1962)?.length ?? 0) > 1 };
  });
}
