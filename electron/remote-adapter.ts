import type { Controller } from './controller';
import { LumenError,welcome } from '../src/shared/contracts';
import type { Slide,Verse } from '../src/shared/contracts';
import { reference,referenceQuery } from '../src/shared/domain';
import { oldCatalogRows } from '../src/shared/old-hymn-catalog';
import { selectRange } from '../src/shared/selection';
import { remoteSearchSchema } from '../src/shared/remote-contracts';
import type { RemoteCommand,RemoteLibrary,RemoteState } from '../src/shared/remote-contracts';
import type { RemoteHandlers } from './remote-server';
type Intent={readonly generation:number;readonly revision:number};

export function remoteAdapter(controller:Controller):RemoteHandlers{
  let opening:Promise<void>|undefined;
  let generation=0;
  const state=():RemoteState=>{
    const snapshot=controller.snapshot();const slide=snapshot.output.slide;
    return {output:{...snapshot.output,slide:slide.kind==='hymn'?{...slide,mediaUrl:''}:slide},volume:snapshot.settings.volume,bibles:snapshot.bibles.map(({id,name,abbreviation})=>({id,name,abbreviation})),displays:snapshot.displays,program:snapshot.program.map(({id,title,slide})=>({id,title,kind:slide.kind}))};
  };
  const open=async():Promise<void>=>{
    if(opening){await opening;return;}
    if(controller.output.connected)return;
    const displays=controller.snapshot().displays;const display=displays.find(item=>!item.primary)??displays[0];
    if(!display)throw new LumenError('display','No hay una pantalla disponible.');
    opening??=controller.open(display.id).finally(()=>{opening=undefined;});await opening;
  };
  const ready=async(intent:Intent):Promise<boolean>=>{await open();return intent.generation===generation&&intent.revision===controller.output.revision&&controller.output.connected;};
  const project=async(slide:Slide,intent:Intent):Promise<void>=>{if(!await ready(intent))return;if(slide.kind==='hymn')await controller.action({type:'play-hymn',id:slide.hymnId,track:slide.track});else await controller.action({type:'project',slide});};
  const passage=async(id:string,verses:readonly Verse[],intent:Intent):Promise<void>=>{
    const bible=controller.store.infos().find(bible=>bible.id===id);const first=verses[0];const last=verses.at(-1);
    if(!bible||!first||!last)throw new LumenError('reference','No se encontró ese pasaje.');
    await project({kind:'verse',text:verses.map(verse=>verse.text).join('\n'),reference:reference({...first,endVerse:last.endVerse??last.verse}),translation:bible.abbreviation},intent);
  };
  return {
    state,
    library:():RemoteLibrary=>({hymns:controller.store.saved.hymns.map(hymn=>({id:hymn.id,number:hymn.number,title:hymn.title,number1962:hymn.number1962??(hymn.edition==='1962'?hymn.number:null),number2009:hymn.number2009??(hymn.edition==='2009'?hymn.number:null),tracks:hymn.tracks.map(({index,label})=>({index,label})),duration:hymn.duration})),old:oldCatalogRows({hymns:controller.store.saved.hymns,oldHymnCatalog:[...controller.store.oldHymnCatalog]}).map(row=>({number:row.number,title:row.title,hymnId:row.playable?.id??null}))}),
    search:(input:unknown)=>{const query=remoteSearchSchema.parse(input);if(!controller.store.infos().some(bible=>bible.id===query.bibleId))throw new LumenError('bible','La traducción no está disponible.');return controller.store.search(query.bibleId,query.query);},
    command:async(command:RemoteCommand):Promise<RemoteState>=>{
      const intent:Intent={generation:['reference','step','hymn','program','welcome','stop','close'].includes(command.type)?++generation:generation,revision:controller.output.revision};
      switch(command.type){
        case 'reference':{
          const bible=controller.store.bible(command.bibleId);if(!bible)throw new LumenError('bible','La traducción no está disponible.');
          const verses=selectRange(bible.verses.filter(verse=>verse.book===command.book&&verse.chapter===command.chapter),command.range);
          await passage(bible.id,verses,intent);break;
        }
        case 'step':{
          const slide=controller.output.slide;if(slide.kind!=='verse')throw new LumenError('reference','Proyecta un pasaje para avanzar por sus versículos.');
          const query=referenceQuery(slide.reference);const info=controller.store.infos().find(bible=>bible.abbreviation===slide.translation);const bible=info?controller.store.bible(info.id):undefined;
          if(!query||!bible)throw new LumenError('reference','Selecciona de nuevo el pasaje desde Biblia.');
          const boundary=command.direction===1?query.to:query.from;const index=bible.verses.findIndex(verse=>verse.book===query.book&&verse.chapter===query.chapter&&verse.verse<=boundary&&(verse.endVerse??verse.verse)>=boundary);const verse=bible.verses[index+command.direction];
          if(index<0||!verse)throw new LumenError('reference','No hay más versículos en esa dirección.');await passage(bible.id,[verse],intent);break;
        }
        case 'hymn':{
          const hymn=controller.store.saved.hymns.find(hymn=>hymn.id===command.id);
          if(!hymn||!hymn.tracks.some(track=>track.index===command.track))throw new LumenError('hymn','Esta canción o pista no está disponible.');
          if(await ready(intent))await controller.action({type:'play-hymn',id:hymn.id,track:command.track});break;
        }
        case 'program':{const item=controller.store.saved.program.find(item=>item.id===command.id);if(!item)throw new LumenError('program','El elemento ya no está en el programa.');await project(item.slide,intent);break;}
        case 'playback':await controller.action(command);break;
        case 'stop':await controller.action({type:'stop-hymn'});break;
        case 'blackout':await controller.action(command);break;
        case 'volume':await controller.action({type:'settings',settings:{...controller.store.saved.settings,volume:command.value}});break;
        case 'welcome':await project(welcome,intent);break;
        case 'open':await controller.open(command.displayId);break;
        case 'close':await controller.action({type:'close-output'});break;
        default:command satisfies never;
      }
      return state();
    },
  };
}
