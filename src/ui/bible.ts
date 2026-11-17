import { books, normalize, reference, searchVerses } from '../shared/domain';
import { button, esc, icon, iconButton } from './primitives';
import type { UIState } from './state';
import { comparisonPanel } from './comparison';
import { quickSelector } from './quick-selector';

export function bibleLibrary(state:UIState):string{
  const available=new Set(state.bible.verses.map(v=>v.book));
  return `<div class="library-heading"><span class="overline">BIBLIOTECA</span>${icon('book')}</div>
    <label class="field-label" for="translation">Traducción</label><select id="translation">${state.snapshot.bibles.map(b=>`<option value="${esc(b.id)}" ${b.id===state.bible.id?'selected':''}>${esc(b.name)}</option>`).join('')}</select>
    <div class="library-divider"></div><div class="library-heading"><h2>1. Elige un libro</h2><span class="count">${available.size}</span>${iconButton('book-layout',state.bookLayout==='grid'?'Ver lista':'Selección rápida','list')}</div>
    <div class="compact-search">${icon('search')}<input id="book-search" aria-label="Buscar libro" placeholder="Buscar un libro" value="${esc(state.bookQuery)}"></div>
    <div class="segmented" aria-label="Testamento">${[['all','Todos'],['old','A. T.'],['new','N. T.']].map(([id,label])=>`<button data-action="testament" data-id="${id}" aria-pressed="${state.testament===id}" class="${state.testament===id?'active':''}">${label}</button>`).join('')}</div>
    <div class="book-list ${state.bookLayout==='grid'?'book-grid':''}">${books.map((book,index)=>({book,id:index+1})).filter(b=>available.has(b.id)&&normalize(b.book).includes(normalize(state.bookQuery))&&(state.testament==='all'||(state.testament==='old'?b.id<=39:b.id>=40))).map(b=>`<button class="book-row ${b.id===state.book?'selected':''}" data-action="book" data-id="${b.id}" title="${esc(b.book)}" aria-label="${esc(b.book)}" aria-pressed="${b.id===state.book}">${icon('book')}<span>${esc(b.book)}</span>${b.id===state.book?icon('right'):''}</button>`).join('')||'<p class="muted padded">No se encontraron libros.</p>'}</div>
    <div class="library-bottom">${button('import-bible','Importar Biblia','plus','ghost')}</div>`;
}
export function bibleReader(state:UIState):string{
  const searching=state.query.trim().length>0;
  const verses=searching?(state.searchResults??searchVerses(state.bible,state.query)):state.bible.verses.filter(v=>v.book===state.book&&v.chapter===state.chapter);
  const chapters=[...new Set(state.bible.verses.filter(v=>v.book===state.book).map(v=>v.chapter))];
  const selected=state.selected[0];
  return `<div class="reader-toolbar"><div class="breadcrumb">Biblia ${icon('right')} ${esc(books[state.book-1])}</div><span class="edition-tag">${esc(state.bible.abbreviation)}</span></div>
    <div class="reader-heading"><div><div class="overline">${state.book<=39?'ANTIGUO':'NUEVO'} TESTAMENTO</div><h1>${searching?'Resultados de búsqueda':esc(books[state.book-1])}</h1></div><div class="chapter-controls">${iconButton('previous-chapter','Capítulo anterior','left')}<label class="sr-only" for="chapter">Capítulo</label><select id="chapter">${chapters.map(ch=>`<option value="${ch}" ${ch===state.chapter?'selected':''}>Capítulo ${ch}</option>`).join('')}</select>${iconButton('next-chapter','Capítulo siguiente','right')}</div></div>
    ${quickSelector(state)}${comparisonPanel(state)}
    <div class="reader-description">${searching?`${verses.length}${verses.length===100?'+':''} coincidencias · Selecciona un versículo para prepararlo`:`${verses.length} versículos · ${esc(state.bible.name)}`}</div>
    <div class="verses" aria-label="Versículos">${verses.map(v=>`<button type="button" class="verse ${state.selected.some(s=>s.book===v.book&&s.chapter===v.chapter&&s.verse===v.verse)?'selected':''}" data-action="verse" data-book="${v.book}" data-chapter="${v.chapter}" data-id="${v.verse}" aria-pressed="${state.selected.some(s=>s.book===v.book&&s.chapter===v.chapter&&s.verse===v.verse)}"><span class="verse-number">${searching?esc(reference(v)):v.verse}</span><span class="verse-text">${esc(v.text)}</span></button>`).join('')||`<div class="no-results">${icon('search')}<h2>No encontramos ese pasaje</h2><p>Prueba «Juan 3:16», «Salmos 23» o una palabra del texto.</p>${button('clear-search','Volver al capítulo','left')}</div>`}</div>
    <div class="reader-foot"><span>${selected?esc(reference(selected)):'Selecciona un versículo'}</span><span>Mayús + clic para seleccionar un rango</span></div>`;
}
