import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import StudentList from './StudentList';
import type { Student } from '../lib/types';

const db = vi.hoisted(() => ({
    inserts: [] as { table: string; rows: unknown }[],
}));

const students: Student[] = [
    { id: 'st-1', first_name: 'Aoife', last_name: 'Murphy', email: 'aoife@example.ie', phone: '+353871112233', address: null, eircode: 'T12AB34', dob: null, created_at: '2026-05-10T12:00:00Z' },
    { id: 'st-2', first_name: 'Ciaran', last_name: 'Walsh', email: 'ciaran@example.ie', phone: '', address: null, eircode: null, dob: null, created_at: '2026-06-15T09:30:00Z' },
];
const courses = [{ id: 'c-ecdl', name: 'ECDL', created_at: '2026-01-01' }, { id: 'c-barista', name: 'Barista Skills', created_at: '2026-01-01' }];
const enrollments = [
    { id: 'en-1', student_id: 'st-1', course_id: 'c-ecdl', status: 'confirmed', course_variant: null, courses: { name: 'ECDL' } },
];

vi.mock('../lib/supabase', () => {
    const answer = (table: string) => ({
        data: table === 'courses' ? courses : table === 'students' ? students : [],
        count: table === 'students' ? students.length : null,
        error: null,
    });
    const chainFor = (table: string) => {
        const chain: Record<string, unknown> = {};
        for (const m of ['order', 'or', 'eq', 'neq', 'limit', 'gte', 'in']) chain[m] = vi.fn(() => chain);
        chain.range = vi.fn(async () => answer(table));
        chain.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
        chain.single = vi.fn(async () => ({ data: null, error: null }));
        chain.then = (resolve: (v: unknown) => void) => resolve(answer(table));
        return chain;
    };
    return {
        supabase: {
            from: vi.fn((table: string) => ({
                select: vi.fn(() => chainFor(table)),
                insert: vi.fn((rows: { student_id: string }[]) => {
                    db.inserts.push({ table, rows });
                    return { select: vi.fn(async () => ({ data: rows.map((_, i) => ({ id: `new-${i}` })), error: null })) };
                }),
                delete: vi.fn(() => chainFor(table)),
            })),
            rpc: vi.fn(async () => ({ data: [], error: null })),
        },
    };
});

vi.mock('../hooks/useEnrollments', async importOriginal => ({
    ...(await importOriginal<typeof import('../hooks/useEnrollments')>()),
    useEnrollmentList: () => ({ data: enrollments, isLoading: false, complete: true }),
}));

vi.mock('../lib/enrollmentCache', async importOriginal => ({
    ...(await importOriginal<typeof import('../lib/enrollmentCache')>()),
    refreshCachedEnrollments: vi.fn(async () => {}),
}));

function renderList() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={queryClient}><StudentList /></QueryClientProvider>);
}

/** The desktop table (the phone cards hold the same students) */
const table = () => screen.getByRole('table');
/** Waits until the table shows exactly these students */
const tableShows = (names: string[]) => waitFor(() => {
    const shown = within(table()).queryAllByRole('row').slice(1).map(r => within(r).queryByText(/^[A-Z][a-z]+ [A-Z][a-z]+$/)?.textContent);
    expect(shown).toEqual(names);
});

describe('StudentList — filters', () => {
    beforeEach(() => { db.inserts = []; });

    it('shows only students not on any course, as a chip that Reset takes off', async () => {
        renderList();
        expect(await screen.findAllByText('Aoife Murphy')).not.toHaveLength(0);

        fireEvent.click(screen.getByRole('button', { name: 'Not on any course' }));
        await tableShows(['Ciaran Walsh']);
        expect(screen.getByText('None')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
        await tableShows(['Aoife Murphy', 'Ciaran Walsh']);
    });

    it('filters by course and status', async () => {
        renderList();
        await screen.findAllByText('Ciaran Walsh');

        fireEvent.change(screen.getByLabelText('Filter by course'), { target: { value: 'c-ecdl' } });
        await tableShows(['Aoife Murphy']);

        fireEvent.change(screen.getByLabelText('Filter by enrollment status'), { target: { value: 'requested' } });
        expect(await screen.findByText('No students match these filters')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Remove Status filter' }));
        await tableShows(['Aoife Murphy']);
    });
});

describe('StudentList — selected students', () => {
    beforeEach(() => { db.inserts = []; });

    it('enrolls the selected students on a course, skipping who is already on it', async () => {
        renderList();
        await screen.findAllByText('Aoife Murphy');

        fireEvent.click(within(table()).getByRole('checkbox', { name: 'Select all 2 shown students' }));
        const bar = screen.getByRole('toolbar', { name: 'Selected students' });
        expect(bar).toHaveTextContent('2 selected');

        fireEvent.click(within(bar).getByRole('button', { name: /Enroll/ }));
        const dialog = await screen.findByRole('dialog', { name: 'Enroll on a course' });
        fireEvent.change(await within(dialog).findByLabelText('Course'), { target: { value: 'c-ecdl' } });
        expect(within(dialog).getByText(/1 already on this course/).closest('p')).toHaveTextContent('will be skipped: Aoife Murphy');

        fireEvent.click(within(dialog).getByRole('button', { name: 'Enroll 1' }));
        await waitFor(() => expect(db.inserts).toHaveLength(1));
        expect(db.inserts[0]).toEqual({
            table: 'enrollments',
            rows: [{ student_id: 'st-2', course_id: 'c-ecdl', status: 'requested', course_variant: 'English' }],
        });
        // Done: the selection is cleared
        await waitFor(() => expect(screen.queryByRole('toolbar', { name: 'Selected students' })).toBeNull());
    });

    it('says how many enrollments go with a deleted student', async () => {
        renderList();
        await screen.findAllByText('Aoife Murphy');
        const row = within(table()).getByText('Aoife Murphy').closest('tr')!;
        fireEvent.click(within(row).getByRole('button', { name: 'Delete' }));
        const dialog = await screen.findByRole('alertdialog');
        expect(dialog).toHaveTextContent('Their 1 course enrollment (ECDL) will be deleted too');
    });
});
