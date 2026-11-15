import ky from 'ky';
import { z } from 'zod';
import { bibleSchema,LumenError } from '../src/shared/contracts';
import type { Bible } from '../src/shared/contracts';
import type { CatalogEntry } from '../src/shared/catalog';
import { bookCodes } from './usfm';
const base='https://v1.fetch.bible/';
const client=ky.create({timeout:20000,retry:1});
const translationSchema=z.object({name:z.object({local:z.string(),local_abbrev:z.string(),english:z.string()}),copyright:z.object({licenses:z.array(z.object({license:z.unknown(),url:z.string()})).min(1),attribution:z.string()})});
const manifestSchema=z.object({bibles:z.record(z.string(),z.unknown())});
const bookSchema=z.object({contents:z.array(z.array(z.array(z.union([z.string(),z.record(z.string(),z.unknown())]))))});
export async function catalog():Promise<CatalogEntry[]>{
  const manifest=manifestSchema.parse(await client.get(`${base}manifest.json`).json<unknown>());
  const ids=['spa_bll','spa_blm'] as const;
  return ids.flatMap(id=>{
    const parsed=translationSchema.safeParse(manifest.bibles[id]);
    if(!parsed.success||!parsed.data.copyright.licenses.every(license=>license.license==='public'))return [];
    const item=parsed.data;
    return [{id,name:item.name.local||item.name.english,abbreviation:item.name.local_abbrev||(id==='spa_bll'?'BLL':'BLM'),license:'Dominio público',source:`https://v1.fetch.bible/bibles/${id}/`,attribution:item.copyright.attribution,licenseUrl:item.copyright.licenses[0]?.url??'',notice:id==='spa_bll'?'La fuente identifica esta edición como un borrador en revisión.':''}];
  });
}
export async function downloadBible(id:'spa_bll'|'spa_blm',status:(message:string)=>void):Promise<Bible>{
  const entry=(await catalog()).find(item=>item.id===id);
  if(!entry)throw new LumenError('license','Esta edición no está disponible como dominio público en el catálogo actual.');
  let complete=0;
  const downloaded:unknown[]=new Array(bookCodes.length);let next=0;
  await Promise.all(Array.from({length:4},async()=>{
    while(next<bookCodes.length){const index=next++;const code=bookCodes[index];if(!code)continue;
      downloaded[index]=bookSchema.parse(await client.get(`${base}bibles/${id}/txt/${code.toLowerCase()}.json`).json<unknown>());
      status(`Descargando ${entry.abbreviation} · ${++complete}/66 libros`);
    }
  }));
  const verses=downloaded.flatMap((raw,index)=>bookSchema.parse(raw).contents.flatMap((chapter,ch)=>ch===0?[]:chapter.flatMap((parts,v)=>v===0?[]:(()=>{
    const text=parts.filter(part=>typeof part==='string').join('').replace(/\s+/g,' ').trim();
    return text?[{book:index+1,chapter:ch,verse:v,text}]:[];
  })())));
  if(new Set(verses.map(v=>v.book)).size!==66)throw new LumenError('incomplete','La descarga está incompleta. No se instaló la traducción.');
  return bibleSchema.parse({...entry,provenance:{provider:'fetch-bible',rights:'public-domain',offline:'allowed',redistribution:'allowed',attribution:entry.attribution,licenseUrl:entry.licenseUrl,retrievedAt:Date.now(),notice:entry.notice},verses});
}
