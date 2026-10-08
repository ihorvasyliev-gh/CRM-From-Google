import { useEffect, useRef, type RefObject } from 'react';

/**
 * Shared behaviour for every modal / drawer / sheet in the app:
 *  - Escape closes only the top-most open layer (modals keep a global stack)
 *  - Focus is restored to the previously focused element when the layer closes
 *  - With `trapFocus`, focus moves into the layer when it opens and Tab / Shift+Tab cycle
 *    inside it while it is the top-most layer
 *  - Global hotkeys can ask whether any layer is open via `isAnyModalOpen()`
 *
 * Components that handle Escape themselves (inline editors, comboboxes) should call
 * `e.preventDefault()` in their own handler — the layer then ignores that key press.
 */

const modalStack: symbol[] = [];

export function isAnyModalOpen(): boolean {
    return modalStack.length > 0;
}

interface ModalBehaviorOptions {
    /** Set to false to keep the layer open on Escape (e.g. while saving). */
    closeOnEscape?: boolean;
    /** Restore focus to the element that was focused before opening (default: true). */
    restoreFocus?: boolean;
    /** The dialog element: focus moves into it on open and Tab stays inside it (give it tabIndex={-1}). */
    trapFocus?: RefObject<HTMLElement | null>;
}

const TABBABLE = 'a[href], area[href], button, input:not([type="hidden"]), select, textarea, iframe, summary, [contenteditable="true"], [tabindex]';

/** What Tab can reach inside `root`, in order */
function tabbables(root: HTMLElement): HTMLElement[] {
    return Array.from(root.querySelectorAll<HTMLElement>(TABBABLE)).filter(el =>
        el.tabIndex >= 0
        && !(el as HTMLButtonElement).disabled
        && !el.closest('[inert]')
        // Hidden by CSS (e.g. a desktop-only button on a phone); jsdom has no checkVisibility
        && (typeof el.checkVisibility !== 'function' || el.checkVisibility())
    );
}

export function useModalBehavior(
    open: boolean,
    onClose: () => void,
    { closeOnEscape = true, restoreFocus = true, trapFocus }: ModalBehaviorOptions = {}
) {
    const onCloseRef = useRef(onClose);
    const closeOnEscapeRef = useRef(closeOnEscape);

    useEffect(() => {
        onCloseRef.current = onClose;
        closeOnEscapeRef.current = closeOnEscape;
    });

    useEffect(() => {
        if (!open || typeof document === 'undefined') return;

        const id = Symbol('modal');
        modalStack.push(id);
        const previouslyFocused = document.activeElement as HTMLElement | null;

        // Into the dialog, unless something inside already took focus (autoFocus)
        const container = trapFocus?.current;
        if (container && !container.contains(document.activeElement)) container.focus({ preventScroll: true });

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.defaultPrevented || modalStack[modalStack.length - 1] !== id) return;
            if (e.key === 'Tab') {
                if (trapFocus?.current) keepTabInside(e, trapFocus.current);
                return;
            }
            if (e.key !== 'Escape' || !closeOnEscapeRef.current) return;
            e.preventDefault();
            e.stopPropagation();
            onCloseRef.current();
        };

        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            const idx = modalStack.indexOf(id);
            if (idx !== -1) modalStack.splice(idx, 1);
            if (
                restoreFocus &&
                previouslyFocused &&
                previouslyFocused !== document.body &&
                document.contains(previouslyFocused) &&
                typeof previouslyFocused.focus === 'function'
            ) {
                // Defer so the closing modal's DOM is gone before focus moves back
                setTimeout(() => {
                    if (document.contains(previouslyFocused)) previouslyFocused.focus({ preventScroll: true });
                }, 0);
            }
        };
    }, [open, restoreFocus, trapFocus]);
}

/** Tab from the last element goes to the first, Shift+Tab from the first to the last */
function keepTabInside(e: KeyboardEvent, container: HTMLElement) {
    const active = document.activeElement;
    // Focus is in a pop-up of the dialog's own (a date picker list portaled to <body>): leave it be
    if (active && active !== document.body && !container.contains(active)) return;
    const items = tabbables(container);
    if (items.length === 0) {
        e.preventDefault();
        container.focus({ preventScroll: true });
        return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const outside = !active || active === document.body || active === container;
    if (e.shiftKey && (active === first || outside)) {
        e.preventDefault();
        last.focus();
    } else if (!e.shiftKey && (active === last || outside)) {
        e.preventDefault();
        first.focus();
    }
}
