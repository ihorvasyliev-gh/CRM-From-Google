import { lazy, ComponentType } from 'react';
import { failedChunkUrl, isChunkLoadError, recoverStaleAssets } from './deployRecovery';

/**
 * React.lazy that survives deploys: when a page's code can't be loaded (a new version replaced
 * it, or it hasn't reached this data centre yet), download the code again past the browser cache
 * and reload, retrying a few times with a back-off. After that the error reaches ErrorBoundary.
 */
export function lazyWithRetry(
    componentImport: () => Promise<{ default: ComponentType<any> }>
): ReturnType<typeof lazy> {
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
