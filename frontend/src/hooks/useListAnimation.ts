import { useEffect } from 'react';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import type { AutoAnimationPlugin } from '@formkit/auto-animate';

const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';

/**
 * Put the returned ref on a list's parent: new items fade in, removed ones fade out and the
 * rest slide into their new place instead of jumping. Off with reduced motion (and in jsdom).
 */
export function useListAnimation<T extends HTMLElement>(enabled = true) {
    const [ref, setEnabled] = useAutoAnimate<T>({ duration: 220, easing: EASE_OUT });
    useEffect(() => setEnabled(enabled), [enabled, setEnabled]);
    return ref;
}

/**
 * Board cards: the others slide into place and a removed card fades out. A card that arrives
 * plays its own drop-in animation (animate-card-drop-in), so it gets none here.
 */
export const boardCardMotion: AutoAnimationPlugin = (el, action, oldCoords, newCoords) => {
    let keyframes: Keyframe[] = [];
    if (action === 'remain' && oldCoords && newCoords) {
        const dx = oldCoords.left - newCoords.left;
        const dy = oldCoords.top - newCoords.top;
        if (dx || dy) keyframes = [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }];
    } else if (action === 'remove') {
        keyframes = [{ opacity: 1 }, { opacity: 0 }];
    }
    return new KeyframeEffect(el, keyframes, { duration: action === 'remove' ? 150 : 220, easing: EASE_OUT });
};

/** useListAnimation for a board column, with the board's own card motion */
export function useCardsAnimation<T extends HTMLElement>(enabled: boolean) {
    const [ref, setEnabled] = useAutoAnimate<T>(boardCardMotion);
    useEffect(() => setEnabled(enabled), [enabled, setEnabled]);
    return ref;
}
