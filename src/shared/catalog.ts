import { z } from 'zod';
export const catalogEntrySchema=z.object({id:z.enum(['spa_bll','spa_blm']),name:z.string(),abbreviation:z.string(),license:z.string(),source:z.string(),attribution:z.string(),licenseUrl:z.string(),notice:z.string()});
export type CatalogEntry=z.infer<typeof catalogEntrySchema>;
