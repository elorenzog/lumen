import { describe,it,expect } from 'vitest';
import { comparisonSlide } from '../src/ui/comparison';
import type { Bible } from '../src/shared/contracts';
const bible:Bible={id:'one',name:'Primera',abbreviation:'P',source:'test',license:'test',verses:[{book:43,chapter:3,verse:16,text:'Texto uno.'}]};
describe('Given translations with different verse bridges',()=>{
  it('labels the actual expanded secondary reference in projection',()=>{
    const comparison:Bible={...bible,id:'two',abbreviation:'S',verses:[{book:43,chapter:3,verse:16,endVerse:18,text:'Texto combinado.'}]};
    const slide=comparisonSlide({bible,selected:bible.verses,comparison});
    expect(slide?.kind).toBe('verse');
    if(slide?.kind!=='verse')return;
    expect(slide.reference).toBe('Juan 3:16 / Juan 3:16–18');
    expect(slide.text).toContain('P · Juan 3:16\n');
    expect(slide.text).toContain('S · Juan 3:16–18\n');
  });
  it('does not project comparison when a reference is absent',()=>{expect(comparisonSlide({bible,selected:bible.verses,comparison:{...bible,verses:[]}})).toBeUndefined();});
});
