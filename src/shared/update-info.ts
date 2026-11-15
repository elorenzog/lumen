import { z } from 'zod';
import { appVersion } from './app-info';

export const updateInfoSchema=z.object({currentVersion:z.string(),status:z.enum(['idle','checking','current','available','downloading','downloaded','error']),version:z.string(),notes:z.string(),progress:z.number().min(0).max(100),message:z.string(),checkAtStartup:z.boolean(),installable:z.boolean()});
export type UpdateInfo=z.infer<typeof updateInfoSchema>;
export const initialUpdateInfo:UpdateInfo={currentVersion:appVersion,status:'idle',version:'',notes:'',progress:0,message:'Busca una nueva versión en GitHub.',checkAtStartup:true,installable:false};
