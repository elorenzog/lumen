import { describe,it,expect } from 'vitest';
import { mergeImportedHymns } from '../electron/hymn-import';
import { hymnSchema } from '../src/shared/contracts';
const hymn=hymnSchema.parse({id:'one',number:1,title:'Prueba',path:'one.mkv',duration:10,tracks:[{index:1,label:'Audio',language:'es'}],size:100,modified:1});
describe('Given metadata changes during a hymn import',()=>{
  it('preserves the latest favorite, lyrics and edition at commit',()=>{
    const latest={...hymn,favorite:true,lyrics:'Texto actualizado',edition:'1962' as const};
    expect(mergeImportedHymns([latest],[{...hymn,modified:2}],new Set())[0]).toEqual({...latest,modified:2});
  });
  it('does not restore a hymn removed while probing',()=>{expect(mergeImportedHymns([],[hymn],new Set(['one']))).toEqual([]);});
  it('keeps unrelated hymns added before commit',()=>{const other={...hymn,id:'two'};expect(mergeImportedHymns([other],[hymn],new Set()).map(h=>h.id)).toEqual(['two','one']);});
});
