import { describe, expect, it, vi } from 'vitest';
import { settingsSchema, defaults } from '../src/shared/contracts';
import { stageMarkup } from '../src/ui/stage';
import { welcome } from '../src/shared/contracts';

vi.mock('lucide',async importOriginal=>({...await importOriginal<typeof import('lucide')>(),createElement:()=>({outerHTML:'<svg></svg>'})}));
const id='f2579f7b-d92d-4838-a78e-d66d942ad573';
const media=[{id,name:'Pantalla de la iglesia',kind:'image' as const,url:'http://localhost/managed.png'}];
describe('Given a personalized base screen image',()=>{
  it('keeps old settings compatible with the original LUMEN welcome',()=>{
    const settings=settingsSchema.parse({theme:'noche',fontSize:52,autoProject:false,volume:.8});expect(settings).toHaveProperty('baseScreen',{imageId:null,fit:'contain'});
  });
  it('shows loading at the saved position only on the welcome slide while preparing',()=>{
    const settings=settingsSchema.parse({...defaults.settings,baseScreen:{imageId:id,fit:'contain',loadingPosition:{x:38,y:87}}});
    const style={settings,backgroundMedia:media};
    expect(stageMarkup(welcome,style,true,true)).toContain('role="status"');
    expect(stageMarkup(welcome,style,true,true)).toContain('Cargando contenido…');
    expect(stageMarkup(welcome,style,true,true)).toContain('--loading-x:38%;--loading-y:87%');
    expect(stageMarkup(welcome,style,true,false)).not.toContain('Cargando contenido');
    expect(stageMarkup({kind:'verse',text:'Texto',reference:'Juan 3:16',translation:'PR'},style,true,true)).not.toContain('Cargando contenido');
  });
  it('rejects a loading position outside the projection',()=>{
    expect(settingsSchema.safeParse({...defaults.settings,baseScreen:{loadingPosition:{x:101,y:50}}}).success).toBe(false);
  });
  it('renders the managed image only on the welcome slide',()=>{
    const settings=settingsSchema.parse({...defaults.settings,baseScreen:{imageId:id,fit:'contain'}});
    expect(stageMarkup(welcome,{settings,backgroundMedia:media})).toContain('class="stage-base-image"');
    expect(stageMarkup(welcome,{settings,backgroundMedia:media})).toContain('http://localhost/managed.png');
    expect(stageMarkup({kind:'verse',text:'Texto',reference:'Juan 3:16',translation:'PR'},{settings,backgroundMedia:media})).not.toContain('stage-base-image');
    expect(stageMarkup({kind:'hymn',hymnId:'h',title:'Himno',track:1,mediaUrl:'http://localhost/video.mp4'},{settings,backgroundMedia:media})).not.toContain('stage-base-image');
  });
  it('preserves the Bible appearance while storing a chosen base image',()=>{
    const settings=settingsSchema.parse({...defaults.settings,baseScreen:{imageId:id,fit:'cover'}});expect(settings.appearance).toEqual(defaults.settings.appearance);expect(settings).toHaveProperty('baseScreen',{imageId:id,fit:'cover'});
  });
  it('falls back to the original welcome when the image is missing from the library',()=>{
    const settings=settingsSchema.parse({...defaults.settings,baseScreen:{imageId:id,fit:'contain'}});const html=stageMarkup(welcome,{settings,backgroundMedia:[]});expect(html).not.toContain('stage-base-image');expect(html).toContain('LUMEN');
  });
  it('rejects paths and CSS injection in place of a managed image',()=>{
    expect(settingsSchema.safeParse({...defaults.settings,baseScreen:{imageId:'../../image.png',fit:'contain'}}).success).toBe(false);
    expect(settingsSchema.safeParse({...defaults.settings,baseScreen:{imageId:id,fit:'cover;background:red'}}).success).toBe(false);
  });
});
