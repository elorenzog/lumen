import { describe, expect, it, vi, afterEach } from 'vitest';
import type { BrowserWindowConstructorOptions, Rectangle } from 'electron';
import { BrowserWindow } from 'electron';
import { Controller } from '../electron/controller';
import { Store } from '../electron/store';
import { MediaServer } from '../electron/media-server';

type WindowState={readonly options:BrowserWindowConstructorOptions;bounds:Rectangle;fullscreen:boolean;menuRemoved:boolean;readonly fullscreenCalls:boolean[]};
const observed=vi.hoisted(()=>({windows:[] as WindowState[],displays:[{id:1,label:'Primary',bounds:{x:0,y:0,width:1920,height:1080},size:{width:1920,height:1080}}]}));
vi.mock('electron',async()=>{
  const {EventEmitter}=await import('node:events');
  class Window extends EventEmitter{
    readonly state:WindowState;
    readonly webContents={send:()=>{},setWindowOpenHandler:()=>{},on:()=>{}};
    constructor(options:BrowserWindowConstructorOptions={}){super();this.state={options,bounds:{x:options.x??0,y:options.y??0,width:options.width??800,height:options.height??600},fullscreen:false,menuRemoved:false,fullscreenCalls:[]};observed.windows.push(this.state);}
    isDestroyed(){return false;}
    setBounds(bounds:Rectangle){this.state.bounds={...bounds};}
    setFullScreen(value:boolean){this.state.fullscreen=value;this.state.fullscreenCalls.push(value);}
    setMenu(value:null){this.state.menuRemoved=value===null;}
    showInactive(){}
  }
  return {BrowserWindow:Window,dialog:{},screen:{getAllDisplays:()=>observed.displays,getPrimaryDisplay:()=>observed.displays[0]}};
});
function scenario(){const media=new MediaServer();const controller=new Controller(new Store('fixture'),media,new BrowserWindow({show:false}),async()=>{},'preload');return {controller,media};}
afterEach(()=>{observed.windows.length=0;observed.displays=[{id:1,label:'Primary',bounds:{x:0,y:0,width:1920,height:1080},size:{width:1920,height:1080}}];});
describe('Given projection on the designated display',()=>{
  it('uses a borderless fullscreen window even when only one display is connected',async()=>{
    const {controller,media}=scenario();try{await controller.open(1);const window=observed.windows.at(-1);expect(window?.options).toMatchObject({frame:false,width:1920,height:1080});expect(window?.bounds).toEqual(observed.displays[0]?.bounds);expect(window?.fullscreen).toBe(true);expect(window?.menuRemoved).toBe(true);}finally{media.close();}
  });
  it('uses the complete selected display including a negative desktop origin',async()=>{
    observed.displays.push({id:2,label:'Projector',bounds:{x:-2560,y:-120,width:2560,height:1440},size:{width:2560,height:1440}});
    const {controller,media}=scenario();try{await controller.open(2);expect(observed.windows.at(-1)?.bounds).toEqual(observed.displays[1]?.bounds);expect(observed.windows.at(-1)?.fullscreen).toBe(true);expect(controller.output.displayId).toBe(2);}finally{media.close();}
  });
  it('moves the existing projection to another display and restores fullscreen without creating another window',async()=>{
    observed.displays.push({id:2,label:'Projector',bounds:{x:1920,y:40,width:1280,height:1024},size:{width:1280,height:1024}});
    const {controller,media}=scenario();try{await controller.open(1);const count=observed.windows.length;await controller.open(2);expect(observed.windows).toHaveLength(count);expect(observed.windows.at(-1)?.bounds).toEqual(observed.displays[1]?.bounds);expect(observed.windows.at(-1)?.fullscreenCalls.slice(-2)).toEqual([false,true]);expect(controller.output.displayId).toBe(2);}finally{media.close();}
  });
  it('rejects a disconnected display without creating a projection window',async()=>{
    const {controller,media}=scenario();try{const count=observed.windows.length;await expect(controller.open(99)).rejects.toThrow('La pantalla seleccionada');expect(observed.windows).toHaveLength(count);expect(controller.output.connected).toBe(false);}finally{media.close();}
  });
});
