import { describe,expect,it } from 'vitest';
import { selectRange } from '../src/shared/selection';
const chapter=Array.from({length:20},(_,index)=>({book:43,chapter:3,verse:index+1,text:`Texto ${index+1}`}));
describe('quick passage range selection',()=>{
  it('selects a single verse or inclusive range in canonical order',()=>{expect(selectRange(chapter,'16').map(v=>v.verse)).toEqual([16]);expect(selectRange(chapter,' 16 - 18 ').map(v=>v.verse)).toEqual([16,17,18]);});
  it('rejects reversed, missing, invalid and overly long ranges',()=>{for(const range of ['18-16','0','21','abc','1-7'])expect(()=>selectRange(chapter,range)).toThrow();});
  it('preserves an imported verse bridge when selecting its internal number',()=>{expect(selectRange([{book:43,chapter:3,verse:16,endVerse:18,text:'Puente'}],'17')).toMatchObject([{verse:16,endVerse:18}]);});
});
