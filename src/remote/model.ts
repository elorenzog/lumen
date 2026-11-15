import type { Verse } from '../shared/contracts';
import type { RemoteLibrary,RemoteState } from '../shared/remote-contracts';

export type RemoteModel={paired:boolean;connection:'loading'|'connected'|'lost';state:RemoteState|null;library:RemoteLibrary|null;tab:'biblia'|'himnario'|'programa';bibleId:string;book:number;chapter:number;range:string;query:string;results:readonly Verse[]|null;selected:readonly Verse[];hymnQuery:string;edition:'1962'|'2009'|'all';hymnId:string;track:number;pending:number;message:string;error:string;pin:string};
export const remoteModel=():RemoteModel=>({paired:false,connection:'loading',state:null,library:null,tab:'biblia',bibleId:'',book:43,chapter:3,range:'16',query:'',results:null,selected:[],hymnQuery:'',edition:'2009',hymnId:'',track:0,pending:0,message:'',error:'',pin:''});
