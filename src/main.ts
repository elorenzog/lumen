import './styles.css';
import { operator } from './operator';
import { projection } from './projection';
const root=document.getElementById('app');
if(root){void (new URLSearchParams(location.search).has('output')?projection(root):operator(root)).catch((error:unknown)=>{root.textContent=error instanceof Error?`LUMEN: ${error.message}`:'No se pudo iniciar LUMEN.';});}
