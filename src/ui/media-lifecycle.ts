function mediaKey(video:HTMLVideoElement):string {
  const scope=video.closest('#appearance-preview')?'appearance':video.closest('[data-live-preview]')?'monitor':video.closest('.preview-section')?'preview':'output';
  return `${scope}:${video.className}:${video.getAttribute('src')??''}`;
}

export function releaseVideo(video:HTMLVideoElement):void {
  video.pause();
  video.removeAttribute('src');
  video.load();
}

export function replaceMarkup(root:HTMLElement,markup:string):void {
  const template=document.createElement('template');
  template.innerHTML=markup;
  const previous=[...root.querySelectorAll<HTMLVideoElement>('video')];
  const retained=new Set<HTMLVideoElement>();
  for(const next of template.content.querySelectorAll<HTMLVideoElement>('video')) {
    const key=mediaKey(next);
    const existing=previous.find(video=>!retained.has(video)&&mediaKey(video)===key);
    if(existing){retained.add(existing);next.replaceWith(existing);}
  }
  for(const video of previous)if(!retained.has(video))releaseVideo(video);
  root.replaceChildren(template.content);
}
