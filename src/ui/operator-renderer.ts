import { shell } from './shell';
import { inspector } from './inspector';
import { replaceMarkup } from './media-lifecycle';
import { fitStages } from './stage';
import type { UIState } from './state';
import { currentHymn } from './state';

function updateRegion(root:HTMLElement,markup:string):void {
  const focused=document.activeElement;
  const id=focused?.id;
  const selection=focused instanceof HTMLInputElement&&focused.type==='text'?focused.selectionStart:null;
  const action=focused instanceof HTMLElement?focused.dataset['action']:undefined;
  const selector=action?`[data-action="${CSS.escape(action)}"]`:'';
  const index=focused&&selector?[...root.querySelectorAll(selector)].indexOf(focused):-1;
  const radio=focused instanceof HTMLInputElement&&focused.type==='radio'?focused.value:null;
  const scrollSelector='.book-list,.verses,.reader,.hymn-list,.inspector,.editor-body,.editor-controls,.chapter-grid,.verse-grid';
  const scrolls=[root,...root.querySelectorAll<HTMLElement>(scrollSelector)].map(element=>({className:element.className,scroll:element.scrollTop}));
  const disclosures=[...root.querySelectorAll<HTMLDetailsElement>('details[id]')].map(element=>({id:element.id,open:element.open}));
  replaceMarkup(root,markup);
  for(const saved of disclosures){const element=root.querySelector<HTMLDetailsElement>(`#${CSS.escape(saved.id)}`);if(element)element.open=saved.open;}
  for(const saved of scrolls){const element=[root,...root.querySelectorAll<HTMLElement>(scrollSelector)].find(element=>element.className===saved.className);if(element)element.scrollTo({top:saved.scroll,behavior:'instant'});}
  if(id){const input=document.getElementById(id);input?.focus({preventScroll:true});if(input instanceof HTMLInputElement&&selection!==null)input.setSelectionRange(selection,selection);}
  else if(selector&&index>=0)root.querySelectorAll<HTMLElement>(selector)[index]?.focus({preventScroll:true});
  else if(radio!==null)root.querySelector<HTMLInputElement>(`input[name="track"][value="${CSS.escape(radio)}"]`)?.focus({preventScroll:true});
}

export function operatorRenderer(root:HTMLElement,state:UIState,syncMedia:()=>void) {
  let scheduled=0;
  let libraryKey='';
  let selection:UIState['selected']|undefined;
  let passage='';
  const contentKey=():string=>JSON.stringify([state.snapshot.hymns,state.snapshot.bibles,state.snapshot.program,state.snapshot.backgrounds,state.snapshot.remote,state.view==='ajustes'?[state.snapshot.startup,state.snapshot.settings,state.snapshot.updates,state.snapshot.output.connected,Boolean(state.snapshot.output.preparing)]:null]);
  const syncPreparation=():void=>{
    if(state.view!=='himnario')return;
    const preparing=state.snapshot.output.preparing;
    const pending=preparing?.hymnId===currentHymn(state)?.id&&preparing?.track===state.track;
    const button=root.querySelector<HTMLButtonElement>('.detail-actions [data-action="project"]');
    if(button){button.disabled=state.busy||pending||!currentHymn(state);const text=button.querySelector('span');if(text)text.textContent=pending?'Preparando…':'Reproducir en pantalla';}
  };
  const full=():void=>{
    cancelAnimationFrame(scheduled);scheduled=0;
    libraryKey=contentKey();
    updateRegion(root,shell(state));
    const context=JSON.stringify([state.view,state.bible.id,state.book,state.chapter]);
    if(selection!==state.selected||passage!==context){
      selection=state.selected;passage=context;
      const viewport=root.querySelector<HTMLElement>('.verses');
      const selected=viewport?.querySelector<HTMLElement>('.verse.selected');
      if(viewport&&selected){
        const area=viewport.getBoundingClientRect(),row=selected.getBoundingClientRect();
        const top=area.top+viewport.clientTop,bottom=top+viewport.clientHeight;
        const offset=row.top<top||row.height>viewport.clientHeight?row.top-top:Math.max(0,row.bottom-bottom);
        if(offset)viewport.scrollTo({top:viewport.scrollTop+offset,behavior:'instant'});
      }
    }
    const dialog=document.getElementById('appearance-dialog');
    const help=document.getElementById('help-dialog');
    if(help instanceof HTMLDialogElement){help.showModal();help.addEventListener('cancel',event=>{event.preventDefault();state.helpOpen=false;full();root.querySelector<HTMLElement>('[data-action="show-help"]')?.focus({preventScroll:true});});}
    if(dialog instanceof HTMLDialogElement){dialog.showModal();dialog.addEventListener('cancel',event=>{event.preventDefault();state.appearanceDraft=null;full();document.querySelector<HTMLElement>('[data-action="appearance-open"]')?.focus();});}
    fitStages(root,state.snapshot.settings.fontSize);
    const preview=document.getElementById('appearance-preview');if(preview&&state.appearanceDraft)fitStages(preview,state.appearanceDraft.fontSize);
    syncPreparation();syncMedia();
  };
  const snapshot=():void=>{
    if(scheduled)return;
    scheduled=requestAnimationFrame(()=>{
      scheduled=0;
      if(contentKey()!==libraryKey){full();return;}
      if(state.view==='ajustes')return;
      const panel=root.querySelector<HTMLElement>('.inspector');
      if(!panel){full();return;}
      updateRegion(panel,inspector(state));
      fitStages(panel,state.snapshot.settings.fontSize);
      syncPreparation();syncMedia();
    });
  };
  return {full,snapshot};
}
