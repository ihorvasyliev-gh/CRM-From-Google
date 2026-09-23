import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePersistentState } from './usePersistentState';

describe('usePersistentState', () => {
    beforeEach(() => {
        sessionStorage.clear();
        localStorage.clear();
    });

    it('persists values and restores them on the next mount', () => {
        const { result, unmount } = renderHook(() => usePersistentState('test.key', 'a'));
        act(() => result.current[1]('b'));
        unmount();
        const { result: again } = renderHook(() => usePersistentState('test.key', 'a'));
        expect(again.current[0]).toBe('b');
    });

    it('falls back to the initial value when the stored value fails validation', () => {
        sessionStorage.setItem('test.num', JSON.stringify('not-a-number'));
        const { result } = renderHook(() =>
            usePersistentState<number>('test.num', 5, { validate: (v): v is number => typeof v === 'number' })
        );
        expect(result.current[0]).toBe(5);
    });

    it('uses localStorage when asked', () => {
        const { result } = renderHook(() => usePersistentState('test.local', false, { storage: 'local' }));
        act(() => result.current[1](true));
        expect(localStorage.getItem('test.local')).toBe('true');
    });
});
