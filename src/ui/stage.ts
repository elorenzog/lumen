import type { Slide, Snapshot } from '../shared/contracts';
import { defaultLoadingPosition } from '../shared/base-screen';
import { esc, wordmark } from './primitives';

export type StageStyle=Pick<Snapshot,'settings'|'backgroundMedia'>;
export function stageMarkup(slide:Slide,style:StageStyle,live=false,showLoading=false):string{
  const content=(()=>{switch(slide.kind){
    case 'welcome':return `<div class="stage-welcome">${wordmark}<h2>${esc(slide.title)}</h2><p>${esc(slide.subtitle)}</p></div>`;
    case 'verse':return `<div class="stage-scripture"><div class="stage-rule"></div><p class="stage-text">${esc(slide.text)}</p><div class="stage-reference">${esc(slide.reference)}<span>${esc(slide.translation)}</span></div></div>`;
    case 'hymn':return slide.mediaUrl?`<video class="stage-video" src="${esc(slide.mediaUrl)}" playsinline ${live?'':'muted'}></video>`:`<div class="stage-welcome"><div class="hymn-stage-number">♫</div><p>${esc(slide.title)}</p><small>Listo para proyectar</small></div>`;
    default:slide satisfies never;return '';
  }})();
  const base=style.settings.baseScreen;
  const positionLoading=base.loadingPosition??defaultLoadingPosition;
  const loading=slide.kind==='welcome'&&showLoading
    ? `<div class="stage-loading" style="--loading-x:${positionLoading.x}%;--loading-y:${positionLoading.y}%"><div class="stage-loading-label" ${live?'role="status"':'aria-hidden="true"'}><span class="stage-loading-ring" aria-hidden="true"></span>Cargando contenido…</div></div>`
    : '';
  const baseImage=slide.kind==='welcome'&&base.imageId?style.backgroundMedia.find(asset=>asset.id===base.imageId&&asset.kind==='image'):undefined;
  if(baseImage)return `<div class="stage theme-noche base-image-stage" data-stage>${content}<img class="stage-base-image" src="${esc(baseImage.url)}" alt="Pantalla base personalizada" style="object-fit:${base.fit}">${loading}</div>`;
  const a=style.settings.appearance;
  const family={georgia:'Georgia, serif',segoe:'Segoe UI, sans-serif',arial:'Arial, sans-serif'}[a.fontFamily];
  const position={top:'flex-start',center:'center',bottom:'flex-end'}[a.vertical];
  const background=a.mode==='solid'?a.color:a.mode==='gradient'?`linear-gradient(${a.angle}deg,${a.color},${a.secondary})`:'';
  const asset=style.backgroundMedia.find(item=>item.id===a.assetId&&item.kind===a.mode);
  const media=slide.kind==='hymn'?'':a.mode==='image'&&asset?`<img class="stage-background" alt="" src="${esc(asset.url)}">`:a.mode==='video'&&asset?`<video class="stage-background" src="${esc(asset.url)}" autoplay muted loop playsinline></video>`:'';
  const css=`${background?`background:${background};`:''}--stage-text:${a.textColor};--stage-reference:${a.referenceColor};--stage-family:${family};--stage-weight:${a.bold?700:400};--stage-align:${a.align};--stage-vertical:${position};--stage-margin:${a.margin}%;--stage-leading:${a.lineHeight};--stage-shadow:${a.shadow/1280*100}cqw;--stage-outline:${a.outline/1280*100}cqw;--stage-dim:${a.mode==='preset'?0:a.dim/100};`;
  return `<div class="stage theme-${esc(style.settings.theme)} custom-stage ${slide.kind==='hymn'?'hymn-stage':''}" data-stage style="${esc(css)}">${media}<div class="stage-dimmer"></div>${content}${loading}</div>`;
}
export function fitStages(root:ParentNode,fontSize:number):void{
  for(const element of root.querySelectorAll<HTMLElement>('[data-stage]')){
    const text=element.querySelector<HTMLElement>('.stage-text');const parent=text?.parentElement;
    if(!text||!parent)continue;
    let size=fontSize*element.clientWidth/1280;
    text.style.fontSize=`${size}px`;
    const height=():number=>[...parent.children].reduce((total,child)=>{const css=getComputedStyle(child);return total+child.getBoundingClientRect().height+Number.parseFloat(css.marginTop)+Number.parseFloat(css.marginBottom);},0);
    while(height()>parent.clientHeight&&size>3){size-=0.5;text.style.fontSize=`${size}px`;}
  }
}
