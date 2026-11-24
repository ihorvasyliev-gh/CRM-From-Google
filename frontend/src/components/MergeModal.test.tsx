import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MergeModal from './MergeModal';
import { supabase } from '../lib/supabase';
import type { Student } from '../lib/types';

vi.mock('../lib/supabase', () => ({
    supabase: {
        rpc: vi.fn(),
        from: vi.fn(),
    },
}));

const mockRpc = vi.mocked(supabase.rpc);
const mockFrom = vi.mocked(supabase.from);

function makeStudent(overrides: Partial<Student> & { id: string }): Student {
    return {
        first_name: 'Alice',
        last_name: 'Murphy',
        email: 'alice@example.ie',
        phone: '+353871112222',
        address: '10 Main St, Cork',
        eircode: 'T12 AB34',
        dob: '1992-04-15',
        created_at: '2026-01-10T09:00:00Z',
        ...overrides,
    };
}

function renderModal(props: Partial<React.ComponentProps<typeof MergeModal>> = {}) {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
        },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    const sourceStudent = makeStudent({
        id: 'stu-1',
        first_name: 'Alice',
        last_name: 'Murphy',
        email: 'alice.old@example.ie',
        phone: '+353871112222',
        address: '10 Old Road, Cork',
        eircode: 'T12 AA11',
    });
    const targetStudent = makeStudent({
        id: 'stu-2',
        first_name: 'Alice',
        last_name: 'Murphy-Byrne',
        email: 'alice.new@example.ie',
        phone: '+353879998888',
        address: '10 Old Road, Cork',
        eircode: 'T12 BB22',
    });

    const mergedProps: React.ComponentProps<typeof MergeModal> = {
        open: true,
        student: sourceStudent,
        initialTargetStudent: targetStudent,
        onClose,
        onSuccess,
        ...props,
    };

    const view = render(
        <QueryClientProvider client={queryClient}>
            <MergeModal {...mergedProps} />
        </QueryClientProvider>,
    );

    return {
        ...view,
        queryClient,
        invalidateSpy,
        onClose,
        onSuccess,
        sourceStudent: mergedProps.student,
        targetStudent: mergedProps.initialTargetStudent,
    };
}

