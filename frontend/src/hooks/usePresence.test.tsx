import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { usePresence } from './usePresence';

function Layer({ open }: { open: boolean }) {
    const { mounted, closing, ref } = usePresence(open);
    if (!mounted) return null;
    return <div ref={ref} data-testid="layer" data-closing={closing} className={closing ? 'animate-fadeOut' : 'animate-fadeIn'} />;
}

/** jsdom applies no stylesheets: report an exit animation on elements that have the exit class. */
function mockExitAnimation() {
    const original = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((el, pseudo) => {
        const style = original(el, pseudo);
        if (!(el as HTMLElement).classList?.contains('animate-fadeOut')) return style;
        return new Proxy(style, {
            get: (target, key) => {
                if (key === 'animationName') return 'fadeOut';
                const value = Reflect.get(target, key, target);
                return typeof value === 'function' ? value.bind(target) : value;
            },
        });
    });
}

function animationEvent(type: 'animationend' | 'animationcancel', animationName: string) {
    return Object.assign(new Event(type), { animationName });
}

describe('usePresence', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('mounts with open and unmounts at once when no exit animation applies', () => {
        const { rerender } = render(<Layer open={false} />);
        expect(screen.queryByTestId('layer')).toBeNull();

        rerender(<Layer open />);
        expect(screen.getByTestId('layer')).toHaveAttribute('data-closing', 'false');

        rerender(<Layer open={false} />);
        expect(screen.queryByTestId('layer')).toBeNull();
    });

    it('stays mounted while the exit animation plays and unmounts when it ends', () => {
        mockExitAnimation();
        const { rerender } = render(<Layer open />);

        rerender(<Layer open={false} />);
        const layer = screen.getByTestId('layer');
        expect(layer).toHaveAttribute('data-closing', 'true');

        // The cancelled entry animation does not end the exit
        act(() => { layer.dispatchEvent(animationEvent('animationcancel', 'fadeIn')); });
        expect(screen.getByTestId('layer')).toBeInTheDocument();

        act(() => { layer.dispatchEvent(animationEvent('animationend', 'fadeOut')); });
        expect(screen.queryByTestId('layer')).toBeNull();
    });

    it('reopens a closing layer instead of unmounting it', () => {
        mockExitAnimation();
        const { rerender } = render(<Layer open />);
        rerender(<Layer open={false} />);
        rerender(<Layer open />);
        expect(screen.getByTestId('layer')).toHaveAttribute('data-closing', 'false');
    });

    it('unmounts after a timeout when the animation never ends (background tab)', () => {
        vi.useFakeTimers();
        mockExitAnimation();
        const { rerender } = render(<Layer open />);
        rerender(<Layer open={false} />);
        expect(screen.getByTestId('layer')).toBeInTheDocument();

        act(() => { vi.advanceTimersByTime(1000); });
        expect(screen.queryByTestId('layer')).toBeNull();
    });
});
