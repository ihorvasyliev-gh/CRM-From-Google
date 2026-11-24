import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PendingApprovalsModal from './PendingApprovalsModal';
import { supabase } from '../lib/supabase';
import { subscribeToasts, type ToastData } from '../lib/toast';
import type { PendingCompletionRequest } from '../lib/types';

vi.mock('../lib/supabase', () => ({
    supabase: {
        rpc: vi.fn(),
        from: vi.fn(),
    },
}));

const mockRpc = vi.mocked(supabase.rpc);

function makeRequest(overrides: Partial<PendingCompletionRequest> & { enrollment_id: string }): PendingCompletionRequest {
    return {
        student_id: 'st-1',
        student_name: 'Ciara Byrne',
        student_email: 'ciara@example.ie',
        student_phone: '087 123 4567',
        course_id: 'c-1',
        course_name: 'Safe Pass',
        course_variant: 'Safe Pass - Morning',
        confirmed_date: '2026-04-10',
        pending_completion_date: '2026-04-12',
        completion_requested_at: '2026-04-12T14:30:00Z',
        completion_requested_by: 'trainer@example.ie',
        ...overrides,
    };
}

function renderModal(open = true) {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
        },
    });
    const onClose = vi.fn();

    const view = render(
        <QueryClientProvider client={queryClient}>
            <PendingApprovalsModal open={open} onClose={onClose} />
        </QueryClientProvider>,
    );

    return { ...view, queryClient, onClose };
}

