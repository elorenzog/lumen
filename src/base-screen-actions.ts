import { baseScreenSchema,defaultBaseScreen } from './shared/base-screen';
import type { Action } from './shared/contracts';
import { LumenError } from './shared/contracts';
import type { UIState } from './ui/state';

type Context={readonly invoke:(action:Action)=>Promise<unknown>;readonly render:()=>void};
export function baseScreenActions(state:UIState,context:Context){
  const {invoke,render}=context;
  const save=async():Promise<void>=>{
    const config=state.baseScreenDraft;if(!config)return;
    await invoke({type:'settings',settings:{...state.snapshot.settings,baseScreen:config}});
    state.baseScreenDraft=null;state.message='Pantalla base guardada.';render();
  };
  return {
    change(target:HTMLInputElement|HTMLSelectElement):boolean{
      const current=state.baseScreenDraft??state.snapshot.settings.baseScreen;
      if(target.id==='base-screen-image')state.baseScreenDraft=baseScreenSchema.parse({...current,imageId:target.value||null});
      else if(target.id==='base-screen-fit')state.baseScreenDraft=baseScreenSchema.parse({...current,fit:target.value});
      else return false;
      render();return true;
    },
    async action(action:string):Promise<boolean>{
      if(!action.startsWith('base-screen-'))return false;
      switch(action){
        case 'base-screen-import':{
          const previous=state.baseScreenDraft??null;const origin=structuredClone(previous??state.snapshot.settings.baseScreen);state.baseScreenDraft=origin;state.baseScreenBusy=true;render();
          try{const id=await invoke({type:'import-background',kind:'image'});if(state.baseScreenDraft===origin)state.baseScreenDraft=typeof id==='string'?{...origin,imageId:id}:previous;}
          catch(error){if(state.baseScreenDraft===origin)state.baseScreenDraft=previous;throw error;}
          finally{state.baseScreenBusy=false;render();}break;
        }
        case 'base-screen-apply':{
          const config=state.baseScreenDraft;
          if(!config)break;
          if(config.imageId&&!state.snapshot.backgroundMedia.some(asset=>asset.id===config.imageId&&asset.kind==='image'))throw new LumenError('base-image','Selecciona una imagen antes de aplicar.');
          await save();break;
        }
        case 'base-screen-cancel':state.baseScreenDraft=null;render();break;
        case 'base-screen-reset':state.baseScreenDraft={...defaultBaseScreen};await save();break;
      }
      return true;
    },
  };
}
