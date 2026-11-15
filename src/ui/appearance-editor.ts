import type { UIState } from './state';
import { button, esc, iconButton } from './primitives';
import { stageMarkup } from './stage';
import { verseSlide } from './state';
import type { Appearance } from '../shared/appearance';

function select(field:keyof Appearance,label:string,options:readonly (readonly [string,string])[],a:Appearance):string{
  return `<label for="ap-${field}">${label}</label><select id="ap-${field}" data-appearance="${field}">${options.map(([value,name])=>`<option value="${value}" ${a[field]===value?'selected':''}>${name}</option>`).join('')}</select>`;
}
function color(field:'color'|'secondary'|'textColor'|'referenceColor',label:string,a:Appearance):string{
  return `<label class="color-field" for="ap-${field}"><span>${label}</span><input type="color" id="ap-${field}" data-appearance="${field}" value="${a[field]}"></label>`;
}
function range(field:keyof Appearance,label:string,a:Appearance):string{
  const limits={angle:[0,360,5,'°'],dim:[0,90,5,'%'],margin:[4,20,1,'%'],lineHeight:[1,2,0.1,''],shadow:[0,8,1,''],outline:[0,4,0.5,'']} as const;
  if(!(field in limits))return '';
  const values=field==='angle'?limits.angle:field==='dim'?limits.dim:field==='margin'?limits.margin:field==='lineHeight'?limits.lineHeight:field==='shadow'?limits.shadow:limits.outline;
  return `<label class="range-heading" for="ap-${field}">${label}<output>${a[field]}${values[3]}</output></label><input type="range" id="ap-${field}" data-appearance="${field}" min="${values[0]}" max="${values[1]}" step="${values[2]}" value="${a[field]}">`;
}
export function appearanceEditor(state:UIState):string{
  const draft=state.appearanceDraft;if(!draft)return '';
  const a=draft.appearance;
  const assets=state.snapshot.backgroundMedia.filter(item=>item.kind===a.mode);
  const slide=state.selected.length?verseSlide(state):{kind:'verse' as const,text:'Lámpara es a mis pies tu palabra,\ny lumbrera a mi camino.',reference:'Salmos 119:105',translation:state.bible.abbreviation};
  return `<dialog id="appearance-dialog" class="appearance-dialog" aria-labelledby="appearance-title"><header class="editor-heading"><div><div class="overline">DISEÑO DE PROYECCIÓN</div><h2 id="appearance-title">Un fondo para la Palabra</h2></div>${iconButton('appearance-cancel','Cerrar editor','close')}</header>
    <div class="editor-body"><section class="editor-preview"><div class="preview-label"><span>VISTA PREVIA DEL TEMA</span><span>16:9</span></div><div id="appearance-preview">${stageMarkup(slide,{...state.snapshot,settings:{...state.snapshot.settings,...draft}})}</div><p class="small-note">Prueba los cambios aquí. «Aplicar» actualiza la pantalla de salida.</p>
    <h3>Mis temas</h3><label class="sr-only" for="appearance-preset">Tema guardado</label><select id="appearance-preset"><option value="">Elegir un tema guardado</option>${state.snapshot.settings.presets.map(p=>`<option value="${p.id}" ${state.presetId===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select>
    <div class="preset-save"><label class="sr-only" for="appearance-name">Nombre del tema</label><input id="appearance-name" placeholder="Nombre del tema" maxlength="60" value="${esc(state.presetName)}">${button('appearance-save-preset','Guardar','plus','secondary',state.appearanceBusy?'disabled':'')}</div>
    ${button('appearance-delete-preset','Eliminar tema elegido','trash','ghost',state.presetId?'':'disabled')}<p class="editor-notice" role="status">${esc(state.appearanceMessage)}</p></section>
    <section class="editor-controls"><fieldset><legend>Fondo</legend>${select('mode','Tipo de fondo',[['preset','Fondos de LUMEN'],['solid','Color sólido'],['gradient','Degradado'],['image','Imagen'],['video','Vídeo en bucle']],a)}
    ${a.mode==='preset'?`<label for="ap-theme">Fondo de LUMEN</label><select id="ap-theme">${[['noche','Noche serena'],['amanecer','Luz del amanecer'],['negro','Negro esencial']].map(([id,name])=>`<option value="${id}" ${draft.theme===id?'selected':''}>${name}</option>`).join('')}</select>`:''}
    ${a.mode==='solid'||a.mode==='gradient'?`<div class="color-fields">${color('color','Color principal',a)}${a.mode==='gradient'?color('secondary','Segundo color',a):''}</div>`:''}${a.mode==='gradient'?range('angle','Dirección',a):''}
    ${a.mode==='image'||a.mode==='video'?`<label for="ap-assetId">${a.mode==='image'?'Imagen':'Vídeo'} guardado</label><select id="ap-assetId" data-appearance="assetId"><option value="">Seleccionar archivo</option>${assets.map(item=>`<option value="${item.id}" ${a.assetId===item.id?'selected':''}>${esc(item.name)}</option>`).join('')}</select>${button('appearance-import',state.appearanceBusy?'Importando…':a.mode==='image'?'Importar imagen':'Importar vídeo','folder','secondary',state.appearanceBusy?'disabled':'')}<p class="small-note">${a.mode==='image'?'PNG, JPG o WebP · hasta 30 MB':'MP4 (H.264) o WebM · hasta 500 MB · sin audio'}. Se guarda una copia para usar sin conexión.</p>`:''}
    ${a.mode!=='preset'?range('dim','Oscurecer fondo',a):''}</fieldset>
    <fieldset><legend>Texto y referencia</legend>${select('fontFamily','Tipografía',[['georgia','Georgia'],['segoe','Segoe UI'],['arial','Arial']],a)}<div class="color-fields">${color('textColor','Versículos',a)}${color('referenceColor','Referencia',a)}</div><label class="auto-label"><input type="checkbox" id="ap-bold" data-appearance="bold" ${a.bold?'checked':''}>Texto en negrita</label><label class="range-heading" for="ap-fontSize">Tamaño del texto<output>${draft.fontSize}</output></label><input id="ap-fontSize" type="range" min="24" max="76" step="2" value="${draft.fontSize}">${range('lineHeight','Interlineado',a)}${range('shadow','Sombra',a)}${range('outline','Contorno',a)}</fieldset>
    <fieldset><legend>Distribución</legend>${select('align','Alineación',[['left','Izquierda'],['center','Centro'],['right','Derecha']],a)}${select('vertical','Posición vertical',[['top','Arriba'],['center','Centro'],['bottom','Abajo']],a)}${range('margin','Márgenes de seguridad',a)}</fieldset></section></div>
    <footer class="editor-footer">${button('appearance-reset','Restablecer','settings','ghost')}<div>${button('appearance-cancel','Cancelar',undefined,'secondary')}${button('appearance-apply','Aplicar al proyector','check','primary',state.appearanceBusy?'disabled':'')}</div></footer></dialog>`;
}
