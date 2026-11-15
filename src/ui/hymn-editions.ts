import type { Hymn } from '../shared/contracts';
import { editionNames, editionNumber, matchesHymnEdition } from '../shared/hymn-editions';
import type { UIState } from './state';
import { esc } from './primitives';

export function hymnEditionPicker(state: UIState): string {
  const count = (edition: UIState['hymnEdition']): number => state.snapshot.hymns.filter(hymn => matchesHymnEdition(hymn, edition)).length;
  const choice = (edition: UIState['hymnEdition'], label: string): string => `<button type="button" data-action="hymn-edition" data-id="${edition}" aria-pressed="${state.hymnEdition === edition}" class="edition-choice ${state.hymnEdition === edition ? 'selected' : ''}"><strong>${label}</strong><small>${edition==='1962'&&state.snapshot.oldHymnCatalog.length?`${state.snapshot.oldHymnCatalog.length} títulos`:`${count(edition)} disponibles`}</small></button>`;
  return `<fieldset class="edition-picker" id="hymn-edition"><legend>Elige el himnario</legend><div class="edition-main-choices">${choice('1962', 'Antiguo <span>1962</span>')}${choice('2009', 'Nuevo <span>2009</span>')}</div><div class="edition-other-choices">${choice('all', 'Todos')}${choice('unknown', 'Sin identificar')}</div></fieldset>`;
}
export function hymnNumberingSummary(hymn: Hymn): string {
  return (['1962', '2009'] as const).map(edition => {
    const number = editionNumber(hymn, edition);
    return `${edition === '1962' ? 'Antiguo' : 'Nuevo'} ${number === null ? '—' : String(number).padStart(3, '0')}`;
  }).join(' · ');
}
export function hymnNumberingDetail(hymn: Hymn): string {
  return `<section class="hymn-numbering" aria-label="Numeración del himno">${(['1962', '2009'] as const).map(edition => {
    const number = editionNumber(hymn, edition);
    return `<div data-numbering="${edition}"><span>${editionNames[edition]}</span>${number === null ? '<small>Sin equivalencia disponible</small>' : `<strong>${String(number).padStart(3, '0')}</strong>`}</div>`;
  }).join('')}</section>${hymn.numberingConflict ? '<p class="numbering-warning" role="note">Equivalencia por revisar: la fuente asigna este número antiguo a más de un himno. Se conservan ambas opciones.</p>' : ''}<p class="small-note numbering-note">Video disponible: ${esc(editionNames[hymn.edition])}. Cambiar de himnario cambia la numeración de búsqueda; se conserva el mismo archivo.</p>`;
}
