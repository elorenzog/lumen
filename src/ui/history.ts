import { button,esc,icon } from './primitives';
import type { UIState } from './state';
export function historyPanel(state:UIState):string{
  const history=state.snapshot.history.filter(item=>state.view==='biblia'?item.slide.kind==='verse':state.view==='himnario'?item.slide.kind==='hymn':true);
  const label=state.view==='biblia'?'Historial de pasajes':state.view==='himnario'?'Historial de himnos':'Historial de proyección';
  return `<details class="history-panel"><summary>${icon('list')} ${label} <span class="count">${history.length}</span></summary><div class="history-list">${history.map(item=>`<div><span>${esc(item.title)}</span>${button('history-play','Volver a proyectar','play','ghost',`data-id="${esc(item.id)}" aria-label="Volver a proyectar ${esc(item.title)}" title="${esc(item.title)}" ${state.busy?'disabled':''}`)}</div>`).join('')||'<p class="small-note">Aquí aparecerán los elementos que proyectes en esta sección.</p>'}</div></details>`;
}
