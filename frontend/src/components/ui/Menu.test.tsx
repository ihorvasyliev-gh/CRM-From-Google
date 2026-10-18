import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Menu from './Menu';

function setup() {
    const onReject = vi.fn();
    const onDelete = vi.fn();
    render(
        <Menu
            label="More actions"
            triggerClassName=""
            items={[
                { label: 'Reject', onSelect: onReject },
                { label: 'Delete', onSelect: onDelete, tone: 'danger' },
            ]}
        >
            More
        </Menu>
    );
    return { onReject, onDelete, trigger: screen.getByRole('button', { name: 'More actions' }) };
}

describe('Menu', () => {
    it('opens on click with the first action focused, and runs the chosen one', () => {
        const { trigger, onDelete } = setup();
        expect(screen.queryByRole('menu')).toBeNull();

        fireEvent.click(trigger);
        expect(trigger).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByRole('menuitem', { name: 'Reject' })).toHaveFocus();

        fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
        expect(onDelete).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('menu')).toBeNull();
        expect(trigger).toHaveFocus();
    });

    it('moves between actions with the arrow keys and closes on Escape', () => {
        const { trigger, onReject } = setup();
        fireEvent.click(trigger);
        const menu = screen.getByRole('menu');

        fireEvent.keyDown(menu, { key: 'ArrowDown' });
        expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveFocus();
        fireEvent.keyDown(menu, { key: 'ArrowDown' });
        expect(screen.getByRole('menuitem', { name: 'Reject' })).toHaveFocus();

        fireEvent.keyDown(menu, { key: 'Escape' });
        expect(screen.queryByRole('menu')).toBeNull();
        expect(trigger).toHaveFocus();
        expect(onReject).not.toHaveBeenCalled();
    });

    it('closes on a click elsewhere', () => {
        const { trigger } = setup();
        fireEvent.click(trigger);
        fireEvent.pointerDown(document.body);
        expect(screen.queryByRole('menu')).toBeNull();
    });
});
