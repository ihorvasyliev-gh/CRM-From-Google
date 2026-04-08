import { lazy, ComponentType } from 'react';

/**
 * A wrapper for React.lazy that attempts to reload the component if it fails to load.
 * This is particularly useful in production where a new deployment might have removed
 * old chunk files while the user still has an old version of the index.html open.
 * 
 * @param componentImport - A function that returns a promise of a component
 * @param retriesLeft - Number of times to retry before giving up
 * @returns A lazy-loaded component with retry logic
 */
export function lazyWithRetry(
    componentImport: () => Promise<{ default: ComponentType<any> }>,
    retriesLeft = 2
): ReturnType<typeof lazy> {
    return lazy(async () => {
        for (let i = 0; i <= retriesLeft; i++) {
            try {
                return await componentImport();
            } catch (error: any) {
                if (i === retriesLeft) throw error;
                // Wait briefly before retrying (exponential backoff optional, but fixed delay is simpler)
                await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
                console.warn(`Retry ${i + 1}/${retriesLeft} for component loading...`);
            }
        }
        throw new Error('All retries failed for component loading');
    });
}
