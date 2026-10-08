import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, act, screen } from '@testing-library/react';
import { useRef } from 'react';
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

    describe('trapFocus', () => {
        function Dialog({ open, autoFocusInput = false }: { open: boolean; autoFocusInput?: boolean }) {
            const ref = useRef<HTMLDivElement>(null);
            useModalBehavior(open, () => {}, { trapFocus: ref });
            if (!open) return null;
            return (
                <div ref={ref} role="dialog" tabIndex={-1}>
                    <button>First</button>
                    <input aria-label="Name" autoFocus={autoFocusInput} />
                    <button disabled>Disabled</button>
                    <button>Last</button>
                </div>
            );
        }

        it('moves focus into the dialog on open and back on close', () => {
            const { rerender } = render(<><button>Open</button><Dialog open={false} /></>);
            const trigger = screen.getByRole('button', { name: 'Open' });
            trigger.focus();
            rerender(<><button>Open</button><Dialog open /></>);
            expect(document.activeElement).toBe(screen.getByRole('dialog'));

            vi.useFakeTimers();
            rerender(<><button>Open</button><Dialog open={false} /></>);
            act(() => { vi.runAllTimers(); });
            vi.useRealTimers();
            expect(document.activeElement).toBe(trigger);
        });

        it('leaves focus on an autoFocus field', () => {
            render(<Dialog open autoFocusInput />);
            expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Name' }));
        });

        it('cycles Tab and Shift+Tab inside the dialog, skipping disabled buttons', () => {
            render(<Dialog open />);
            const first = screen.getByRole('button', { name: 'First' });
            const last = screen.getByRole('button', { name: 'Last' });

            fireEvent.keyDown(document, { key: 'Tab' });
            expect(document.activeElement).toBe(first);

            last.focus();
            fireEvent.keyDown(document, { key: 'Tab' });
            expect(document.activeElement).toBe(first);

            fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
            expect(document.activeElement).toBe(last);
        });

        it('only the top-most dialog keeps the focus', () => {
            function Two() {
                const a = useRef<HTMLDivElement>(null);
                const b = useRef<HTMLDivElement>(null);
                useModalBehavior(true, () => {}, { trapFocus: a });
                useModalBehavior(true, () => {}, { trapFocus: b });
                return (
                    <>
                        <div ref={a} tabIndex={-1}><button>Below</button></div>
                        <div ref={b} tabIndex={-1}><button>Above</button></div>
                    </>
                );
            }
            render(<Two />);
            fireEvent.keyDown(document, { key: 'Tab' });
            expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Above' }));
        });
    });
});
