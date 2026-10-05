import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Dashboard from './Dashboard';
import { localDateKey } from './Dashboard/dashboardUtils';

const dayKey = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return localDateKey(d);
};

const db = vi.hoisted(() => ({
    /** invite_dates rows already marked as sent, per column */
    sent: {} as Record<string, { course_id: string; invite_date: string }[]>,
    upserts: [] as Record<string, unknown>[],
}));

vi.mock('../lib/supabase', () => ({
    supabase: {
        from: vi.fn((table: string) => table === 'invite_dates'
            ? {
                select: () => ({ not: (column: string) => ({ gte: () => Promise.resolve({ data: db.sent[column] ?? [], error: null }) }) }),
                upsert: (row: Record<string, unknown>) => {
                    db.upserts.push(row);
                    return Promise.resolve({ error: null });
                },
            }
            : { select: vi.fn().mockResolvedValue({ count: 5 }) }),
    },
}));

const confirmed = (id: string, courseId: string, name: string, offset: number) => ({
    id,
    student_id: `stu-${id}`,
    course_id: courseId,
    status: 'confirmed',
    confirmed_date: dayKey(offset),
    created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    students: { id: `stu-${id}`, first_name: 'Jane', last_name: 'Smith' },
    courses: { id: courseId, name },
});

vi.mock('../hooks/useEnrollments', () => ({
    fetchAllEnrollments: vi.fn(async () => [
        confirmed('1', 'crs-tomorrow', 'Tomorrow Course', 1),
        confirmed('2', 'crs-later', 'Later Course', 4),
    ]),
}));

describe('Dashboard send-reminders banner', () => {
    beforeEach(() => {
        db.sent = {};
        db.upserts = [];
    });

    const renderDashboard = () => render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <Dashboard />
        </QueryClientProvider>
    );

    const rowOf = async (name: string) => (await screen.findByText(name, { selector: 'p.truncate' })).closest('li') as HTMLElement;

    it('asks for the day-before reminder even though the 7-day one was marked as sent', async () => {
        db.sent.reminder_sent_at = [
            { course_id: 'crs-tomorrow', invite_date: dayKey(1) },
            { course_id: 'crs-later', invite_date: dayKey(4) },
        ];
        renderDashboard();

        const row = await rowOf('Tomorrow Course');
        expect(row).toHaveTextContent(/day-before reminder/i);
        // the later course's 7-day reminder is done, so it is gone
        expect(screen.queryByText('Later Course', { selector: 'p.truncate' })).not.toBeInTheDocument();
    });

    it('marks the day-before reminder in its own column and removes the row', async () => {
        renderDashboard();
        const row = await rowOf('Tomorrow Course');

        fireEvent.click(within(row).getByRole('button', { name: /I've sent it/i }));

        await waitFor(() => expect(screen.queryByText('Tomorrow Course', { selector: 'p.truncate' })).not.toBeInTheDocument());
        expect(db.upserts).toHaveLength(1);
        expect(db.upserts[0]).toMatchObject({ course_id: 'crs-tomorrow', invite_date: dayKey(1), reminder_tomorrow_sent_at: expect.any(String) });
        expect(db.upserts[0]).not.toHaveProperty('reminder_sent_at');
        // the later course is untouched
        expect(screen.getByText('Later Course', { selector: 'p.truncate' })).toBeInTheDocument();
    });

    it('marks an ordinary reminder in the 7-day column', async () => {
        renderDashboard();
        const row = await rowOf('Later Course');
        expect(row).not.toHaveTextContent(/day-before reminder/i);

        fireEvent.click(within(row).getByRole('button', { name: /I've sent it/i }));

        await waitFor(() => expect(db.upserts).toHaveLength(1));
        expect(db.upserts[0]).toMatchObject({ course_id: 'crs-later', invite_date: dayKey(4), reminder_sent_at: expect.any(String) });
        expect(db.upserts[0]).not.toHaveProperty('reminder_tomorrow_sent_at');
    });

    it('stops asking once the day-before reminder is marked as sent', async () => {
        db.sent.reminder_tomorrow_sent_at = [{ course_id: 'crs-tomorrow', invite_date: dayKey(1) }];
        renderDashboard();

        await rowOf('Later Course');
        expect(screen.queryByText('Tomorrow Course', { selector: 'p.truncate' })).not.toBeInTheDocument();
    });
});
