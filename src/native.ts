import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { actionSchema, responseSchema, snapshotSchema } from './shared/contracts';
import type { Bridge, Snapshot } from './shared/contracts';

export async function initializeNative():Promise<void>{
  if(window.lumen||!isTauri())return;
  const snapshots=new Set<(snapshot:Snapshot)=>void>();
  const statuses=new Set<(message:string)=>void>();
  const stopSnapshots=await listen<unknown>('lumen:snapshot',event=>{
    const snapshot=snapshotSchema.safeParse(event.payload);
    if(snapshot.success)for(const listener of snapshots)listener(snapshot.data);
  });
  try{
    const stopStatuses=await listen<unknown>('lumen:status',event=>{
      if(typeof event.payload==='string')for(const listener of statuses)listener(event.payload);
    });
    const bridge:Bridge={
      invoke:async action=>responseSchema.parse(await invoke<unknown>('lumen_action',{action:actionSchema.parse(action)})),
      subscribe:listener=>{snapshots.add(listener);return ()=>{snapshots.delete(listener);};},
      onStatus:listener=>{statuses.add(listener);return ()=>{statuses.delete(listener);};},
    };
    Object.defineProperty(window,'lumen',{value:bridge,writable:false,configurable:false});
    window.addEventListener('unload',()=>{stopSnapshots();stopStatuses();},{once:true});
  }catch(error){stopSnapshots();throw error;}
}
