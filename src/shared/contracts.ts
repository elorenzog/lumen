import { z } from 'zod';
import { appearanceSchema, defaultAppearance, themePresetSchema, backgroundAssetSchema, backgroundMediaSchema } from './appearance';
import { baseScreenSchema, defaultBaseScreen } from './base-screen';
import { remoteInfoSchema,disabledRemote } from './remote-info';
import { updateInfoSchema,initialUpdateInfo } from './update-info';

export const verseSchema = z.object({ book: z.number().int().min(1).max(66), chapter: z.number().int().positive(), verse: z.number().int().positive(), endVerse: z.number().int().positive().optional(), text: z.string().min(1).max(20000) });
export type Verse = z.infer<typeof verseSchema>;
export const provenanceSchema = z.object({ provider:z.enum(['local','ebible','fetch-bible','open-bible','api-bible']).default('local'), rights:z.enum(['public-domain','open-license','authorized','unspecified']).default('unspecified'), offline:z.enum(['allowed','unspecified']).default('unspecified'), redistribution:z.enum(['allowed','unspecified']).default('unspecified'), attribution:z.string().max(4000).default(''), licenseUrl:z.string().max(1000).default(''), retrievedAt:z.number().nonnegative().default(0),notice:z.string().max(1000).optional() });
export const bibleSchema = z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]+$/), name: z.string().min(1).max(200), abbreviation: z.string().min(1).max(40), source: z.string().max(1000), license: z.string().max(1000), provenance:provenanceSchema.optional(), verses: z.array(verseSchema).min(1).max(50000) });
export type Bible = z.infer<typeof bibleSchema>;
export type BibleInfo = Omit<Bible, 'verses'> & { readonly count: number };
export const trackSchema = z.object({ index: z.number().int().nonnegative(), label: z.string(), language: z.string() });
export const hymnMetadataSchema=z.object({number1962:z.number().int().positive().nullable().default(null),number2009:z.number().int().positive().nullable().default(null),numberingSource:z.string().max(1000).default(''),numberingConflict:z.boolean().default(false),edition:z.enum(['1962','2009','unknown']).default('unknown'),favorite:z.boolean().default(false),topic:z.string().max(1000).default(''),lyrics:z.string().max(50000).default(''),lyricist:z.string().max(500).default(''),composer:z.string().max(500).default(''),references:z.string().max(2000).default(''),sungTrack:z.number().int().nonnegative().nullable().default(null),instrumentalTrack:z.number().int().nonnegative().nullable().default(null)});
export const hymnSchema = z.object({ id: z.string(), number: z.number().int().positive(), title: z.string(), path: z.string(), duration: z.number().nonnegative(), tracks: z.array(trackSchema).min(1), size: z.number(), modified: z.number() }).extend(hymnMetadataSchema.shape);
export type Hymn = z.infer<typeof hymnSchema>;
export const oldHymnCatalogEntrySchema = z.object({ number: z.number().int().min(1).max(527), title: z.string().trim().min(1).max(500) });
export type OldHymnCatalogEntry = z.infer<typeof oldHymnCatalogEntrySchema>;
export const slideSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('welcome'), title: z.string(), subtitle: z.string() }),
  z.object({ kind: z.literal('verse'), text: z.string(), reference: z.string(), translation: z.string() }),
  z.object({ kind: z.literal('hymn'), hymnId: z.string(), title: z.string(), track: z.number().int().nonnegative(), mediaUrl: z.string() }),
]);
export type Slide = z.infer<typeof slideSchema>;
export const settingsSchema = z.object({ theme: z.enum(['noche', 'amanecer', 'negro']), fontSize: z.number().min(24).max(76), autoProject: z.boolean(), volume: z.number().min(0).max(1), appearance:appearanceSchema.default(defaultAppearance), presets:z.array(themePresetSchema).max(40).default([]),baseScreen:baseScreenSchema.default(()=>({...defaultBaseScreen})) });
export const programItemSchema = z.object({ id: z.string(), title: z.string(), slide: slideSchema });
export type ProgramItem = z.infer<typeof programItemSchema>;
export const historySchema=programItemSchema.extend({projectedAt:z.number()});
export const savedSchema = z.object({ hymns: z.array(hymnSchema), program: z.array(programItemSchema), history:z.array(historySchema).max(30).default([]), settings: settingsSchema, backgrounds:z.array(backgroundAssetSchema).max(200).default([]) });
export type Saved = z.infer<typeof savedSchema>;
export const outputSchema = z.object({ slide: slideSchema, blackout: z.boolean(), playing: z.boolean(), position: z.number().nonnegative(), updatedAt: z.number(), connected: z.boolean(), displayId: z.number().nullable(), revision: z.number().int(), preparing:z.object({hymnId:z.string(),title:z.string(),track:z.number().int().nonnegative()}).nullable().default(null) });
export type Output = z.infer<typeof outputSchema>;
export const displaySchema = z.object({ id: z.number(), label: z.string(), width: z.number(), height: z.number(), primary: z.boolean() });
export const snapshotSchema = savedSchema.extend({ updates:updateInfoSchema.default(()=>({...initialUpdateInfo})), remote:remoteInfoSchema.default(()=>({...disabledRemote})), oldHymnCatalog: z.array(oldHymnCatalogEntrySchema).default([]), output: outputSchema, displays: z.array(displaySchema), bibles: z.array(bibleSchema.omit({ verses: true }).extend({ count: z.number() })), backgroundMedia:z.array(backgroundMediaSchema).default([]) });
export type Snapshot = z.infer<typeof snapshotSchema>;
export const actionSchema = z.discriminatedUnion('type', [
  z.object({type:z.literal('updates'),operation:z.enum(['check','download','install','releases'])}),
  z.object({type:z.literal('update-preference'),checkAtStartup:z.boolean()}),
  z.object({type:z.literal('remote-control'),operation:z.enum(['enable','disable','rotate'])}),
  z.object({ type: z.literal('snapshot') }),
  z.object({ type: z.literal('bible'), id: z.string() }),
  z.object({ type:z.literal('bible-search'),id:z.string(),query:z.string().max(500) }),
  z.object({ type:z.literal('bible-catalog') }),
  z.object({ type:z.literal('download-bible'),id:z.enum(['spa_bll','spa_blm']) }),
  z.object({ type: z.literal('import-bible') }),
  z.object({type:z.literal('import-bible-folder')}),
  z.object({ type:z.literal('import-background'),kind:z.enum(['image','video']) }),
  z.object({ type: z.literal('import-hymns'), folder: z.boolean(), edition:z.enum(['1962','2009','unknown']).default('unknown') }),
  z.object({ type:z.literal('hymn-metadata'),id:z.string(),metadata:hymnMetadataSchema }),
  z.object({ type: z.literal('remove-hymn'), id: z.string() }),
  z.object({ type: z.literal('open-output'), displayId: z.number() }),
  z.object({ type: z.literal('close-output') }),
  z.object({ type: z.literal('project'), slide: slideSchema }),
  z.object({ type: z.literal('play-hymn'), id: z.string(), track: z.number().int().nonnegative() }),
  z.object({ type: z.literal('stop-hymn') }),
  z.object({ type: z.literal('playback'), playing: z.boolean().optional(), position: z.number().nonnegative().optional(), ended: z.boolean().optional(), revision: z.number().int().optional() }),
  z.object({ type: z.literal('blackout'), value: z.boolean() }),
  z.object({ type: z.literal('media-error'), message: z.string().max(1000), revision: z.number().int() }),
  z.object({ type:z.literal('background-error'),message:z.string().max(1000) }),
  z.object({ type: z.literal('settings'), settings: settingsSchema }),
  z.object({ type: z.literal('program'), program: z.array(programItemSchema).max(500) }),
]);
export type Action = z.infer<typeof actionSchema>;
export const responseSchema = z.discriminatedUnion('ok', [z.object({ ok: z.literal(true), data: z.unknown() }), z.object({ ok: z.literal(false), error: z.string() })]);
export type Response = z.infer<typeof responseSchema>;
export type Bridge = { readonly invoke: (action: Action) => Promise<Response>; readonly subscribe: (listener: (snapshot: Snapshot) => void) => () => void; readonly onStatus: (listener: (message: string) => void) => () => void };
export const defaults: Saved = { hymns: [], program: [], history:[], backgrounds:[], settings: { theme: 'noche', fontSize: 52, autoProject: false, volume: 0.8, appearance:{...defaultAppearance},presets:[],baseScreen:{...defaultBaseScreen} } };
export const welcome: Slide = { kind: 'welcome', title: 'LUMEN', subtitle: 'La Palabra que ilumina,\nla alabanza que inspira.' };
export class LumenError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = 'LumenError'; }
}
