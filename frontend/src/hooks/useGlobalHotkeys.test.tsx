import { describe, it, expect, vi } from 'vitest';
import { renderHook, fireEvent } from '@testing-library/react';
import { useGlobalHotkeys } from './useGlobalHotkeys';

function setup(enabled = true, canAddStudent = true) {
    const actions = {
        tabKeys: ['dashboard', 'students', 'courses'],
        canAddStudent,
        navigate: vi.fn(),
        toggleCommandPalette: vi.fn(),
        toggleShortcuts: vi.fn(),
        openAddStudent: vi.fn(),
        toggleDarkMode: vi.fn(),
        toggleDensity: vi.fn(),
    };
    const hook = renderHook(() => useGlobalHotkeys(enabled, actions));
    return { actions, ...hook };
}

describe('useGlobalHotkeys', () => {
    it('number keys open the matching tab; keys past the last tab do nothing', () => {
        const { actions } = setup();
        fireEvent.keyDown(window, { key: '2' });
        fireEvent.keyDown(window, { key: '9' });
        expect(actions.navigate).toHaveBeenCalledTimes(1);
        expect(actions.navigate).toHaveBeenCalledWith('students');
    });

    it('ignores letter and number keys while typing, but Ctrl+K still opens the palette', () => {
        const { actions } = setup();
        const input = document.createElement('input');
        document.body.appendChild(input);
        fireEvent.keyDown(input, { key: '1' });
        fireEvent.keyDown(input, { key: 'n' });
        fireEvent.keyDown(input, { key: 'k', ctrlKey: true });
        expect(actions.navigate).not.toHaveBeenCalled();
        expect(actions.openAddStudent).not.toHaveBeenCalled();
        expect(actions.toggleCommandPalette).toHaveBeenCalledTimes(1);
        input.remove();
    });

    it('N adds a student only where that is allowed', () => {
        const admin = setup(true, true);
        fireEvent.keyDown(window, { key: 'n' });
        expect(admin.actions.openAddStudent).toHaveBeenCalledTimes(1);
        admin.unmount();

        const viewer = setup(true, false);
        fireEvent.keyDown(window, { key: 'n' });
        expect(viewer.actions.openAddStudent).not.toHaveBeenCalled();
    });

    it('theme and density shortcuts, and nothing at all when disabled', () => {
        const { actions, unmount } = setup();
        fireEvent.keyDown(window, { key: 'D', ctrlKey: true, shiftKey: true });
        fireEvent.keyDown(window, { key: 'C', metaKey: true, shiftKey: true });
        expect(actions.toggleDarkMode).toHaveBeenCalledTimes(1);
        expect(actions.toggleDensity).toHaveBeenCalledTimes(1);
        unmount();

        const off = setup(false);
        fireEvent.keyDown(window, { key: '1' });
        fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
        expect(off.actions.navigate).not.toHaveBeenCalled();
        expect(off.actions.toggleCommandPalette).not.toHaveBeenCalled();
    });
});
