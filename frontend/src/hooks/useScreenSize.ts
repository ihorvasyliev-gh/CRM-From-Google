import { useSyncExternalStore } from 'react';

function subscribe(callback: () => void) {
    if (typeof window === 'undefined') return () => {};
    window.addEventListener('resize', callback);
    return () => window.removeEventListener('resize', callback);
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
        () => (typeof window !== 'undefined' ? window.innerWidth < 640 : false),
        () => false
    );
}
