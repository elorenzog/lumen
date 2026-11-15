import { hymnMetadataSchema } from '../src/shared/contracts';
import type { Hymn } from '../src/shared/contracts';

export function mergeImportedHymns(current:readonly Hymn[],incoming:readonly Hymn[],removed:ReadonlySet<string>):Hymn[]{
  const merged=new Map(current.filter(hymn=>!removed.has(hymn.id)).map(hymn=>[hymn.id,hymn]));
  for(const hymn of incoming){
    if(removed.has(hymn.id))continue;
    const latest=merged.get(hymn.id);
    merged.set(hymn.id,latest?{...hymn,...hymnMetadataSchema.parse(latest)}:hymn);
  }
  return [...merged.values()];
}
