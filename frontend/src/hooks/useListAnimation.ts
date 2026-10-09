import { useLayoutEffect, useRef, useState } from 'react';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import autoAnimate, { type AnimationController, type AutoAnimationPlugin } from '@formkit/auto-animate';

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

/**
 * useListAnimation for a board column, with the board's own card motion; none while `enabled` is
 * false. A new `resetKey` (other filters, a new search) swaps the cards at once instead: a filter
 * is not a move, and measuring every card for it (auto-animate does, even with the motion off)
 * plus the old cards fading out over the new ones made each search result arrive with a stall.
 */
export function useCardsAnimation<T extends HTMLElement>(enabled: boolean, resetKey?: unknown) {
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
    const [list, setList] = useState<T | null>(null);
    const controller = useRef<AnimationController | null>(null);
    // Layout effects run before auto-animate hears of the rendered changes (a microtask later).
    // On a new resetKey it is detached first, which drops the changes unseen, and attached again
    // for the moves that follow.
    useLayoutEffect(() => {
        if (!list) return;
        const ctl = autoAnimate(list, motion);
        controller.current = ctl;
        return () => {
            ctl.destroy?.();
            controller.current = null;
            leaving.forEach(card => card.remove());
            leaving.clear();
        };
    }, [list, motion, leaving, resetKey]);
    // The cards a render removes while turning the motion off go at once; the ones still fading go here
    useLayoutEffect(() => {
        const ctl = controller.current;
        if (!ctl) return;
        if (enabled) {
            ctl.enable();
        } else {
            ctl.disable();
            leaving.forEach(card => card.remove());
            leaving.clear();
        }
    }, [enabled, list, leaving, resetKey]);
    return setList;
}
