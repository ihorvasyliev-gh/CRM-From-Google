import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import StudentDetailDrawer from './StudentDetailDrawer';
import { GlobalToaster } from './Toast';
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
            <GlobalToaster />
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

    function mockRpc() {
        (supabase.rpc as any).mockImplementation((rpcName: string) => {
            if (rpcName === 'get_student_detail_restricted') {
                return Promise.resolve({ data: mockDetail, error: null });
            }
            return Promise.resolve({ data: null, error: null });
        });
    }

    it('renders null when studentId is null', () => {
        const { container } = render(
            <QueryClientProvider client={new QueryClient()}>
                <StudentDetailDrawer studentId={null} onClose={vi.fn()} />
            </QueryClientProvider>
        );
        expect(container.firstChild).toBeNull();
    });

    it('fetches and displays student name, contacts, and registration date', async () => {
        mockRpc();
        renderWithClient(<StudentDetailDrawer studentId="st-101" onClose={vi.fn()} />);

        expect(await screen.findByText('Jane Doe')).toBeInTheDocument();
        expect(screen.getByText('jane.doe@example.com')).toBeInTheDocument();
        expect(screen.getByText('+353871234567')).toBeInTheDocument();
        expect(screen.getByText('10 Main Street, Cork')).toBeInTheDocument();
        expect(screen.getByText('T12AB34')).toBeInTheDocument();
        expect(screen.getByText(/Registered 10\/01\/2026/)).toBeInTheDocument();
    });

    it('offers one-tap contact actions (email, call, WhatsApp)', async () => {
        mockRpc();
        renderWithClient(<StudentDetailDrawer studentId="st-101" onClose={vi.fn()} />);
        await screen.findByText('Jane Doe');

        expect(screen.getByRole('link', { name: /^Email$/ })).toHaveAttribute('href', 'mailto:jane.doe@example.com');
        expect(screen.getByRole('link', { name: /^Call$/ }).getAttribute('href')).toMatch(/^tel:/);
        expect(screen.getByRole('link', { name: /WhatsApp/ }).getAttribute('href')).toMatch(/wa\.me/);
    });

    it('copies a contact field on click with toast feedback', async () => {
        const writeTextMock = vi.fn().mockResolvedValue(undefined);
        Object.assign(navigator, { clipboard: { writeText: writeTextMock } });
        mockRpc();

        renderWithClient(<StudentDetailDrawer studentId="st-101" onClose={vi.fn()} />);
        await screen.findByText('Jane Doe');

        fireEvent.click(screen.getByText('jane.doe@example.com'));
        expect(writeTextMock).toHaveBeenCalledWith('jane.doe@example.com');
        expect(await screen.findByText('Email copied')).toBeInTheDocument();
    });

    it('displays enrollments (active first) with clean variant, status badge, queue position and notes', async () => {
        mockRpc();
        renderWithClient(<StudentDetailDrawer studentId="st-101" onClose={vi.fn()} />);

        await screen.findByText('Barista Training');
        const titles = screen.getAllByRole('heading', { level: 4 }).map(h => h.textContent);
        expect(titles).toEqual(['Barista Training', 'Digital Skills Beginners']);

        expect(screen.getByText(/Morning/)).toBeInTheDocument();
        expect(screen.getByText('#3')).toBeInTheDocument();
        expect(screen.getByText('Requested online class if possible')).toBeInTheDocument();
        expect(screen.getAllByLabelText('Enrollment progress')).toHaveLength(2);
    });

    it('displays course flags/notes section with created dates', async () => {
        mockRpc();
        renderWithClient(<StudentDetailDrawer studentId="st-101" onClose={vi.fn()} />);

        expect(await screen.findByText('Basic English')).toBeInTheDocument();
        expect(screen.getByText('Needs level A2 re-assessment')).toBeInTheDocument();
        expect(screen.getByText('02/01/2026')).toBeInTheDocument();
    });

    it('opens the completion modal (defaulting to the course day) and submits the request', async () => {
        mockRpc();
        renderWithClient(<StudentDetailDrawer studentId="st-101" onClose={vi.fn()} />);
        await screen.findByText('Barista Training');

        // Both active enrollments can be completed; the confirmed one is listed first
        fireEvent.click(screen.getAllByRole('button', { name: /Request Completion/i })[0]);

        const dialog = await screen.findByRole('dialog', { name: 'Request completion' });
        expect(dialog).toHaveTextContent('Barista Training');
        expect(screen.getByLabelText('Completion date')).toHaveTextContent('15/01/2026');

        fireEvent.click(screen.getByRole('button', { name: /Submit request/i }));

        await waitFor(() => {
            expect(supabase.rpc).toHaveBeenCalledWith('request_course_completion', {
                p_enrollment_ids: ['en-2'],
                p_completed_date: '2026-01-15',
            });
        });
        expect(await screen.findByText(/waiting for admin approval/i)).toBeInTheDocument();
    });

    it('opens the course roster from an enrollment', async () => {
        mockRpc();
        const onOpenCourse = vi.fn();
        renderWithClient(<StudentDetailDrawer studentId="st-101" onClose={vi.fn()} onOpenCourse={onOpenCourse} />);
        await screen.findByText('Barista Training');

        fireEvent.click(screen.getAllByRole('button', { name: /Open course/i })[0]);
        expect(onOpenCourse).toHaveBeenCalledWith('c-2');
    });

    it('steps through the list with the arrows and ↑ / ↓ keys', async () => {
        mockRpc();
        const onPrev = vi.fn();
        const onNext = vi.fn();
        renderWithClient(
            <StudentDetailDrawer studentId="st-101" onClose={vi.fn()} onPrev={onPrev} onNext={onNext} position={{ index: 1, total: 5 }} />
        );
        await screen.findByText('Jane Doe');

        expect(screen.getByText('2 / 5')).toBeInTheDocument();
        fireEvent.click(screen.getByLabelText('Next student'));
        expect(onNext).toHaveBeenCalledTimes(1);

        fireEvent.keyDown(window, { key: 'ArrowUp' });
        expect(onPrev).toHaveBeenCalledTimes(1);
        fireEvent.keyDown(window, { key: 'j' });
        expect(onNext).toHaveBeenCalledTimes(2);
    });

    it('calls onClose when close button is clicked', async () => {
        mockRpc();
        const onClose = vi.fn();
        renderWithClient(<StudentDetailDrawer studentId="st-101" onClose={onClose} />);
        await screen.findByText('Jane Doe');

        fireEvent.click(screen.getByLabelText('Close drawer'));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when backdrop overlay is clicked', async () => {
        mockRpc();
        const onClose = vi.fn();
        renderWithClient(<StudentDetailDrawer studentId="st-101" onClose={onClose} />);
        await screen.findByText('Jane Doe');

        fireEvent.click(screen.getByTestId('drawer-backdrop'));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when Escape key is pressed', async () => {
        mockRpc();
        const onClose = vi.fn();
        renderWithClient(<StudentDetailDrawer studentId="st-101" onClose={onClose} />);
        await screen.findByText('Jane Doe');

        fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('closes inner completion modal on Escape without closing the drawer', async () => {
        mockRpc();
        const onClose = vi.fn();
        renderWithClient(<StudentDetailDrawer studentId="st-101" onClose={onClose} />);
        await screen.findByText('Barista Training');

        fireEvent.click(screen.getAllByRole('button', { name: /Request Completion/i })[0]);
        expect(await screen.findByRole('dialog', { name: 'Request completion' })).toBeInTheDocument();

        fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
        expect(screen.queryByRole('dialog', { name: 'Request completion' })).not.toBeInTheDocument();
        expect(onClose).not.toHaveBeenCalled();

        fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
