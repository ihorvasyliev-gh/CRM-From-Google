/**
 * Tests for documentJob.ts: the Web Worker wrapper around renderArchive.
 * jsdom has no Worker, so each test installs a small fake.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { runRenderJob } from './documentJob';
import type { RenderInput } from './documentRender';
import type { WorkerMessage } from './documentWorker';

const input: RenderInput = { enrollments: [], templates: [] };
const emptyResult = { totalTemplates: 0, successTemplates: [], failedTemplates: [], totalDocs: 0, failedDocs: [], extras: [], unknownTags: [], skipped: [] };

/** A Worker stand-in whose behaviour on postMessage is scripted per test. */
class FakeWorker {
    static onPost: (worker: FakeWorker) => void = () => {};
    static created: FakeWorker[] = [];
    onmessage: ((e: MessageEvent<WorkerMessage>) => void) | null = null;
    onerror: ((e: ErrorEvent) => void) | null = null;
    terminate = vi.fn();
    constructor() { FakeWorker.created.push(this); }
    postMessage() { queueMicrotask(() => FakeWorker.onPost(this)); }
    emit(data: WorkerMessage) { this.onmessage?.({ data } as MessageEvent<WorkerMessage>); }
    fail(message: string) { this.onerror?.({ message, preventDefault() {} } as ErrorEvent); }
}

function installWorker(onPost: (worker: FakeWorker) => void) {
    FakeWorker.onPost = onPost;
    FakeWorker.created = [];
    vi.stubGlobal('Worker', FakeWorker);
    return FakeWorker.created;
}

afterEach(() => vi.unstubAllGlobals());

describe('runRenderJob', () => {
    it('renders in the worker and forwards its progress', async () => {
        const zip = new ArrayBuffer(4);
        const workers = installWorker(w => {
            w.emit({ type: 'started' });
            w.emit({ type: 'progress', done: 1, total: 2 });
            w.emit({ type: 'done', zip, result: emptyResult });
        });
        const progress = vi.fn();
        const out = await runRenderJob(input, { onProgress: progress });
        expect(out.zip).toBe(zip);
        expect(progress).toHaveBeenCalledWith(1, 2);
        expect(workers[0].terminate).toHaveBeenCalled();
    });

    it('falls back to the main thread when the worker cannot start', async () => {
        installWorker(w => w.fail('Failed to fetch worker script'));
        const out = await runRenderJob(input);
        expect(out.result.totalDocs).toBe(0);
        expect(out.zip.byteLength).toBeGreaterThan(0); // an (empty) ZIP built here instead
    });

    it('reports a crash after the worker started instead of silently re-running', async () => {
        installWorker(w => { w.emit({ type: 'started' }); w.fail('Out of memory'); });
        await expect(runRenderJob(input)).rejects.toThrow('Out of memory');
    });

    it('passes on errors raised while rendering', async () => {
        installWorker(w => { w.emit({ type: 'started' }); w.emit({ type: 'error', message: 'Broken zip' }); });
        await expect(runRenderJob(input)).rejects.toThrow('Broken zip');
    });

    it('stops the worker when cancelled', async () => {
        const workers = installWorker(w => w.emit({ type: 'started' })); // never finishes
        const controller = new AbortController();
        const run = runRenderJob(input, { signal: controller.signal });
        await new Promise(r => setTimeout(r, 0));
        controller.abort();
        await expect(run).rejects.toMatchObject({ name: 'AbortError' });
        expect(workers[0].terminate).toHaveBeenCalled();
    });
});
