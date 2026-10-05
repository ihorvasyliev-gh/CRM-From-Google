import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SendRemindersBanner from './SendRemindersBanner';
import type { ReminderItem } from './dashboardUtils';
import { localDateKey } from './dashboardUtils';

const dayKey = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return localDateKey(d);
};

const item = (courseId: string, offset: number, dayBefore: boolean): ReminderItem => ({
    date: dayKey(offset), courseId, courseName: `Course ${courseId}`, confirmedCount: 3, pendingCount: 0, dayBefore,
});

describe('SendRemindersBanner', () => {
    it('renders nothing without reminders', () => {
        const { container } = render(<SendRemindersBanner items={[]} onSend={vi.fn()} onMarkSent={vi.fn()} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('labels only the day-before reminder', () => {
        render(<SendRemindersBanner items={[item('a', 4, false), item('b', 1, true)]} onSend={vi.fn()} onMarkSent={vi.fn()} />);
        const rows = screen.getAllByRole('listitem');
        expect(rows).toHaveLength(2);
        expect(rows[0]).not.toHaveTextContent(/day-before reminder/i);
        expect(rows[1]).toHaveTextContent(/Tomorrow/);
        expect(rows[1]).toHaveTextContent(/day-before reminder/i);
    });

    it('sends and marks the row it was pressed on', () => {
        const onSend = vi.fn();
        const onMarkSent = vi.fn();
        const items = [item('a', 4, false), item('b', 1, true)];
        render(<SendRemindersBanner items={items} onSend={onSend} onMarkSent={onMarkSent} />);

        fireEvent.click(screen.getAllByRole('button', { name: /Send reminder/i })[1]);
        expect(onSend).toHaveBeenCalledWith(items[1]);
        fireEvent.click(screen.getAllByRole('button', { name: /I've sent it/i })[1]);
        expect(onMarkSent).toHaveBeenCalledWith(items[1]);
    });

    it('shows the soonest three of a long list until "Show all" is clicked', () => {
        const items = Array.from({ length: 6 }, (_, i) => item(`c${i}`, i + 1, false));
        render(<SendRemindersBanner items={items} onSend={vi.fn()} onMarkSent={vi.fn()} />);
        expect(screen.getAllByRole('listitem')).toHaveLength(3);

        fireEvent.click(screen.getByRole('button', { name: /Show all 6/ }));
        expect(screen.getAllByRole('listitem')).toHaveLength(6);

        fireEvent.click(screen.getByRole('button', { name: /Show fewer/ }));
        expect(screen.getAllByRole('listitem')).toHaveLength(3);
    });

    it('lists four reminders in full (hiding one would save nothing)', () => {
        const items = Array.from({ length: 4 }, (_, i) => item(`c${i}`, i + 1, false));
        render(<SendRemindersBanner items={items} onSend={vi.fn()} onMarkSent={vi.fn()} />);
        expect(screen.getAllByRole('listitem')).toHaveLength(4);
        expect(screen.queryByRole('button', { name: /Show all/ })).toBeNull();
    });
});