describe('PendingApprovalsModal', () => {
    let toasts: ToastData[];
    let unsubscribe: () => void;

    beforeEach(() => {
        vi.clearAllMocks();
        toasts = [];
        unsubscribe = subscribeToasts(t => toasts.push(t));
    });

    afterEach(() => {
        unsubscribe();
    });

    it('renders loading state while fetching and empty state when there are no pending requests', async () => {
        let resolveFetch!: (value: { data: PendingCompletionRequest[]; error: null }) => void;
        mockRpc.mockReturnValueOnce(
            new Promise(resolve => {
                resolveFetch = resolve;
            }) as never,
        );

        renderModal(true);

        expect(screen.getByText('Loading pending approvals...')).toBeInTheDocument();
        expect(screen.getByText('Loading…')).toBeInTheDocument();

        resolveFetch({ data: [], error: null });

        expect(await screen.findByText('All caught up!')).toBeInTheDocument();
        expect(screen.getByText('0 pending')).toBeInTheDocument();
        expect(screen.getByText(/There are no pending course completion requests/i)).toBeInTheDocument();
    });

    it('renders pending completion requests with student, course, date, and requester details', async () => {
        const items = [
            makeRequest({
                enrollment_id: 'en-1',
                student_name: 'Ciara Byrne',
                student_email: 'ciara@example.ie',
                student_phone: '087 123 4567',
                course_name: 'Safe Pass',
                course_variant: 'Safe Pass - Morning',
                pending_completion_date: '2026-04-12',
                completion_requested_by: 'trainer@example.ie',
            }),
            makeRequest({
                enrollment_id: 'en-2',
                student_id: 'st-2',
                student_name: 'Declan Doyle',
                student_email: 'declan@example.ie',
                student_phone: null,
                course_name: 'Barista',
                course_variant: null,
                pending_completion_date: '2026-04-15',
                completion_requested_by: null,
            }),
        ];

        mockRpc.mockResolvedValueOnce({ data: items, error: null } as never);

        renderModal(true);

        expect(await screen.findByText('2 pending')).toBeInTheDocument();
        expect(screen.getByText('Ciara Byrne')).toBeInTheDocument();
        expect(screen.getByText('Safe Pass')).toBeInTheDocument();
        expect(screen.getByText('Morning')).toBeInTheDocument();
        expect(screen.getByText('ciara@example.ie')).toBeInTheDocument();
        expect(screen.getByText('trainer@example.ie')).toBeInTheDocument();
        expect(screen.getByText('12 Apr 2026')).toBeInTheDocument();

        expect(screen.getByText('Declan Doyle')).toBeInTheDocument();
        expect(screen.getByText('Barista')).toBeInTheDocument();
        expect(screen.getByText('Viewer')).toBeInTheDocument();
        expect(screen.getByText('15 Apr 2026')).toBeInTheDocument();
    });

    it('approves a single request via approve_course_completion RPC and notifies with a success toast', async () => {
        const req = makeRequest({ enrollment_id: 'en-1', student_name: 'Ciara Byrne', course_name: 'Safe Pass' });
        mockRpc
            .mockResolvedValueOnce({ data: [req], error: null } as never) // initial list
            .mockResolvedValueOnce({ data: { success: true }, error: null } as never) // approve RPC
            .mockResolvedValue({ data: [], error: null } as never); // refetch after approve

        renderModal(true);

        expect(await screen.findByText('Ciara Byrne')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /^Approve$/i }));

        await waitFor(() => {
            expect(mockRpc).toHaveBeenCalledWith('approve_course_completion', {
                p_enrollment_ids: ['en-1'],
            });
        });

        await waitFor(() => {
            expect(toasts).toContainEqual(
                expect.objectContaining({
                    type: 'success',
                    message: 'Approved course completion for Ciara Byrne (Safe Pass)',
                }),
            );
        });

        expect(await screen.findByText('All caught up!')).toBeInTheDocument();
    });

    it('bulk approves selected requests after confirmation dialog', async () => {
        const items = [
            makeRequest({ enrollment_id: 'en-1', student_name: 'Ciara Byrne' }),
            makeRequest({ enrollment_id: 'en-2', student_id: 'st-2', student_name: 'Declan Doyle' }),
            makeRequest({ enrollment_id: 'en-3', student_id: 'st-3', student_name: 'Eimear Kelly' }),
        ];

        mockRpc
            .mockResolvedValueOnce({ data: items, error: null } as never)
            .mockResolvedValueOnce({ data: { success: true }, error: null } as never)
            .mockResolvedValue({ data: [items[2]], error: null } as never);

        renderModal(true);

        expect(await screen.findByText('Ciara Byrne')).toBeInTheDocument();

        // Select two of the three requests
        fireEvent.click(screen.getByRole('button', { name: 'Select Ciara Byrne' }));
        fireEvent.click(screen.getByRole('button', { name: 'Select Declan Doyle' }));

        const approveSelectedBtn = screen.getByRole('button', { name: /Approve Selected \(2\)/i });
        fireEvent.click(approveSelectedBtn);

        // Confirmation dialog appears before firing the batch approval RPC
        const confirmDialog = await screen.findByRole('alertdialog');
        expect(within(confirmDialog).getByText('Approve 2 completions?')).toBeInTheDocument();
        expect(mockRpc).not.toHaveBeenCalledWith('approve_course_completion', expect.anything());

        fireEvent.click(within(confirmDialog).getByRole('button', { name: 'Approve' }));

        await waitFor(() => {
            expect(mockRpc).toHaveBeenCalledWith('approve_course_completion', {
                p_enrollment_ids: ['en-1', 'en-2'],
            });
        });

        await waitFor(() => {
            expect(toasts).toContainEqual(
                expect.objectContaining({
                    type: 'success',
                    message: 'Approved 2 course completion(s)',
                }),
            );
        });
    });

    it('rejects a request with a trimmed reason via reject_course_completion RPC', async () => {
        const req = makeRequest({ enrollment_id: 'en-1', student_name: 'Ciara Byrne' });
        mockRpc
            .mockResolvedValueOnce({ data: [req], error: null } as never)
            .mockResolvedValueOnce({ data: { success: true }, error: null } as never)
            .mockResolvedValue({ data: [], error: null } as never);

        renderModal(true);

        expect(await screen.findByText('Ciara Byrne')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /^Reject$/i }));

        const rejectDialog = await screen.findByRole('dialog', { name: 'Reject Completion Request' });
        const textarea = within(rejectDialog).getByPlaceholderText(/Reason \(optional/i);
        fireEvent.change(textarea, { target: { value: '  Missed final practical exam  ' } });

        fireEvent.click(within(rejectDialog).getByRole('button', { name: 'Confirm Rejection' }));

        await waitFor(() => {
            expect(mockRpc).toHaveBeenCalledWith('reject_course_completion', {
                p_enrollment_ids: ['en-1'],
                p_reason: 'Missed final practical exam',
            });
        });

        await waitFor(() => {
            expect(toasts).toContainEqual(
                expect.objectContaining({
                    type: 'info',
                    message: 'Completion request rejected',
                }),
            );
        });
    });

    it('displays ErrorState with retry on fetch failure and shows error toasts on mutation failure', async () => {
        // First load fails; retry succeeds; approve fails
        const req = makeRequest({ enrollment_id: 'en-1', student_name: 'Ciara Byrne' });
        mockRpc
            .mockResolvedValueOnce({ data: null, error: { message: 'Database unavailable' } } as never)
            .mockResolvedValueOnce({ data: [req], error: null } as never)
            .mockResolvedValueOnce({ data: null, error: { message: 'Approval blocked by policy' } } as never);

        renderModal(true);

        expect(await screen.findByText("Couldn't load the requests")).toBeInTheDocument();
        expect(screen.getByText('Database unavailable')).toBeInTheDocument();

        // Retry recovers and renders the list
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(await screen.findByText('Ciara Byrne')).toBeInTheDocument();

        // Approve fails -> error toast is emitted
        fireEvent.click(screen.getByRole('button', { name: /^Approve$/i }));

        await waitFor(() => {
            expect(toasts).toContainEqual(
                expect.objectContaining({
                    type: 'error',
                    message: 'Approval blocked by policy',
                }),
            );
        });
    });
});
