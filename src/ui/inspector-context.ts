import type { Hymn, Snapshot } from '../shared/contracts';
import { formatTime } from '../shared/domain';
import { hymnReference } from '../shared/hymn-editions';
import { selectedOldCatalog } from '../shared/old-hymn-catalog';
import { button, esc, icon } from './primitives';
import { currentHymn, selectionSlide } from './state';
import type { UIState } from './state';
import { stageMarkup } from './stage';

export function trackLabel(hymn: Hymn | undefined, track: number): string {
  if (!hymn) return 'Audio del himno';
  if (track === hymn.sungTrack) return 'Cantado';
  if (track === hymn.instrumentalTrack) return 'Instrumental';
  return hymn.tracks.find(audio => audio.index === track)?.label ?? 'Audio del himno';
}

export function preparationPanel(state: UIState): string {
  const slide = selectionSlide(state);
  switch (state.view) {
    case 'biblia': {
      const ready = slide.kind === 'verse';
      return `<section class="preview-section" data-projection-context="biblia"><div class="projection-context"><span>${icon('book')} BIBLIA · PREPARACIÓN</span><strong>${ready ? esc(slide.reference) : 'Selecciona un pasaje'}</strong><small>${esc(state.bible.name)}</small></div><div class="preview-label"><span>VISTA PREVIA</span><span>16:9</span></div>${stageMarkup(slide, state.snapshot)}<div class="preview-description">${ready ? 'Este pasaje está preparado para proyectar.' : 'Elige un versículo para preparar la pantalla.'}</div></section>${button('project', 'Proyectar selección', 'external', 'primary project-button', state.busy || !ready ? 'disabled' : '')}${button('add-program', 'Añadir al programa', 'plus', 'ghost add-program', !ready ? 'disabled' : '')}`;
    }
    case 'himnario': {
      const hymn = currentHymn(state);
      const unavailable=selectedOldCatalog(state.snapshot,state.selectedHymn);
      if(unavailable&&!hymn)return `<section class="preview-section" data-projection-context="himnario"><div class="projection-context"><span>${icon('music')} HIMNARIO ANTIGUO</span><strong>${unavailable.number} · ${esc(unavailable.title)}</strong><small>Canción no disponible</small></div><p class="preview-description">${unavailable.status==='review'?'Revisa las referencias vinculadas antes de reproducir.':'No hay un archivo de reproducción vinculado.'}</p></section>${button('project','Reproducir en pantalla','play','primary project-button','disabled')}${button('add-program','Añadir al programa','plus','ghost add-program','disabled')}`;
      const pending = state.snapshot.output.preparing;
      const samePending = pending?.hymnId === hymn?.id && pending?.track === state.track;
      return `<section class="preview-section" data-projection-context="himnario"><div class="projection-context"><span>${icon('music')} HIMNARIO · PREPARACIÓN</span><strong>${hymn ? esc(hymnReference(hymn,state.hymnEdition)) : 'Selecciona un himno'}</strong><small>${hymn ? `${esc(trackLabel(hymn, state.track))} · ${formatTime(hymn.duration)}` : 'Busca por número o nombre en tu biblioteca.'}</small></div><div class="preview-label"><span>VISTA PREVIA</span><span>16:9</span></div>${stageMarkup(slide, state.snapshot)}<div class="preview-description">${samePending ? 'Preparando este himno…' : 'La selección se reproduce al enviarla a la pantalla.'}</div></section>${button('project', samePending ? 'Preparando himno…' : 'Reproducir en pantalla', 'play', 'primary project-button', state.busy || !hymn || samePending ? 'disabled' : '')}${button('add-program', 'Añadir al programa', 'plus', 'ghost add-program', !hymn ? 'disabled' : '')}`;
    }
    case 'programa': return `<section class="preview-section" data-projection-context="programa"><div class="projection-context"><span>${icon('list')} PROGRAMA DEL CULTO</span><strong>${state.snapshot.program.length} elementos preparados</strong><small>Reproduce cada pasaje o himno desde su botón en el programa.</small></div></section>`;
    case 'ajustes': return `<section class="preview-section" data-projection-context="ajustes"><div class="projection-context"><span>${icon('settings')} AJUSTES</span><strong>Configuración de LUMEN</strong><small>La salida actual permanece identificada en el monitor.</small></div></section>`;
    default: state.view satisfies never; return '';
  }
}

export function bibleAppearance(snapshot: Snapshot): string {
  const { settings } = snapshot;
  return `<section class="appearance"><div class="section-heading"><h3>Apariencia de los versículos</h3>${icon('settings')}</div><label class="field-label" for="theme">Fondo</label><select id="theme">${settings.appearance.mode !== 'preset' ? '<option value="custom" selected disabled>Fondo personalizado</option>' : ''}<option value="noche" ${settings.appearance.mode === 'preset' && settings.theme === 'noche' ? 'selected' : ''}>Noche serena</option><option value="amanecer" ${settings.appearance.mode === 'preset' && settings.theme === 'amanecer' ? 'selected' : ''}>Luz del amanecer</option><option value="negro" ${settings.appearance.mode === 'preset' && settings.theme === 'negro' ? 'selected' : ''}>Negro esencial</option></select>${button('appearance-open', 'Personalizar fondo y texto', 'settings', 'secondary appearance-open')}<div class="range-heading"><label for="font-size">Tamaño del texto</label><span>${settings.fontSize}</span></div><input id="font-size" type="range" min="24" max="76" value="${settings.fontSize}" step="2"><label class="auto-label"><input id="auto-project" type="checkbox" ${settings.autoProject ? 'checked' : ''}><span>Proyectar al seleccionar<small>Envía los versículos automáticamente</small></span></label></section>`;
}

export function hymnAudio(snapshot: Snapshot): string {
  return `<section class="hymn-audio-settings"><div class="section-heading"><h3>Audio del himnario</h3>${icon('volume')}</div><div class="range-heading"><label for="hymn-volume">Volumen de salida</label><span>${Math.round(snapshot.settings.volume * 100)}%</span></div><input id="hymn-volume" type="range" min="0" max="1" step="0.05" value="${snapshot.settings.volume}"><p class="small-note">Pausar conserva la posición. Detener cierra el himno.</p></section>`;
}
