import { useEffect, useRef } from 'react';
import { isAnyModalOpen } from './useModalBehavior';

interface HotkeyActions {
    /** Tab keys for 1–9 (admin) or 1–4 (viewer), in order */
    tabKeys: readonly string[];
    /** Viewers can't add students */
    canAddStudent: boolean;
    navigate: (tab: string) => void;
    toggleCommandPalette: () => void;
    toggleShortcuts: () => void;
    openAddStudent: () => void;
    toggleDarkMode: () => void;
    toggleDensity: () => void;
}

/**
 * App-wide keyboard shortcuts: Ctrl/⌘+K palette, ? shortcuts, / page search, N add student,
 * number keys for tabs, Ctrl/⌘+Shift+D theme, Ctrl/⌘+Shift+C density. Letter and number keys
 * are ignored while typing or while a modal is open, so they can't act "behind" it.
 */
export function useGlobalHotkeys(enabled: boolean, actions: HotkeyActions) {
    // The listener is attached once per `enabled` and always calls the latest actions
    const actionsRef = useRef(actions);
    useEffect(() => {
        actionsRef.current = actions;
    });

    useEffect(() => {
        if (!enabled) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            const a = actionsRef.current;
            const target = e.target as HTMLElement;
            const isInput = target && (
                target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.tagName === 'SELECT' ||
                target.isContentEditable
            );
            const plain = !e.ctrlKey && !e.metaKey && !e.altKey;

            // Ctrl+K or Cmd+K: Open Command Palette
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                a.toggleCommandPalette();
                return;
            }

            if (!isInput && !isAnyModalOpen() && !e.repeat) {
                // ? or Shift+/ -> Open Shortcuts Modal
                if (e.key === '?' || (e.shiftKey && e.key === '/')) {
                    e.preventDefault();
                    a.toggleShortcuts();
                    return;
                }

                // / -> Focus the current page's search input (falls back to the first visible text input)
                if (e.key === '/') {
                    const isVisible = (el: HTMLElement) => el.offsetParent !== null || el.getClientRects().length > 0;
                    const candidates = [
                        ...Array.from(document.querySelectorAll<HTMLInputElement>('main input[data-page-search]')),
                        ...Array.from(document.querySelectorAll<HTMLInputElement>('main input[type="text"], main input[type="search"]')),
                    ];
                    const searchInput = candidates.find(isVisible);
                    if (searchInput) {
                        e.preventDefault();
                        searchInput.focus();
                        searchInput.select();
                    }
                    return;
                }

                // N -> Add Student
                if (a.canAddStudent && (e.key === 'n' || e.key === 'N') && plain) {
                    e.preventDefault();
                    a.openAddStudent();
                    return;
                }

                // Number keys -> Tab navigation
                if (plain && e.key >= '1' && e.key <= '9') {
                    const tab = a.tabKeys[parseInt(e.key, 10) - 1];
                    if (tab) {
                        e.preventDefault();
                        a.navigate(tab);
                    }
                    return;
                }
            }

            // Ctrl+Shift+D -> Toggle Theme
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'd') {
                e.preventDefault();
                a.toggleDarkMode();
                return;
            }

            // Ctrl+Shift+C -> Toggle Density
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'c') {
                e.preventDefault();
                a.toggleDensity();
                return;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [enabled]);
}
