import { describe, expect, it, vi } from 'vitest';
import { defaults, hymnSchema, snapshotSchema, welcome } from '../src/shared/contracts';
import type { Bible, Output, Snapshot } from '../src/shared/contracts';
import type { UIState, View } from '../src/ui/state';
import { inspector } from '../src/ui/inspector';
import { settingsPage } from '../src/ui/settings';

vi.mock('lucide', async importOriginal => ({
  ...await importOriginal<typeof import('lucide')>(),
  createElement: () => ({ outerHTML: '<svg aria-hidden="true"></svg>' }),
}));

const bible: Bible = { id: 'test', name: 'Biblia de prueba', abbreviation: 'PR', source: 'fixture', license: 'fixture', verses: [{ book: 43, chapter: 3, verse: 16, text: 'Pasaje seleccionado' }] };
const hymn = hymnSchema.parse({ id: 'hymn-one', number: 3, title: 'Himno seleccionado', path: 'song.mkv', duration: 120, tracks: [{ index: 1, label: 'Voz', language: 'und' }, { index: 2, label: 'Pista', language: 'und' }], size: 100, modified: 1, sungTrack: 1, instrumentalTrack: 2 });
function fixture(view: View, output: Partial<Output> = {}): UIState {
  const snapshot: Snapshot = snapshotSchema.parse({ ...defaults, hymns: [hymn], bibles: [], displays: [{ id: 1, label: 'Proyector', width: 1920, height: 1080, primary: true }], output: { slide: welcome, playing: false, blackout: false, connected: false, displayId: null, position: 0, updatedAt: 0, revision: 0, ...output } });
  return { appearanceDraft: null, appearanceBusy: false, presetName: '', presetId: '', appearanceMessage: '', rangeInput: '', snapshot, bible, view, book: 43, chapter: 3, selected: bible.verses, selectedHymn: hymn.id, track: 2, query: '', bookQuery: '', testament: 'all', busy: false, message: '', displayId: 1, comparison: null, comparisonId: '', catalog: [], catalogLoaded: false, searchResults: null, bookLayout: 'grid', hymnEdition: 'all', favoriteOnly: false, hymnSearchScope: 'all', hymnDraft: null };
}

describe('Given projection controls for different preparation sections', () => {
  it('offers reversible minimized Windows startup without changing projection settings', () => {
    const state = fixture('ajustes');
    for (const enabled of [false, true]) {
      state.snapshot = snapshotSchema.parse({ ...state.snapshot, startup: { supported: true, enabled, error: null } });
      const html = settingsPage(state);
      expect(html).toContain('id="start-with-windows"');
      expect(html).toContain('Iniciar LUMEN con Windows');
      expect(html).toContain('minimizada');
      expect(html).toMatch(enabled ? /id="start-with-windows"[^>]*checked/ : /id="start-with-windows"(?![^>]*checked)/);
      expect(state.snapshot.settings).toEqual(defaults.settings);
    }
  });
  it('exposes audio controls without verse controls when preparing a hymn', () => {
    const html = inspector(fixture('himnario'));
    expect(html).toContain('data-projection-context="himnario"');
    expect(html).toContain('id="hymn-volume"');
    expect(html).not.toContain('id="auto-project"');
    expect(html).not.toContain('id="font-size"');
    expect(html).not.toContain('data-action="appearance-open"');
    expect(html).not.toContain('Pasaje seleccionado');
  });
  it('exposes verse controls without hymn audio settings in Bible mode', () => {
    const html = inspector(fixture('biblia'));
    expect(html).toContain('data-projection-context="biblia"');
    expect(html).toContain('id="auto-project"');
    expect(html).not.toContain('id="hymn-volume"');
  });
  it('keeps transport for the actual live hymn when navigating to the Bible', () => {
    const state = fixture('biblia', { connected: true, playing: false, slide: { kind: 'hymn', hymnId: hymn.id, title: 'Himno en la salida', track: 1, mediaUrl: 'http://localhost/song.mp4' } });
    const html = inspector(state);
    expect(html).toContain('data-live-kind="hymn"');
    expect(html).toContain('data-playback-state="paused"');
    expect(html).toContain('data-action="stop"');
    expect(html).toContain('data-action="toggle-play"');
    expect(html).toContain('Himno en la salida');
  });
  it.each(['programa', 'ajustes'] as const)('does not reuse a Bible selection in %s', view => {
    const html = inspector(fixture(view));
    expect(html).not.toContain('Pasaje seleccionado');
    expect(html).not.toContain('class="button primary project-button"');
    expect(html).not.toContain('id="auto-project"');
  });
  it('filters hymn history independently from Bible history', () => {
    const state = fixture('himnario');
    state.snapshot.history = [{ id: 'verse', title: 'Pasaje anterior', slide: { kind: 'verse', text: 'Anterior', reference: 'Juan 1:1', translation: 'PR' }, projectedAt: 1 }, { id: 'song', title: 'Canto anterior', slide: { kind: 'hymn', hymnId: hymn.id, title: 'Canto anterior', track: 1, mediaUrl: '' }, projectedAt: 2 }];
    const html = inspector(state);
    expect(html).toContain('data-id="song"');
    expect(html).not.toContain('data-id="verse"');
  });
  it('offers cancellation and prevents duplicate play for the same pending selection', () => {
    const state = fixture('himnario', { connected: true, preparing: { hymnId: hymn.id, title: hymn.title, track: 2 } });
    const html = inspector(state);
    expect(html).toContain('data-playback-state="preparing"');
    expect(html).toMatch(/class="button primary project-button" data-action="project" disabled/);
    expect(html).toContain('data-action="stop"');
    expect(html).not.toContain('data-action="toggle-play"');
  });
  it('allows a different audio choice while a prior track is preparing', () => {
    const state = fixture('himnario', { connected: true, preparing: { hymnId: hymn.id, title: hymn.title, track: 1 } });
    const html = inspector(state);
    expect(html).toMatch(/class="button primary project-button" data-action="project" >/);
  });
});
