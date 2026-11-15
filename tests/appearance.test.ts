import { describe,expect,it } from 'vitest';
import { settingsSchema,savedSchema,defaults } from '../src/shared/contracts';
import { appearanceSchema } from '../src/shared/appearance';
describe('persistent projection appearance',()=>{
  it('opens v0.2 settings and libraries with compatible defaults',()=>{
    const settings=settingsSchema.parse({theme:'noche',fontSize:52,autoProject:false,volume:0.8});
    expect(settings.appearance.mode).toBe('preset');expect(settings.presets).toEqual([]);
    const legacy={hymns:[],program:[],settings:{theme:'noche',fontSize:52,autoProject:false,volume:0.8}};
    expect(savedSchema.parse(legacy).backgrounds).toEqual([]);
  });
  it('rejects CSS injection and invalid appearance dimensions at the IPC boundary',()=>{
    for(const value of [{color:'red;background:url(x)'},{margin:99},{dim:-1},{fontFamily:'url(x)'},{assetId:'../../secret'}])expect(appearanceSchema.safeParse(value).success).toBe(false);
  });
  it('round trips custom themes and isolated active settings',()=>{
    const saved=structuredClone(defaults);const appearance=appearanceSchema.parse({mode:'gradient',color:'#334455',vertical:'bottom',outline:2});
    saved.settings.presets.push({id:'24f1e713-c407-4310-a13d-3285e055737a',name:'Tema culto',appearance,fontSize:60,theme:'noche'});
    const restored=savedSchema.parse(JSON.parse(JSON.stringify(saved)));
    expect(restored.settings.presets[0]?.appearance.vertical).toBe('bottom');expect(restored.settings.appearance.mode).toBe('preset');
  });
});
