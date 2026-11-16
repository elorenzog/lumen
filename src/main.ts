import './styles.css';
import { operator } from './operator';
import { projection } from './projection';
import { initializeNative } from './native';
const root=document.getElementById('app');
if(root){void (async()=>{
  await initializeNative();
  await (new URLSearchParams(location.search).has('output')?projection(root):operator(root));
})().catch((error:unknown)=>{root.textContent=error instanceof Error?`LUMEN: ${error.message}`:typeof error==='string'?`LUMEN: ${error}`:'No se pudo iniciar LUMEN.';});}
