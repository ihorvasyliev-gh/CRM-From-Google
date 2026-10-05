import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useProgressiveList } from './useProgressiveList';

let observers: { callback: IntersectionObserverCallback; disconnect: ReturnType<typeof vi.fn> }[] = [];
const original = window.IntersectionObserver;

beforeEach(() => {
    observers = [];
    window.IntersectionObserver = class {
        disconnect = vi.fn();
        observe = vi.fn();
        unobserve = vi.fn();
        constructor(callback: IntersectionObserverCallback) {
            observers.push({ callback, disconnect: this.disconnect });
        }
    } as unknown as typeof IntersectionObserver;
});

afterEach(() => {
    window.IntersectionObserver = original;
});

const items = Array.from({ length: 300 }, (_, i) => i);
const nearScreen = () => act(() => {
    observers[observers.length - 1].callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
});

describe('useProgressiveList', () => {
    it('renders the first part, then another step each time the sentinel nears the screen', () => {
        const { result } = renderHook(() => useProgressiveList(items, 'a', { initial: 50, step: 100 }));
        expect(result.current.visible).toHaveLength(50);
        expect(result.current.hasMore).toBe(true);

        act(() => result.current.sentinelRef(document.createElement('tr')));
        nearScreen();
        expect(result.current.visible).toHaveLength(150);

        act(() => result.current.sentinelRef(document.createElement('tr')));
        nearScreen();
        act(() => result.current.sentinelRef(document.createElement('tr')));
        nearScreen();
        expect(result.current.visible).toHaveLength(300);
        expect(result.current.hasMore).toBe(false);
    });

    it('starts over when the reset key changes, but not when the items are refreshed', () => {
        const { result, rerender } = renderHook(({ list, key }) => useProgressiveList(list, key, { initial: 50, step: 100 }), {
            initialProps: { list: items, key: 'a' },
        });
        act(() => result.current.sentinelRef(document.createElement('tr')));
        nearScreen();
        expect(result.current.visible).toHaveLength(150);

        rerender({ list: [...items], key: 'a' });
        expect(result.current.visible).toHaveLength(150);

        rerender({ list: items, key: 'b' });
        expect(result.current.visible).toHaveLength(50);
    });

    it('returns short lists whole', () => {
        const { result } = renderHook(() => useProgressiveList([1, 2, 3], 'a'));
        expect(result.current.visible).toEqual([1, 2, 3]);
        expect(result.current.hasMore).toBe(false);
    });
});
