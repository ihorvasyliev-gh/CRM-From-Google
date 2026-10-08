/**
 * Production console: silent, so anyone opening DevTools on the site sees nothing from the app.
 *
 * To debug in a browser: `localStorage.setItem('crm:debug', '1')` in the console, then reload
 * (`localStorage.removeItem('crm:debug')` turns it off again). console.log / info / debug calls
 * are removed from the build (vite.config.ts), so only warnings and errors come back.
 *
 * Covers the app's and libraries' console output and the browser's "Uncaught …" reports of
 * unhandled errors. Messages the browser writes itself (failed requests, scripts blocked by an
 * extension, header warnings) can't be hidden by a page.
 *
 * Imported first in main.tsx, before anything that could log.
 */
const DEBUG_KEY = 'crm:debug';

function debugEnabled(): boolean {
    try {
        return localStorage.getItem(DEBUG_KEY) === '1';
    } catch {
        return false; // storage blocked
    }
}

if (import.meta.env.PROD && !debugEnabled()) {
    const noop = () => {};
    const methods = ['log', 'info', 'debug', 'warn', 'error', 'trace', 'table', 'dir', 'group', 'groupCollapsed', 'assert'];
    for (const method of methods) (console as unknown as Record<string, unknown>)[method] = noop;

    // Still delivered to every other listener (e.g. UpdateNotice); this only stops the console report
    window.addEventListener('error', e => e.preventDefault());
    window.addEventListener('unhandledrejection', e => e.preventDefault());
}

export {};
