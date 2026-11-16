import {describe,expect,it,vi} from 'vitest';
import {defaults,snapshotSchema,welcome} from '../src/shared/contracts';
import {remoteSettings} from '../src/ui/remote-settings';
import type {RemoteInfo} from '../src/shared/remote-info';

vi.mock('lucide',async original=>({...await original<typeof import('lucide')>(),createElement:()=>({outerHTML:'<svg aria-hidden="true"></svg>'})}));

function render(remote:RemoteInfo,remoteUrl=''):string{
  const snapshot=snapshotSchema.parse({...defaults,remote,output:{slide:welcome,playing:false,blackout:false,connected:false,displayId:null,position:0,updatedAt:0,revision:0},displays:[],bibles:[]});
  return remoteSettings({snapshot,busy:false,remoteUrl});
}
const enabled:RemoteInfo={enabled:true,urls:['http://192.168.1.2:5000','http://10.0.0.2:5000'],pin:'123456',devices:0};

describe('Phone connection instructions',()=>{
  it('shows an activation action without stale QR or PIN while disabled',()=>{
    const html=render({enabled:false,urls:[],pin:'',devices:0});
    expect(html).toContain('Activar y mostrar código QR');expect(html).not.toContain('class="remote-qr"');expect(html).not.toContain('class="remote-pin"');
  });
  it('explains missing connectivity without inventing a QR destination',()=>{
    const html=render({...enabled,urls:[]});
    expect(html).toContain('No encontramos una dirección de red');expect(html).not.toContain('class="remote-qr"');
  });
  it('keeps network selection and the readable address in sync',()=>{
    const html=render(enabled,enabled.urls[1]);
    expect(html).toContain('value="http://10.0.0.2:5000" selected');expect(html).toContain('readonly value="http://10.0.0.2:5000"');expect(html).toContain('El PIN protege el acceso');
  });
  it('falls back to an available address after network changes',()=>{
    const html=render({...enabled,urls:[enabled.urls[0]??'']},'http://old-network:5000');
    expect(html).toContain('readonly value="http://192.168.1.2:5000"');expect(html).not.toContain('old-network');expect(html).not.toContain('id="remote-address"');
  });
});
