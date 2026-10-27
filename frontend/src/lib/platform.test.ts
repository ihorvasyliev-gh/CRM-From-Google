import { afterEach, describe, expect, it, vi } from 'vitest';

/** lib/platform reads the keyboard once, when it loads */
async function load(platform: string) {
    vi.resetModules();
    vi.stubGlobal('navigator', { platform, userAgent: '' });
    return import('./platform');
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('shortcut labels', () => {
    it('names Ctrl on Windows and Linux', async () => {
        const { shortcutLabel, kbdLabel, shortcutKeys } = await load('Win32');
        expect(shortcutLabel('Mod', 'K')).toBe('Ctrl+K');
        expect(shortcutLabel('Mod', 'Shift', 'D')).toBe('Ctrl+Shift+D');
        expect(kbdLabel('Mod', 'K')).toBe('Ctrl K');
        expect(shortcutKeys('Mod', 'Shift', 'C')).toEqual(['Ctrl', 'Shift', 'C']);
    });

    it('uses the Mac symbols on a Mac', async () => {
        const { shortcutLabel, kbdLabel, shortcutKeys } = await load('MacIntel');
        expect(shortcutLabel('Mod', 'K')).toBe('⌘K');
        expect(shortcutLabel('Mod', 'Shift', 'D')).toBe('⌘⇧D');
        expect(kbdLabel('Mod', 'K')).toBe('⌘K');
        expect(shortcutKeys('Mod', 'Shift', 'C')).toEqual(['⌘', '⇧', 'C']);
    });
});
