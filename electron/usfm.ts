import { toJSON } from 'usfm-js';
import { z } from 'zod';
import { bibleSchema,LumenError } from '../src/shared/contracts';
import type { Bible,Verse } from '../src/shared/contracts';
export const bookCodes=['GEN','EXO','LEV','NUM','DEU','JOS','JDG','RUT','1SA','2SA','1KI','2KI','1CH','2CH','EZR','NEH','EST','JOB','PSA','PRO','ECC','SNG','ISA','JER','LAM','EZK','DAN','HOS','JOL','AMO','OBA','JON','MIC','NAM','HAB','ZEP','HAG','ZEC','MAL','MAT','MRK','LUK','JHN','ACT','ROM','1CO','2CO','GAL','EPH','PHP','COL','1TH','2TH','1TI','2TI','TIT','PHM','HEB','JAS','1PE','2PE','1JN','2JN','3JN','JUD','REV'] as const;
type UsfmObject={readonly type?:string|undefined;readonly tag?:string|undefined;readonly text?:string|undefined;readonly nextChar?:string|undefined;readonly children?:readonly UsfmObject[]|undefined};
const objectSchema:z.ZodType<UsfmObject>=z.lazy(()=>z.object({type:z.string().optional(),tag:z.string().optional(),text:z.string().optional(),nextChar:z.string().optional(),children:z.array(objectSchema).optional()}));
const parsedSchema=z.object({chapters:z.record(z.string(),z.record(z.string(),z.object({verseObjects:z.array(objectSchema)})))});
const omitted=new Set(['f','fe','x','fr','ft','fk','fq','fqa','xo','xt','vp','va','ca','s','s1','s2','s3','r','d','cl','cp','rem']);
function text(nodes:readonly UsfmObject[]):string{
  return nodes.map(node=>`${omitted.has(node.tag??'')||node.type==='footnote'?'':`${node.text??''}${node.children?text(node.children):''}`}${node.nextChar??''}`).join('');
}
export function parseUsfm(content:string):Verse[]{
  const code=/^\s*\\id\s+([A-Z0-9]+)/m.exec(content.replace(/^\uFEFF/,''))?.[1];
  const book=bookCodes.findIndex(item=>item===code)+1;
  if(!book)throw new LumenError('usfm-book',`USFM: código de libro no admitido (${code??'falta \\id'}).`);
  const parsed=parsedSchema.parse(toJSON(content));const verses:Verse[]=[];
  for(const [chapter,entries] of Object.entries(parsed.chapters)){
    if(chapter==='front')continue;
    if(!/^\d+$/.test(chapter)||Number(chapter)<1)throw new LumenError('usfm-chapter','USFM: capítulo no reconocido.');
    for(const [number,entry] of Object.entries(entries)){
      if(number==='front'||number==='0')continue;
      const match=/^(\d+)(?:-(\d+))?$/.exec(number);
      if(!match?.[1])throw new LumenError('usfm-verse',`USFM: numeración no admitida (${number}).`);
      const verse=Number(match[1]);const endVerse=match[2]?Number(match[2]):undefined;
      if(endVerse!==undefined&&endVerse<verse)throw new LumenError('usfm-range','USFM: rango invertido.');
      const plain=text(entry.verseObjects).replace(/\s+/g,' ').trim();
      if(plain)verses.push({book,chapter:Number(chapter),verse,...(endVerse===undefined?{}:{endVerse}),text:plain});
    }
  }
  if(!verses.length)throw new LumenError('usfm-empty','No se encontraron versículos en el archivo USFM.');
  return verses;
}
export function usfmBible(files:readonly {readonly name:string;readonly content:string}[],name:string,id:string):Bible{
  const verses=files.flatMap(file=>parseUsfm(file.content)).toSorted((a,b)=>a.book-b.book||a.chapter-b.chapter||a.verse-b.verse);
  const keys=new Set<string>();
  for(const verse of verses){const key=`${verse.book}:${verse.chapter}:${verse.verse}`;if(keys.has(key))throw new LumenError('usfm-duplicate','El lote USFM contiene libros o versículos duplicados. Importa una sola traducción a la vez.');keys.add(key);}
  return bibleSchema.parse({id,name,abbreviation:'USFM',source:'Importación local USFM',license:'Consultar la licencia de la traducción importada',provenance:{provider:'local'},verses});
}
