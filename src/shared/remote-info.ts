import { z } from 'zod';

export const remoteInfoSchema=z.object({enabled:z.boolean(),urls:z.array(z.string()),pin:z.string(),devices:z.number().int().nonnegative()});
export type RemoteInfo=z.infer<typeof remoteInfoSchema>;
export const disabledRemote:RemoteInfo={enabled:false,urls:[],pin:'',devices:0};
