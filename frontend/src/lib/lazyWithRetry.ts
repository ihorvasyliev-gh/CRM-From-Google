/* eslint-disable @typescript-eslint/no-explicit-any */
import { lazy, ComponentType } from 'react';

/**
 * A wrapper for React.lazy that attempts to reload the component if it fails to load.
 * This is particularly useful in production where a new deployment might have removed
 * old chunk files while the user still has an old version of index.html open.
 */
export function lazyWithRetry(
    componentImport: () => Promise<{ default: ComponentType<any> }>,
    retriesLeft = 2
): ReturnType<typeof lazy> {
    return lazy(async () => {
        try {
            return await componentImport();
        } catch (error: any) {
            const errorMessage = error?.message || error?.toString() || '';
            const isChunkLoadError = errorMessage.includes('Failed to fetch dynamically imported module') ||
                                     errorMessage.includes('Importing a module script failed') ||
                                     errorMessage.includes('error loading dynamically imported module');

            const lastReload = sessionStorage.getItem('chunk_load_error_time');
            const now = Date.now();
            const isRecent = lastReload && (now - parseInt(lastReload, 10)) < 15000;

            if (isChunkLoadError && !isRecent) {
                sessionStorage.setItem('chunk_load_error_time', now.toString());
                window.location.reload();
                return new Promise(() => {}); // prevent throwing while browser reloads
            }

            for (let i = 0; i < retriesLeft; i++) {
                try {
                    await new Promise((resolve) => setTimeout(resolve, 800 * (i + 1)));
                    return await componentImport();
                } catch (e) {
                    if (i === retriesLeft - 1) throw e;
                }
            }
            throw error;
        }
    });
}

