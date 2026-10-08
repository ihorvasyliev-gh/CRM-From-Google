import { useLayoutEffect, useState } from 'react';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import type { AutoAnimationPlugin } from '@formkit/auto-animate';

const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';

/**
 * Put the returned ref on a list's parent: new items fade in, removed ones fade out and the
 * rest slide into their new place instead of jumping. Off with reduced motion (and in jsdom).
 *
 * Always on: auto-animate puts a removed item back for its fade-out and takes it out when the
 * fade ends, and turning it off cancels the fade, so the item would stay (useCardsAnimation
 * takes care of that).
 */
export function useListAnimation<T extends HTMLElement>() {
    const [ref] = useAutoAnimate<T>({ duration: 220, easing: EASE_OUT });
    return ref;
}

/**
 * Board cards: the others slide into place and a removed card fades out. A card that arrives
 * plays its own drop-in animation (animate-card-drop-in), so it gets none here.
 */
const boardCardMotion: AutoAnimationPlugin = (el, action, oldCoords, newCoords) => {
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

/** useListAnimation for a board column, with the board's own card motion; none while `enabled` is false */
export function useCardsAnimation<T extends HTMLElement>(enabled: boolean) {
    // Cards fading out. Turning the motion off cancels their fade, and a card whose fade was
    // cancelled is never taken out: it stayed in the column over the others, at full opacity.
    const [{ motion, leaving }] = useState(() => {
        const leaving = new Set<Element>();
        const motion: AutoAnimationPlugin = (el, action, oldCoords, newCoords) => {
            if (action === 'remove') {
                leaving.forEach(card => { if (!card.isConnected) leaving.delete(card); });
                leaving.add(el);
            }
            return boardCardMotion(el, action, oldCoords, newCoords);
        };
        return { motion, leaving };
    });
    const [ref, setEnabled] = useAutoAnimate<T>(motion);
    // A layout effect runs before auto-animate sees the rendered changes, so the cards a render
    // removes while turning the motion off go at once; the ones still fading go here
    useLayoutEffect(() => {
        setEnabled(enabled);
        if (!enabled) {
            leaving.forEach(card => card.remove());
            leaving.clear();
        }
    }, [enabled, setEnabled, leaving]);
    return ref;
}
