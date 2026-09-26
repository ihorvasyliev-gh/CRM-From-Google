import { renderArchive, abortError, type RenderInput, type RenderHooks, type GenerationResult } from './documentRender';
import type { WorkerMessage } from './documentWorker';

/**
 * Render the archive in a Web Worker. Falls back to the main thread when workers are
 * unavailable (tests) or the worker script fails to load; the input is copied, not
 * transferred, so it is still usable for that fallback.
 */
export function runRenderJob(input: RenderInput, hooks: RenderHooks = {}): Promise<{ zip: ArrayBuffer; result: GenerationResult }> {
    if (hooks.signal?.aborted) return Promise.reject(abortError());
    if (typeof Worker === 'undefined') return renderArchive(input, hooks);

    let worker: Worker;
    try {
        worker = new Worker(new URL('./documentWorker.ts', import.meta.url), { type: 'module' });
    } catch {
        return renderArchive(input, hooks);
    }

    return new Promise((resolve, reject) => {
        let started = false;
        const finish = () => {
            worker.terminate();
            hooks.signal?.removeEventListener('abort', onAbort);
        };
        const onAbort = () => { finish(); reject(abortError()); };
        hooks.signal?.addEventListener('abort', onAbort);

        worker.onmessage = ({ data }: MessageEvent<WorkerMessage>) => {
            if (data.type === 'started') started = true;
            else if (data.type === 'progress') hooks.onProgress?.(data.done, data.total);
            else if (data.type === 'done') { finish(); resolve({ zip: data.zip, result: data.result }); }
            else { finish(); reject(new Error(data.message)); }
        };
        worker.onerror = event => {
            event.preventDefault();
            finish();
            if (started) reject(new Error(event.message || 'Document generation stopped unexpectedly'));
            else renderArchive(input, hooks).then(resolve, reject);
        };
        worker.postMessage(input);
    });
}
