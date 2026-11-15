import { appearanceEditor } from './appearance-editor';
import { baseScreenSettings } from './base-screen';
import { remoteSettings } from './remote-settings';
import { aboutLumen } from './about';
import { appVersion } from '../shared/app-info';
import { bibleLibrary, bibleReader } from './bible';
import { hymnLibrary, hymnDetail } from './hymnal';
import { inspector } from './inspector';
import { programPanel } from './program';
import { button, esc, icon, wordmark } from './primitives';
import type { Icon } from './primitives';
import type { UIState, View } from './state';
import { translationsSettings } from './translations';

const navigation:readonly {readonly view:View;readonly label:string;readonly icon:Icon}[]=[{view:'biblia',label:'Biblia',icon:'book'},{view:'himnario',label:'Himnario',icon:'music'},{view:'programa',label:'Programa',icon:'list'},{view:'ajustes',label:'Ajustes',icon:'settings'}];
function settings(state:UIState):string{
  return `<div class="settings-page"><div class="overline">TU ESPACIO DE ADORACIÓN</div><h1>Ajustes de LUMEN</h1><p class="muted">Todo preparado para concentrarte en lo que importa.</p>${button('show-about','Acerca de LUMEN','help','ghost')}${remoteSettings(state)}${baseScreenSettings(state)}<section><h2>${icon('volume')} Audio de la proyección</h2><label for="volume">Volumen <span>${Math.round(state.snapshot.settings.volume*100)}%</span></label><input type="range" id="volume" min="0" max="1" step="0.05" value="${state.snapshot.settings.volume}"><p class="muted">La vista previa permanece en silencio. El sonido se reproduce desde la pantalla de salida.</p></section>${translationsSettings(state)}<section><h2>${icon('keyboard')} Atajos del operador</h2><dl class="shortcuts"><div><dt>Versículo anterior / siguiente</dt><dd>← / →</dd></div><div><dt>Proyectar selección</dt><dd>Ctrl + Enter</dd></div><div><dt>Ocultar / mostrar pantalla y audio</dt><dd>B</dd></div><div><dt>Cerrar salida de proyección</dt><dd>Esc en la salida</dd></div></dl></section>${aboutLumen(state)}</div>`;
}
export function shell(state:UIState):string{
  return `<div class="app-shell"><header class="app-header"><div class="brand">${wordmark}<div class="brand-name">LUMEN<span>BIBLIA E HIMNARIO ADVENTISTA</span></div></div><div class="global-search">${icon('search')}<input id="global-search" aria-label="Buscar pasaje o himno" placeholder="${state.view==='himnario'?'Buscar himno por número, letra o referencia…':'Ir a Juan 3:16 o buscar una palabra…'}" value="${esc(state.query)}">${state.query?`<button data-action="clear-search" class="icon-button" aria-label="Limpiar búsqueda">${icon('close')}</button>`:'<kbd>↵</kbd>'}</div><div class="header-caption">La Palabra que ilumina.<br><span>La alabanza que inspira.</span></div></header>
    <aside class="navigation"><div class="nav-caption overline">ESPACIO DE ADORACIÓN</div><nav aria-label="Navegación principal">${navigation.map(n=>`<button data-action="view-${n.view}" class="nav-item ${state.view===n.view?'active':''}" ${state.view===n.view?'aria-current="page"':''} title="${n.label}">${icon(n.icon)}<span>${n.label}</span>${n.view==='programa'?`<span class="nav-count">${state.snapshot.program.length}</span>`:''}</button>`).join('')}</nav><div class="nav-footer"><div class="nav-verse">«Lámpara es a mis pies tu palabra, y lumbrera a mi camino.»</div><span>SALMOS 119:105 · RV1909</span><div class="offline-note"><i></i>Disponible sin conexión</div></div></aside>
    <main class="workspace ${state.view==='programa'||state.view==='ajustes'?'wide-workspace':''}">${state.view==='biblia'?`<aside class="library">${bibleLibrary(state)}</aside><article class="reader">${bibleReader(state)}</article>`:state.view==='himnario'?`<aside class="library">${hymnLibrary(state)}</aside><article class="reader">${hymnDetail(state)}</article>`:`<article class="reader full-reader">${state.view==='programa'?programPanel(state):settings(state)}</article>`}</main>
    <aside class="inspector" aria-label="Controles de proyección">${inspector(state)}</aside>
    <footer class="status-bar"><div class="status-message" role="status" aria-live="polite">${icon(state.busy?'settings':'check')}<span id="status-text">${esc(state.message||'Todo listo para compartir la Palabra.')}</span></div><span>${esc(state.view==='biblia'?state.bible.abbreviation:state.view==='himnario'?'HIMNARIO':state.view==='programa'?'PROGRAMA':'AJUSTES')} <span class="status-separator">·</span> ${state.snapshot.hymns.length} himnos <span class="status-separator">·</span> LUMEN ${appVersion}</span></footer></div>${appearanceEditor(state)}<div id="error-toast" class="error-toast" role="alert" hidden></div>`;
}


