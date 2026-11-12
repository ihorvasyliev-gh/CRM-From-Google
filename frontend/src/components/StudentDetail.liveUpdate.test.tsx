import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import StudentDetail from './StudentDetail';
import type { Student } from '../lib/types';
import { applyStudentChange } from '../lib/studentCache';

// The database: one student row, updated by the card's inline edits
const db = vi.hoisted(() => ({ row: null as Record<string, unknown> | null }));

vi.mock('../lib/supabase', () => ({
    supabase: {
        from: vi.fn((table: string) => ({
            select: vi.fn(() => ({
                eq: vi.fn(() => ({
                    order: vi.fn().mockResolvedValue({ data: [], error: null }),
                    single: vi.fn(async () => ({ data: table === 'students' ? { ...db.row } : null, error: null })),
                })),
            })),
            update: vi.fn((fields: Record<string, unknown>) => ({
                eq: vi.fn(() => ({
                    select: vi.fn(() => ({
                        maybeSingle: vi.fn(async () => {
                            db.row = { ...db.row, ...fields };
                            return { data: { ...db.row }, error: null };
                        }),
                    })),
                })),
            })),
        })),
    },
}));

vi.mock('../hooks/useApprovals', () => ({
    useApproveCompletion: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useRejectCompletion: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const opened: Student = {
    id: 'anna',
    first_name: 'Anna',
    last_name: 'Rohozha',
    email: 'anna@example.com',
    phone: '+353851132976',
    address: 'Dunmanway, Co.Cork',
    eircode: 'P47NH60',
    dob: '2007-07-04',
    created_at: '2026-01-01T00:00:00Z',
};

function setup(onStudentUpdated = vi.fn()) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
        <QueryClientProvider client={queryClient}>
            <StudentDetail student={opened} onClose={vi.fn()} onStudentUpdated={onStudentUpdated} />
        </QueryClientProvider>
    );
    return { queryClient, onStudentUpdated };
}

async function editField(label: string, value: string) {
    fireEvent.click(screen.getByTitle(`Edit ${label}`));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(screen.queryByDisplayValue(value)).not.toBeInTheDocument());
}

describe('StudentDetail shows saved changes without reopening', () => {
    beforeEach(() => {
        db.row = { ...opened };
    });

    it('shows a new address and eircode as soon as they are saved, keeping both', async () => {
        const { onStudentUpdated } = setup();

        await editField('Address', 'Cork City, Co. Cork');
        expect(await screen.findByText('Cork City, Co. Cork')).toBeInTheDocument();
        expect(screen.queryByText('Dunmanway, Co.Cork')).not.toBeInTheDocument();

        await editField('Eircode', 't12e2w2');
        expect(await screen.findByText('T12E2W2')).toBeInTheDocument();
        // The second edit didn't put back the address the card was opened with
        expect(screen.getByText('Cork City, Co. Cork')).toBeInTheDocument();
        expect(onStudentUpdated).toHaveBeenLastCalledWith(expect.objectContaining({ address: 'Cork City, Co. Cork', eircode: 'T12E2W2' }));
    });

    it('shows a change saved elsewhere (the Edit form, another user) while it is open', async () => {
        const { queryClient } = setup();
        await screen.findByText('Dunmanway, Co.Cork');

        db.row = { ...opened, phone: '+353870000000', address: 'Ballincollig' };
        applyStudentChange(queryClient, { id: 'anna', address: 'Ballincollig' });
        expect(await screen.findByText('Ballincollig')).toBeInTheDocument();
        // Reloaded from the database: the phone changed there too
        expect(await screen.findByText('+353870000000')).toBeInTheDocument();
    });
});
