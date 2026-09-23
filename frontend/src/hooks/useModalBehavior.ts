import { useEffect, useRef } from 'react';

/**
 * Shared behaviour for every modal / drawer / sheet in the app:
 *  - Escape closes only the top-most open layer (modals keep a global stack)
 *  - Focus is restored to the previously focused element when the layer closes
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
}

export function useModalBehavior(
    open: boolean,
    onClose: () => void,
    { closeOnEscape = true, restoreFocus = true }: ModalBehaviorOptions = {}
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

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Escape' || e.defaultPrevented) return;
            if (modalStack[modalStack.length - 1] !== id) return;
            if (!closeOnEscapeRef.current) return;
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
    }, [open, restoreFocus]);
}
