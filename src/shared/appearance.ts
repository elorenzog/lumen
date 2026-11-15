import { z } from 'zod';

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const appearanceSchema = z.object({
  mode:z.enum(['preset','solid','gradient','image','video']).default('preset'),
  color:color.default('#111d32'), secondary:color.default('#736344'), angle:z.number().min(0).max(360).default(135),
  assetId:z.string().uuid().nullable().default(null), dim:z.number().min(0).max(90).default(25),
  textColor:color.default('#ffffff'), referenceColor:color.default('#c29b55'),
  fontFamily:z.enum(['georgia','segoe','arial']).default('georgia'), bold:z.boolean().default(false),
  align:z.enum(['left','center','right']).default('center'), vertical:z.enum(['top','center','bottom']).default('center'),
  margin:z.number().min(4).max(20).default(9), lineHeight:z.number().min(1).max(2).default(1.4),
  shadow:z.number().min(0).max(8).default(2), outline:z.number().min(0).max(4).default(0),
});
export type Appearance = z.infer<typeof appearanceSchema>;
export const defaultAppearance:Appearance = appearanceSchema.parse({});
export const themePresetSchema = z.object({id:z.string().uuid(),name:z.string().trim().min(1).max(60),appearance:appearanceSchema,fontSize:z.number().min(24).max(76),theme:z.enum(['noche','amanecer','negro'])});
export const backgroundAssetSchema = z.object({id:z.string().uuid(),name:z.string().min(1).max(255),kind:z.enum(['image','video']),file:z.string().regex(/^[a-f0-9-]+\.(png|mp4|webm)$/)});
export const backgroundMediaSchema = backgroundAssetSchema.omit({file:true}).extend({url:z.string()});
export type BackgroundAsset = z.infer<typeof backgroundAssetSchema>;
export type BackgroundMedia = z.infer<typeof backgroundMediaSchema>;
export type AppearanceDraft = {appearance:Appearance;fontSize:number;theme:'noche'|'amanecer'|'negro'};
