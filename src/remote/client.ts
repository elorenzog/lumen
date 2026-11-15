import ky,{ HTTPError } from 'ky';
import '../styles.css';
import './remote.css';
import { remoteStateSchema,remoteLibrarySchema,remoteResultsSchema } from '../shared/remote-contracts';
import type { RemoteCommand } from '../shared/remote-contracts';
import { books } from '../shared/domain';
import { remoteModel } from './model';
import { livePanel,remoteView } from './view';

const model=remoteModel();const api=ky.create({timeout:10000,retry:0,credentials:'same-origin'});
const root=document.getElementById('app');
if(root){const app=root;document.body.classList.add('remote-body');
  function render():void{
    const active=document.activeElement;const id=active?.id;const start=active instanceof HTMLInputElement?active.selectionStart:null;
    app.innerHTML=remoteView(model);
    const next=id?document.getElementById(id):null;if(next){next.focus({preventScroll:true});if(next instanceof HTMLInputElement&&start!==null)next.setSelectionRange(start,start);}
  }
  function live():void{
    const host=document.getElementById('remote-live-region');
    if(host&&!host.contains(document.activeElement))host.innerHTML=livePanel(model);
    const error=document.getElementById('remote-error');if(error){error.textContent=model.error;error.hidden=!model.error;}
    const message=document.getElementById('remote-message');if(message)message.textContent=model.message;
  }
  async function failure(error:unknown):Promise<void>{
    if(!(error instanceof Error))throw error;
    model.error=error.message;
    if(error instanceof HTTPError){
      const payload:unknown=error.data;
      if(payload&&typeof payload==='object'&&'error'in payload&&typeof payload.error==='string')model.error=payload.error;
      if(error.response.status===401){model.paired=false;model.pin='';model.state=null;}
    }else{model.connection='lost';model.error='No se pudo conectar con LUMEN. Comprueba la red y reintenta.';}
    render();
  }
  const run=(job:Promise<void>):void=>{void job.catch(failure);};
  let searchGeneration=0;
  async function refreshLibrary():Promise<void>{model.library=remoteLibrarySchema.parse(await api.get('/api/library').json());}
  async function connect():Promise<void>{
    model.state=remoteStateSchema.parse(await api.get('/api/state').json());await refreshLibrary();model.paired=true;model.connection='connected';model.error='';model.bibleId=model.bibleId||model.state.bibles[0]?.id||'';render();
  }
  async function command(value:RemoteCommand):Promise<void>{
    if(model.connection!=='connected')return;
    model.pending++;model.error='';model.message='Enviando a LUMEN.';render();
    try{model.state=remoteStateSchema.parse(await api.post('/api/command',{json:value,timeout:120000}).json());model.message='Acción enviada a LUMEN.';}
    finally{model.pending--;render();}
  }
  async function search(query:string,range:boolean):Promise<void>{
    const generation=++searchGeneration;const bibleId=model.bibleId;
    model.error='';model.message='Buscando pasaje.';render();
    const results=remoteResultsSchema.parse(await api.post('/api/search',{json:{bibleId,query}}).json());
    if(generation!==searchGeneration||bibleId!==model.bibleId)return;
    model.results=results;
    model.selected=range?model.results:[];model.message='Pasaje preparado. Pulsa Proyectar para mostrarlo.';render();
  }
  app.addEventListener('submit',event=>{
    const form=event.target;if(!(form instanceof HTMLFormElement))return;event.preventDefault();
    if(form.id==='pair-form')run((async()=>{model.pending++;render();try{await api.post('/api/pair',{json:{pin:model.pin}});await connect();model.pin='';}finally{model.pending--;render();}})());
    if(form.id==='reference-form')run(search(`${books[model.book-1]} ${model.chapter}:${model.range}`,true));
    if(form.id==='search-form')run(search(model.query,false));
  });
  app.addEventListener('input',event=>{
    const input=event.target;if(!(input instanceof HTMLInputElement))return;
    switch(input.id){case 'remote-pin':model.pin=input.value;break;case 'remote-query':model.query=input.value;break;case 'remote-range':model.range=input.value;break;case 'remote-chapter':model.chapter=Number(input.value);break;case 'remote-hymn-query':model.hymnQuery=input.value;render();break;}
  });
  app.addEventListener('change',event=>{
    const input=event.target;if(!(input instanceof HTMLInputElement||input instanceof HTMLSelectElement))return;
    switch(input.id){
      case 'remote-bible':searchGeneration++;model.bibleId=input.value;model.results=null;model.selected=[];model.message='Selecciona un pasaje de esta traducción.';render();break;
      case 'remote-book':searchGeneration++;model.book=Number(input.value);model.chapter=1;model.range='1';model.results=null;model.selected=[];model.message='Selecciona un pasaje de este libro.';render();break;
      case 'remote-edition':model.edition=input.value==='1962'?'1962':input.value==='all'?'all':'2009';model.hymnId='';render();break;
      case 'remote-track':model.track=Number(input.value);break;
      case 'remote-volume':run(command({type:'volume',value:Number(input.value)}));break;
      case 'remote-seek':run(command({type:'playback',position:Number(input.value)}));break;
    }
  });
  app.addEventListener('click',event=>{
    if(!(event.target instanceof Element))return;
    const button=event.target.closest<HTMLButtonElement>('button[data-action]');if(!button||button.disabled)return;
    const action=button.dataset['action'];const output=model.state?.output;
    if(action?.startsWith('tab-')){model.tab=action==='tab-himnario'?'himnario':action==='tab-programa'?'programa':'biblia';render();return;}
    switch(action){
      case 'select-verse':{const verse=model.results?.[Number(button.dataset['id'])];if(verse){model.selected=[verse];model.book=verse.book;model.chapter=verse.chapter;model.range=String(verse.verse);render();}break;}
      case 'select-hymn':{const hymn=model.library?.hymns.find(hymn=>hymn.id===button.dataset['id']);if(hymn){model.hymnId=hymn.id;model.track=hymn.tracks[0]?.index??0;render();}break;}
      case 'project-reference':{const first=model.selected[0];const last=model.selected.at(-1);if(first&&last)run(command({type:'reference',bibleId:model.bibleId,book:first.book,chapter:first.chapter,range:`${first.verse}-${last.endVerse??last.verse}`}));break;}
      case 'play-hymn':run(command({type:'hymn',id:model.hymnId,track:model.track}));break;
      case 'program-item':run(command({type:'program',id:button.dataset['id']??''}));break;
      case 'previous-verse':run(command({type:'step',direction:-1}));break;
      case 'next-verse':run(command({type:'step',direction:1}));break;
      case 'toggle-play':if(output)run(command({type:'playback',playing:!output.playing}));break;
      case 'stop':run(command({type:'stop'}));break;
      case 'blackout':if(output)run(command({type:'blackout',value:!output.blackout}));break;
      case 'welcome':run(command({type:'welcome'}));break;
      case 'open':{const select=document.getElementById('remote-display');if(select instanceof HTMLSelectElement)run(command({type:'open',displayId:Number(select.value)}));break;}
      case 'close':run(command({type:'close'}));break;
      case 'refresh-library':run(refreshLibrary().then(()=>{model.message='Catálogo actualizado.';render();}));break;
      case 'reconnect':run(connect());break;
      case 'logout':run((async()=>{await api.post('/api/logout',{json:{}});model.paired=false;model.state=null;model.pin='';model.message='Teléfono desvinculado.';render();})());break;
    }
  });
  let polling=false;
  setInterval(()=>{
    if(!model.paired||document.hidden||polling)return;
    polling=true;
    void api.get('/api/state').json().then(raw=>{const previous=model.state;model.state=remoteStateSchema.parse(raw);const lost=model.connection==='lost';model.connection='connected';const changed=model.tab==='programa'&&JSON.stringify(previous?.program)!==JSON.stringify(model.state.program);if(lost||changed){if(lost)model.error='';render();}else live();}).catch(failure).finally(()=>{polling=false;});
  },1000);
  render();void connect().catch(async(error:unknown)=>{if(error instanceof HTTPError&&error.response.status===401){model.connection='connected';render();}else await failure(error);});
}
