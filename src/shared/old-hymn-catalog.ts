import type { Hymn, Snapshot } from './contracts';
import { normalize } from './domain';
import { searchEditionHymns } from './hymn-editions';
import type { HymnSearchScope } from './domain';

export type OldCatalogRow = {
  readonly id: string; readonly number: number; readonly title: string;
  readonly media: readonly Hymn[]; readonly playable: Hymn | undefined;
  readonly status: 'available' | 'missing' | 'review'; readonly conflict: boolean;
};
type Catalogue = Pick<Snapshot, 'hymns' | 'oldHymnCatalog'>;
const titleKey = (title: string): string => normalize(title).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export function oldCatalogRows(snapshot: Catalogue): readonly OldCatalogRow[] {
  const byNumber = new Map<number, Hymn[]>();
  for (const hymn of snapshot.hymns) {
    const number = hymn.number1962 ?? (hymn.edition === '1962' ? hymn.number : null);
    if (number !== null) byNumber.set(number, [...(byNumber.get(number) ?? []), hymn]);
  }
  return snapshot.oldHymnCatalog.map(entry => {
    const media = byNumber.get(entry.number) ?? [];
    const conflict = media.length > 1 || media.some(hymn => hymn.numberingConflict);
    const matching = media.filter(hymn => titleKey(hymn.title) === titleKey(entry.title));
    const playable = conflict ? matching.length === 1 ? matching[0] : undefined : media[0];
    return { ...entry, id: `old1962:${entry.number}`, media, playable, conflict, status: playable ? 'available' : media.length ? 'review' : 'missing' };
  });
}
type CatalogueSearch = { readonly query: string; readonly scope: HymnSearchScope; readonly favorites: boolean };
export function searchOldCatalog(snapshot: Catalogue, search: CatalogueSearch): readonly OldCatalogRow[] {
  const terms = normalize(search.query).split(' ').filter(Boolean);
  return oldCatalogRows(snapshot).filter(row => {
    if (search.favorites && !row.media.some(hymn => hymn.favorite)) return false;
    const titleMatch = (search.scope === 'all' || search.scope === 'title') && terms.every(term => normalize(`${row.number} ${row.title}`).includes(term));
    return titleMatch || searchEditionHymns(row.media, { ...search, edition: '1962' }).length > 0;
  });
}
export function selectedOldCatalog(snapshot: Catalogue, selection: string | null): OldCatalogRow | undefined {
  if (!selection?.startsWith('old1962:')) return undefined;
  return oldCatalogRows(snapshot).find(row => row.id === selection);
}
