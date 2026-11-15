import type { Hymn } from './contracts';
import { searchHymns } from './domain';
import type { HymnSearchScope } from './domain';

export type HymnEditionFilter = 'all' | '1962' | '2009' | 'unknown';
export const editionNames = { '1962': 'Antiguo (1962)', '2009': 'Nuevo (2009)', unknown: 'Edición sin identificar', all: 'Todos' } as const;
export function editionNumber(hymn: Hymn, edition: '1962' | '2009'): number | null {
  const mapped = edition === '1962' ? hymn.number1962 : hymn.number2009;
  return mapped ?? (hymn.edition === edition ? hymn.number : null);
}
export function matchesHymnEdition(hymn: Hymn, edition: HymnEditionFilter): boolean {
  switch (edition) {
    case 'all': return true;
    case '1962': case '2009': return editionNumber(hymn, edition) !== null;
    case 'unknown': return editionNumber(hymn, '1962') === null && editionNumber(hymn, '2009') === null;
    default: edition satisfies never; return false;
  }
}
export function displayHymnNumber(hymn: Hymn, edition: HymnEditionFilter): number {
  if (edition === '1962' || edition === '2009') return editionNumber(hymn, edition) ?? hymn.number;
  if (hymn.edition === '1962' || hymn.edition === '2009') return editionNumber(hymn, hymn.edition) ?? hymn.number;
  return editionNumber(hymn, '2009') ?? editionNumber(hymn, '1962') ?? hymn.number;
}
type HymnSearch = { readonly edition: HymnEditionFilter; readonly query: string; readonly scope: HymnSearchScope; readonly favorites: boolean };
export function searchEditionHymns(hymns: readonly Hymn[], selection: HymnSearch): readonly Hymn[] {
  const available = hymns.filter(hymn => matchesHymnEdition(hymn, selection.edition) && (!selection.favorites || hymn.favorite));
  const originals = new Map(available.map(hymn => [hymn.id, hymn]));
  const numbered = available.map(hymn => ({ ...hymn, number: displayHymnNumber(hymn, selection.edition) }));
  return searchHymns(numbered, selection.query, selection.scope).flatMap(hymn => {
    const original = originals.get(hymn.id); return original ? [original] : [];
  });
}
export function hymnReference(hymn: Hymn, edition: HymnEditionFilter): string {
  const name = edition === '1962' || edition === '2009' ? editionNames[edition] : editionNames[hymn.edition];
  return `${displayHymnNumber(hymn, edition)} · ${hymn.title} · ${name}`;
}
