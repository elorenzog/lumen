import { bibleSchema, LumenError, snapshotSchema, welcome,verseSchema } from './shared/contracts';
import { z } from 'zod';
import type { Action, ProgramItem, Slide, Snapshot, Verse } from './shared/contracts';
import { formatTime, playbackPosition, referenceQuery } from './shared/domain';
import { operatorRenderer } from './ui/operator-renderer';
import { currentHymn, selectionSlide } from './ui/state';
import type { UIState } from './ui/state';
import { fitStages } from './ui/stage';
import { featureActions } from './feature-actions';
import { ignorePlaybackError } from './shared/playback';
import { appearanceActions } from './appearance-actions';
import { baseScreenActions } from './base-screen-actions';
import { baseImageErrors } from './ui/base-screen';
import { selectRange } from './shared/selection';
import { selectedOldCatalog } from './shared/old-hymn-catalog';

export async function operator(root:HTMLElement):Promise<void>{
  const bridge=window.lumen;
  if(!bridge){root.innerHTML='<main class="native-required"><h1>LUMEN</h1><p>Abre la aplicación de escritorio para usar la Biblia, el himnario y la proyección.</p><code>pnpm dev</code></main>';return;}
  const invoke=async(action:Action):Promise<unknown>=>{const result=await bridge.invoke(action);if(!result.ok)throw new LumenError('action',result.error);return result.data;};
  const initial=snapshotSchema.parse(await invoke({type:'snapshot'}));
  const firstBible=initial.bibles[0];if(!firstBible)throw new LumenError('bible','No hay Biblias instaladas.');
  const bible=bibleSchema.parse(await invoke({type:'bible',id:firstBible.id}));
  const state:UIState={appearanceDraft:null,appearanceBusy:false,presetName:'',presetId:'',appearanceMessage:'',rangeInput:'',snapshot:initial,bible,view:'biblia',book:43,chapter:3,selected:bible.verses.filter(v=>v.book===43&&v.chapter===3&&v.verse===16),selectedHymn:null,track:0,query:'',bookQuery:'',testament:'all',busy:false,message:'',displayId:(initial.displays.find(d=>!d.primary)??initial.displays[0])?.id??0,comparison:null,comparisonId:'',catalog:[],catalogLoaded:false,searchResults:null,bookLayout:'grid',hymnEdition:'all',favoriteOnly:false,hymnSearchScope:'all',hymnDraft:null};
  const showError=(error:unknown):void=>{
    if(!(error instanceof Error))throw error;
    if(state.appearanceDraft){state.appearanceMessage=error.message;render();return;}
    const toast=document.getElementById('error-toast');if(toast){toast.hidden=false;toast.replaceChildren(document.createTextNode(error.message));const close=document.createElement('button');close.textContent='Cerrar';close.onclick=()=>{toast.hidden=true;};toast.append(close);}
  };
  baseImageErrors(root,message=>showError(new LumenError('base-image',message)));
  const guarded=(promise:Promise<unknown>):void=>{void promise.catch(showError);};
  const renderer=operatorRenderer(root,state,()=>syncPreview());
  const render=():void=>renderer.full();
  const syncPreview=():void=>{
    const video=root.querySelector<HTMLVideoElement>('[data-live-preview] .stage-video');if(!video)return;
    video.muted=true;
    const sync=():void=>{
      if(!video.isConnected)return;
      const position=playbackPosition(state.snapshot.output);const originRevision=state.snapshot.output.revision;
      if(video.readyState>=1&&Number.isFinite(video.duration)&&Math.abs(video.currentTime-position)>0.65)video.currentTime=Math.min(position,video.duration);
      if(state.snapshot.output.playing&&!state.snapshot.output.blackout){if(video.paused)void video.play().catch((error:unknown)=>{
        if(!ignorePlaybackError(error,{connected:video.isConnected,originRevision,currentRevision:state.snapshot.output.revision,playing:state.snapshot.output.playing&&!state.snapshot.output.blackout}))showError(error);
      });}else if(!video.paused)video.pause();
    };
    if(video.readyState>=1)sync();else video.addEventListener('loadedmetadata',sync,{once:true});
  };
  const saveSettings=async():Promise<void>=>{await invoke({type:'settings',settings:state.snapshot.settings});};
  let projectRequest=0;
  const project=async(selected?:Slide):Promise<void>=>{
    if(!selected&&state.view==='himnario'&&selectedOldCatalog(state.snapshot,state.selectedHymn)&&!currentHymn(state))throw new LumenError('song-unavailable','Canción no disponible. Importa y vincula un archivo antes de reproducirla.');
    if(!selected&&state.view!=='biblia'&&state.view!=='himnario')return;
    const slide=selected??selectionSlide(state);
    if(!selected&&state.view==='himnario'&&slide.kind!=='hymn')throw new LumenError('selection','Selecciona un himno antes de reproducir.');
    if(slide.kind==='hymn'&&state.snapshot.output.preparing?.hymnId===slide.hymnId&&state.snapshot.output.preparing.track===slide.track)return;
    const request=++projectRequest;state.busy=slide.kind!=='hymn';render();
    try{if(!state.snapshot.output.connected)await invoke({type:'open-output',displayId:state.displayId});
      if(request!==projectRequest)return;
      if(slide.kind==='hymn')await invoke({type:'play-hymn',id:slide.hymnId,track:slide.track});else await invoke({type:'project',slide});
    }finally{if(request===projectRequest){state.busy=false;render();}}
  };
  const chooseVerse=async(verse:Verse,extend=false):Promise<void>=>{
    const first=state.selected[0];
    state.book=verse.book;state.chapter=verse.chapter;
    if(extend&&first&&first.book===verse.book&&first.chapter===verse.chapter){
      const range=state.bible.verses.filter(v=>v.book===verse.book&&v.chapter===verse.chapter&&v.verse>=Math.min(first.verse,verse.verse)&&v.verse<=Math.max(first.verse,verse.verse));
      if(range.length>6)throw new LumenError('range','Selecciona hasta 6 versículos por diapositiva para mantener una lectura clara.');
      state.selected=range;
    }else state.selected=[verse];
    render();if(state.snapshot.settings.autoProject)await project();
  };
  const changeChapter=(offset:number):void=>{
    const chapters=state.bible.verses.filter(v=>v.book===state.book).map(v=>v.chapter);
    state.chapter=Math.max(1,Math.min(Math.max(...chapters),state.chapter+offset));state.query='';render();
    root.querySelector('.verses')?.scrollTo(0,0);
  };
  const updateProgram=async(program:readonly ProgramItem[]):Promise<void>=>{await invoke({type:'program',program:[...program]});};
  const features=featureActions(state,{invoke,render,project});
  const appearance=appearanceActions(state,{invoke,render});
  const base=baseScreenActions(state,{invoke,render});
  let lastVerseClick:{key:string;at:number}|undefined;
  const handle=async(action:string,id:string|undefined,button:HTMLElement,event:MouseEvent):Promise<void>=>{
    if(action==='remote-enable'||action==='remote-disable'||action==='remote-rotate'){
      state.busy=true;render();
      try{await invoke({type:'remote-control',operation:action==='remote-enable'?'enable':action==='remote-disable'?'disable':'rotate'});state.message=action==='remote-disable'?'Control remoto desactivado.':'Control remoto listo. Consulta la dirección y el PIN en Ajustes.';}
      finally{state.busy=false;render();}return;
    }
    if(await base.action(action)||await appearance.action(action)||await features.action(action,id))return;
    if(action.startsWith('view-')){const view=action.slice(5);if(['biblia','himnario','programa','ajustes'].includes(view)){state.view=view==='himnario'?'himnario':view==='programa'?'programa':view==='ajustes'?'ajustes':'biblia';state.query='';render();}return;}
    switch(action){
      case 'show-about':document.getElementById('about-lumen')?.scrollIntoView({block:'start',behavior:'instant'});break;
      case 'update-check':case 'update-download':case 'update-install':case 'update-releases':await invoke({type:'updates',operation:action==='update-check'?'check':action==='update-download'?'download':action==='update-install'?'install':'releases'});break;
      case 'import-bible-folder':state.busy=true;render();try{await invoke({type:'import-bible-folder'});state.message='Carpeta de Biblias procesada.';}finally{state.busy=false;render();}break;
      case 'book':state.book=Number(id);state.chapter=1;state.query='';render();root.querySelector('.verses')?.scrollTo(0,0);break;
      case 'chapter-pick':state.chapter=Number(id);state.query='';state.rangeInput='';render();root.querySelector('.verses')?.scrollTo(0,0);break;
      case 'select-range':state.selected=selectRange(state.bible.verses.filter(v=>v.book===state.book&&v.chapter===state.chapter),state.rangeInput);state.query='';render();if(state.snapshot.settings.autoProject)await project();break;
      case 'testament':state.testament=id==='old'?'old':id==='new'?'new':'all';render();break;
      case 'verse':{
        const verse=state.bible.verses.find(v=>v.book===Number(button.dataset['book'])&&v.chapter===Number(button.dataset['chapter'])&&v.verse===Number(id));
        if(verse){
          const key=`${verse.book}:${verse.chapter}:${verse.verse}`;const now=performance.now();
          // Selection replaces the button DOM, so retain the gesture across renders.
          const doubleClick=!event.shiftKey&&lastVerseClick?.key===key&&now-lastVerseClick.at<500;
          lastVerseClick=doubleClick?undefined:{key,at:now};
          await chooseVerse(verse,event.shiftKey);
          if(doubleClick&&!state.snapshot.settings.autoProject)await project();
        }break;
      }
      case 'hymn':{state.selectedHymn=id??null;const hymn=currentHymn(state);state.track=hymn?.tracks[0]?.index??0;render();break;}
      case 'previous-chapter':changeChapter(-1);break;
      case 'next-chapter':changeChapter(1);break;
      case 'clear-search':state.query='';render();break;
      case 'project':await project();break;
      case 'welcome':await project(welcome);break;
      case 'open-output':await invoke({type:'open-output',displayId:state.displayId});break;
      case 'close-output':await invoke({type:'close-output'});break;
      case 'blackout':await invoke({type:'blackout',value:!state.snapshot.output.blackout});break;
      case 'toggle-play':await invoke({type:'playback',playing:!state.snapshot.output.playing,revision:state.snapshot.output.revision});break;
      case 'stop':projectRequest++;state.busy=false;await invoke({type:'stop-hymn'});break;
      case 'import-bible':case 'import-folder':case 'import-hymns':{
        state.busy=true;render();try{const result=await invoke(action==='import-bible'?{type:'import-bible'}:{type:'import-hymns',folder:action==='import-folder',edition:state.hymnEdition==='all'?'unknown':state.hymnEdition});
          if(action==='import-bible'&&typeof result==='string'){state.bible=bibleSchema.parse(await invoke({type:'bible',id:result}));state.book=state.bible.verses[0]?.book??1;state.chapter=1;state.selected=[];}
          if(result&&typeof result==='object'&&'errors' in result&&Array.isArray(result.errors)&&result.errors.length)throw new LumenError('import',result.errors.join('\n'));
        }finally{state.busy=false;render();}break;
      }
      case 'remove-hymn':{const hymn=currentHymn(state);if(hymn){await invoke({type:'remove-hymn',id:hymn.id});state.selectedHymn=null;render();}break;}
      case 'add-program':{const slide=selectionSlide(state);if(slide.kind==='welcome')throw new LumenError('selection','Selecciona un versículo o un himno primero.');await updateProgram([...state.snapshot.program,{id:crypto.randomUUID(),title:slide.kind==='verse'?slide.reference:slide.title,slide}]);state.message='Selección añadida al programa.';render();break;}
      case 'program-remove':await updateProgram(state.snapshot.program.filter(item=>item.id!==id));break;
      case 'program-play':{const item=state.snapshot.program.find(p=>p.id===id);if(item)await project(item.slide);break;}
      case 'program-up':case 'program-down':{const list=[...state.snapshot.program];const index=list.findIndex(p=>p.id===id);const target=index+(action==='program-up'?-1:1);const current=list[index];const other=list[target];if(current&&other){list[index]=other;list[target]=current;await updateProgram(list);}break;}
    }
  };
  root.addEventListener('click',event=>{if(!(event.target instanceof Element))return;const button=event.target.closest<HTMLElement>('[data-action]');if(button&&!button.hasAttribute('disabled'))guarded(handle(button.dataset['action']??'',button.dataset['id'],button,event));});
  root.addEventListener('change',event=>{
    const target=event.target;if(!(target instanceof HTMLInputElement||target instanceof HTMLSelectElement))return;
    guarded((async()=>{
      if(base.change(target)||await appearance.change(target)||appearance.input(target)||await features.change(target))return;
      switch(target.id){
        case 'remote-address':state.remoteUrl=target.value;render();break;
        case 'check-updates-startup':if(target instanceof HTMLInputElement)await invoke({type:'update-preference',checkAtStartup:target.checked});render();break;
        case 'translation':{state.bible=bibleSchema.parse(await invoke({type:'bible',id:target.value}));state.selected=state.bible.verses.filter(v=>v.book===state.book&&v.chapter===state.chapter&&v.verse===(state.selected[0]?.verse??1));state.searchResults=null;if(state.comparisonId===state.bible.id){state.comparison=null;state.comparisonId='';}render();if(state.query)await search();break;}
        case 'chapter':state.chapter=Number(target.value);state.query='';render();break;
        case 'display':state.displayId=Number(target.value);if(state.snapshot.output.connected)await invoke({type:'open-output',displayId:state.displayId});break;
        case 'seek':await invoke({type:'playback',position:Number(target.value),revision:state.snapshot.output.revision});break;
        case 'theme':case 'font-size':case 'auto-project':case 'volume':case 'hymn-volume':{
          const previous=state.snapshot.settings;if(target.id==='theme')previous.appearance.mode='preset';
          state.snapshot={...state.snapshot,settings:{...previous,theme:target.id==='theme'?(target.value==='amanecer'?'amanecer':target.value==='negro'?'negro':'noche'):previous.theme,fontSize:target.id==='font-size'?Number(target.value):previous.fontSize,autoProject:target.id==='auto-project'&&target instanceof HTMLInputElement?target.checked:previous.autoProject,volume:target.id==='volume'||target.id==='hymn-volume'?Number(target.value):previous.volume}};await saveSettings();break;
        }
      }
      if(target instanceof HTMLInputElement&&target.name==='track'){state.track=Number(target.value);render();const hymn=currentHymn(state);if(hymn&&((state.snapshot.output.slide.kind==='hymn'&&state.snapshot.output.slide.hymnId===hymn.id)||state.snapshot.output.preparing?.hymnId===hymn.id))await project();}
    })());
  });
  let searchTimer:ReturnType<typeof setTimeout>|undefined;
  const search=async():Promise<void>=>{
    const query=state.query;const id=state.bible.id;
    if(state.view!=='biblia'||!query.trim()){state.searchResults=null;render();return;}
    const results=z.array(verseSchema).parse(await invoke({type:'bible-search',id,query}));
    if(state.query!==query||state.bible.id!==id||state.view!=='biblia')return;
    state.searchResults=results;const ref=referenceQuery(query);const first=results[0];
    if(ref&&first){state.book=first.book;state.chapter=first.chapter;state.selected=results.slice(0,ref.to===999?1:6);}
    render();if(ref&&first&&state.snapshot.settings.autoProject)await project();
  };
  root.addEventListener('submit',event=>event.preventDefault());
  root.addEventListener('error',event=>{
    const target=event.target;if(!(target instanceof HTMLImageElement||target instanceof HTMLVideoElement)||!target.classList.contains('stage-background'))return;
    const message='No se pudo mostrar este fondo. Elige otra imagen o un vídeo MP4 H.264 / WebM.';
    const notice=document.querySelector('.editor-notice')??document.getElementById('status-text');if(notice)notice.textContent=message;
  },true);
  root.addEventListener('input',event=>{const target=event.target;if(target instanceof HTMLElement)features.input(target);if(target instanceof HTMLInputElement||target instanceof HTMLSelectElement){if(appearance.input(target))return;}if(!(target instanceof HTMLInputElement))return;if(target.id==='verse-range'){state.rangeInput=target.value;return;}if(target.id==='book-search'){state.bookQuery=target.value;render();}if(target.id==='global-search'){state.query=target.value;state.searchResults=null;clearTimeout(searchTimer);searchTimer=setTimeout(()=>guarded(search()),180);}});
  document.addEventListener('keydown',event=>{
    if(state.appearanceDraft)return;
    if(event.ctrlKey&&event.key.toLowerCase()==='l'){event.preventDefault();const input=document.getElementById('global-search');if(input instanceof HTMLInputElement){input.focus();input.select();}return;}
    if(event.key==='Enter'&&event.target instanceof HTMLElement&&event.target.id==='verse-range'){event.preventDefault();guarded(handle('select-range',undefined,event.target,new MouseEvent('click')));return;}
    const editing=event.target instanceof HTMLInputElement||event.target instanceof HTMLSelectElement||event.target instanceof HTMLTextAreaElement;
    if(event.key==='Enter'&&event.ctrlKey&&(state.view==='biblia'||state.view==='himnario')){event.preventDefault();guarded(project());return;}
    if(editing){if(event.key==='Enter'&&event.target instanceof HTMLElement&&event.target.id==='global-search'){event.preventDefault();clearTimeout(searchTimer);guarded(search());}return;}
    if(event.key.toLowerCase()==='b'){event.preventDefault();guarded(invoke({type:'blackout',value:!state.snapshot.output.blackout}));}
    if(['ArrowLeft','ArrowRight'].includes(event.key)&&state.view==='biblia'){
      event.preventDefault();const current=state.selected.at(-1);if(!current)return;const index=state.bible.verses.findIndex(v=>v.book===current.book&&v.chapter===current.chapter&&v.verse===current.verse);const next=state.bible.verses[index+(event.key==='ArrowRight'?1:-1)];if(next)guarded(chooseVerse(next));
    }
  });
  bridge.subscribe((next:Snapshot)=>{state.snapshot=next;if(!next.displays.some(d=>d.id===state.displayId))state.displayId=(next.displays.find(d=>!d.primary)??next.displays[0])?.id??0;renderer.snapshot();});
  bridge.onStatus(message=>{state.message=message;const status=document.getElementById('status-text');if(status)status.textContent=message;});
  new ResizeObserver(()=>{fitStages(root,state.snapshot.settings.fontSize);const preview=document.getElementById('appearance-preview');if(preview&&state.appearanceDraft)fitStages(preview,state.appearanceDraft.fontSize);}).observe(root);
  setInterval(()=>{const time=document.getElementById('playback-time');if(time)time.textContent=formatTime(playbackPosition(state.snapshot.output));const seek=document.getElementById('seek');if(seek instanceof HTMLInputElement&&document.activeElement!==seek)seek.value=String(playbackPosition(state.snapshot.output));},300);
  render();
}

