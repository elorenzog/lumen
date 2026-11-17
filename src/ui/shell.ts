import { settingsPage } from './settings';
import { helpDialog } from './help';
import { appearanceEditor } from './appearance-editor';
import { appVersion } from '../shared/app-info';
import { bibleLibrary, bibleReader } from './bible';
import { hymnLibrary, hymnDetail } from './hymnal';
import { inspector } from './inspector';
import { programPanel } from './program';
import { esc, icon, wordmark } from './primitives';
import type { Icon } from './primitives';
import type { UIState, View } from './state';

const navigation:readonly {readonly view:View;readonly label:string;readonly icon:Icon}[]=[{view:'biblia',label:'Biblia',icon:'book'},{view:'himnario',label:'Himnario',icon:'music'},{view:'programa',label:'Programa',icon:'list'}];
export function shell(state:UIState):string{
  return `<div class="app-shell ${state.view==='ajustes'?'settings-view':''}"><header class="app-header"><div class="brand">${wordmark}<div class="brand-name">LUMEN<span>BIBLIA E HIMNARIO ADVENTISTA</span></div></div><div class="global-search">${icon('search')}<input id="global-search" aria-label="Buscar pasaje o himno" placeholder="${state.view==='himnario'?'Buscar himno por número, letra o referencia…':'Ir a Juan 3:16 o buscar una palabra…'}" value="${esc(state.query)}">${state.query?`<button data-action="clear-search" class="icon-button" aria-label="Limpiar búsqueda">${icon('close')}</button>`:'<kbd>↵</kbd>'}</div><div class="header-caption">La Palabra que ilumina.<br><span>La alabanza que inspira.</span></div></header>
    <aside class="navigation"><div class="nav-caption overline">ESPACIO DE ADORACIÓN</div><nav aria-label="Navegación principal">${navigation.map(n=>`<button data-action="view-${n.view}" class="nav-item ${state.view===n.view?'active':''}" ${state.view===n.view?'aria-current="page"':''} title="${n.label}">${icon(n.icon)}<span>${n.label}</span>${n.view==='programa'?`<span class="nav-count">${state.snapshot.program.length}</span>`:''}</button>`).join('')}</nav><div class="navigation-tools" role="group" aria-label="Ayuda y configuración"><button type="button" data-action="show-help" class="nav-item" aria-haspopup="dialog">${icon('help')}<span>¿Cómo funciona?</span></button><button type="button" data-action="view-ajustes" class="nav-item ${state.view==='ajustes'?'active':''}" ${state.view==='ajustes'?'aria-current="page"':''}>${icon('settings')}<span>Ajustes</span></button></div></aside>
    <main class="workspace ${state.view==='programa'||state.view==='ajustes'?'wide-workspace':''}">${state.view==='biblia'?`<aside class="library">${bibleLibrary(state)}</aside><article class="reader">${bibleReader(state)}</article>`:state.view==='himnario'?`<aside class="library">${hymnLibrary(state)}</aside><article class="reader">${hymnDetail(state)}</article>`:`<article class="reader full-reader">${state.view==='programa'?programPanel(state):settingsPage(state)}</article>`}</main>
    <aside class="inspector" aria-label="Controles de proyección">${state.view==='ajustes'?'':inspector(state)}</aside>
    <footer class="status-bar"><div class="status-message" role="status" aria-live="polite">${icon(state.busy?'settings':'check')}<span id="status-text">${esc(state.message||'Todo listo para compartir la Palabra.')}</span></div><span>${esc(state.view==='biblia'?state.bible.abbreviation:state.view==='himnario'?'HIMNARIO':state.view==='programa'?'PROGRAMA':'AJUSTES')} <span class="status-separator">·</span> ${state.snapshot.hymns.length} himnos <span class="status-separator">·</span> LUMEN ${appVersion}</span></footer></div>${appearanceEditor(state)}${helpDialog(state.helpOpen??false)}<div id="error-toast" class="error-toast" role="alert" hidden></div>`;
}


