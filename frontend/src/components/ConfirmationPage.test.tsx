import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ConfirmationPage from './ConfirmationPage';
import { supabase } from '../lib/supabase';

vi.mock('../lib/supabase', () => ({
    supabase: {
        rpc: vi.fn(),
    },
}));

describe('ConfirmationPage Component', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Setup window.location.pathname
        window.history.pushState({}, 'Test', '/confirm?course_id=test-course-123&date=2026-10-15');
    });

    it('does not display Course CRM header', async () => {
        (supabase.rpc as any).mockImplementation(async (name: string) => {
            if (name === 'get_public_course_info') {
                return {
                    data: [{ course_name: 'Python for Beginners', course_id: 'test-course-123' }],
                    error: null,
                } as any;
            }
            return { data: null, error: null } as any;
        });

        render(<ConfirmationPage />);

        await waitFor(() => {
            expect(screen.getByText('Python for Beginners')).toBeInTheDocument();
        });

        // Ensure "Course CRM" is NOT present anywhere in the document
        expect(screen.queryByText('Course CRM')).not.toBeInTheDocument();
    });

    it('renders a prominent "Can\'t make it to this date? Let us know" button and switches to mailto view', async () => {
        (supabase.rpc as any).mockImplementation(async (name: string) => {
            if (name === 'get_public_course_info') {
                return {
                    data: [{ course_name: 'Python for Beginners', course_id: 'test-course-123' }],
                    error: null,
                } as any;
            }
            return { data: null, error: null } as any;
        });

        render(<ConfirmationPage />);

        await waitFor(() => {
            expect(screen.getByText('Python for Beginners')).toBeInTheDocument();
        });

        const declineBtn = screen.getByRole('button', { name: /can't make it to this date/i });
        expect(declineBtn).toBeInTheDocument();

        // Click to go to decline options
        fireEvent.click(declineBtn);

        expect(screen.getByText(/Can't attend this session\?/i)).toBeInTheDocument();

        // Check options with mailto links
        const waitlistLink = screen.getByRole('link', { name: /keep me on the waiting list/i });
        const cancelLink = screen.getByRole('link', { name: /no longer interested/i });

        expect(waitlistLink).toBeInTheDocument();
        expect(cancelLink).toBeInTheDocument();

        const waitlistHref = waitlistLink.getAttribute('href');
        const cancelHref = cancelLink.getAttribute('href');

        expect(waitlistHref).toContain('mailto:ivasyliev@partnershipcork.ie');
        expect(waitlistHref).toContain('Waiting%20list');
        expect(cancelHref).toContain('mailto:ivasyliev@partnershipcork.ie');
        expect(cancelHref).toContain('Cancel');

        // Confirm public_decline_enrollment was NEVER called
        expect(supabase.rpc).not.toHaveBeenCalledWith('public_decline_enrollment', expect.anything());
    });

    it('prefills entered email into mailto URLs', async () => {
        (supabase.rpc as any).mockImplementation(async (name: string) => {
            if (name === 'get_public_course_info') {
                return {
                    data: [{ course_name: 'Python for Beginners', course_id: 'test-course-123' }],
                    error: null,
                } as any;
            }
            return { data: null, error: null } as any;
        });

        render(<ConfirmationPage />);

        await waitFor(() => {
            expect(screen.getByText('Python for Beginners')).toBeInTheDocument();
        });

        // Enter email on main form
        const emailInput = screen.getByPlaceholderText(/registered email/i);
        fireEvent.change(emailInput, { target: { value: 'student@example.com' } });

        // Navigate to decline screen
        const declineBtn = screen.getByRole('button', { name: /can't make it to this date/i });
        fireEvent.click(declineBtn);

        const waitlistLink = screen.getByRole('link', { name: /keep me on the waiting list/i });
        const waitlistHref = decodeURIComponent(waitlistLink.getAttribute('href') || '');

        expect(waitlistHref).toContain('student@example.com');
        expect(waitlistHref).toContain('ivasyliev@partnershipcork.ie');
    });

    it('copies coordinator email to clipboard and allows going back to confirmation form', async () => {
        const mockWriteText = vi.fn();
        Object.assign(navigator, {
            clipboard: {
                writeText: mockWriteText,
            },
        });

        (supabase.rpc as any).mockImplementation(async (name: string) => {
            if (name === 'get_public_course_info') {
                return {
                    data: [{ course_name: 'Python for Beginners', course_id: 'test-course-123' }],
                    error: null,
                } as any;
            }
            return { data: null, error: null } as any;
        });

        render(<ConfirmationPage />);

        await waitFor(() => {
            expect(screen.getByText('Python for Beginners')).toBeInTheDocument();
        });

        // Click decline button
        fireEvent.click(screen.getByRole('button', { name: /can't make it to this date/i }));

        // Click copy address
        const copyBtn = screen.getByRole('button', { name: /copy address/i });
        fireEvent.click(copyBtn);

        expect(mockWriteText).toHaveBeenCalledWith('ivasyliev@partnershipcork.ie');
        expect(screen.getByText('Copied!')).toBeInTheDocument();

        // Click back to confirmation
        const backBtn = screen.getByRole('button', { name: /back to confirmation/i });
        fireEvent.click(backBtn);

        expect(screen.getByRole('button', { name: /confirm my participation/i })).toBeInTheDocument();
    });

    it('shows confirmed / max places for the course date', async () => {
        (supabase.rpc as any).mockImplementation(async (name: string) => {
            if (name === 'get_public_course_info') {
                return { data: [{ course_name: 'Python for Beginners' }], error: null } as any;
            }
            if (name === 'get_course_capacity') {
                return { data: [{ max_capacity: 10, confirmed_count: 4, is_full: false }], error: null } as any;
            }
            return { data: null, error: null } as any;
        });

        render(<ConfirmationPage />);

        const meter = await screen.findByTestId('capacity-meter');
        expect(meter).toHaveTextContent('4 of 10 places confirmed');
        expect(meter).toHaveTextContent('6 places left');
        expect(supabase.rpc).toHaveBeenCalledWith('get_course_capacity', { p_course_id: 'test-course-123', p_course_date: '2026-10-15' });
        expect(screen.getByRole('button', { name: /confirm my participation/i })).toBeInTheDocument();
    });

    it('blocks confirmation when the course date is full and offers priority for the next course', async () => {
        (supabase.rpc as any).mockImplementation(async (name: string) => {
            if (name === 'get_public_course_info') {
                return { data: [{ course_name: 'Python for Beginners' }], error: null } as any;
            }
            if (name === 'get_course_capacity') {
                return { data: [{ max_capacity: 10, confirmed_count: 10, is_full: true }], error: null } as any;
            }
            return { data: null, error: null } as any;
        });

        render(<ConfirmationPage />);

        expect(await screen.findByText(/all places for this date have been taken/i)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /confirm my participation/i })).not.toBeInTheDocument();
        const priorityLink = screen.getByRole('link', { name: /priority for the next course/i });
        expect(priorityLink.getAttribute('href')).toContain('mailto:ivasyliev@partnershipcork.ie');
        expect(priorityLink.getAttribute('href')).toContain('Priority');
    });

    it('switches to the fully booked view when the server reports course_full on confirm', async () => {
        (supabase.rpc as any).mockImplementation(async (name: string) => {
            if (name === 'get_public_course_info') {
                return { data: [{ course_name: 'Python for Beginners' }], error: null } as any;
            }
            if (name === 'get_course_capacity') {
                return { data: [{ max_capacity: 10, confirmed_count: 9, is_full: false }], error: null } as any;
            }
            if (name === 'find_students_by_email') {
                return { data: [{ student_id: 's1', first_name: 'A', last_name: 'B' }], error: null } as any;
            }
            if (name === 'public_confirm_enrollment') {
                return { data: { success: false, code: 'course_full', message: 'Full' }, error: null } as any;
            }
            return { data: null, error: null } as any;
        });

        render(<ConfirmationPage />);

        const input = await screen.findByPlaceholderText(/enter registered email address/i);
        fireEvent.change(input, { target: { value: 'a@b.com' } });
        fireEvent.click(screen.getByRole('button', { name: /confirm my participation/i }));

        expect(await screen.findByText(/all places for this date have been taken/i)).toBeInTheDocument();
    });
});
