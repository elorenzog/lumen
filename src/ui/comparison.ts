import type { Slide,Verse } from '../shared/contracts';
import { reference } from '../shared/domain';
import type { UIState } from './state';
import { verseSlide } from './state';
import { button,esc } from './primitives';
type ComparisonState=Pick<UIState,'bible'|'selected'|'comparison'>;
function matching(verse:Verse,state:ComparisonState):readonly Verse[]{
  return state.comparison?.verses.filter(v=>v.book===verse.book&&v.chapter===verse.chapter&&v.verse<=(verse.endVerse??verse.verse)&&(v.endVerse??v.verse)>=verse.verse)??[];
}
export function comparisonSlide(state:ComparisonState):Slide|undefined{
  if(!state.comparison||!state.selected.length||state.selected.some(v=>!matching(v,state).length))return undefined;
  const first=state.selected[0];if(!first)return undefined;
  const secondary=[...new Map(state.selected.flatMap(v=>matching(v,state)).map(v=>[`${v.book}:${v.chapter}:${v.verse}`,v])).values()];
  const original=verseSlide(state);
  const primaryReference=original.kind==='verse'?original.reference:reference(first);
  const secondaryReferences=secondary.map(reference).join('; ');
  return {kind:'verse',reference:primaryReference===secondaryReferences?primaryReference:`${primaryReference} / ${secondaryReferences}`,translation:`${state.bible.abbreviation} · ${state.comparison.abbreviation}`,text:`${state.bible.abbreviation} · ${primaryReference}\n${state.selected.map(v=>v.text).join('\n')}\n\n${state.comparison.abbreviation} · ${secondaryReferences}\n${secondary.map(v=>v.text).join('\n')}`};
}
export function comparisonPanel(state:UIState):string{
  const comparison=state.comparison;
  return `<details id="comparison-options" class="comparison-panel simple-options"><summary>Comparar dos Biblias</summary><div class="advanced-content"><div class="comparison-controls"><label for="comparison-translation">Comparar traducciones</label><select id="comparison-translation"><option value="">Sin comparación</option>${state.snapshot.bibles.filter(b=>b.id!==state.bible.id).map(b=>`<option value="${esc(b.id)}" ${state.comparisonId===b.id?'selected':''}>${esc(b.name)}</option>`).join('')}</select></div>${state.snapshot.bibles.length<2?'<p class="small-note">Importa otra Biblia o descárgala desde Ajustes para comparar el mismo pasaje.</p>':''}${comparison?`<div class="comparison-grid"><div><h3>${esc(state.bible.name)}</h3>${state.selected.map(v=>`<p><small>${esc(reference(v))}</small>${esc(v.text)}</p>`).join('')}</div><div><h3>${esc(comparison.name)}</h3>${comparison.provenance?.notice?`<p class="small-note">${esc(comparison.provenance.notice)}</p>`:""}${state.selected.map(v=>{const items=matching(v,state);return items.length?items.map(item=>`<p><small>${esc(reference(item))}</small>${esc(item.text)}</p>`).join(''):'<p class="muted">Este versículo no está disponible en esta edición.</p>';}).join('')}</div></div><p class="small-note">Correspondencia por libro, capítulo y versículo. Algunas ediciones usan otra numeración.</p>${button('project-comparison','Proyectar comparación','external','secondary',comparisonSlide(state)&&!state.busy?'':'disabled')}`:''}</div></details>`;
}

