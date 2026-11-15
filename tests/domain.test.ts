import { describe, expect, it } from 'vitest';
import { hymnName, referenceQuery, searchVerses, playbackPosition } from '../src/shared/domain';
import type { Bible, Output } from '../src/shared/contracts';

describe('Given locally named MKV hymns', () => {
  it.each(['001 Cantad alegres al Señor.mkv', '(001 Cantad alegres al Señor).mkv', '001 - Cantad alegres al Señor.MKV'])('parses number and title when importing %s', filename => { expect(hymnName(filename)).toEqual({number:1,title:'Cantad alegres al Señor'}); });
  it.each(['sin numero.mkv', '0 himno.mkv', '1 himno.mp4'])('rejects invalid hymn when importing %s', filename => { expect(hymnName(filename)).toBeNull(); });
});
describe('Given a Bible search', () => {
  it('resolves numbered books and ranges when a reference is entered', () => { expect(referenceQuery('1 Juan 2:1-3')).toEqual({book:62,chapter:2,from:1,to:3}); });
  it('resolves abbreviated references when entered', () => { expect(referenceQuery('Jn 3:16')).toEqual({book:43,chapter:3,from:16,to:16}); });
  it('rejects reversed ranges when entered', () => { expect(referenceQuery('Juan 3:19-16')).toBeNull(); });
  it('matches accents when searching a keyword', () => {
    const bible: Bible = {id:'test',name:'Test',abbreviation:'T',source:'test',license:'test',verses:[{book:19,chapter:1,verse:1,text:'Bienaventurado el varón'}]};
    expect(searchVerses(bible,'VARON')).toHaveLength(1);
  });
});
describe('Given live playback', () => {
  const output: Output = {slide:{kind:'welcome',title:'LUMEN',subtitle:''},blackout:false,playing:true,position:5,updatedAt:1000,connected:true,displayId:1,revision:1,preparing:null};
  it('advances from its clock anchor when playing', () => { expect(playbackPosition(output,4000)).toBe(8); });
  it('freezes the anchor when blacked out', () => { expect(playbackPosition({...output,blackout:true},4000)).toBe(5); });
});
