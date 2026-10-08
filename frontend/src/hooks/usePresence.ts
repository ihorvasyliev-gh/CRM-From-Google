import { useLayoutEffect, useRef, useState } from 'react';

/** Longest an exit may hold a layer on screen (background tabs may never finish the animation). */
const EXIT_TIMEOUT_MS = 500;

/**
 * Keeps a layer (dialog, sheet) mounted while it animates out, instead of vanishing on close.
 *
 * Put `ref` on the element whose exit animation sets the pace, and give it that animation while
 * `closing` (e.g. `animate-fadeOut`). The layer unmounts when that animation ends — at once when
 * none applies (jsdom, a layer without an exit animation).
 */
export function usePresence<T extends HTMLElement = HTMLDivElement>(open: boolean) {
    const ref = useRef<T>(null);
    const [shown, setShown] = useState(open);
    // Opening shows the layer in the same render, without an effect round trip
    if (open && !shown) setShown(true);

    useLayoutEffect(() => {
        if (open || !shown) return;
        const el = ref.current;
        const animation = el ? getComputedStyle(el).animationName : '';
        if (!el || !animation || animation === 'none') {
            setShown(false);
            return;
        }
        // Only the exit animation counts: closing mid-entry cancels the entry animation too
        const finish = (e?: AnimationEvent) => {
            if (!e || (e.target === el && e.animationName === animation)) setShown(false);
        };
        const timeout = setTimeout(finish, EXIT_TIMEOUT_MS);
        el.addEventListener('animationend', finish);
        el.addEventListener('animationcancel', finish);
        return () => {
            clearTimeout(timeout);
            el.removeEventListener('animationend', finish);
            el.removeEventListener('animationcancel', finish);
        };
    }, [open, shown]);

    return { mounted: open || shown, closing: !open && shown, ref };
}
