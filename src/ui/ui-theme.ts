export type UiThemePreference = 'light' | 'dark' | 'system';

const storageKey = 'lumen.ui-theme';
let preference: UiThemePreference = 'light';
type UiSize = 'normal' | 'large' | 'larger';
let size: UiSize = 'normal';
const sizeKey = 'lumen.ui-size';

export function parseUiTheme(value: unknown): UiThemePreference {
  return value === 'dark' || value === 'system' ? value : 'light';
}

export function resolveUiTheme(value: UiThemePreference, systemDark: boolean): 'light' | 'dark' {
  return value === 'system' ? (systemDark ? 'dark' : 'light') : value;
}

export function initializeUiTheme(): void {
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  try {
    preference = parseUiTheme(window.localStorage.getItem(storageKey));
    const savedSize = window.localStorage.getItem(sizeKey);
    size = savedSize === 'large' || savedSize === 'larger' ? savedSize : 'normal';
  } catch (error: unknown) {
    if (!(error instanceof Error)) throw error;
    console.warn('No se pudo leer la apariencia de LUMEN.', error.name);
  }
  const apply = (): void => {
    document.documentElement.dataset['uiTheme'] = resolveUiTheme(preference, system.matches);
    document.documentElement.dataset['uiSize'] = size;
    for (const card of document.querySelectorAll<HTMLElement>('[data-theme-choice]')) {
      card.setAttribute('aria-pressed', String(card.dataset['themeChoice'] === preference));
    }
    for (const card of document.querySelectorAll<HTMLElement>('[data-size-choice]')) {
      card.setAttribute('aria-pressed', String(card.dataset['sizeChoice'] === size));
    }
  };
  apply();
  system.addEventListener('change', apply);
  const save = (): void => {
    apply();
    try {
      window.localStorage.setItem(storageKey, preference);
      window.localStorage.setItem(sizeKey, size);
    } catch (error: unknown) {
      if (!(error instanceof Error)) throw error;
      const status = document.getElementById('status-text');
      if (status) status.textContent = 'Apariencia aplicada. No se pudo guardarla para la próxima apertura.';
      console.warn('No se pudo guardar la apariencia de LUMEN.', error.name);
    }
  };
  document.addEventListener('click', event => {
    const card = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-theme-choice],[data-size-choice]') : null;
    if (!card) return;
    if (card.dataset['themeChoice']) preference = parseUiTheme(card.dataset['themeChoice']);
    const selectedSize = card.dataset['sizeChoice'];
    if (selectedSize) size = selectedSize === 'large' || selectedSize === 'larger' ? selectedSize : 'normal';
    save();
  });
  document.addEventListener('keydown', event => {
    const editing = event.target instanceof Element && Boolean(event.target.closest('input,select,textarea,[contenteditable="true"]'));
    if (!event.ctrlKey || editing || !['+', '=', '-', '0'].includes(event.key)) return;
    event.preventDefault();
    const levels = ['normal', 'large', 'larger'] as const;
    size = event.key === '0' ? 'normal' : levels[Math.max(0, Math.min(2, levels.indexOf(size) + (event.key === '-' ? -1 : 1)))] ?? 'normal';
    save();
  });
}

export function uiThemeSettings(): string {
  const options = [
    { value: 'light', label: 'Claro' },
    { value: 'dark', label: 'Oscuro' },
    { value: 'system', label: 'Seguir al sistema' },
  ] as const;
  return `<section class="settings-card ui-theme-settings" aria-labelledby="ui-theme-heading"><h2 id="ui-theme-heading">Apariencia</h2><p class="muted">El modo oscuro es ideal para un templo con las luces bajas.</p><div class="theme-choices" role="group" aria-label="Tema de LUMEN">${options.map(option => `<button type="button" class="theme-choice" data-theme-choice="${option.value}" aria-pressed="${option.value === preference}"><span class="theme-sample sample-${option.value}" aria-hidden="true"><span class="sample-page sample-light"><i></i><i></i></span>${option.value === 'system' ? '<span class="sample-page sample-dark"><i></i><i></i></span>' : ''}</span><span>${option.label}</span></button>`).join('')}</div></section><section class="settings-card"><h2>Tamaño de la interfaz</h2><p class="muted">Agranda las letras, los botones y las listas. También con Ctrl + y Ctrl −; Ctrl 0 vuelve a Normal.</p><div class="size-choices" role="group" aria-label="Tamaño de la interfaz">${([{ value: 'normal', label: 'Normal' }, { value: 'large', label: 'Grande' }, { value: 'larger', label: 'Muy grande' }] as const).map(option => `<button type="button" data-size-choice="${option.value}" aria-pressed="${size === option.value}"><span aria-hidden="true">Aa</span>${option.label}</button>`).join('')}</div></section>`;
}
