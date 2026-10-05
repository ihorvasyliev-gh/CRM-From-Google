// ─── Staying up across deploys ──────────────────────────────────
// Every deploy replaces the hashed code files under /assets/. A tab opened before the deploy
// can then ask for a file that no longer exists, and a page loaded during the switch-over can
// briefly miss a new one. public/boot-recovery.js handles the page start; these helpers cover
// code loaded later (pages, Excel/PDF/Word libraries) and spotting that a new version is out.

type RecoverFn = (url?: string) => Promise<boolean>;
type RecoveryWindow = Window & { __crmRecoverAssets?: RecoverFn; __crmResetAssetRecovery?: () => void };

/** Fired when code failed to load because a new version replaced it. */
export const STALE_ASSETS_EVENT = 'crm:stale-assets';

export const APP_UPDATED_MESSAGE = 'The app has been updated. Reload the page to continue.';

/** The error browsers give when a code chunk can't be loaded (Chrome, Firefox, Safari, Vite CSS preload). */
export function isChunkLoadError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error ?? '');
    return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS|Loading chunk .* failed/i.test(message);
}

/** The file named in a chunk load error, if any. */
export function failedChunkUrl(error: unknown): string | undefined {
    const message = error instanceof Error ? error.message : String(error ?? '');
    return message.match(/https?:\/\/[^\s'"]+\.(?:js|css)/)?.[0];
}

function recoveryWindow(): RecoveryWindow | null {
    return typeof window === 'undefined' ? null : (window as RecoveryWindow);
}

/**
 * Download the page's code again past the browser cache and reload (with a short back-off
 * between attempts). Resolves false when there is nothing to do it with (dev, tests) or after
 * a few failed attempts, so the caller can show an error instead.
 */
export function recoverStaleAssets(url?: string): Promise<boolean> {
    const recover = recoveryWindow()?.__crmRecoverAssets;
    return recover ? recover(url) : Promise.resolve(false);
}

/** Start counting recovery attempts afresh (the user asked to retry). */
export function resetAssetRecovery(): void {
    recoveryWindow()?.__crmResetAssetRecovery?.();
}

/** Tell the app its code is out of date, so it can offer a reload. */
function notifyStaleAssets(url?: string): void {
    recoveryWindow()?.dispatchEvent(new CustomEvent(STALE_ASSETS_EVENT, { detail: url }));
}

/**
 * Load an on-demand library (ExcelJS, pdf.js…). If its file is gone because a new version was
 * deployed, offer the reload and fail with a message people understand.
 */
export async function loadChunk<T>(load: () => Promise<T>): Promise<T> {
    try {
        return await load();
    } catch (error) {
        if (!isChunkLoadError(error)) throw error;
        notifyStaleAssets(failedChunkUrl(error));
        const updated: Error & { cause?: unknown } = new Error(APP_UPDATED_MESSAGE);
        updated.cause = error;
        throw updated;
    }
}

// ─── New version detection ──────────────────────────────────────

const ENTRY_RE = /\/assets\/index-[\w-]+\.js/;

/** Entry script of the running page, e.g. "/assets/index-AbC123.js" (null in dev). */
export function runningEntry(doc: Document = document): string | null {
    const src = doc.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]')?.getAttribute('src');
    return src?.match(ENTRY_RE)?.[0] ?? null;
}

/** Entry script referenced by a freshly fetched index.html. */
export function entryFromHtml(html: string): string | null {
    return html.match(ENTRY_RE)?.[0] ?? null;
}

/** True when the server now serves a different build than the one running in this tab. */
export async function isNewVersionDeployed(): Promise<boolean> {
    const running = runningEntry();
    if (!running) return false;
    try {
        const res = await fetch('/', { cache: 'no-store', credentials: 'same-origin' });
        if (!res.ok) return false;
        const latest = entryFromHtml(await res.text());
        return !!latest && latest !== running;
    } catch {
        return false; // offline: nothing to say
    }
}
