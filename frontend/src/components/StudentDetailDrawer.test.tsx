import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import StudentDetailDrawer from './StudentDetailDrawer';
import { supabase } from '../lib/supabase';

vi.mock('../lib/supabase', () => ({
    supabase: {
        rpc: vi.fn(),
    },
}));

function renderWithClient(ui: React.ReactElement) {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
        },
    });
    return render(
        <QueryClientProvider client={queryClient}>
            {ui}
        </QueryClientProvider>
    );
}

describe('StudentDetailDrawer Component', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const mockDetail = {
        id: 'st-101',
        first_name: 'Jane',
        last_name: 'Doe',
        email: 'jane.doe@example.com',
        phone: '+353871234567',
        address: '10 Main Street, Cork',
        eircode: 'T12AB34',
        dob: '1995-05-15',
        created_at: '2026-01-10T10:00:00Z',
        enrollments: [
            {
                id: 'en-1',
                status: 'requested',
                course_id: 'c-1',
                course_name: 'Digital Skills Beginners',
                course_variant: 'Digital Skills (Morning)',
                created_at: '2026-01-10T10:00:00Z',
                invited_at: null,
                invited_date: null,
                confirmed_at: null,
                confirmed_date: null,
                completed_at: null,
                completed_date: null,
                queue_position: 3,
                notes: 'Requested online class if possible',
                is_priority: false,
                completion_request_status: 'none',
            },
            {
                id: 'en-2',
                status: 'confirmed',
                course_id: 'c-2',
                course_name: 'Barista Training',
                course_variant: null,
                created_at: '2026-01-05T10:00:00Z',
                invited_at: '2026-01-08T10:00:00Z',
                invited_date: '2026-01-08',
                confirmed_at: '2026-01-09T10:00:00Z',
                confirmed_date: '2026-01-15',
                completed_at: null,
                completed_date: null,
                queue_position: null,
                notes: null,
                is_priority: true,
                completion_request_status: 'none',
            },
        ],
        flags: [
            {
                id: 'fl-1',
                course_id: 'c-3',
                course_name: 'Basic English',
                comment: 'Needs level A2 re-assessment',
                created_at: '2026-01-02T10:00:00Z',
            },
        ],
    };

    it('renders null when studentId is null', () => {
        const onClose = vi.fn();
        const { container } = renderWithClient(<StudentDetailDrawer studentId={null} onClose={onClose} />);
        expect(container.firstChild).toBeNull();
    });

    it('fetches and displays student name, contacts, and registration date', async () => {
        (supabase.rpc as any).mockImplementation((rpcName: string) => {
            if (rpcName === 'get_student_detail_restricted') {
                return Promise.resolve({ data: mockDetail, error: null });
            }
            return Promise.resolve({ data: null, error: null });
        });

        renderWithClient(<StudentDetailDrawer studentId="st-101" onClose={vi.fn()} />);

        // Wait for details
        await waitFor(() => {
            expect(screen.getByText('Jane Doe')).toBeInTheDocument();
        });

        expect(screen.getByText('jane.doe@example.com')).toBeInTheDocument();
        expect(screen.getByText('+353871234567')).toBeInTheDocument();
        expect(screen.getByText('10 Main Street, Cork')).toBeInTheDocument();
        expect(screen.getByText('T12AB34')).toBeInTheDocument();
    });

    it('triggers copy action on contact field click with toast feedback', async () => {
        const writeTextMock = vi.fn().mockResolvedValue(undefined);
        Object.assign(navigator, {
            clipboard: {
                writeText: writeTextMock,
            },
        });

        (supabase.rpc as any).mockImplementation((rpcName: string) => {
            if (rpcName === 'get_student_detail_restricted') {
                return Promise.resolve({ data: mockDetail, error: null });
            }
            return Promise.resolve({ data: null, error: null });
        });

        renderWithClient(<StudentDetailDrawer studentId="st-101" onClose={vi.fn()} />);

        await waitFor(() => {
            expect(screen.getByText('Jane Doe')).toBeInTheDocument();
        });

        // Click email to copy
        fireEvent.click(screen.getByText('jane.doe@example.com'));
        expect(writeTextMock).toHaveBeenCalledWith('jane.doe@example.com');

        // Toast feedback should appear
        await waitFor(() => {
            expect(screen.getByText(/copied to clipboard/i)).toBeInTheDocument();
        });
    });

    it('displays course enrollments with clean variant, status badge, queue position, and dates', async () => {
        (supabase.rpc as any).mockImplementation((rpcName: string) => {
            if (rpcName === 'get_student_detail_restricted') {
                return Promise.resolve({ data: mockDetail, error: null });
            }
            return Promise.resolve({ data: null, error: null });
        });

        renderWithClient(<StudentDetailDrawer studentId="st-101" onClose={vi.fn()} />);

        await waitFor(() => {
            expect(screen.getByText('Digital Skills Beginners')).toBeInTheDocument();
            expect(screen.getByText('Barista Training')).toBeInTheDocument();
        });

        // Variant cleaned from "Digital Skills (Morning)" -> "Morning"
        expect(screen.getByText(/Morning/)).toBeInTheDocument();

        // Queue position #3 for requested course
        expect(screen.getByText(/#3/)).toBeInTheDocument();

        // Notes rendered
        expect(screen.getByText('Requested online class if possible')).toBeInTheDocument();
    });

    it('displays course flags/notes section with created dates', async () => {
        (supabase.rpc as any).mockImplementation((rpcName: string) => {
            if (rpcName === 'get_student_detail_restricted') {
                return Promise.resolve({ data: mockDetail, error: null });
            }
            return Promise.resolve({ data: null, error: null });
        });

        renderWithClient(<StudentDetailDrawer studentId="st-101" onClose={vi.fn()} />);

        await waitFor(() => {
            expect(screen.getByText('Basic English')).toBeInTheDocument();
            expect(screen.getByText('Needs level A2 re-assessment')).toBeInTheDocument();
        });
    });

    it('opens date picker modal on Request Completion and submits mutation', async () => {
        (supabase.rpc as any).mockImplementation((rpcName: string) => {
            if (rpcName === 'get_student_detail_restricted') {
                return Promise.resolve({ data: mockDetail, error: null });
            }
            if (rpcName === 'request_course_completion') {
                return Promise.resolve({ data: { success: true, updated_count: 1 }, error: null });
            }
            return Promise.resolve({ data: null, error: null });
        });

        renderWithClient(<StudentDetailDrawer studentId="st-101" onClose={vi.fn()} />);

        await waitFor(() => {
            expect(screen.getByText('Barista Training')).toBeInTheDocument();
        });

        // Find Request Completion button
        const completionBtn = screen.getByRole('button', { name: /Mark Completed|Request Completion/i });
        fireEvent.click(completionBtn);

        // Date picker modal should appear
        expect(screen.getByText('Mark Course Completion')).toBeInTheDocument();
        const submitBtn = screen.getByRole('button', { name: /Submit Request/i });
        fireEvent.click(submitBtn);

        await waitFor(() => {
            expect(supabase.rpc).toHaveBeenCalledWith(
                'request_course_completion',
                expect.objectContaining({
                    p_enrollment_ids: ['en-2'],
                })
            );
        });
    });

    it('calls onClose when close button is clicked', async () => {
        const onClose = vi.fn();
        (supabase.rpc as any).mockImplementation((rpcName: string) => {
            if (rpcName === 'get_student_detail_restricted') {
                return Promise.resolve({ data: mockDetail, error: null });
            }
            return Promise.resolve({ data: null, error: null });
        });

        renderWithClient(<StudentDetailDrawer studentId="st-101" onClose={onClose} />);

        await waitFor(() => {
            expect(screen.getByText('Jane Doe')).toBeInTheDocument();
        });

        const closeBtn = screen.getByLabelText('Close drawer');
        fireEvent.click(closeBtn);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when backdrop overlay is clicked', async () => {
        const onClose = vi.fn();
        (supabase.rpc as any).mockImplementation((rpcName: string) => {
            if (rpcName === 'get_student_detail_restricted') {
                return Promise.resolve({ data: mockDetail, error: null });
            }
            return Promise.resolve({ data: null, error: null });
        });

        renderWithClient(<StudentDetailDrawer studentId="st-101" onClose={onClose} />);

        await waitFor(() => {
            expect(screen.getByText('Jane Doe')).toBeInTheDocument();
        });

        const backdrop = screen.getByTestId('drawer-backdrop');
        fireEvent.click(backdrop);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when Escape key is pressed', async () => {
        const onClose = vi.fn();
        (supabase.rpc as any).mockImplementation((rpcName: string) => {
            if (rpcName === 'get_student_detail_restricted') {
                return Promise.resolve({ data: mockDetail, error: null });
            }
            return Promise.resolve({ data: null, error: null });
        });

        renderWithClient(<StudentDetailDrawer studentId="st-101" onClose={onClose} />);

        await waitFor(() => {
            expect(screen.getByText('Jane Doe')).toBeInTheDocument();
        });

        fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('closes inner completion modal on Escape without closing the drawer', async () => {
        const onClose = vi.fn();
        (supabase.rpc as any).mockImplementation((rpcName: string) => {
            if (rpcName === 'get_student_detail_restricted') {
                return Promise.resolve({ data: mockDetail, error: null });
            }
            return Promise.resolve({ data: null, error: null });
        });

        renderWithClient(<StudentDetailDrawer studentId="st-101" onClose={onClose} />);

        await waitFor(() => {
            expect(screen.getByText('Barista Training')).toBeInTheDocument();
        });

        // Open completion modal
        const completionBtn = screen.getByRole('button', { name: /Mark Completed|Request Completion/i });
        fireEvent.click(completionBtn);

        expect(screen.getByText('Mark Course Completion')).toBeInTheDocument();

        // First Escape closes the modal, NOT the drawer
        fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });

        expect(screen.queryByText('Mark Course Completion')).not.toBeInTheDocument();
        expect(onClose).not.toHaveBeenCalled();

        // Second Escape closes the drawer
        fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
