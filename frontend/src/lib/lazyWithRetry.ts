import { lazy, ComponentType, LazyExoticComponent } from 'react';
import { failedChunkUrl, isChunkLoadError, recoverStaleAssets } from './deployRecovery';

/**
 * React.lazy that survives deploys: when a page's code can't be loaded (a new version replaced
 * it, or it hasn't reached this data centre yet), download the code again past the browser cache
 * and reload, retrying a few times with a back-off. After that the error reaches ErrorBoundary.
 */
export function lazyWithRetry<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- same signature as React.lazy: any component
    T extends ComponentType<any>,
>(
    componentImport: () => Promise<{ default: T }>
): LazyExoticComponent<T> {
    return lazy(async () => {
        try {
            return await componentImport();
        } catch (error: unknown) {
            if (isChunkLoadError(error) && await recoverStaleAssets(failedChunkUrl(error))) {
                return new Promise(() => {}); // pause while the browser reloads
            }
            throw error;
        }
    });
}
