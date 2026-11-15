import { contextBridge, ipcRenderer } from 'electron';
import { actionSchema, responseSchema, snapshotSchema } from '../src/shared/contracts';
import type { Bridge } from '../src/shared/contracts';

const bridge:Bridge = {
  invoke: async action => responseSchema.parse(await ipcRenderer.invoke('lumen:action',actionSchema.parse(action))),
  subscribe: listener => {
    const handler=(_event:Electron.IpcRendererEvent,value:unknown):void=>{const snapshot=snapshotSchema.safeParse(value);if(snapshot.success)listener(snapshot.data);};
    ipcRenderer.on('lumen:snapshot',handler);
    return ()=>ipcRenderer.removeListener('lumen:snapshot',handler);
  },
  onStatus:listener=>{
    const handler=(_event:Electron.IpcRendererEvent,value:unknown):void=>{if(typeof value==='string')listener(value);};
    ipcRenderer.on('lumen:status',handler);
    return ()=>ipcRenderer.removeListener('lumen:status',handler);
  },
};
contextBridge.exposeInMainWorld('lumen',bridge);
