import { describe, it, expect, vi, afterEach } from 'vitest';
import { entryFromHtml, failedChunkUrl, isChunkLoadError, isNewVersionDeployed, loadChunk, recoverStaleAssets, runningEntry, APP_UPDATED_MESSAGE, STALE_ASSETS_EVENT } from './deployRecovery';

const CHROME = new TypeError('Failed to fetch dynamically imported module: https://crm.example/assets/Settings-AbC123.js');

describe('deployRecovery', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        document.head.innerHTML = '';
        delete (window as { __crmRecoverAssets?: unknown }).__crmRecoverAssets;
    });

    it('recognises chunk load errors from every browser', () => {
        expect(isChunkLoadError(CHROME)).toBe(true);
        expect(isChunkLoadError(new TypeError('error loading dynamically imported module: https://x/a.js'))).toBe(true);
        expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
        expect(isChunkLoadError(new Error('Unable to preload CSS for https://x/assets/a.css'))).toBe(true);
        expect(isChunkLoadError(new Error('permission denied'))).toBe(false);
        expect(isChunkLoadError(undefined)).toBe(false);
        expect(failedChunkUrl(CHROME)).toBe('https://crm.example/assets/Settings-AbC123.js');
    });

    it('recovery resolves false where boot-recovery.js is not loaded', async () => {
        await expect(recoverStaleAssets()).resolves.toBe(false);
        const recover = vi.fn().mockResolvedValue(true);
        (window as { __crmRecoverAssets?: unknown }).__crmRecoverAssets = recover;
        await expect(recoverStaleAssets('u')).resolves.toBe(true);
        expect(recover).toHaveBeenCalledWith('u');
    });

    it('loadChunk turns a missing file into a readable error and offers the reload', async () => {
        const onStale = vi.fn();
        window.addEventListener(STALE_ASSETS_EVENT, onStale);
        await expect(loadChunk(() => Promise.reject(CHROME))).rejects.toThrow(APP_UPDATED_MESSAGE);
        expect(onStale).toHaveBeenCalledTimes(1);
        await expect(loadChunk(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
        await expect(loadChunk(() => Promise.resolve(42))).resolves.toBe(42);
        window.removeEventListener(STALE_ASSETS_EVENT, onStale);
    });

    it('spots a new deploy by its entry script', async () => {
        expect(runningEntry()).toBeNull();
        expect(await isNewVersionDeployed()).toBe(false); // dev: nothing to compare
        document.head.innerHTML = '<script type="module" crossorigin src="/assets/index-OLD111.js"></script>';
        expect(runningEntry()).toBe('/assets/index-OLD111.js');
        expect(entryFromHtml('<script type="module" crossorigin src="/assets/index-NEW-22_2.js"></script>')).toBe('/assets/index-NEW-22_2.js');

        const fetchMock = vi.spyOn(globalThis, 'fetch');
        fetchMock.mockResolvedValueOnce(new Response('<script type="module" src="/assets/index-OLD111.js"></script>'));
        expect(await isNewVersionDeployed()).toBe(false);
        fetchMock.mockResolvedValueOnce(new Response('<script type="module" src="/assets/index-NEW222.js"></script>'));
        expect(await isNewVersionDeployed()).toBe(true);
        expect(fetchMock).toHaveBeenLastCalledWith('/', expect.objectContaining({ cache: 'no-store' }));
        fetchMock.mockRejectedValueOnce(new TypeError('offline'));
        expect(await isNewVersionDeployed()).toBe(false);
    });
});
