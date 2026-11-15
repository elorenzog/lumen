import { snapshotSchema } from './shared/contracts';
import { playbackPosition } from './shared/domain';
import { stageMarkup, fitStages } from './ui/stage';
import type { Snapshot } from './shared/contracts';
import { ignorePlaybackError } from './shared/playback';
import { replaceMarkup } from './ui/media-lifecycle';
import { baseImageErrors } from './ui/base-screen';

export async function projection(root:HTMLElement):Promise<void>{
  const bridge=window.lumen;if(!bridge){root.textContent='Abre la proyección desde LUMEN.';return;}
  document.body.classList.add('projection-body');
  baseImageErrors(root,message=>{void bridge.invoke({type:'background-error',message});});
  let revision=-1;let appearanceKey="";let snapshot:Snapshot|undefined;
  root.addEventListener('error',event=>{if(event.target instanceof Element&&event.target.classList.contains('stage-background'))void bridge.invoke({type:'background-error',message:'No se pudo leer el fondo de proyección. Selecciona otro archivo en Apariencia.'});},true);
  const render=(next:Snapshot):void=>{
    snapshot=next;
    const key=JSON.stringify([next.settings.appearance,next.settings.fontSize,next.settings.theme,next.backgroundMedia,next.output.slide.kind==='welcome'?next.settings.baseScreen:null]);
    if(revision!==next.output.revision||(next.output.slide.kind!=="hymn"&&key!==appearanceKey)){
      appearanceKey=key;
      revision=next.output.revision;replaceMarkup(root,stageMarkup(next.output.slide,next,true));
      const video=root.querySelector<HTMLVideoElement>('.stage-video');
      if(video){
        const thisRevision=revision;
        video.addEventListener('ended',()=>{if(video.isConnected&&snapshot?.output.revision===thisRevision)void bridge.invoke({type:'playback',ended:true,position:video.duration,revision:thisRevision});});
        video.addEventListener('error',()=>{if(video.isConnected&&snapshot?.output.revision===thisRevision)void bridge.invoke({type:'media-error',message:video.error?.message??'No se pudo leer el vídeo.',revision:thisRevision});});
        video.addEventListener('loadedmetadata',()=>sync());
      }
      fitStages(root,next.settings.fontSize);
    }
    root.classList.toggle('blackout',next.output.blackout);
    sync();
  };
  const sync=():void=>{
    if(!snapshot)return;
    const background=root.querySelector<HTMLVideoElement>('video.stage-background');
    if(background){background.muted=true;if(snapshot.output.blackout)background.pause();else void background.play().catch((error:unknown)=>{if(error instanceof Error&&error.name!=='AbortError')void bridge.invoke({type:'background-error',message:'No se pudo reproducir el fondo de vídeo. Usa MP4 H.264 o WebM.'});});}
    const video=root.querySelector<HTMLVideoElement>('.stage-video');if(!video)return;
    video.volume=snapshot.settings.volume;
    const position=playbackPosition(snapshot.output);
    if(video.readyState>=1&&Number.isFinite(video.duration)&&Math.abs(video.currentTime-position)>0.65)video.currentTime=Math.min(position,video.duration);
    if(snapshot.output.playing&&!snapshot.output.blackout){
      const originRevision=snapshot.output.revision;
      if(video.paused)void video.play().catch((error:unknown)=>{
        if(!snapshot||ignorePlaybackError(error,{connected:video.isConnected,originRevision,currentRevision:snapshot.output.revision,playing:snapshot.output.playing&&!snapshot.output.blackout}))return;
        if(error instanceof Error)void bridge.invoke({type:'media-error',message:error.message,revision:originRevision});else throw error;
      });
    }else video.pause();
  };
  bridge.subscribe(render);
  const result=await bridge.invoke({type:'snapshot'});
  if(result.ok)render(snapshotSchema.parse(result.data));else root.textContent=result.error;
  new ResizeObserver(()=>{if(snapshot)fitStages(root,snapshot.settings.fontSize);}).observe(root);
  document.addEventListener('keydown',event=>{if(event.key==='Escape')void bridge.invoke({type:'close-output'});});
}