describe('MergeModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders both profiles side-by-side with differing fields highlighted and lets users toggle all details', () => {
        renderModal();

        const dialog = screen.getByRole('dialog');
        expect(within(dialog).getByText('Merge duplicate students')).toBeInTheDocument();
        expect(within(dialog).getByText('Choose the record to keep')).toBeInTheDocument();

        const radios = within(dialog).getAllByRole('radio');
        expect(radios).toHaveLength(2);
        expect(radios[0]).toHaveAttribute('aria-checked', 'true');
        expect(within(radios[0]).getByText('Keep')).toBeInTheDocument();
        expect(within(radios[0]).getByText('Alice Murphy')).toBeInTheDocument();

        expect(radios[1]).toHaveAttribute('aria-checked', 'false');
        expect(within(radios[1]).getByText('Will be deleted')).toBeInTheDocument();
        expect(within(radios[1]).getByText('Alice Murphy-Byrne')).toBeInTheDocument();

        // Differing fields are visible by default; identical fields (First name, Address, Date of birth) are hidden
        expect(within(dialog).getByText('Details that differ')).toBeInTheDocument();
        expect(within(dialog).getByText('Last name')).toBeInTheDocument();
        expect(within(dialog).getByText('Email')).toBeInTheDocument();
        expect(within(dialog).getByText('Phone')).toBeInTheDocument();
        expect(within(dialog).getByText('Eircode')).toBeInTheDocument();
        expect(within(dialog).queryByText('Address')).not.toBeInTheDocument();

        // Toggling "Show all details" reveals matching fields too
        const toggleBtn = within(dialog).getByRole('button', { name: 'Show all details' });
        fireEvent.click(toggleBtn);
        expect(within(dialog).getByText('Address')).toBeInTheDocument();
        expect(within(dialog).getByText('First name')).toBeInTheDocument();
        expect(within(dialog).getByText('Date of birth')).toBeInTheDocument();
        expect(within(dialog).getByRole('button', { name: 'Only what differs' })).toBeInTheDocument();
    });

    it('lets the admin pick field values from the duplicate and undo picks, then passes them to merge_students_with_changes', async () => {
        mockRpc.mockResolvedValueOnce({ data: null, error: null } as never);
        const { onSuccess, onClose, invalidateSpy } = renderModal();

        const dialog = screen.getByRole('dialog');

        // Pick duplicate's Email and Eircode via "Use this"
        const emailUseBtn = within(dialog).getByTitle('Keep "alice.new@example.ie" on the merged record');
        fireEvent.click(emailUseBtn);

        const eircodeUseBtn = within(dialog).getByTitle('Keep "T12 BB22" on the merged record');
        fireEvent.click(eircodeUseBtn);

        // Two "Undo" buttons appear for the two edited fields
        const undoButtons = within(dialog).getAllByRole('button', { name: 'Undo' });
        expect(undoButtons).toHaveLength(2);

        // Undo the Eircode pick; keep only the Email override
        fireEvent.click(undoButtons[1]);
        expect(within(dialog).getAllByRole('button', { name: 'Undo' })).toHaveLength(1);
        expect(within(dialog).getByTitle('Keep "T12 BB22" on the merged record')).toBeInTheDocument();

        // Confirm merge
        fireEvent.click(within(dialog).getByRole('button', { name: /Merge into Alice Murphy$/i }));

        await waitFor(() => {
            expect(mockRpc).toHaveBeenCalledWith('merge_students_with_changes', {
                p_primary_id: 'stu-1',
                p_duplicate_id: 'stu-2',
                p_changes: { email: 'alice.new@example.ie' },
            });
        });

        await waitFor(() => {
            expect(onSuccess).toHaveBeenCalledTimes(1);
            expect(onClose).toHaveBeenCalledTimes(1);
        });

        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['students'] });
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['dashboard_stats'] });
    });

    it('swaps primary and duplicate direction, resets prior field picks, and merges in the swapped direction', async () => {
        mockRpc.mockResolvedValueOnce({ data: null, error: null } as never);
        const { onSuccess, onClose } = renderModal();

        const dialog = screen.getByRole('dialog');
        const radios = within(dialog).getAllByRole('radio');

        // Pick a field before swapping
        fireEvent.click(within(dialog).getByTitle('Keep "alice.new@example.ie" on the merged record'));
        expect(within(dialog).getByRole('button', { name: 'Undo' })).toBeInTheDocument();

        // Swap primary to the second profile (stu-2)
        fireEvent.click(radios[1]);

        expect(radios[0]).toHaveAttribute('aria-checked', 'false');
        expect(radios[1]).toHaveAttribute('aria-checked', 'true');
        expect(within(radios[0]).getByText('Will be deleted')).toBeInTheDocument();
        expect(within(radios[1]).getByText('Keep')).toBeInTheDocument();

        // Previous field edits are cleared when primary changes
        expect(within(dialog).queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();

        // Primary CTA button reflects the new kept record
        const mergeBtn = within(dialog).getByRole('button', { name: /Merge into Alice Murphy-Byrne/i });
        expect(mergeBtn).toBeInTheDocument();

        // Now pick stu-1's phone onto stu-2
        fireEvent.click(within(dialog).getByTitle('Keep "+353871112222" on the merged record'));

        fireEvent.click(mergeBtn);

        await waitFor(() => {
            expect(mockRpc).toHaveBeenCalledWith('merge_students_with_changes', {
                p_primary_id: 'stu-2',
                p_duplicate_id: 'stu-1',
                p_changes: { phone: '+353871112222' },
            });
        });

        await waitFor(() => {
            expect(onSuccess).toHaveBeenCalledTimes(1);
            expect(onClose).toHaveBeenCalledTimes(1);
        });
    });

    it('shows an error alert on RPC failure without calling onSuccess or onClose', async () => {
        mockRpc.mockResolvedValueOnce({
            data: null,
            error: { code: 'P0001', message: 'Duplicate email constraint violation' },
        } as never);

        const { onSuccess, onClose } = renderModal();
        const dialog = screen.getByRole('dialog');

        fireEvent.click(within(dialog).getByRole('button', { name: /Merge into Alice Murphy/i }));

        const alert = await within(dialog).findByRole('alert');
        expect(alert).toHaveTextContent('Duplicate email constraint violation');
        expect(onSuccess).not.toHaveBeenCalled();
        expect(onClose).not.toHaveBeenCalled();
    });

    it('marks the pair as non-duplicates with sorted IDs when clicking "Not the same person"', async () => {
        const upsert = vi.fn().mockResolvedValueOnce({ error: null });
        mockFrom.mockReturnValue({ upsert } as never);

        const { onSuccess, onClose } = renderModal({
            student: makeStudent({ id: 'stu-b', first_name: 'Ben', last_name: 'One' }),
            initialTargetStudent: makeStudent({ id: 'stu-a', first_name: 'Ben', last_name: 'Two' }),
        });

        const dialog = screen.getByRole('dialog');
        fireEvent.click(within(dialog).getByRole('button', { name: /Not the same person/i }));

        await waitFor(() => {
            expect(mockFrom).toHaveBeenCalledWith('student_non_duplicates');
            expect(upsert).toHaveBeenCalledWith(
                { student_a_id: 'stu-a', student_b_id: 'stu-b' },
                { onConflict: 'student_a_id,student_b_id' },
            );
        });

        await waitFor(() => {
            expect(onSuccess).toHaveBeenCalledTimes(1);
            expect(onClose).toHaveBeenCalledTimes(1);
        });
    });
});
