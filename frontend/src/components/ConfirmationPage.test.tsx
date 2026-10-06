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

    it('does not display CCP CRM header', async () => {
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

        // Ensure "CCP CRM" is NOT present anywhere in the document
        expect(screen.queryByText('CCP CRM')).not.toBeInTheDocument();
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

describe('ConfirmationPage multi-date invitation', () => {
    const DATES = ['2026-10-14', '2026-10-15', '2026-10-16'];

    function mockMultiDate({ fullDates = [] as string[], confirm }: { fullDates?: string[]; confirm?: (args: any) => any } = {}) {
        (supabase.rpc as any).mockImplementation(async (name: string, args: any) => {
            if (name === 'resolve_confirmation_token') {
                return {
                    data: [{ course_id: 'c-1', course_date: DATES[0], course_name: 'Safe Pass', course_dates: DATES }],
                    error: null,
                } as any;
            }
            if (name === 'get_course_capacity') {
                const full = fullDates.includes(args.p_course_date);
                return { data: [{ max_capacity: 10, confirmed_count: full ? 10 : 4, is_full: full }], error: null } as any;
            }
            if (name === 'find_students_by_email') {
                return { data: [{ student_id: 's1', first_name: 'A', last_name: 'B' }], error: null } as any;
            }
            if (name === 'public_confirm_enrollment') {
                return { data: confirm ? confirm(args) : { success: true, message: 'Confirmed!' }, error: null } as any;
            }
            return { data: null, error: null } as any;
        });
    }

    beforeEach(() => {
        vi.clearAllMocks();
        window.history.pushState({}, 'Test', '/c/AbC1234');
    });

    it('lists every offered date with places left and requires choosing one', async () => {
        mockMultiDate();
        render(<ConfirmationPage />);

        const options = await screen.findAllByTestId('date-option');
        expect(options).toHaveLength(3);
        expect(screen.getAllByText('6 places left')).toHaveLength(3);
        for (const d of DATES) {
            expect(supabase.rpc).toHaveBeenCalledWith('get_course_capacity', { p_course_id: 'c-1', p_course_date: d });
        }

        const input = screen.getByPlaceholderText(/enter registered email address/i);
        fireEvent.change(input, { target: { value: 'a@b.com' } });
        expect(screen.getByRole('button', { name: /confirm my participation/i })).toBeDisabled();
        expect(screen.getByRole('button', { name: /none of these dates work for me/i })).toBeInTheDocument();
    });

    it('sends the chosen date and shows it on the success screen', async () => {
        mockMultiDate();
        render(<ConfirmationPage />);

        const radios = await screen.findAllByRole('radio');
        fireEvent.click(radios[1]);
        fireEvent.change(screen.getByPlaceholderText(/enter registered email address/i), { target: { value: 'a@b.com' } });
        fireEvent.click(screen.getByRole('button', { name: /confirm my participation/i }));

        expect(await screen.findByText(/you're all set/i)).toBeInTheDocument();
        expect(supabase.rpc).toHaveBeenCalledWith('public_confirm_enrollment', {
            p_email: 'a@b.com',
            p_course_id: 'c-1',
            p_student_id: 's1',
            p_course_date: '2026-10-15',
        });
        expect(screen.getByText(/15 October 2026/)).toBeInTheDocument();
    });

    it('disables a fully booked date', async () => {
        mockMultiDate({ fullDates: ['2026-10-14'] });
        render(<ConfirmationPage />);

        const radios = await screen.findAllByRole('radio');
        expect(radios[0]).toBeDisabled();
        expect(radios[1]).not.toBeDisabled();
        expect(screen.getByText('Full')).toBeInTheDocument();
    });

    it('shows the fully booked view when every offered date is full', async () => {
        mockMultiDate({ fullDates: DATES });
        render(<ConfirmationPage />);

        expect(await screen.findByText(/all places for these dates have been taken/i)).toBeInTheDocument();
    });

    it('asks to pick another date when the chosen one fills up during confirmation', async () => {
        const fullDates: string[] = [];
        mockMultiDate({
            fullDates,
            confirm: (args) => {
                fullDates.push(args.p_course_date);
                return { success: false, code: 'course_full', message: 'Full' };
            },
        });
        render(<ConfirmationPage />);

        const radios = await screen.findAllByRole('radio');
        fireEvent.click(radios[0]);
        fireEvent.change(screen.getByPlaceholderText(/enter registered email address/i), { target: { value: 'a@b.com' } });
        fireEvent.click(screen.getByRole('button', { name: /confirm my participation/i }));

        expect(await screen.findByText(/the date you selected has just filled up/i)).toBeInTheDocument();
        await waitFor(() => expect(screen.getAllByRole('radio')[0]).toBeDisabled());
        expect(screen.getByRole('button', { name: /confirm my participation/i })).toBeDisabled();
    });
});

describe('ConfirmationPage course date schedule', () => {
    const OCTOBER = { course_date: '2026-10-01', start_time: '10:00', end_time: '14:00', location: 'Heron House', days: [{ date: '2026-10-01' }, { date: '2026-10-08' }, { date: '2026-10-12' }, { date: '2026-10-15' }] };
    const NOVEMBER = { course_date: '2026-10-29', start_time: '10:00', end_time: '14:00', location: 'Heron House', days: [{ date: '2026-10-29' }, { date: '2026-11-02' }, { date: '2026-11-05' }, { date: '2026-11-12' }] };

    function mockToken(dates: string[], sessions: unknown[] | null) {
        (supabase.rpc as any).mockImplementation(async (name: string) => {
            if (name === 'resolve_confirmation_token') {
                return { data: [{ course_id: 'c-1', course_date: dates[0], course_name: 'Safe Pass', course_dates: dates }], error: null } as any;
            }
            if (name === 'get_confirmation_sessions') {
                return sessions ? { data: sessions, error: null } as any : { data: null, error: { message: 'function does not exist' } } as any;
            }
            if (name === 'find_students_by_email') {
                return { data: [{ student_id: 's1', first_name: 'A', last_name: 'B' }], error: null } as any;
            }
            if (name === 'public_confirm_enrollment') {
                return { data: { success: true, message: 'Confirmed!' }, error: null } as any;
            }
            return { data: null, error: null } as any;
        });
    }

    beforeEach(() => {
        vi.clearAllMocks();
        window.history.pushState({}, 'Test', '/c/AbC1234');
    });

    it('shows every day, the time and the place of a multi-day course', async () => {
        mockToken(['2026-10-01'], [OCTOBER]);
        render(<ConfirmationPage />);

        const details = await screen.findByTestId('session-details');
        expect(details).toHaveTextContent(/Day 1\s*Thu,? 1 October 2026/);
        expect(details).toHaveTextContent(/Day 4\s*Thu,? 15 October 2026/);
        expect(details).toHaveTextContent('10:00 – 14:00');
        expect(details).toHaveTextContent('Heron House');
        expect(details).toHaveTextContent('Attendance on all 4 days is required.');
        expect(supabase.rpc).toHaveBeenCalledWith('get_confirmation_sessions', { p_token: 'AbC1234' });
    });

    it('offers multi-day options with their days, and the shared place once', async () => {
        mockToken(['2026-10-01', '2026-10-29'], [OCTOBER, NOVEMBER]);
        render(<ConfirmationPage />);

        const options = await screen.findAllByTestId('date-option');
        await waitFor(() => expect(options[0]).toHaveTextContent('Option 1'));
        expect(screen.getByText(/2 options available/)).toBeInTheDocument();
        expect(options[1]).toHaveTextContent(/Option 2.*Day 4\s*Thu,? 12 November 2026/);
        expect(screen.getAllByText('Heron House')).toHaveLength(1);
    });

    it('adds every course day to the calendar after confirming', async () => {
        mockToken(['2026-10-01'], [OCTOBER]);
        render(<ConfirmationPage />);
        await screen.findByTestId('session-details');

        fireEvent.change(screen.getByPlaceholderText(/enter registered email address/i), { target: { value: 'a@b.com' } });
        fireEvent.click(screen.getByRole('button', { name: /confirm my participation/i }));

        expect(await screen.findByText(/you're all set/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /apple \/ outlook \(\.ics\) — all 4 days/i })).toBeInTheDocument();
        const day2 = screen.getByRole('link', { name: /day 2/i });
        const url = new URL(day2.getAttribute('href')!);
        expect(url.searchParams.get('dates')).toBe('20261008T100000/20261008T140000');
        expect(url.searchParams.get('location')).toBe('Heron House');
        expect(url.searchParams.get('text')).toBe('Course: Safe Pass (Day 2 of 4)');
    });

    it('still works without a schedule (migration 79 not applied)', async () => {
        mockToken(['2026-10-01'], null);
        render(<ConfirmationPage />);
        expect(await screen.findByText('Safe Pass')).toBeInTheDocument();
        expect(screen.queryByTestId('session-details')).not.toBeInTheDocument();
    });
});
