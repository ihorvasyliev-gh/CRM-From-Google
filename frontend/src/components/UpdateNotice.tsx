import { useEffect, useRef, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { isChunkLoadError, isNewVersionDeployed, STALE_ASSETS_EVENT } from '../lib/deployRecovery';

/** How often an open tab checks for a new deploy. */
const CHECK_EVERY_MS = 5 * 60 * 1000;
/** Minimum gap between checks triggered by returning to the tab. */
const MIN_GAP_MS = 60 * 1000;

/**
 * "A new version is available" bar. Shown when the server serves a newer build than this tab
 * runs (checked every few minutes and on returning to the tab), or right away when code failed
 * to load because a deploy replaced it. Reloading stays the user's choice, so unsaved work in
 * an open form isn't lost.
 */
export default function UpdateNotice() {
    const [available, setAvailable] = useState(false);
    const [dismissed, setDismissed] = useState(false);
    const lastCheck = useRef(0);

    useEffect(() => {
        let stopped = false;
        const check = async (force = false) => {
            if (stopped || (!force && Date.now() - lastCheck.current < MIN_GAP_MS)) return;
            lastCheck.current = Date.now();
            if (await isNewVersionDeployed() && !stopped) setAvailable(true);
        };
        const onVisible = () => { if (document.visibilityState === 'visible') void check(); };
        // Code already known to be gone: no need to ask the server
        const onStale = () => setAvailable(true);
        const onPreloadError = () => void check(true);
        const onRejection = (e: PromiseRejectionEvent) => { if (isChunkLoadError(e.reason)) void check(true); };

        const timer = window.setInterval(() => void check(), CHECK_EVERY_MS);
        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener(STALE_ASSETS_EVENT, onStale);
        window.addEventListener('vite:preloadError', onPreloadError);
        window.addEventListener('unhandledrejection', onRejection);
        return () => {
            stopped = true;
            window.clearInterval(timer);
            document.removeEventListener('visibilitychange', onVisible);
            window.removeEventListener(STALE_ASSETS_EVENT, onStale);
            window.removeEventListener('vite:preloadError', onPreloadError);
            window.removeEventListener('unhandledrejection', onRejection);
        };
    }, []);

    if (!available || dismissed) return null;
    return (
        <div
            role="status"
            className="fixed z-10060 left-1/2 -translate-x-1/2 bottom-[max(1rem,env(safe-area-inset-bottom))] w-[calc(100%-2rem)] max-w-md flex items-center gap-3 pl-4 pr-2 py-2 rounded-2xl border border-border-subtle bg-surface text-primary shadow-float animate-slideUpCenter"
        >
            <RefreshCw size={16} className="shrink-0 text-brand-500" />
            <span className="flex-1 min-w-0 text-sm">A new version of this page is available.</span>
            <button
                type="button"
                onClick={() => window.location.reload()}
                className="shrink-0 h-8 px-3 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold"
            >
                Reload
            </button>
            <button
                type="button"
                aria-label="Later"
                title="Later"
                onClick={() => setDismissed(true)}
                className="shrink-0 w-8 h-8 inline-flex items-center justify-center rounded-lg text-muted hover:text-primary hover:bg-surface-elevated"
            >
                <X size={15} />
            </button>
        </div>
    );
}
