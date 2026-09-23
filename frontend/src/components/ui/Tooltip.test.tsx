import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CustomTooltip } from './Tooltip';

describe('CustomTooltip', () => {
    it('renders the trigger without mounting Radix until hovered', () => {
        render(
            <CustomTooltip content="Helpful hint">
                <button title="Native title">Trigger</button>
            </CustomTooltip>
        );
        const button = screen.getByRole('button', { name: 'Native title' });
        // native title converted to aria-label (no duplicate browser tooltip)
        expect(button).not.toHaveAttribute('title');
        expect(button).not.toHaveAttribute('data-state');

        fireEvent.pointerEnter(button, { pointerType: 'mouse' });
        expect(screen.getByRole('button', { name: 'Native title' })).toHaveAttribute('data-state');
    });

    it('keeps original handlers working', () => {
        let clicks = 0;
        render(
            <CustomTooltip content="Hint">
                <button onClick={() => { clicks++; }}>Go</button>
            </CustomTooltip>
        );
        fireEvent.click(screen.getByRole('button', { name: 'Go' }));
        fireEvent.pointerEnter(screen.getByRole('button', { name: 'Go' }), { pointerType: 'mouse' });
        fireEvent.click(screen.getByRole('button', { name: 'Go' }));
        expect(clicks).toBe(2);
    });
});
