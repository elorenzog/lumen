import { describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { defaults, hymnSchema, snapshotSchema, welcome } from '../src/shared/contracts';
import type { Bible, Hymn } from '../src/shared/contracts';
import type { UIState } from '../src/ui/state';
import { hymnDetail, hymnLibrary } from '../src/ui/hymnal';
import { currentHymn, selectionSlide } from '../src/ui/state';
import { inspector } from '../src/ui/inspector';

vi.mock('lucide', async importOriginal => ({ ...await importOriginal<typeof import('lucide')>(), createElement: () => ({ outerHTML: '<svg></svg>' }) }));
const hymn = (id: string, number: number, extra: object = {}): Hymn => hymnSchema.parse({ id, number, title: 'Unidos en espíritu', path: 'fixture.mkv', duration: 120, tracks: [{ index: 1, label: 'Cantado', language: 'spa' }], size: 1, modified: 0, edition: '2009', number1962: 11, number2009: number, ...extra });
const completeOldCatalog=JSON.parse(await readFile('resources/hymnal-1962.json','utf8'));
function fixture(): UIState {
  const hymns = [hymn('unidos', 3), hymn('nuevo', 11, { title: 'Alma bendice al Señor', number1962: null }), hymn('sin-edicion', 7, { title: 'Archivo propio', edition: 'unknown', number1962: null, number2009: null })];
  const bible: Bible = { id: 'test', name: 'Prueba', abbreviation: 'PR', source: '', license: '', verses: [] };
  const snapshot = snapshotSchema.parse({ ...defaults, hymns, bibles: [], displays: [], output: { slide: welcome, preparing: null, blackout: false, playing: false, position: 0, updatedAt: 0, connected: false, displayId: null, revision: 0 } });
  return { appearanceDraft: null, appearanceBusy: false, presetName: '', presetId: '', appearanceMessage: '', rangeInput: '', snapshot, bible, view: 'himnario', book: 43, chapter: 3, selected: [], selectedHymn: 'unidos', track: 1, query: '', bookQuery: '', testament: 'all', busy: false, message: '', displayId: 1, comparison: null, comparisonId: '', catalog: [], catalogLoaded: false, searchResults: null, bookLayout: 'grid', hymnEdition: 'all', favoriteOnly: false, hymnSearchScope: 'all', hymnDraft: null };
}
describe('Given old and new numbering for the same hymn', () => {
  it('shows both edition names and available counts as visible choices', () => {
    const html = hymnLibrary(fixture());
    expect(html).toContain('data-action="hymn-edition"');
    expect(html).toContain('Antiguo'); expect(html).toContain('1962');
    expect(html).toContain('Nuevo'); expect(html).toContain('2009');
    expect(html).toContain('1 disponibles'); expect(html).toContain('2 disponibles');
  });
  it('finds a shared hymn by its old number and hides new-only hymns', () => {
    const state = fixture(); state.hymnEdition = '1962'; state.query = '11';
    const html = hymnLibrary(state);
    expect(html).toContain('data-id="unidos"'); expect(html).not.toContain('data-id="nuevo"');
    expect(html).toContain('>011</span>');
  });
  it('does not search the new number while browsing the old numbering', () => {
    const state = fixture(); state.hymnEdition = '1962'; state.query = '3';
    expect(hymnLibrary(state)).not.toContain('data-id="unidos"');
  });
  it('shows both references on the detail without replacing the physical media number', () => {
    const state = fixture(); state.hymnEdition = '1962';
    const html = hymnDetail(state);
    expect(html).toContain('data-numbering="1962"'); expect(html).toContain('data-numbering="2009"');
    expect(html).toContain('>011<'); expect(html).toContain('>003<');
    expect(state.snapshot.hymns[0]?.number).toBe(3);
  });
  it('explicitly identifies a hymn with no old equivalence', () => {
    const state = fixture(); state.selectedHymn = 'nuevo';
    expect(hymnDetail(state)).toContain('Sin equivalencia disponible');
  });
  it('keeps unclassified media available in a separate view', () => {
    const state = fixture(); state.hymnEdition = 'unknown';
    const html = hymnLibrary(state); expect(html).toContain('data-id="sin-edicion"'); expect(html).not.toContain('data-id="unidos"');
  });
  it('keeps the physical old number when viewing all editions', () => {
    const state=fixture();state.snapshot.hymns=[hymn('old-source',11,{edition:'1962',number1962:11,number2009:3})];state.selectedHymn='old-source';
    expect(hymnDetail(state)).toContain('<div class="large-number">011</div>');
  });
  it('shows the conflict without discarding either hymn assigned old number190', () => {
    const state = fixture(); state.hymnEdition = '1962'; state.query = '190';
    state.snapshot.hymns = [hymn('first190', 193, { number1962: 190, numberingConflict: true }), hymn('second190', 293, { number1962: 190, numberingConflict: true })];
    state.selectedHymn = 'first190';
    const html = hymnLibrary(state); expect(html).toContain('data-id="first190"'); expect(html).toContain('data-id="second190"');
    expect(hymnDetail(state)).toContain('Equivalencia por revisar');
  });
});
describe('Given the complete old catalogue and a partial media library',()=>{
  const complete=():UIState=>{const state=fixture();state.hymnEdition='1962';state.snapshot.oldHymnCatalog=completeOldCatalog.entries;return state;};
  it('shows527canonical entries even when only one old hymn has a linked video',()=>{
    const html=hymnLibrary(complete());expect(html.match(/class="hymn-row/g)).toHaveLength(527);expect(html).toContain('527 títulos');expect(html).toContain('Canción no disponible');
  });
  it('finds missing songs by catalogue number without inventing a media record',()=>{
    const state=complete();state.query='527';const html=hymnLibrary(state);expect(html).toContain('data-id="old1962:527"');expect(state.snapshot.hymns).toHaveLength(3);
  });
  it('opens an unavailable song with reproduction and programme controls disabled',()=>{
    const state=complete();state.selectedHymn='old1962:527';
    expect(hymnDetail(state)).toContain('Canción no disponible');expect(hymnDetail(state)).toMatch(/data-action="project" disabled/);
    expect(inspector(state)).toContain('Canción no disponible');expect(inspector(state)).toMatch(/data-action="project" disabled/);
    expect(currentHymn(state)).toBeUndefined();expect(selectionSlide(state).kind).toBe('welcome');
  });
  it('resolves an available catalogue entry to the existing stable media identity',()=>{
    const state=complete();state.selectedHymn='old1962:11';expect(currentHymn(state)?.id).toBe('unidos');expect(selectionSlide(state)).toMatchObject({kind:'hymn',hymnId:'unidos'});
  });
  it('retains a single canonical190row while exposing the source conflict',()=>{
    const state=complete();state.snapshot.hymns=[hymn('first190',193,{title:'Dios nos ha dado promesa',number1962:190,numberingConflict:true}),hymn('second190',293,{title:'¿Quieres ser salvo de toda maldad?',number1962:190,numberingConflict:true})];state.query='190';state.selectedHymn='old1962:190';
    const html=hymnLibrary(state);expect(html.match(/class="hymn-row/g)).toHaveLength(1);expect(currentHymn(state)?.id).toBe('first190');expect(hymnDetail(state)).toContain('Equivalencia por revisar');expect(state.snapshot.hymns).toHaveLength(2);
  });
});
