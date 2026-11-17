import type {RemoteModel} from './model';
import type {RemoteLibrary} from '../shared/remote-contracts';
import {formatTime,playbackPosition} from '../shared/domain';
import {button} from '../ui/primitives';

export function seekPanel(model:RemoteModel,hymn:RemoteLibrary['hymns'][number]):string{
  const output=model.state?.output;if(!output||output.slide.kind!=='hymn')return '';
  const draft=model.seekDraft;
  const editing=draft?.hymnId===output.slide.hymnId&&draft.track===output.slide.track&&draft.revision===output.revision;
  const time=Math.min(playbackPosition(output),hymn.duration);
  return `<div class="remote-seek-panel"><p class="small-note">Posición · ${formatTime(time)} / ${formatTime(hymn.duration)}</p>${editing?`<label for="remote-seek">Nueva posición: <output id="remote-seek-value">${formatTime(draft.position)}</output></label><input id="remote-seek" type="range" min="0" max="${hymn.duration}" step="1" value="${draft.position}" aria-describedby="seek-help"><p id="seek-help" class="small-note">El himno sigue igual hasta que pulses Ir a esta posición.</p><div class="remote-transport">${button('seek-apply','Ir a esta posición','check','primary',model.pending?'disabled':'')}${button('seek-cancel','Cancelar','close')}</div>`:`${button('seek-open','Cambiar posición','settings')}<p class="small-note">Puedes desplazarte por esta página sin adelantar el himno.</p>`}</div>`;
}
