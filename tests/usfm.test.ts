import { describe,it,expect } from 'vitest';
import { parseUsfm,usfmBible } from '../electron/usfm';
const content=String.raw`\id JHN Prueba
\h Juan
\c 3
\p
\v 16 Porque \w amó|lemma="amor"\w* Dios al mundo.\f + \ft Nota editorial.\f*
\v 17-18 Texto combinado original.
`;
describe('Given an authorized USFM source',()=>{
  it('keeps the space after an inline footnote when omitting the note',()=>{
    const source=String.raw`\id JHN Prueba
\c 3
\v 16 texto\f + \ft nota\f* siguiente palabra.`;
    expect(parseUsfm(source)[0]?.text).toBe('texto siguiente palabra.');
  });
  it('preserves words while excluding footnotes and lexical attributes',()=>{expect(parseUsfm(content)[0]).toEqual({book:43,chapter:3,verse:16,text:'Porque amó Dios al mundo.'});});
  it('keeps verse bridges without duplicating their text',()=>{expect(parseUsfm(content)[1]).toEqual({book:43,chapter:3,verse:17,endVerse:18,text:'Texto combinado original.'});});
  it('rejects duplicate books across a multi-file batch',()=>{expect(()=>usfmBible([{name:'a',content},{name:'b',content}],'Test','test')).toThrow();});
  it('rejects unknown canonical book identifiers',()=>{expect(()=>parseUsfm(content.replace('JHN','XXX'))).toThrow();});
});
