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

    function mockDecline(report: (args: any) => any) {
        (supabase.rpc as any).mockImplementation(async (name: string, args: any) => {
            if (name === 'get_public_course_info') {
                return { data: [{ course_name: 'Python for Beginners', course_id: 'test-course-123' }], error: null } as any;
            }
            if (name === 'public_report_cant_attend') return report(args);
            return { data: null, error: null } as any;
        });
    }

    async function openDecline() {
        render(<ConfirmationPage />);
        fireEvent.click(await screen.findByRole('button', { name: /can't make it to this date/i }));
        expect(screen.getByRole('heading', { level: 1, name: /can't make it\?/i })).toBeInTheDocument();
    }

    it('records "can\'t make it" for the organizer without changing the place', async () => {
        mockDecline(() => ({ data: { success: true, first_name: 'Olena' }, error: null }));
        await openDecline();

        fireEvent.click(screen.getByLabelText(/keep me for a later date/i));
        fireEvent.change(screen.getByLabelText(/your email/i), { target: { value: 'olena@example.com' } });
        fireEvent.click(screen.getByRole('button', { name: /send my answer/i }));

        expect(await screen.findByRole('heading', { name: /thanks for letting us know, olena/i })).toBeInTheDocument();
        expect(screen.getByText(/new invitation when there's another date/i)).toBeInTheDocument();
        expect(supabase.rpc).toHaveBeenCalledWith('public_report_cant_attend', {
            p_email: 'olena@example.com',
            p_course_id: 'test-course-123',
            p_reason: 'other_date',
            p_student_id: null,
        });
        // The old RPC changed the status itself and stays closed (migrations 53, 64)
        expect(supabase.rpc).not.toHaveBeenCalledWith('public_decline_enrollment', expect.anything());
    });

    it('asks for an answer and an email before sending', async () => {
        mockDecline(() => ({ data: { success: true }, error: null }));
        await openDecline();

        fireEvent.click(screen.getByRole('button', { name: /send my answer/i }));

        expect(screen.getByText('Choose one of the options')).toBeInTheDocument();
        expect(screen.getByText('Enter your email address')).toBeInTheDocument();
        expect(screen.getByLabelText(/your email/i)).toHaveAttribute('aria-invalid', 'true');
        await waitFor(() => expect(screen.getByLabelText(/keep me for a later date/i)).toHaveFocus());
        expect(supabase.rpc).not.toHaveBeenCalledWith('public_report_cant_attend', expect.anything());
    });

    it('asks who can\'t come when several people share the email', async () => {
        mockDecline((args) => args.p_student_id
            ? { data: { success: true, first_name: args.p_student_id === 's2' ? 'Taras' : 'Olena' }, error: null }
            : { data: { success: false, code: 'choose_person', people: [
                { student_id: 's1', first_name: 'Olena', last_name: 'Melnyk' },
                { student_id: 's2', first_name: 'Taras', last_name: 'Melnyk' },
            ] }, error: null });
        await openDecline();

        fireEvent.click(screen.getByLabelText(/no longer interested/i));
        fireEvent.change(screen.getByLabelText(/your email/i), { target: { value: 'melnyk@example.com' } });
        fireEvent.click(screen.getByRole('button', { name: /send my answer/i }));

        fireEvent.click(await screen.findByLabelText('Taras Melnyk'));
        fireEvent.click(screen.getByRole('button', { name: /send my answer/i }));

        expect(await screen.findByRole('heading', { name: /thanks for letting us know, taras/i })).toBeInTheDocument();
        expect(supabase.rpc).toHaveBeenCalledWith('public_report_cant_attend', {
            p_email: 'melnyk@example.com',
            p_course_id: 'test-course-123',
            p_reason: 'not_interested',
            p_student_id: 's2',
        });
        expect(supabase.rpc).not.toHaveBeenCalledWith('public_report_cant_attend', expect.objectContaining({ p_student_id: 's1' }));
    });

    it('says so under the email when it has no invitation for the course', async () => {
        mockDecline(() => ({ data: { success: false, code: 'not_found', message: 'We could not find an invitation for this course with this email.' }, error: null }));
        await openDecline();

        fireEvent.click(screen.getByLabelText(/keep me for a later date/i));
        fireEvent.change(screen.getByLabelText(/your email/i), { target: { value: 'other@example.com' } });
        fireEvent.click(screen.getByRole('button', { name: /send my answer/i }));

        expect(await screen.findByText(/could not find an invitation/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/your email/i)).toHaveAttribute('aria-invalid', 'true');
        expect(screen.queryByText(/thanks for letting us know/i)).not.toBeInTheDocument();
    });

    it('offers ready-to-send emails when the answer can\'t be saved (migration 89 not applied)', async () => {
        const mockWriteText = vi.fn();
        Object.assign(navigator, { clipboard: { writeText: mockWriteText } });
        mockDecline(() => ({ data: null, error: { message: 'Could not find the function public.public_report_cant_attend' } }));
        await openDecline();

        fireEvent.click(screen.getByLabelText(/keep me for a later date/i));
        fireEvent.change(screen.getByLabelText(/your email/i), { target: { value: 'student@example.com' } });
        fireEvent.click(screen.getByRole('button', { name: /send my answer/i }));

        const waitlistLink = await screen.findByRole('link', { name: /keep me on the waiting list/i });
        const cancelLink = screen.getByRole('link', { name: /no longer interested in this course/i });
        expect(waitlistLink.getAttribute('href')).toContain('mailto:ivasyliev@partnershipcork.ie');
        expect(waitlistLink.getAttribute('href')).toContain('Waiting%20list');
        expect(cancelLink.getAttribute('href')).toContain('mailto:ivasyliev@partnershipcork.ie');
        expect(cancelLink.getAttribute('href')).toContain('Cancel');
        expect(decodeURIComponent(waitlistLink.getAttribute('href') || '')).toContain('student@example.com');

        fireEvent.click(screen.getByRole('button', { name: /copy address/i }));
        expect(mockWriteText).toHaveBeenCalledWith('ivasyliev@partnershipcork.ie');
        expect(screen.getByText('Copied!')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /back to confirmation/i }));
        expect(screen.getByRole('button', { name: /confirm my participation/i })).toBeInTheDocument();
        expect(screen.getByLabelText(/your email/i)).toHaveValue('student@example.com');
    });

    it('shows what to fix under the email instead of sending', async () => {
        mockDecline(() => ({ data: null, error: null }));
        render(<ConfirmationPage />);

        const input = await screen.findByLabelText(/your email/i);
        fireEvent.change(input, { target: { value: 'not-an-email' } });
        fireEvent.click(screen.getByRole('button', { name: /confirm my participation/i }));

        expect(screen.getByText(/enter an email address like/i)).toBeInTheDocument();
        expect(input).toHaveAttribute('aria-invalid', 'true');
        await waitFor(() => expect(input).toHaveFocus());
        expect(supabase.rpc).not.toHaveBeenCalledWith('public_confirm_enrollment', expect.anything());
    });

    it('links the place to Google Maps', async () => {
        (supabase.rpc as any).mockImplementation(async (name: string) => {
            if (name === 'resolve_confirmation_token') {
                return { data: [{ course_id: 'c-1', course_date: '2026-10-15', course_name: 'Safe Pass', course_dates: ['2026-10-15'] }], error: null } as any;
            }
            if (name === 'get_confirmation_sessions') {
                return { data: [{ course_date: '2026-10-15', start_time: '10:00', end_time: '14:00', location: 'Heron House, Blackpool' }], error: null } as any;
            }
            return { data: null, error: null } as any;
        });
        window.history.pushState({}, 'Test', '/c/AbC1234');
        render(<ConfirmationPage />);

        const link = await screen.findByRole('link', { name: /directions to heron house/i });
        expect(link.getAttribute('href')).toBe('https://www.google.com/maps/search/?api=1&query=Heron%20House%2C%20Blackpool%2C%20Cork%2C%20Ireland');
        expect(link).toHaveAttribute('target', '_blank');
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

        const input = await screen.findByLabelText(/your email/i);
        fireEvent.change(input, { target: { value: 'a@b.com' } });
        fireEvent.click(screen.getByRole('button', { name: /confirm my participation/i }));

        expect(await screen.findByText(/all places for this date have been taken/i)).toBeInTheDocument();
    });

    function mockFullCourse({ pending = [] as any[], capacity = [true] as boolean[], confirm = { success: true, message: 'Your attendance has already been confirmed!' } as any, confirmedSession = null as any[] | null } = {}) {
        // Each capacity lookup takes the next value; the last one repeats
        let lookups = 0;
        (supabase.rpc as any).mockImplementation(async (name: string) => {
            if (name === 'get_public_course_info') {
                return { data: [{ course_name: 'Python for Beginners' }], error: null } as any;
            }
            if (name === 'get_course_capacity') {
                const full = capacity[Math.min(lookups++, capacity.length - 1)];
                return { data: [{ max_capacity: 10, confirmed_count: full ? 10 : 9, is_full: full }], error: null } as any;
            }
            if (name === 'find_students_by_email') {
                return { data: pending, error: null } as any;
            }
            if (name === 'public_confirm_enrollment') {
                return { data: confirm, error: null } as any;
            }
            if (name === 'get_confirmed_session') {
                return { data: confirmedSession, error: null } as any;
            }
            return { data: null, error: null } as any;
        });
    }

    async function checkPlace(emailAddress: string) {
        fireEvent.change(await screen.findByLabelText(/your email/i), { target: { value: emailAddress } });
        fireEvent.click(screen.getByRole('button', { name: /check my place/i }));
    }

    it('shows their place to someone already in the group when the course date is full', async () => {
        mockFullCourse();
        render(<ConfirmationPage />);

        await checkPlace('a@b.com');

        expect(await screen.findByText(/you're all set/i)).toBeInTheDocument();
        expect(screen.getByText('Your attendance has already been confirmed!')).toBeInTheDocument();
        expect(screen.getByText(/15 October 2026/)).toBeInTheDocument();
        expect(supabase.rpc).toHaveBeenCalledWith('public_confirm_enrollment', {
            p_email: 'a@b.com',
            p_course_id: 'test-course-123',
            p_student_id: null,
        });
    });

    it('shows the date, time and place the person is actually confirmed for', async () => {
        mockFullCourse({ confirmedSession: [{ course_date: '2026-10-22', start_time: '09:00', end_time: '16:30', location: 'Heron House', days: null }] });
        render(<ConfirmationPage />);

        await checkPlace('a@b.com');

        expect(await screen.findByText(/you're all set/i)).toBeInTheDocument();
        expect(screen.getByText(/22 October 2026/)).toBeInTheDocument();
        expect(screen.queryByText(/15 October 2026/)).not.toBeInTheDocument();
        expect(screen.getByText(/09:00/)).toBeInTheDocument();
        expect(screen.getByText('Heron House')).toBeInTheDocument();
        expect(supabase.rpc).toHaveBeenCalledWith('get_confirmed_session', {
            p_email: 'a@b.com',
            p_course_id: 'test-course-123',
            p_student_id: null,
        });
    });

    it('shows the time and place of the confirmed date after confirming', async () => {
        mockFullCourse({
            capacity: [false],
            pending: [{ student_id: 's1', first_name: 'A', last_name: 'B' }],
            confirm: { success: true, message: 'Your attendance has been confirmed!' },
            confirmedSession: [{ course_date: '2026-10-15', start_time: '10:00', end_time: '14:00', location: 'Heron House', days: null }],
        });
        render(<ConfirmationPage />);

        fireEvent.change(await screen.findByLabelText(/your email/i), { target: { value: 'a@b.com' } });
        fireEvent.click(screen.getByRole('button', { name: /confirm my participation/i }));

        expect(await screen.findByText(/you're all set/i)).toBeInTheDocument();
        expect(screen.getByText(/15 October 2026/)).toBeInTheDocument();
        expect(screen.getByText(/10:00/)).toBeInTheDocument();
        expect(screen.getByText('Heron House')).toBeInTheDocument();
        expect(supabase.rpc).toHaveBeenCalledWith('get_confirmed_session', {
            p_email: 'a@b.com',
            p_course_id: 'test-course-123',
            p_student_id: 's1',
        });
    });

    it('tells someone with no place yet that the group is full, without confirming anything', async () => {
        mockFullCourse({ pending: [{ student_id: 's1', first_name: 'A', last_name: 'B' }] });
        render(<ConfirmationPage />);

        await checkPlace('a@b.com');

        expect(await screen.findByText(/doesn't have a place in this group yet/i)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /priority for the next course/i })).toBeInTheDocument();
        expect(supabase.rpc).not.toHaveBeenCalledWith('public_confirm_enrollment', expect.anything());
    });

    it('opens the confirmation form when a place has come free since the page loaded', async () => {
        mockFullCourse({ pending: [{ student_id: 's1', first_name: 'A', last_name: 'B' }], capacity: [true, false] });
        render(<ConfirmationPage />);

        await checkPlace('a@b.com');

        expect(await screen.findByRole('button', { name: /confirm my participation/i })).toBeInTheDocument();
        expect(screen.getByLabelText(/your email/i)).toHaveValue('a@b.com');
        expect(supabase.rpc).not.toHaveBeenCalledWith('public_confirm_enrollment', expect.anything());
    });

    it('shows the reason when the email has no place on the course', async () => {
        mockFullCourse({ confirm: { success: false, message: 'No pending invitation found for this course. Please contact the organizer.' } });
        render(<ConfirmationPage />);

        await checkPlace('a@b.com');

        expect(await screen.findByText(/no pending invitation found/i)).toBeInTheDocument();
        expect(screen.queryByText(/you're all set/i)).not.toBeInTheDocument();
    });
});

describe('ConfirmationPage multi-date invitation', () => {
    const DATES = ['2026-10-14', '2026-10-15', '2026-10-16'];

    function mockMultiDate({ fullDates = [] as string[], confirm, pending = [{ student_id: 's1', first_name: 'A', last_name: 'B' }], confirmedSession = null }: { fullDates?: string[]; confirm?: (args: any) => any; pending?: any[]; confirmedSession?: any[] | null } = {}) {
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
                return { data: pending, error: null } as any;
            }
            if (name === 'public_confirm_enrollment') {
                return { data: confirm ? confirm(args) : { success: true, message: 'Confirmed!' }, error: null } as any;
            }
            if (name === 'get_confirmed_session') {
                return { data: confirmedSession, error: null } as any;
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

        const input = screen.getByLabelText(/your email/i);
        fireEvent.change(input, { target: { value: 'a@b.com' } });
        expect(screen.getByRole('button', { name: /confirm my participation/i })).toBeDisabled();
        expect(screen.getByRole('button', { name: /none of these dates work for me/i })).toBeInTheDocument();
    });

    it('sends the chosen date and shows it on the success screen', async () => {
        mockMultiDate();
        render(<ConfirmationPage />);

        const radios = await screen.findAllByRole('radio');
        fireEvent.click(radios[1]);
        fireEvent.change(screen.getByLabelText(/your email/i), { target: { value: 'a@b.com' } });
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

    it('lets someone already in the group check their place when every offered date is full', async () => {
        mockMultiDate({
            fullDates: DATES,
            pending: [],
            confirm: () => ({ success: true, message: 'Your attendance has already been confirmed!' }),
            confirmedSession: [{ course_date: '2026-10-16', start_time: '18:00', end_time: '20:00', location: 'Room 4', days: null }],
        });
        render(<ConfirmationPage />);

        fireEvent.change(await screen.findByLabelText(/your email/i), { target: { value: 'a@b.com' } });
        fireEvent.click(screen.getByRole('button', { name: /check my place/i }));

        expect(await screen.findByText(/you're all set/i)).toBeInTheDocument();
        expect(screen.getByText(/16 October 2026/)).toBeInTheDocument();
        expect(screen.getByText('Room 4')).toBeInTheDocument();
        expect(supabase.rpc).toHaveBeenCalledWith('public_confirm_enrollment', {
            p_email: 'a@b.com',
            p_course_id: 'c-1',
            p_student_id: null,
        });
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
        fireEvent.change(screen.getByLabelText(/your email/i), { target: { value: 'a@b.com' } });
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

        fireEvent.change(screen.getByLabelText(/your email/i), { target: { value: 'a@b.com' } });
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
