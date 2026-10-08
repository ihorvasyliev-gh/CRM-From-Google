import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import Modal from './Modal';

/** jsdom applies no stylesheets: report the exit animation on the closing overlay. */
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

function Example({ item }: { item: string | null }) {
    return (
        <Modal open={!!item} onClose={() => {}} title={item ?? ''}>
            {item && <p>Details of {item}</p>}
        </Modal>
    );
}

describe('Modal', () => {
    afterEach(() => vi.restoreAllMocks());

    it('animates out with the content it had, inert, then unmounts', () => {
        mockExitAnimation();
        const { rerender } = render(<Example item="Barista Training" />);
        expect(screen.getByRole('dialog', { name: 'Barista Training' })).toBeInTheDocument();

        // The parent clears the data together with `open`
        rerender(<Example item={null} />);
        const overlay = document.querySelector('.animate-fadeOut') as HTMLElement;
        expect(overlay).toHaveAttribute('inert');
        expect(screen.getByText('Details of Barista Training')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Barista Training' })).toBeInTheDocument();

        act(() => { overlay.dispatchEvent(Object.assign(new Event('animationend'), { animationName: 'fadeOut' })); });
        expect(screen.queryByText('Details of Barista Training')).toBeNull();
    });

    it('shows the new content when reopened', () => {
        const { rerender } = render(<Example item="Barista Training" />);
        rerender(<Example item={null} />);
        rerender(<Example item="First Aid" />);
        expect(screen.getByRole('dialog', { name: 'First Aid' })).toHaveTextContent('Details of First Aid');
    });
});
