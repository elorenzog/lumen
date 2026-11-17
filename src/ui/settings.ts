import { aboutLumen } from './about';
import { baseScreenSettings } from './base-screen';
import { bibleAppearance } from './inspector-context';
import { button, esc, icon } from './primitives';
import { remoteSettings } from './remote-settings';
import type { UIState } from './state';
import { translationsSettings } from './translations';
import { uiThemeSettings } from './ui-theme';
import type { Snapshot } from '../shared/contracts';

function startupSettings(startup: Snapshot['startup']): string {
  return `<section class="settings-card startup-settings"><h2>Inicio de Windows</h2><label class="auto-label" for="start-with-windows"><input type="checkbox" id="start-with-windows" ${startup.enabled ? 'checked' : ''} ${!startup.supported || startup.error ? 'disabled' : ''} aria-describedby="startup-note"><span>Iniciar LUMEN con Windows</span></label><p class="muted" id="startup-note">Al iniciar sesión, LUMEN se abrirá minimizada en la barra de tareas, con esta biblioteca y sin activar la proyección. Desmarca la opción para quitar el inicio automático.</p>${startup.error ? `<p role="alert">No se pudo consultar el inicio automático: ${esc(startup.error)}</p>` : !startup.supported ? '<p class="small-note">Disponible únicamente en Windows.</p>' : ''}<p class="small-note">Si cambias la ubicación de LUMEN, vuelve a activar esta opción desde la nueva ubicación.</p></section>`;
}

const tabs = [
  { id: 'general', label: 'General' },
  { id: 'biblioteca', label: 'Biblioteca' },
  { id: 'proyeccion', label: 'Proyección' },
  { id: 'remoto', label: 'Control remoto' },
  { id: 'acerca', label: 'Acerca de' },
] as const;
export type SettingsTab = typeof tabs[number]['id'];

export function parseSettingsTab(value: unknown): SettingsTab {
  return tabs.find(tab => tab.id === value)?.id ?? 'general';
}

export function settingsTabKeys(event: KeyboardEvent): void {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement) || target.getAttribute('role') !== 'tab') return;
  const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
  if (!keys.includes(event.key)) return;
  const buttons = [...(target.closest('.settings-tabs')?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [])];
  const index = buttons.indexOf(target);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
  event.preventDefault();
  event.stopPropagation();
  buttons[next]?.click();
}

function projectionSettings(state: UIState): string {
  const output = state.snapshot.output;
  return `<section class="settings-card"><h2>${icon('monitor')} Pantalla de la iglesia</h2><p class="muted">Elige dónde mostrar los versículos y los himnos.</p><label class="field-label" for="display">Pantalla de salida</label><select id="display">${state.snapshot.displays.map(display => `<option value="${display.id}" ${state.displayId === display.id ? 'selected' : ''}>${esc(display.label)}${display.primary ? ' · Principal' : ''} · ${display.width} × ${display.height}</option>`).join('')}</select><div class="settings-import-actions">${button(output.connected ? 'close-output' : 'open-output', output.connected ? 'Cerrar proyección' : 'Abrir proyección', 'external')}</div></section>${baseScreenSettings(state)}<section class="settings-card"><h2>Versículos en pantalla</h2><p class="muted">Personaliza el fondo, el tamaño de letra y la selección automática.</p>${bibleAppearance(state.snapshot)}</section><section class="settings-card"><h2>${icon('volume')} Audio de la proyección</h2><label for="volume">Volumen <span>${Math.round(state.snapshot.settings.volume * 100)}%</span></label><input type="range" id="volume" min="0" max="1" step="0.05" value="${state.snapshot.settings.volume}"><p class="muted">El sonido se reproduce en la computadora. La vista previa permanece en silencio.</p></section>`;
}

export function settingsPage(state: UIState): string {
  const active = state.settingsTab ?? 'general';
  const content = active === 'general' ? `${uiThemeSettings()}${startupSettings(state.snapshot.startup)}<section class="settings-card"><h2>${icon('keyboard')} Atajos del teclado</h2><p class="muted">También puedes trabajar con el teclado.</p><dl class="shortcuts"><div><dt>Versículo anterior / siguiente</dt><dd>← / →</dd></div><div><dt>Mostrar la selección</dt><dd>Ctrl + Enter</dd></div><div><dt>Ocultar / mostrar pantalla</dt><dd>B</dd></div><div><dt>Cerrar la pantalla de salida</dt><dd>Esc en la salida</dd></div></dl></section>`
    : active === 'biblioteca' ? `<section class="settings-card"><h2>${icon('music')} Himnario</h2><p class="muted">${state.snapshot.hymns.length} archivos disponibles. Agrega tus vídeos y elige su edición desde el Himnario.</p><div class="settings-import-actions">${button('import-folder', 'Agregar carpeta de himnos', 'folder', 'secondary', state.busy ? 'disabled' : '')}${button('view-himnario', 'Ir al Himnario', 'music', 'ghost')}</div></section>${translationsSettings(state)}`
    : active === 'proyeccion' ? projectionSettings(state)
    : active === 'remoto' ? remoteSettings(state)
    : aboutLumen(state);
  return `<div class="settings-page"><header class="settings-heading"><h1>Configuración</h1></header><div class="settings-body"><div class="settings-tabs" role="tablist" aria-label="Secciones de configuración">${tabs.map(tab => `<button type="button" role="tab" id="settings-tab-${tab.id}" aria-selected="${active === tab.id}" aria-controls="settings-panel-${tab.id}" tabindex="${active === tab.id ? 0 : -1}" data-action="settings-tab" data-id="${tab.id}">${tab.label}</button>`).join('')}</div><div role="tabpanel" id="settings-panel-${active}" aria-labelledby="settings-tab-${active}" tabindex="0" class="settings-panel">${content}</div></div></div>`;
}
