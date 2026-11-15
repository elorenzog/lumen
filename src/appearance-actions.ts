import { appearanceSchema, defaultAppearance } from './shared/appearance';
import type { Action } from './shared/contracts';
import type { UIState } from './ui/state';
import { stageMarkup, fitStages } from './ui/stage';
import { verseSlide } from './ui/state';

type EditorContext={readonly invoke:(action:Action)=>Promise<unknown>;readonly render:()=>void};
export function appearanceActions(state:UIState,context:EditorContext){
  const {invoke,render}=context;
  const save=async():Promise<void>=>{await invoke({type:'settings',settings:state.snapshot.settings});};
  return {
    input(target:HTMLInputElement|HTMLSelectElement):boolean{
      if(target.id==='appearance-name'){state.presetName=target.value;return true;}
      const draft=state.appearanceDraft;if(!draft)return false;
      if(target.dataset['appearance']){
        const field=target.dataset['appearance'];
        const value=target instanceof HTMLInputElement?(target.type==='range'?Number(target.value):target.type==='checkbox'?target.checked:target.value):target.value;
        draft.appearance=appearanceSchema.parse({...draft.appearance,[field]:field==='assetId'?(value||null):value});
        if(field==='mode'){render();return true;}
      }else if(target.id==='ap-fontSize')draft.fontSize=Number(target.value);
      else if(target.id==='ap-theme')draft.theme=target.value==='amanecer'?'amanecer':target.value==='negro'?'negro':'noche';
      else return false;
      const preview=document.getElementById('appearance-preview');
      if(preview){
        const slide=state.selected.length?verseSlide(state):{kind:'verse' as const,text:'Lámpara es a mis pies tu palabra,\ny lumbrera a mi camino.',reference:'Salmos 119:105',translation:state.bible.abbreviation};
        preview.innerHTML=stageMarkup(slide,{...state.snapshot,settings:{...state.snapshot.settings,...draft}});fitStages(preview,draft.fontSize);
      }
      const output=target.previousElementSibling?.querySelector('output');if(output)output.textContent=target.value;
      return true;
    },
    async change(target:HTMLInputElement|HTMLSelectElement):Promise<boolean>{
      if(target.id!=='appearance-preset')return false;
      const preset=state.snapshot.settings.presets.find(p=>p.id===target.value);
      state.presetId=preset?.id??'';if(preset){state.appearanceDraft={appearance:{...preset.appearance},fontSize:preset.fontSize,theme:preset.theme};state.presetName=preset.name;}
      render();return true;
    },
    async action(action:string):Promise<boolean>{
      if(!action.startsWith('appearance-'))return false;
      switch(action){
        case 'appearance-open':state.appearanceDraft={appearance:{...state.snapshot.settings.appearance},fontSize:state.snapshot.settings.fontSize,theme:state.snapshot.settings.theme};state.appearanceMessage='';state.presetId='';state.presetName='';render();break;
        case 'appearance-cancel':state.appearanceDraft=null;render();document.querySelector<HTMLElement>('[data-action="appearance-open"]')?.focus();break;
        case 'appearance-reset':state.appearanceDraft={appearance:{...defaultAppearance},fontSize:52,theme:'noche'};render();break;
        case 'appearance-apply':{
          const draft=state.appearanceDraft;if(!draft)break;
          if((draft.appearance.mode==='image'||draft.appearance.mode==='video')&&!state.snapshot.backgroundMedia.some(a=>a.id===draft.appearance.assetId&&a.kind===draft.appearance.mode)){state.appearanceMessage='Selecciona o importa un archivo para este fondo.';render();break;}
          await invoke({type:'settings',settings:{...state.snapshot.settings,...draft}});state.appearanceDraft=null;render();document.querySelector<HTMLElement>('[data-action="appearance-open"]')?.focus();break;
        }
        case 'appearance-import':{
          const origin=state.appearanceDraft;const kind=origin?.appearance.mode;if(kind!=='image'&&kind!=='video')break;
          state.appearanceBusy=true;state.appearanceMessage='';render();
          try{const id=await invoke({type:'import-background',kind});if(typeof id==='string'&&state.appearanceDraft&&state.appearanceDraft===origin){state.appearanceDraft.appearance.assetId=id;state.appearanceMessage='Archivo guardado. Puedes aplicar el tema.';}}
          finally{state.appearanceBusy=false;render();}break;
        }
        case 'appearance-save-preset':{
          const draft=state.appearanceDraft;const name=state.presetName.trim();if(!draft)break;
          if(!name){state.appearanceMessage='Escribe un nombre para el tema.';render();break;}
          const existing=state.snapshot.settings.presets.find(p=>p.id===state.presetId);
          if(!existing&&state.snapshot.settings.presets.length>=40){state.appearanceMessage='Puedes guardar hasta 40 temas.';render();break;}
          const id=existing?.id??crypto.randomUUID();const preset={id,name,...structuredClone(draft)};
          state.snapshot.settings.presets=[...state.snapshot.settings.presets.filter(p=>p.id!==id),preset];await save();state.presetId=id;state.appearanceMessage='Tema guardado.';render();break;
        }
        case 'appearance-delete-preset':state.snapshot.settings.presets=state.snapshot.settings.presets.filter(p=>p.id!==state.presetId);await save();state.presetId='';state.appearanceMessage='Tema eliminado.';render();break;
      }
      return true;
    },
  };
}
