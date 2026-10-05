import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Renders a long list a part at a time: the first `initial` items, then `step` more whenever the
 * sentinel (an element placed after the last rendered item) comes within `margin` of the screen.
 * Hundreds of table rows rendered at once (the Outcomes table: ~18,000 DOM nodes for 660
 * graduates) froze a phone for seconds and made every click on the page slow.
 *
 * The count starts over when `resetKey` changes (a new search or filter), not when the items are
 * refreshed, so a realtime update doesn't jump a scrolled-down list back to the top.
 *
 * Give the sentinel `key={visible.length}`: a new element is observed after each step, so the
 * next step loads straight away if it is still near the screen.
 */
export function useProgressiveList<T>(items: T[], resetKey: unknown, { initial = 60, step = 120, margin = '800px' } = {}) {
    const [limit, setLimit] = useState(initial);
    const [prevKey, setPrevKey] = useState(resetKey);
    if (prevKey !== resetKey) {
        setPrevKey(resetKey);
        setLimit(initial);
    }

    const observerRef = useRef<IntersectionObserver | null>(null);
    const sentinelRef = useCallback((node: Element | null) => {
        observerRef.current?.disconnect();
        observerRef.current = null;
        if (!node || typeof IntersectionObserver === 'undefined') return;
        const observer = new IntersectionObserver(entries => {
            if (entries.some(e => e.isIntersecting)) {
                observer.disconnect();
                setLimit(l => l + step);
            }
        }, { rootMargin: `${margin} 0px` });
        observer.observe(node);
        observerRef.current = observer;
    }, [step, margin]);
    useEffect(() => () => observerRef.current?.disconnect(), []);

    const visible = items.length > limit ? items.slice(0, limit) : items;
    return { visible, hasMore: items.length > limit, sentinelRef };
}
