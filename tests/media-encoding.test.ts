import { describe, expect, it } from 'vitest';
import { encodingOptions } from '../electron/media-encoding';

describe('Given the codecs of a selected hymn track', () => {
  it('copies compatible H264 and stereo AAC when no re-encoding is needed', () => {
    const result = encodingOptions({ codec: 'h264', pixelFormat: 'yuv420p' }, { codec: 'aac', channels: 2, profile: 'LC' });
    expect(result).toEqual(['-c:v', 'copy', '-c:a', 'copy']);
  });
  it('converts only audio when H264 is paired with an MP3 instrumental track', () => {
    const result = encodingOptions({ codec: 'h264', pixelFormat: 'yuv420p' }, { codec: 'mp3', channels: 2 });
    expect(result.slice(0, 2)).toEqual(['-c:v', 'copy']);
    expect(result).toContain('aac');
    expect(result).not.toContain('libx264');
  });
  it('transcodes video when its pixel format is not broadly playable', () => {
    const result = encodingOptions({ codec: 'h264', pixelFormat: 'yuv444p10le' }, { codec: 'aac', channels: 2 });
    expect(result).toContain('libx264');
    expect(result).toContain('yuv420p');
  });
  it('downmixes multichannel AAC when stereo conversion is needed', () => {
    const result = encodingOptions({ codec: 'h264', pixelFormat: 'yuv420p' }, { codec: 'aac', channels: 6, profile: 'LC' });
    expect(result).toContain('192k');
    expect(result.slice(-2)).toEqual(['-ac', '2']);
  });
});
