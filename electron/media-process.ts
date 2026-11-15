import { spawn } from 'node:child_process';
import { LumenError } from '../src/shared/contracts';

type ProcessOptions = { readonly signal?: AbortSignal; readonly onProgress?: (line: string) => void };
const children = new Set<ReturnType<typeof spawn>>();
export function assertMediaActive(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Preparación cancelada.', 'AbortError');
}
export function isCancellationError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}
export function run(binary: string, args: readonly string[], options: ProcessOptions = {}): Promise<string> {
  assertMediaActive(options.signal);
  return new Promise((resolve, reject) => {
    const child = spawn(binary.replace('app.asar', 'app.asar.unpacked'), [...args], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    children.add(child);
    let stdout = ''; let stderr = ''; let settled = false;
    const abort = (): void => { child.kill(); };
    const cleanup = (): void => { children.delete(child); options.signal?.removeEventListener('abort', abort); };
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) abort();
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); options.onProgress?.(chunk.toString()); });
    child.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-4000); });
    child.once('error', error => {
      settled = true; cleanup();
      reject(new LumenError('media-tool', `No se pudo iniciar el motor multimedia: ${error.message}`));
    });
    child.once('close', code => {
      cleanup(); if (settled) return;
      if (options.signal?.aborted) { reject(new DOMException('Preparación cancelada.', 'AbortError')); return; }
      if (code === 0) resolve(stdout);
      else reject(new LumenError('media', `El motor multimedia no pudo procesar el archivo (${code}). ${stderr.slice(-600)}`));
    });
  });
}
export const stopMedia = (): void => { for (const child of children) child.kill(); };
