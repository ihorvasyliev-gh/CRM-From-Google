// Builds the documents archive off the main thread, so the page stays responsive and
// the run keeps full speed when the tab is in the background. See documentJob.ts.
import { renderArchive, describeDocxError, type RenderInput } from './documentRender';

export type WorkerMessage =
    | { type: 'started' }
    | { type: 'progress'; done: number; total: number }
    | { type: 'done'; zip: ArrayBuffer; result: Awaited<ReturnType<typeof renderArchive>>['result'] }
    | { type: 'error'; message: string };

const post = (message: WorkerMessage, transfer: Transferable[] = []) => self.postMessage(message, { transfer });

/** Progress is posted at most this often; the last file is always reported. */
const PROGRESS_EVERY_MS = 50;

self.onmessage = async (event: MessageEvent<RenderInput>) => {
    post({ type: 'started' });
    let lastPost = 0;
    try {
        const { zip, result } = await renderArchive(event.data, {
            onProgress: (done, total) => {
                const now = performance.now();
                if (done === total || now - lastPost >= PROGRESS_EVERY_MS) {
                    lastPost = now;
                    post({ type: 'progress', done, total });
                }
            },
        });
        post({ type: 'done', zip, result }, [zip]);
    } catch (err) {
        post({ type: 'error', message: describeDocxError(err) });
    }
};
