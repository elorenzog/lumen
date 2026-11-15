import type { Verse } from './contracts';
import { LumenError } from './contracts';

export function selectRange(chapter:readonly Verse[],input:string):readonly Verse[]{
  const match=/^\s*(\d+)(?:\s*[-–]\s*(\d+))?\s*$/.exec(input);
  if(!match)throw new LumenError('range','Escribe un versículo o un rango, por ejemplo: 16 o 16-18.');
  const from=Number(match[1]);const to=Number(match[2]??match[1]);
  if(from>to)throw new LumenError('range','El inicio del rango debe ser menor o igual al final.');
  const selected=chapter.filter(v=>(v.endVerse??v.verse)>=from&&v.verse<=to);
  if(!selected.length||!selected.some(v=>v.verse<=from&&(v.endVerse??v.verse)>=from)||!selected.some(v=>v.verse<=to&&(v.endVerse??v.verse)>=to))throw new LumenError('range','Ese versículo no está disponible en este capítulo.');
  if(selected.length>6)throw new LumenError('range','Selecciona hasta 6 versículos por diapositiva.');
  return selected;
}
