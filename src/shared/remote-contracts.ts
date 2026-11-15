import { z } from 'zod';
import { outputSchema,displaySchema,verseSchema } from './contracts';

const id=z.string().min(1).max(200);
export const remoteCommandSchema=z.discriminatedUnion('type',[
  z.object({type:z.literal('reference'),bibleId:id,book:z.number().int().min(1).max(66),chapter:z.number().int().min(1).max(150),range:z.string().min(1).max(20)}).strict(),
  z.object({type:z.literal('step'),direction:z.union([z.literal(-1),z.literal(1)])}).strict(),
  z.object({type:z.literal('hymn'),id,track:z.number().int().nonnegative()}).strict(),
  z.object({type:z.literal('program'),id}).strict(),
  z.object({type:z.literal('playback'),playing:z.boolean().optional(),position:z.number().min(0).max(86400).optional()}).strict(),
  z.object({type:z.literal('stop')}).strict(),
  z.object({type:z.literal('blackout'),value:z.boolean()}).strict(),
  z.object({type:z.literal('volume'),value:z.number().min(0).max(1)}).strict(),
  z.object({type:z.literal('welcome')}).strict(),
  z.object({type:z.literal('open'),displayId:z.number()}).strict(),
  z.object({type:z.literal('close')}).strict(),
]);
export type RemoteCommand=z.infer<typeof remoteCommandSchema>;
export const remoteStateSchema=z.object({output:outputSchema,volume:z.number(),bibles:z.array(z.object({id,name:z.string(),abbreviation:z.string()})),displays:z.array(displaySchema),program:z.array(z.object({id,title:z.string(),kind:z.enum(['verse','hymn','welcome'])}))});
export type RemoteState=z.infer<typeof remoteStateSchema>;
export const remoteHymnSchema=z.object({id,number:z.number(),title:z.string(),number1962:z.number().nullable(),number2009:z.number().nullable(),tracks:z.array(z.object({index:z.number(),label:z.string()})),duration:z.number()});
export const remoteLibrarySchema=z.object({hymns:z.array(remoteHymnSchema),old:z.array(z.object({number:z.number(),title:z.string(),hymnId:z.string().nullable()}))});
export type RemoteLibrary=z.infer<typeof remoteLibrarySchema>;
export const remoteSearchSchema=z.object({bibleId:id,query:z.string().min(1).max(500)}).strict();
export const remoteResultsSchema=z.array(verseSchema);
