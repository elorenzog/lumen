import './styles.css';
import './beginner.css';
import './ui-theme.css';
import './settings.css';
import './help.css';
import { initializeUiTheme } from './ui/ui-theme';
import { operator } from './operator';
import { projection } from './projection';
import { initializeNative } from './native';
const root=document.getElementById('app');
const output=new URLSearchParams(location.search).has('output');
if(output)document.body.classList.add('projection-body');
if(root){void (async()=>{
  if(!output)initializeUiTheme();
  await initializeNative();
  await (output?projection(root):operator(root));
})().catch((error:unknown)=>{root.textContent=error instanceof Error?`LUMEN: ${error.message}`:typeof error==='string'?`LUMEN: ${error}`:'No se pudo iniciar LUMEN.';});}
