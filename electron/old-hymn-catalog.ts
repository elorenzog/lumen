import { z } from 'zod';
import { oldHymnCatalogEntrySchema } from '../src/shared/contracts';
import type { OldHymnCatalogEntry } from '../src/shared/contracts';

const catalogSchema = z.object({
  version: z.literal(1),
  edition: z.literal('1962'),
  source: z.url(),
  entries: z.array(oldHymnCatalogEntrySchema).length(527),
}).superRefine((catalog, context) => {
  if (new Set(catalog.entries.map(entry => entry.number)).size !== 527) {
    context.addIssue({ code: 'custom', message: 'El catálogo antiguo debe contener cada número del1al527 exactamente una vez.' });
  }
});

export function parseOldHymnCatalog(raw: unknown): OldHymnCatalogEntry[] {
  return catalogSchema.parse(raw).entries.toSorted((left, right) => left.number - right.number);
}
