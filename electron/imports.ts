import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { bibleSchema, LumenError } from '../src/shared/contracts';
import type { Bible } from '../src/shared/contracts';

const scrollSchema = z.object({ translation: z.string(), books: z.array(z.object({ name: z.string(), chapters: z.array(z.object({ chapter: z.number().int().positive(), verses: z.array(z.object({ verse: z.number().int().positive(), text: z.string() })) })) })).length(66) });
const xmlSchema = z.object({ XMLBIBLE: z.object({ biblename: z.string().optional(), INFORMATION: z.object({ title: z.string().optional(), identifier: z.string().optional(), rights: z.string().optional() }).optional(), BIBLEBOOK: z.array(z.object({ bnumber: z.coerce.number().int(), CHAPTER: z.array(z.object({ cnumber: z.coerce.number().int(), VERS: z.array(z.object({ vnumber: z.coerce.number().int(), '#text': z.union([z.string(), z.number()]).transform(String) }).strict()) })) })) }) });
export function importBible(content: string, name: string, id: string = randomUUID()): Bible {
  if (content.length > 40_000_000) throw new LumenError('size', 'La Biblia supera el límite de 40 MB.');
  if (name.toLowerCase().endsWith('.xml')) {
    if (content.includes('<!DOCTYPE') || content.includes('<!ENTITY') || XMLValidator.validate(content) !== true) throw new LumenError('xml', 'El XML no es válido o contiene declaraciones no admitidas.');
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', parseTagValue: false, isArray: tag => ['BIBLEBOOK','CHAPTER','VERS'].includes(tag), processEntities: false });
    const parsed: unknown = parser.parse(content);
    const { XMLBIBLE: bible } = xmlSchema.parse(parsed);
    return bibleSchema.parse({ id, name: bible.biblename ?? bible.INFORMATION?.title ?? name, abbreviation: bible.INFORMATION?.identifier ?? 'XML', source: 'Importación local Zefania XML', license: bible.INFORMATION?.rights ?? 'Consultar derechos de la edición importada', verses: bible.BIBLEBOOK.flatMap(b => b.CHAPTER.flatMap(c => c.VERS.map(v => ({book:b.bnumber,chapter:c.cnumber,verse:v.vnumber,text:v['#text']})))) });
  }
  const raw: unknown = JSON.parse(content);
  const own = bibleSchema.safeParse(raw);
  if (own.success) return { ...own.data, id };
  const scroll = scrollSchema.parse(raw);
  return bibleSchema.parse({ id, name: scroll.translation, abbreviation: 'JSON', source: 'Importación local JSON (Scrollmapper)', license: 'Consultar derechos de la edición importada', verses: scroll.books.flatMap((b, index) => b.chapters.flatMap(c => c.verses.map(v => ({book:index+1,chapter:c.chapter,verse:v.verse,text:v.text})))) });
}
