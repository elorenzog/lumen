import { LumenError, welcome } from '../src/shared/contracts';
import type { Hymn, Output, Slide } from '../src/shared/contracts';
import { playbackPosition } from '../src/shared/domain';

type HymnSlide = Extract<Slide, { kind: 'hymn' }>;
export type HymnPlaybackEffects = {
  readonly current: () => Output;
  readonly update: (value: Partial<Output>) => void;
  readonly prepare: (hymn: Hymn, track: number, signal: AbortSignal) => Promise<string>;
  readonly register: (file: string) => string;
  readonly revoke: (url: string) => void;
  readonly ready: (slide: HymnSlide) => Promise<void>;
  readonly status: (message: string) => void;
};
type Preparation = { readonly hymnId: string; readonly position: number; readonly abort: AbortController; readonly generation: number };

export class HymnPlayback {
  private generation = 0;
  private pending: Preparation | undefined;
  constructor(private readonly effects: HymnPlaybackEffects, private readonly now: () => number = Date.now) {}
  has(id: string): boolean { return this.pending?.hymnId === id || this.currentHymnId() === id; }
  private currentHymnId(): string | undefined { const slide = this.effects.current().slide; return slide.kind === 'hymn' ? slide.hymnId : undefined; }
  cancel(): void { this.generation++; this.pending?.abort.abort(); this.pending = undefined; }
  stop(): void {
    this.cancel();
    const output = this.effects.current();
    if (output.slide.kind === 'hymn') this.effects.revoke(output.slide.mediaUrl);
    this.effects.update({ slide: welcome, preparing: null, playing: false, position: 0, updatedAt: this.now(), revision: output.revision + 1 });
  }
  async play(hymn: Hymn, track: number): Promise<void> {
    const output = this.effects.current();
    if (!output.connected) throw new LumenError('output', 'Abre la pantalla de proyección antes de reproducir.');
    if (!hymn.tracks.some(candidate => candidate.index === track)) throw new LumenError('track', 'Esta pista de audio no existe.');
    const previousPosition = this.currentHymnId() === hymn.id ? playbackPosition(output) : this.pending?.hymnId === hymn.id ? this.pending.position : 0;
    const position = previousPosition < hymn.duration - 0.1 ? previousPosition : 0;
    this.cancel();
    const job: Preparation = { hymnId: hymn.id, position, abort: new AbortController(), generation: this.generation };
    this.pending = job;
    if (output.slide.kind === 'hymn') this.effects.revoke(output.slide.mediaUrl);
    this.effects.update({ slide: welcome, preparing: { hymnId: hymn.id, title: `${hymn.number} · ${hymn.title}`, track }, playing: false, position: 0, updatedAt: this.now(), revision: output.revision + 1 });
    try {
      const file = await this.effects.prepare(hymn, track, job.abort.signal);
      if (job.abort.signal.aborted || job.generation !== this.generation) return;
      const current = this.effects.current();
      if (!current.connected) return;
      const slide: HymnSlide = { kind: 'hymn', hymnId: hymn.id, title: `${hymn.number} · ${hymn.title}`, track, mediaUrl: this.effects.register(file) };
      this.pending = undefined;
      this.effects.update({ slide, preparing: null, blackout: false, playing: true, position: job.position, updatedAt: this.now(), revision: current.revision + 1 });
      await this.effects.ready(slide);
      if (job.generation === this.generation) this.effects.status('Himno listo.');
    } catch (error) {
      if (job.abort.signal.aborted || job.generation !== this.generation) return;
      this.effects.update({ preparing: null, playing: false });
      throw error;
    } finally {
      if (this.pending === job) this.pending = undefined;
    }
  }
}
