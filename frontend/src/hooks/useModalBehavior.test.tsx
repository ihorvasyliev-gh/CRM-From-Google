import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { useModalBehavior, isAnyModalOpen } from './useModalBehavior';

function Layer({ open, onClose, name }: { open: boolean; onClose: () => void; name: string }) {
    useModalBehavior(open, onClose);
    return open ? <div data-testid={name} /> : null;
}

describe('useModalBehavior', () => {
    it('closes only the top-most open layer on Escape', () => {
        const closeBottom = vi.fn();
        const closeTop = vi.fn();
        render(
            <>
                <Layer open name="bottom" onClose={closeBottom} />
                <Layer open name="top" onClose={closeTop} />
            </>
        );
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(closeTop).toHaveBeenCalledTimes(1);
        expect(closeBottom).not.toHaveBeenCalled();
    });

    it('ignores Escape that a component already handled (defaultPrevented)', () => {
        const onClose = vi.fn();
        render(<Layer open name="a" onClose={onClose} />);
        const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
        event.preventDefault();
        document.dispatchEvent(event);
        expect(onClose).not.toHaveBeenCalled();
    });

    it('tracks whether any modal is open', () => {
        const { rerender, unmount } = render(<Layer open={false} name="a" onClose={() => {}} />);
        expect(isAnyModalOpen()).toBe(false);
        rerender(<Layer open name="a" onClose={() => {}} />);
        expect(isAnyModalOpen()).toBe(true);
        act(() => unmount());
        expect(isAnyModalOpen()).toBe(false);
    });
});
