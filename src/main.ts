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
if(root){void (async()=>{
  if(!new URLSearchParams(location.search).has('output'))initializeUiTheme();
  await initializeNative();
  await (new URLSearchParams(location.search).has('output')?projection(root):operator(root));
})().catch((error:unknown)=>{root.textContent=error instanceof Error?`LUMEN: ${error.message}`:typeof error==='string'?`LUMEN: ${error}`:'No se pudo iniciar LUMEN.';});}
