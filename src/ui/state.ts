import { welcome } from '../shared/contracts';
import type { Bible, Hymn, Slide, Snapshot, Verse } from '../shared/contracts';
import { reference } from '../shared/domain';
import { hymnReference } from '../shared/hymn-editions';
import { selectedOldCatalog } from '../shared/old-hymn-catalog';
import type { HymnSearchScope } from '../shared/domain';
import type { CatalogEntry } from '../shared/catalog';
import type { AppearanceDraft } from '../shared/appearance';
import type { BaseScreen } from '../shared/base-screen';
import type { SettingsTab } from './settings';
export type View='biblia'|'himnario'|'programa'|'ajustes';
export type UIState={helpOpen?:boolean;settingsTab?:SettingsTab;remoteUrl?:string;baseScreenDraft?:BaseScreen|null;baseScreenBusy?:boolean; appearanceDraft:AppearanceDraft|null;appearanceBusy:boolean;presetName:string;presetId:string;appearanceMessage:string;rangeInput:string; snapshot:Snapshot; bible:Bible; view:View; book:number; chapter:number; selected:readonly Verse[]; selectedHymn:string|null; track:number; query:string; bookQuery:string; testament:'all'|'old'|'new'; busy:boolean; message:string; displayId:number; comparison:Bible|null;comparisonId:string;catalog:readonly CatalogEntry[];catalogLoaded:boolean;searchResults:readonly Verse[]|null;bookLayout:'list'|'grid';hymnEdition:'all'|'1962'|'2009'|'unknown';favoriteOnly:boolean;hymnSearchScope:HymnSearchScope;hymnDraft:{id:string;values:Readonly<Record<string,string>>}|null; };
export const currentHymn=(state:UIState):Hymn|undefined=>state.snapshot.hymns.find(h=>h.id===state.selectedHymn)??selectedOldCatalog(state.snapshot,state.selectedHymn)?.playable;
export function verseSlide(state:Pick<UIState,'bible'|'selected'>):Slide{
  const first=state.selected[0];const last=state.selected.at(-1);
  return first?{kind:'verse',text:state.selected.map(v=>v.text).join('\n'),reference:reference({...first,endVerse:last?.endVerse??last?.verse??first.verse}),translation:state.bible.abbreviation}:{kind:'welcome',title:'LUMEN',subtitle:'La Palabra que ilumina,\nla alabanza que inspira.'};
}
export function selectionSlide(state:UIState):Slide{
  const hymn=currentHymn(state);
  if(state.view==='himnario')return hymn?{kind:'hymn',hymnId:hymn.id,title:hymnReference(hymn,state.hymnEdition),track:state.track,mediaUrl:''}:welcome;
  return verseSlide(state);
}


