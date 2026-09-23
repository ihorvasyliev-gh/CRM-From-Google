import { useSyncExternalStore } from 'react';

// One shared, rAF-throttled resize listener for every subscriber. Each Kanban card uses these
// hooks, so a per-hook listener meant hundreds of window handlers firing on every resize event.
const listeners = new Set<() => void>();
let frame: number | null = null;

function notify() {
    frame = null;
    listeners.forEach(cb => cb());
}

function onResize() {
    if (frame === null) frame = window.requestAnimationFrame(notify);
}

function subscribe(callback: () => void) {
    if (typeof window === 'undefined') return () => {};
    listeners.add(callback);
    if (listeners.size === 1) window.addEventListener('resize', onResize);
    return () => {
        listeners.delete(callback);
        if (listeners.size === 0) {
            window.removeEventListener('resize', onResize);
            if (frame !== null) {
                window.cancelAnimationFrame(frame);
                frame = null;
            }
        }
    };
}

export function useIsMobile(): boolean {
    return useSyncExternalStore(
        subscribe,
        () => (typeof window !== 'undefined' ? window.innerWidth < 1024 : false),
        () => false
    );
}

export function useIsSmallScreen(): boolean {
    return useSyncExternalStore(
        subscribe,
        () => (typeof window !== 'undefined' ? window.innerWidth < 768 : false),
        () => false
    );
}
