import { describe,it,expect } from 'vitest';
import { ignorePlaybackError } from '../src/shared/playback';
const current={connected:true,originRevision:2,currentRevision:2,playing:true};
describe('Given a rejected video playback request',()=>{
  it('ignores a rejection from a removed preview',()=>{expect(ignorePlaybackError(new DOMException('Cancelled','AbortError'),{...current,connected:false})).toBe(true);});
  it('does not apply an old rejection to a newer projection',()=>{expect(ignorePlaybackError(new Error('Old failure'),{...current,currentRevision:3})).toBe(true);});
  it('ignores a cancellation caused by an intentional pause',()=>{expect(ignorePlaybackError(new DOMException('Cancelled','AbortError'),{...current,playing:false})).toBe(true);});
  it('retains an unexpected cancellation on the active playing video',()=>{expect(ignorePlaybackError(new DOMException('Cancelled','AbortError'),current)).toBe(false);});
  it('retains a real unsupported-media error',()=>{expect(ignorePlaybackError(new DOMException('Unsupported','NotSupportedError'),current)).toBe(false);});
});
