import type { OldCatalogRow } from '../shared/old-hymn-catalog';
import { oldCatalogRows, selectedOldCatalog } from '../shared/old-hymn-catalog';
import type { UIState } from './state';
import { button, esc, icon } from './primitives';
import { formatTime } from '../shared/domain';

export const catalogueStatus = (row: OldCatalogRow): string => row.status === 'available' ? 'Disponible' : row.status === 'review' ? 'Equivalencia por revisar' : 'Canción no disponible';
export function oldConflictOptions(state:UIState):string{
  if(state.hymnEdition!=='1962')return '';
  const row=selectedOldCatalog(state.snapshot,state.selectedHymn)??oldCatalogRows(state.snapshot).find(row=>row.media.some(hymn=>hymn.id===state.selectedHymn));
  return row?.conflict?`<details class="catalogue-media-options"><summary>Revisar ${row.media.length} videos vinculados</summary><p class="small-note">La reproducción disponible corresponde al título del catálogo. Las otras referencias de la fuente se conservan para revisión.</p>${row.media.map(hymn=>button('hymn',`${hymn.number2009??hymn.number} · ${hymn.title}`,'music','secondary',`data-id="${esc(hymn.id)}"`)).join('')}</details>`:'';
}
export function oldCatalogRow(row: OldCatalogRow, selection: string | null): string {
  const selected = row.id === selection || row.media.some(hymn => hymn.id === selection);
  return `<button type="button" class="hymn-row catalogue-row ${selected ? 'selected' : ''} ${row.status === 'available' ? '' : 'song-unavailable'}" data-action="hymn" data-id="${row.id}" data-availability="${row.status}" ${row.playable ? `data-media-id="${esc(row.playable.id)}"` : ''}><span class="hymn-number">${String(row.number).padStart(3, '0')}</span><span><strong>${esc(row.title)}</strong><small>${catalogueStatus(row)}${row.playable ? ` · Nuevo ${row.playable.number2009 ?? '—'}<br>${formatTime(row.playable.duration)}` : ''}</small></span>${icon('right')}</button>`;
}
export function unavailableOldDetail(state: UIState): string | null {
  const row = selectedOldCatalog(state.snapshot, state.selectedHymn);
  if (!row || row.playable) return null;
  return `<div class="reader-toolbar"><div class="breadcrumb">Himnario ${icon('right')} Himno ${row.number}</div><span class="edition-tag">Antiguo (1962)</span></div><div class="hymn-detail unavailable-detail"><div class="overline">HIMNARIO ADVENTISTA ANTIGUO</div><div class="large-number">${String(row.number).padStart(3, '0')}</div><h1>${esc(row.title)}</h1><p class="song-availability" role="status">${catalogueStatus(row)}</p><p class="muted">${row.status === 'missing' ? 'Este himno forma parte del catálogo completo de 1962. No tiene un archivo de reproducción vinculado en tu biblioteca.' : 'Hay varias referencias para este número. Revisa los videos antes de elegir uno.'}</p>${row.media.length ? `<section class="catalogue-media-options"><h2>Videos vinculados para revisar</h2>${row.media.map(hymn => button('hymn', `${hymn.number2009 ?? hymn.number} · ${hymn.title}`, 'music', 'secondary', `data-id="${esc(hymn.id)}"`)).join('')}</section>` : ''}<div class="detail-actions">${button('project', 'Reproducir en pantalla', 'play', 'primary', 'disabled')}${button('add-program', 'Añadir al programa', 'plus', 'secondary', 'disabled')}</div><p class="small-note">Puedes importar un MKV y asignarle este número antiguo en la información del himno.</p></div>`;
}
