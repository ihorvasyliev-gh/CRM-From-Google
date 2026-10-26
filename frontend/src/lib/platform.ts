/** Apple keyboards: ⌘ in place of Ctrl (every shortcut in the app takes either key) */
export const IS_APPLE = typeof navigator !== 'undefined'
    && /mac|iphone|ipad|ipod/i.test(
        (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform
        || navigator.platform
        || navigator.userAgent,
    );

const APPLE_KEYS: Record<string, string> = { Mod: '⌘', Shift: '⇧', Alt: '⌥', Enter: '↩' };

/**
 * A shortcut as this keyboard labels it, from keys with 'Mod' for Ctrl/⌘:
 * shortcutLabel('Mod', 'K') is "⌘K" on a Mac and "Ctrl+K" elsewhere.
 */
export function shortcutLabel(...keys: string[]): string {
    return IS_APPLE
        ? keys.map(k => APPLE_KEYS[k] ?? k).join('')
        : keys.map(k => (k === 'Mod' ? 'Ctrl' : k)).join('+');
}

/** The keys one by one, for <kbd> chips: ['⌘', 'K'] or ['Ctrl', 'K'] */
export function shortcutKeys(...keys: string[]): string[] {
    return keys.map(k => (k === 'Mod' ? (IS_APPLE ? '⌘' : 'Ctrl') : IS_APPLE ? APPLE_KEYS[k] ?? k : k));
}

/** The text of one <kbd> chip: "⌘K" on a Mac, "Ctrl K" elsewhere */
export function kbdLabel(...keys: string[]): string {
    return shortcutKeys(...keys).join(IS_APPLE ? '' : ' ');
}
