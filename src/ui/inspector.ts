import { button, esc, icon, iconButton } from './primitives';
import type { UIState } from './state';
import { stageMarkup } from './stage';
import { formatTime, playbackPosition } from '../shared/domain';
import { historyPanel } from './history';
import { bibleAppearance, hymnAudio, preparationPanel, trackLabel } from './inspector-context';

export function inspector(state: UIState): string {
  const { output } = state.snapshot;
  const active = output.connected && !output.blackout;
  const liveHymnId = output.slide.kind === 'hymn' ? output.slide.hymnId : null;
  const hymn = state.snapshot.hymns.find(item => item.id === liveHymnId);
  const pending = output.preparing;
  const status = pending ? 'Preparando' : !output.connected ? 'Desconectada' : output.blackout ? 'Oculta' : output.slide.kind === 'hymn' ? output.playing ? 'Reproduciendo' : 'Pausada' : 'Conectada';
  const playbackState = pending ? 'preparing' : !output.connected ? 'disconnected' : output.blackout ? 'hidden' : output.slide.kind === 'hymn' ? output.playing ? 'playing' : 'paused' : output.slide.kind === 'verse' ? 'verse' : 'idle';
  const title = output.slide.kind === 'verse' ? `${output.slide.reference} · ${output.slide.translation}` : output.slide.kind === 'hymn' ? output.slide.title : state.view === 'himnario' ? 'Sin himno en reproducción' : 'Pantalla de bienvenida';
  const detail = output.slide.kind === 'hymn' ? trackLabel(hymn, output.slide.track) : output.slide.kind === 'verse' ? 'Pasaje en la salida' : 'Lista para el siguiente momento';
  return `<div class="inspector-heading"><h2>Proyección</h2><span class="status-pill ${active ? 'connected' : ''}"><i></i>${status}</span></div>
    <section class="monitor-box"><div>${icon('monitor')}<div><label for="display">Pantalla de salida</label><select id="display">${state.snapshot.displays.map(display => `<option value="${display.id}" ${state.displayId === display.id ? 'selected' : ''}>${esc(display.label)}${display.primary ? ' · Principal' : ''} · ${display.width} × ${display.height}</option>`).join('')}</select></div></div>${button(output.connected ? 'close-output' : 'open-output', output.connected ? 'Cerrar proyección' : 'Abrir pantalla', 'external', 'ghost', state.busy ? 'disabled' : '')}</section>
    ${preparationPanel(state)}
    <section class="live-section" data-live-kind="${output.slide.kind}" data-playback-state="${playbackState}"><div class="preview-label"><span><i class="live-dot ${active ? 'on' : ''}"></i>EN VIVO</span><span>${output.blackout ? 'PANTALLA NEGRA' : output.connected ? 'SALIDA ACTIVA' : 'SIN SALIDA'}</span></div><div class="live-identity"><strong>${esc(title)}</strong><small>${esc(detail)}</small></div><div class="live-stage ${output.blackout ? 'blacked-out' : ''}" data-live-preview>${stageMarkup(output.slide, state.snapshot)}</div>
    ${pending ? `<div class="pending-playback" role="status">${icon('settings')}<span><strong>${esc(pending.title)}</strong><small>Preparando ${esc(trackLabel(state.snapshot.hymns.find(item => item.id === pending.hymnId), pending.track))}…</small></span>${button('stop', 'Cancelar preparación', 'stop', 'secondary')}</div>` : output.slide.kind === 'hymn' ? `<div class="playback"><div class="playback-top">${iconButton('toggle-play', output.playing ? 'Pausar' : 'Reanudar', output.playing ? 'pause' : 'play')}${iconButton('stop', 'Detener y cerrar himno', 'stop')}<span id="playback-time">${formatTime(playbackPosition(output))}</span></div><label class="sr-only" for="seek">Posición del himno</label><input type="range" id="seek" min="0" step="0.1" max="${hymn?.duration ?? 0}" value="${playbackPosition(output)}"></div>` : ''}
    <div class="output-actions">${button('blackout', output.blackout ? 'Mostrar pantalla' : 'Pantalla negra', 'hide', output.blackout ? 'secondary toggled' : 'secondary', `aria-pressed="${output.blackout}"`)}${iconButton('welcome', 'Mostrar bienvenida', 'sun')}</div></section>
    ${historyPanel(state)}${state.view === 'biblia' ? bibleAppearance(state.snapshot) : state.view === 'himnario' ? hymnAudio(state.snapshot) : ''}
    ${state.view === 'biblia' || state.view === 'himnario' ? `<div class="keyboard-hint">${icon('keyboard')}<span>${state.view === 'biblia' ? '<kbd>←</kbd><kbd>→</kbd> Versículo' : '<kbd>Ctrl</kbd> + <kbd>Enter</kbd> Reproducir'} <kbd>B</kbd> Ocultar</span></div>` : ''}`;
}
