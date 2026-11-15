import { readFile, writeFile } from 'node:fs/promises';
const codes=['GEN','EXO','LEV','NUM','DEU','JOS','JDG','RUT','1SA','2SA','1KI','2KI','1CH','2CH','EZR','NEH','EST','JOB','PSA','PRO','ECC','SOL','ISA','JER','LAM','EZE','DAN','HOS','JOE','AMO','OBA','JON','MIC','NAH','HAB','ZEP','HAG','ZEC','MAL','MAT','MAR','LUK','JOH','ACT','ROM','1CO','2CO','GAL','EPH','PHI','COL','1TH','2TH','1TI','2TI','TIT','PHM','HEB','JAM','1PE','2PE','1JO','2JO','3JO','JUD','REV'];
const raw=await readFile('resources/rv1909-vpl.txt','utf8');
const verses=raw.split(/\r?\n/).filter(line=>line.trim()).map(line=>{
  const match=/^(\S+) (\d+):(\d+) (.*)$/.exec(line);
  if(!match)throw new Error(`Línea bíblica no reconocida: ${line.slice(0,80)}`);
  const book=codes.indexOf(match[1])+1;
  if(!book)throw new Error(`Libro no reconocido ${match[1]}`);
  return {book,chapter:Number(match[2]),verse:Number(match[3]),text:match[4]};
}).filter(verse=>verse.text.trim());
if(new Set(verses.map(v=>v.book)).size!==66||verses.length<31000)throw new Error('Biblia incompleta');
await writeFile('resources/rv1909.json',JSON.stringify({id:'rv1909',name:'Reina-Valera 1909',abbreviation:'RV1909',source:'https://ebible.org/Scriptures/spaRV1909_vpl.zip',license:'Dominio público. https://ebible.org/spaRV1909/copyright.htm',verses}));
console.log(`RV1909 verificada: 66 libros, ${verses.length} versículos.`);



