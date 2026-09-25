import { lazy, ComponentType } from 'react';

/**
 * React.lazy that reloads the page once (per 30s) when a chunk fails to load.
 * Handles production deployments where dynamic JS chunks are updated on the server.
 */
export function lazyWithRetry(
    componentImport: () => Promise<{ default: ComponentType<any> }>
): ReturnType<typeof lazy> {
    return lazy(async () => {
        try {
            return await componentImport();
        } catch (error: any) {
            const errorMessage = error?.message || error?.toString() || '';
            const isChunkLoadError = errorMessage.includes('Failed to fetch dynamically imported module') ||
                                     errorMessage.includes('Importing a module script failed') ||
                                     errorMessage.includes('error loading dynamically imported module');

            const now = Date.now();
            const lastReload = parseInt(sessionStorage.getItem('chunk_reload_time') || '0', 10);
            const canReload = isChunkLoadError && (!lastReload || (now - lastReload > 30000));

            if (canReload) {
                sessionStorage.setItem('chunk_reload_time', now.toString());
                window.location.reload();
                return new Promise(() => {}); // pause execution while browser reloads
            }
            throw error;
        }
    });
}


