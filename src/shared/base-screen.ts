import { z } from 'zod';

export const baseScreenSchema=z.object({imageId:z.string().uuid().nullable().default(null),fit:z.enum(['contain','cover']).default('contain')});
export type BaseScreen=z.infer<typeof baseScreenSchema>;
export const defaultBaseScreen:BaseScreen=baseScreenSchema.parse({});
