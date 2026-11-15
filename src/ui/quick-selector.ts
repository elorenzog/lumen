import type { UIState } from './state';
import { esc, button } from './primitives';

export function quickSelector(state:UIState):string{
  const chapter=state.bible.verses.filter(v=>v.book===state.book&&v.chapter===state.chapter);
  const chapters=[...new Set(state.bible.verses.filter(v=>v.book===state.book).map(v=>v.chapter))];
  return `<section class="quick-selector" aria-label="Selección rápida de pasajes"><div class="quick-selector-heading"><span class="overline">SELECCIÓN RÁPIDA</span><span>Libro → capítulo → versículo</span></div>
  <div class="number-section"><h3>Capítulo</h3><div class="number-grid chapter-grid" aria-label="Capítulos">${chapters.map(ch=>`<button type="button" data-action="chapter-pick" data-id="${ch}" aria-label="Capítulo ${ch}" aria-pressed="${ch===state.chapter}" class="number-button ${ch===state.chapter?'selected':''}">${ch}</button>`).join('')}</div></div>
  <div class="number-section"><h3>Versículo</h3><div class="number-grid verse-grid" aria-label="Elegir versículo">${chapter.map(v=>{const selected=state.selected.some(s=>s.book===v.book&&s.chapter===v.chapter&&s.verse===v.verse);return `<button type="button" data-action="verse" data-book="${v.book}" data-chapter="${v.chapter}" data-id="${v.verse}" aria-label="Versículo ${v.verse}${v.endVerse?` a ${v.endVerse}`:''}" aria-pressed="${selected}" class="number-button ${selected?'selected':''}">${v.verse}${v.endVerse?`–${v.endVerse}`:''}</button>`;}).join('')}</div></div>
  <div class="range-selector"><label for="verse-range">Versículo o rango</label><input id="verse-range" type="text" inputmode="text" placeholder="16-18" value="${esc(state.rangeInput)}" aria-describedby="range-help">${button('select-range','Seleccionar',undefined,'secondary')}</div><p id="range-help" class="small-note">Mayús + clic para ampliar · doble clic para proyectar · Ctrl + L para escribir una referencia</p></section>`;
}
