import type { Bible, Hymn, Output, Verse } from './contracts';

export const books = ['Génesis', 'Éxodo', 'Levítico', 'Números', 'Deuteronomio', 'Josué', 'Jueces', 'Rut', '1 Samuel', '2 Samuel', '1 Reyes', '2 Reyes', '1 Crónicas', '2 Crónicas', 'Esdras', 'Nehemías', 'Ester', 'Job', 'Salmos', 'Proverbios', 'Eclesiastés', 'Cantares', 'Isaías', 'Jeremías', 'Lamentaciones', 'Ezequiel', 'Daniel', 'Oseas', 'Joel', 'Amós', 'Abdías', 'Jonás', 'Miqueas', 'Nahúm', 'Habacuc', 'Sofonías', 'Hageo', 'Zacarías', 'Malaquías', 'Mateo', 'Marcos', 'Lucas', 'Juan', 'Hechos', 'Romanos', '1 Corintios', '2 Corintios', 'Gálatas', 'Efesios', 'Filipenses', 'Colosenses', '1 Tesalonicenses', '2 Tesalonicenses', '1 Timoteo', '2 Timoteo', 'Tito', 'Filemón', 'Hebreos', 'Santiago', '1 Pedro', '2 Pedro', '1 Juan', '2 Juan', '3 Juan', 'Judas', 'Apocalipsis'] as const;
const aliases: Readonly<Record<string, number>> = { gn: 1, gen: 1, ex: 2, sal: 19, ps: 19, prov: 20, is: 23, mt: 40, mat: 40, mr: 41, mc: 41, lc: 42, luc: 42, jn: 43, juan: 43, hch: 44, ro: 45, rom: 45, '1co': 46, '2co': 47, ef: 49, fil: 50, heb: 58, stg: 59, ap: 66 };
export const normalize = (text: string): string => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
export function hymnName(filename: string): { readonly number: number; readonly title: string } | null {
  const match = /^\(?\s*(\d{1,4})\s*[.\-–_ ]+(.+?)\)?\.mkv$/i.exec(filename);
  if (!match?.[1] || !match[2]) return null;
  const number = Number(match[1]);
  return number > 0 ? { number, title: match[2].trim() } : null;
}
export function referenceQuery(input: string): { readonly book: number; readonly chapter: number; readonly from: number; readonly to: number } | null {
  const match = /^(.+?)\s+(\d+)(?:\s*[:.]\s*(\d+)(?:\s*[-–]\s*(\d+))?)?$/.exec(input.trim());
  if (!match?.[1] || !match[2]) return null;
  const name = normalize(match[1]).replace(/\.$/, '');
  const canonical = books.findIndex(book => normalize(book) === name);
  const book = canonical >= 0 ? canonical + 1 : aliases[name.replace(/ /g, '')];
  const chapter = Number(match[2]); const from = Number(match[3] ?? 1); const to = Number(match[4] ?? match[3] ?? 999);
  return book && chapter > 0 && from > 0 && to >= from ? { book, chapter, from, to } : null;
}
export const reference = (verse: Verse): string => `${books[verse.book - 1] ?? 'Libro'} ${verse.chapter}:${verse.verse}${verse.endVerse&&verse.endVerse>verse.verse?`–${verse.endVerse}`:''}`;
export function searchVerses(bible: Bible, query: string): readonly Verse[] {
  const ref = referenceQuery(query);
  if (ref) return bible.verses.filter(v => v.book === ref.book && v.chapter === ref.chapter && (v.endVerse??v.verse) >= ref.from && v.verse <= ref.to);
  const terms = normalize(query).split(' ').filter(Boolean);
  return terms.length ? bible.verses.filter(v => terms.every(term => normalize(v.text).includes(term))).slice(0, 100) : [];
}
export type HymnSearchScope='all'|'title'|'lyrics'|'topic'|'references'|'authors';
export const searchHymns = (hymns: readonly Hymn[], query: string,scope:HymnSearchScope='all'): readonly Hymn[] => hymns.filter(h => {
  const fields={all:`${h.number} ${h.title} ${h.lyrics} ${h.topic} ${h.references} ${h.lyricist} ${h.composer}`,title:`${h.number} ${h.title}`,lyrics:h.lyrics,topic:h.topic,references:h.references,authors:`${h.lyricist} ${h.composer}`};
  const text=normalize(fields[scope]);return normalize(query).split(' ').every(term=>text.includes(term));
}).toSorted((a,b) => a.number - b.number);
export function playbackPosition(output: Output, now = Date.now()): number {
  return output.position + (output.playing && !output.blackout ? Math.max(0, now - output.updatedAt) / 1000 : 0);
}
export const formatTime = (seconds: number): string => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2,'0')}`;
