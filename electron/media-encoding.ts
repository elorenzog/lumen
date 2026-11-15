export type VideoEncoding = { readonly codec: string; readonly pixelFormat?: string };
export type AudioEncoding = { readonly codec: string; readonly channels?: number; readonly profile?: string };
export function encodingOptions(video: VideoEncoding, audio: AudioEncoding): readonly string[] {
  const copyVideo = video.codec === 'h264' && (video.pixelFormat === 'yuv420p' || video.pixelFormat === 'yuvj420p');
  const copyAudio = audio.codec === 'aac' && (audio.channels ?? 2) <= 2 && (audio.profile === undefined || audio.profile === 'LC');
  return [
    ...(copyVideo ? ['-c:v', 'copy'] : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2']),
    ...(copyAudio ? ['-c:a', 'copy'] : ['-c:a', 'aac', '-b:a', '192k', '-ac', '2']),
  ];
}
