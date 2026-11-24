import { act, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_COALESCE_MS, DEFAULT_MAX_HISTORY, useTemplateHistory } from './useTemplateHistory';

describe('useTemplateHistory', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('starts with the initial state and empty past/future stacks', () => {
        const onChange = vi.fn();
        const { result } = renderHook(() => useTemplateHistory<string[]>(['a'], { onChange }));

        expect(result.current.present).toEqual(['a']);
        expect(result.current.past).toEqual([]);
        expect(result.current.future).toEqual([]);
        expect(result.current.canUndo).toBe(false);
        expect(result.current.canRedo).toBe(false);
        expect(onChange).not.toHaveBeenCalled();
    });

    it('commits direct values and functional updaters, ignoring identical references', () => {
        const onChange = vi.fn();
        const initial = ['a'];
        const { result } = renderHook(() =>
            useTemplateHistory<string[]>(initial, { coalesceMs: 0, onChange }),
        );

        act(() => result.current.commit(initial));
        expect(result.current.past).toEqual([]);
        expect(result.current.canUndo).toBe(false);
        expect(onChange).not.toHaveBeenCalled();

        act(() => result.current.commit(['a', 'b']));
        expect(result.current.present).toEqual(['a', 'b']);
        expect(result.current.past).toEqual([['a']]);
        expect(result.current.canUndo).toBe(true);
        expect(onChange).toHaveBeenCalledTimes(1);

        act(() => result.current.commit(prev => [...prev, 'c']));
        expect(result.current.present).toEqual(['a', 'b', 'c']);
        expect(result.current.past).toEqual([['a'], ['a', 'b']]);
        expect(onChange).toHaveBeenCalledTimes(2);
    });

    it('undoes and redoes through snapshots and is a no-op at stack boundaries', () => {
        const onChange = vi.fn();
        const { result } = renderHook(() =>
            useTemplateHistory<number>(0, { coalesceMs: 0, onChange }),
        );

        // No-op when nothing to undo/redo
        act(() => {
            result.current.undo();
            result.current.redo();
        });
        expect(result.current.present).toBe(0);
        expect(onChange).not.toHaveBeenCalled();

        act(() => result.current.commit(1));
        act(() => result.current.commit(2));
        expect(result.current.present).toBe(2);
        expect(result.current.past).toEqual([0, 1]);
        expect(result.current.future).toEqual([]);

        act(() => result.current.undo());
        expect(result.current.present).toBe(1);
        expect(result.current.past).toEqual([0]);
        expect(result.current.future).toEqual([2]);
        expect(result.current.canUndo).toBe(true);
        expect(result.current.canRedo).toBe(true);

        act(() => result.current.undo());
        expect(result.current.present).toBe(0);
        expect(result.current.past).toEqual([]);
        expect(result.current.future).toEqual([1, 2]);
        expect(result.current.canUndo).toBe(false);
        expect(result.current.canRedo).toBe(true);

        // Extra undo at beginning does nothing
        const callsBefore = onChange.mock.calls.length;
        act(() => result.current.undo());
        expect(result.current.present).toBe(0);
        expect(onChange).toHaveBeenCalledTimes(callsBefore);

        act(() => result.current.redo());
        expect(result.current.present).toBe(1);
        expect(result.current.past).toEqual([0]);
        expect(result.current.future).toEqual([2]);

        act(() => result.current.redo());
        expect(result.current.present).toBe(2);
        expect(result.current.past).toEqual([0, 1]);
        expect(result.current.future).toEqual([]);
        expect(result.current.canRedo).toBe(false);
    });

    it('clears the redo stack when branching with a new commit after undo', () => {
        const { result } = renderHook(() => useTemplateHistory<string>('v0', { coalesceMs: 0 }));

        act(() => result.current.commit('v1'));
        act(() => result.current.commit('v2'));
        act(() => result.current.commit('v3'));

        act(() => result.current.undo());
        act(() => result.current.undo());
        expect(result.current.present).toBe('v1');
        expect(result.current.future).toEqual(['v2', 'v3']);
        expect(result.current.canRedo).toBe(true);

        act(() => result.current.commit('v1-branch'));
        expect(result.current.present).toBe('v1-branch');
        expect(result.current.past).toEqual(['v0', 'v1']);
        expect(result.current.future).toEqual([]);
        expect(result.current.canRedo).toBe(false);
    });

    it('coalesces rapid edits within coalesceMs into a single snapshot', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-01T00:00:01.000Z'));

        const { result } = renderHook(() => useTemplateHistory<number>(0));

        // First edit creates a snapshot of 0
        act(() => result.current.commit(1));
        expect(result.current.past).toEqual([0]);

        // Edits within 700ms coalesce into the same step
        vi.advanceTimersByTime(DEFAULT_COALESCE_MS - 100);
        act(() => result.current.commit(2));
        vi.advanceTimersByTime(100);
        act(() => result.current.commit(3));
        expect(result.current.present).toBe(3);
        expect(result.current.past).toEqual([0]);

        // After the coalesce window passes, the next edit captures a new snapshot
        vi.advanceTimersByTime(DEFAULT_COALESCE_MS + 1);
        act(() => result.current.commit(4));
        expect(result.current.present).toBe(4);
        expect(result.current.past).toEqual([0, 3]);

        // Undo resets the coalesce window so an immediate edit snapshots cleanly
        act(() => result.current.undo());
        expect(result.current.present).toBe(3);
        act(() => result.current.commit(5));
        expect(result.current.past).toEqual([0, 3]);
    });

    it('enforces the stack cap (including maxHistory = 1 and default cap)', () => {
        const { result: small } = renderHook(() =>
            useTemplateHistory<number>(0, { maxHistory: 3, coalesceMs: 0 }),
        );

        for (let i = 1; i <= 5; i++) {
            act(() => small.current.commit(i));
        }
        expect(small.current.present).toBe(5);
        expect(small.current.past).toEqual([2, 3, 4]);

        const { result: single } = renderHook(() =>
            useTemplateHistory<number>(0, { maxHistory: 1, coalesceMs: 0 }),
        );
        act(() => single.current.commit(1));
        act(() => single.current.commit(2));
        expect(single.current.past).toEqual([1]);

        const { result: defaultCap } = renderHook(() =>
            useTemplateHistory<number>(0, { coalesceMs: 0 }),
        );
        act(() => {
            for (let i = 1; i <= DEFAULT_MAX_HISTORY + 15; i++) {
                defaultCap.current.commit(i);
            }
        });
        expect(defaultCap.current.past).toHaveLength(DEFAULT_MAX_HISTORY);
        expect(defaultCap.current.past[0]).toBe(15);
        expect(defaultCap.current.present).toBe(DEFAULT_MAX_HISTORY + 15);
    });

    it('resets present state and clears past and future without firing onChange', () => {
        const onChange = vi.fn();
        const { result } = renderHook(() =>
            useTemplateHistory<string>('a', { coalesceMs: 0, onChange }),
        );

        act(() => result.current.commit('b'));
        act(() => result.current.commit('c'));
        act(() => result.current.undo());
        expect(result.current.canUndo).toBe(true);
        expect(result.current.canRedo).toBe(true);

        const callsBeforeReset = onChange.mock.calls.length;
        act(() => result.current.reset('fresh'));

        expect(result.current.present).toBe('fresh');
        expect(result.current.past).toEqual([]);
        expect(result.current.future).toEqual([]);
        expect(result.current.canUndo).toBe(false);
        expect(result.current.canRedo).toBe(false);
        expect(onChange).toHaveBeenCalledTimes(callsBeforeReset);

        // Subsequent commits notify normally again
        act(() => result.current.commit('fresh-2'));
        expect(result.current.past).toEqual(['fresh']);
        expect(onChange).toHaveBeenCalledTimes(callsBeforeReset + 1);
    });

    it('binds global undo/redo shortcuts when enabled and ignores editable controls and dialogs', () => {
        const { result } = renderHook(() =>
            useTemplateHistory<string>('v0', { coalesceMs: 0, bindShortcuts: true }),
        );

        act(() => result.current.commit('v1'));
        act(() => result.current.commit('v2'));

        // Ctrl+Z undoes
        fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
        expect(result.current.present).toBe('v1');

        // Cmd+Shift+Z redoes
        fireEvent.keyDown(window, { key: 'z', metaKey: true, shiftKey: true });
        expect(result.current.present).toBe('v2');

        // Ctrl+Z then Ctrl+Y redoes
        fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
        expect(result.current.present).toBe('v1');
        fireEvent.keyDown(window, { key: 'y', ctrlKey: true });
        expect(result.current.present).toBe('v2');

        // Ignored inside an <input>
        const input = document.createElement('input');
        document.body.appendChild(input);
        fireEvent.keyDown(input, { key: 'z', ctrlKey: true });
        expect(result.current.present).toBe('v2');
        document.body.removeChild(input);

        // Ignored inside a dialog
        const dialog = document.createElement('div');
        dialog.setAttribute('role', 'dialog');
        const inner = document.createElement('button');
        dialog.appendChild(inner);
        document.body.appendChild(dialog);
        fireEvent.keyDown(inner, { key: 'z', ctrlKey: true });
        expect(result.current.present).toBe('v2');
        document.body.removeChild(dialog);
    });
});
