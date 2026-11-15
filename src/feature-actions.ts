import { z } from 'zod';
import { bibleSchema,hymnMetadataSchema } from './shared/contracts';
import type { Action,Slide } from './shared/contracts';
import { catalogEntrySchema } from './shared/catalog';
import type { UIState } from './ui/state';
import { currentHymn } from './ui/state';
import { comparisonSlide } from './ui/comparison';
import { searchEditionHymns } from './shared/hymn-editions';
import { searchOldCatalog } from './shared/old-hymn-catalog';
type FeatureContext={readonly invoke:(action:Action)=>Promise<unknown>;readonly render:()=>void;readonly project:(slide?:Slide)=>Promise<void>};
export function featureActions(state:UIState,context:FeatureContext){
  const {invoke,render,project}=context;
  const chooseEdition=(value:string|undefined):void=>{
    const selected=currentHymn(state);
    state.hymnEdition=value==='1962'?'1962':value==='2009'?'2009':value==='unknown'?'unknown':'all';
    if(state.hymnEdition==='1962'&&state.snapshot.oldHymnCatalog.length){
      const rows=searchOldCatalog(state.snapshot,{query:state.query,scope:state.hymnSearchScope,favorites:state.favoriteOnly});
      state.selectedHymn=rows.find(row=>row.playable?.id===selected?.id&&selected!==undefined)?.id??null;
      render();return;
    }
    const visible=searchEditionHymns(state.snapshot.hymns,{edition:state.hymnEdition,query:state.query,scope:state.hymnSearchScope,favorites:state.favoriteOnly});
    state.selectedHymn=visible.some(hymn=>hymn.id===selected?.id)?selected?.id??null:null;
    render();
  };
  return {
    input(target:HTMLElement):void{
      const form=target.closest('#hymn-metadata');const hymn=currentHymn(state);
      if(form instanceof HTMLFormElement&&hymn)state.hymnDraft={id:hymn.id,values:Object.fromEntries([...new FormData(form)].map(([key,value])=>[key,String(value)]))};
    },
    async action(action:string,id:string|undefined):Promise<boolean>{
      switch(action){
        case 'hymn-edition':chooseEdition(id);return true;
        case 'book-layout':state.bookLayout=state.bookLayout==='grid'?'list':'grid';render();return true;
        case 'favorite-filter':state.favoriteOnly=!state.favoriteOnly;render();return true;
        case 'favorite-hymn':{const hymn=currentHymn(state);if(hymn)await invoke({type:'hymn-metadata',id:hymn.id,metadata:{...hymnMetadataSchema.parse(hymn),favorite:!hymn.favorite}});return true;}
        case 'save-hymn-metadata':{
          const hymn=currentHymn(state);const form=document.getElementById('hymn-metadata');
          if(hymn&&form instanceof HTMLFormElement){
            const data=new FormData(form);
            const number1962=data.get('number1962')?Number(data.get('number1962')):null;
            const number2009=data.get('number2009')?Number(data.get('number2009')):null;
            const changed=number1962!==hymn.number1962||number2009!==hymn.number2009;
            await invoke({type:'hymn-metadata',id:hymn.id,metadata:hymnMetadataSchema.parse({...hymn,...Object.fromEntries(data),number1962,number2009,...(changed?{numberingSource:'manual',numberingConflict:false}:{}),sungTrack:data.get('sungTrack')?Number(data.get('sungTrack')):null,instrumentalTrack:data.get('instrumentalTrack')?Number(data.get('instrumentalTrack')):null})});state.hymnDraft=null;state.message='Información del himno guardada.';render();
          }return true;
        }
        case 'project-comparison':{const slide=comparisonSlide(state);if(slide)await project(slide);return true;}
        case 'history-play':{const item=state.snapshot.history.find(item=>item.id===id);if(item)await project(item.slide);return true;}
        case 'load-catalog':
          state.busy=true;render();try{state.catalog=z.array(catalogEntrySchema).parse(await invoke({type:'bible-catalog'}));state.catalogLoaded=true;}finally{state.busy=false;render();}return true;
        case 'download-bible':{
          if(id!=='spa_bll'&&id!=='spa_blm')return true;
          state.busy=true;render();try{
            await invoke({type:'download-bible',id});
            if(state.bible.id===id){const selected=state.selected;state.bible=bibleSchema.parse(await invoke({type:'bible',id}));state.selected=state.bible.verses.filter(v=>selected.some(old=>v.book===old.book&&v.chapter===old.chapter&&v.verse===old.verse));state.searchResults=null;}
            if(state.comparisonId===id)state.comparison=bibleSchema.parse(await invoke({type:'bible',id}));
          }finally{state.busy=false;render();}return true;
        }
        default:return false;
      }
    },
    async change(target:HTMLInputElement|HTMLSelectElement):Promise<boolean>{
      switch(target.id){
        case 'comparison-translation':{
          state.comparisonId=target.value;
          if(!target.value){state.comparison=null;render();return true;}
          const id=target.value;const bible=bibleSchema.parse(await invoke({type:'bible',id}));
          if(state.comparisonId===id){state.comparison=bible;render();}return true;
        }
        case 'hymn-edition':chooseEdition(target.value);return true;
        case 'hymn-search-scope':state.hymnSearchScope=z.enum(['all','title','lyrics','topic','references','authors']).parse(target.value);render();return true;
        case 'verse-nav':{
          const verse=state.bible.verses.find(v=>v.book===state.book&&v.chapter===state.chapter&&v.verse===Number(target.value));
          if(verse){state.selected=[verse];render();document.querySelector('.verse.selected')?.scrollIntoView({block:'nearest'});if(state.snapshot.settings.autoProject)await project();}return true;
        }
        default:return false;
      }
    },
  };
}
