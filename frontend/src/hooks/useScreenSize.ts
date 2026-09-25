import { useSyncExternalStore } from 'react';

// matchMedia fires 'change' only when the breakpoint is crossed, so the hundreds of Kanban
// cards using these hooks cost nothing on ordinary resize events.
function mediaStore(query: string) {
    const mql = window.matchMedia(query);
    return {
        subscribe: (cb: () => void) => {
            mql.addEventListener('change', cb);
            return () => mql.removeEventListener('change', cb);
        },
        get: () => mql.matches,
    };
}

const mobile = mediaStore('(max-width: 1023px)');
const small = mediaStore('(max-width: 767px)');

export const useIsMobile = () => useSyncExternalStore(mobile.subscribe, mobile.get, () => false);
export const useIsSmallScreen = () => useSyncExternalStore(small.subscribe, small.get, () => false);
