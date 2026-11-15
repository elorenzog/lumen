type PlaybackContext={readonly connected:boolean;readonly originRevision:number;readonly currentRevision:number;readonly playing:boolean};
export function ignorePlaybackError(error:unknown,context:PlaybackContext):boolean{
  return !context.connected||context.originRevision!==context.currentRevision||(error instanceof DOMException&&error.name==='AbortError'&&!context.playing);
}
