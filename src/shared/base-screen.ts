import { z } from 'zod';

const percent=z.number().int().min(0).max(100);
const loadingPositionSchema=z.object({x:percent,y:percent});
export type LoadingPosition=z.infer<typeof loadingPositionSchema>;
export const defaultLoadingPosition:Readonly<LoadingPosition>={x:50,y:86};
export const baseScreenSchema=z.object({imageId:z.string().uuid().nullable().default(null),fit:z.enum(['contain','cover']).default('contain'),loadingPosition:loadingPositionSchema.optional()});
export type BaseScreen=z.infer<typeof baseScreenSchema>;
export const defaultBaseScreen:BaseScreen=baseScreenSchema.parse({});
