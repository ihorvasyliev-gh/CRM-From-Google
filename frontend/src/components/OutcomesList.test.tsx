import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import OutcomesList, { type GraduateRow } from './OutcomesList';
import { fetchGraduatesFn } from '../hooks/useOutcomes';
import { fetchOptedOutEmails, listEmailOptOutsSafe } from '../lib/emailOptOut';
import { copyEligibleEmails, copySurveyAndOpenMailto } from '../lib/surveyEmail';
import { OUTCOME_UNDO_MS, restoreGraduatesFromPending } from '../lib/outcomeUndo';
import { showToast } from '../lib/toast';
import { supabase } from '../lib/supabase';
import { todayISO } from '../lib/dateUtils';
import { shiftDays, shiftMonths } from '../lib/outcomeCompletionDate';

const mockOutreachLists = vi.fn();

vi.mock('./OutreachLists', () => ({
    default: (props: { onOpenStudentByEmail?: (email: string) => void }) => {
        mockOutreachLists(props);
        return <div data-testid="outreach-lists-stub">External Lists View</div>;
    },
}));

vi.mock('../hooks/useOutcomes', () => ({
    fetchGraduatesFn: vi.fn(),
}));

vi.mock('../lib/emailOptOut', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../lib/emailOptOut')>();
    return {
        ...actual,
        listEmailOptOutsSafe: vi.fn(),
        fetchOptedOutEmails: vi.fn(),
    };
});

vi.mock('../lib/surveyEmail', () => ({
    copyEligibleEmails: vi.fn(),
    copySurveyAndOpenMailto: vi.fn(),
}));

vi.mock('../lib/outcomeUndo', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../lib/outcomeUndo')>();
    return {
        ...actual,
        restoreGraduatesFromPending: vi.fn(),
    };
});

vi.mock('../lib/toast', () => ({
    showToast: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
    supabase: {
        rpc: vi.fn(),
        from: vi.fn(),
    },
}));

const TODAY = todayISO();
const DATE_5D_AGO = shiftDays(TODAY, -5);
const DATE_10D_AGO = shiftDays(TODAY, -10);
const DATE_2M_AGO = shiftMonths(TODAY, -2);
const DATE_4M_AGO = shiftMonths(TODAY, -4);
const DATE_8M_AGO = shiftMonths(TODAY, -8);
const DATE_14M_AGO = shiftMonths(TODAY, -14);

const SAMPLE_GRADUATES: GraduateRow[] = [
    {
        student_id: 's1',
        first_name: 'Alice',
        last_name: 'Adams',
        email: 'alice@example.com',
        phone: '+353871112222',
        courses: ['Safe Pass'],
        is_working: true,
        started_month: '2026-04',
        field_of_work: 'IT',
        employment_type: 'full_time',
        status_updated_at: '2026-09-10T10:00:00Z',
        tracking_status: 'responded',
        last_sent_at: '2026-09-01T10:00:00Z',
        called_no_answer_at: null,
        last_completed_date: DATE_5D_AGO,
        course_completed_dates: { 'Safe Pass': DATE_5D_AGO },
    },
    {
        student_id: 's2',
        first_name: 'Brian',
        last_name: 'Byrne',
        email: 'brian@example.com',
        phone: '+353852223333',
        courses: ['First Aid'],
        is_working: false,
        started_month: null,
        field_of_work: null,
        employment_type: null,
        status_updated_at: '2026-09-12T10:00:00Z',
        tracking_status: 'responded',
        last_sent_at: '2026-09-01T10:00:00Z',
        called_no_answer_at: null,
        last_completed_date: DATE_2M_AGO,
        course_completed_dates: { 'First Aid': DATE_2M_AGO },
    },
    {
        student_id: 's3',
        first_name: 'Cara',
        last_name: 'Collins',
        email: 'cara@example.com',
        phone: '+353863334444',
        courses: ['Safe Pass', 'Manual Handling'],
        is_working: false,
        started_month: '2025-11',
        field_of_work: null,
        employment_type: null,
        status_updated_at: '2026-08-01T10:00:00Z',
        tracking_status: 'pending',
        last_sent_at: '2026-10-01T10:00:00Z',
        called_no_answer_at: null,
        last_completed_date: DATE_10D_AGO,
        course_completed_dates: {
            'Safe Pass': DATE_8M_AGO,
            'Manual Handling': DATE_10D_AGO,
        },
    },
    {
        student_id: 's4',
        first_name: 'David',
        last_name: 'Doyle',
        email: 'david@example.com',
        phone: '+353874445555',
        courses: ['First Aid'],
        is_working: null,
        started_month: null,
        field_of_work: null,
        employment_type: null,
        status_updated_at: null,
        tracking_status: 'pending',
        last_sent_at: '2026-10-02T10:00:00Z',
        called_no_answer_at: '2026-10-05T10:00:00Z',
        last_completed_date: DATE_4M_AGO,
        course_completed_dates: { 'First Aid': DATE_4M_AGO },
    },
    {
        student_id: 's5',
        first_name: 'Eva',
        last_name: 'Egan',
        email: '',
        phone: '+353835556666',
        courses: ['Manual Handling'],
        is_working: null,
        started_month: null,
        field_of_work: null,
        employment_type: null,
        status_updated_at: null,
        tracking_status: 'not_contacted',
        last_sent_at: null,
        called_no_answer_at: null,
        last_completed_date: DATE_14M_AGO,
        course_completed_dates: { 'Manual Handling': DATE_14M_AGO },
    },
    {
        student_id: 's6',
        first_name: 'Frank',
        last_name: 'Flynn',
        email: 'frank@example.com',
        phone: '+353876667777',
        courses: ['First Aid'],
        is_working: null,
        started_month: null,
        field_of_work: null,
        employment_type: null,
        status_updated_at: null,
        tracking_status: 'not_contacted',
        last_sent_at: null,
        called_no_answer_at: null,
        last_completed_date: null,
        course_completed_dates: { 'First Aid': null },
    },
];

function renderOutcomes(props: {
    onOpenStudentDetail?: (studentId: string) => void;
    onOpenStudentByEmail?: (email: string) => void;
} = {}) {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    return render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter>
                <OutcomesList {...props} />
            </MemoryRouter>
        </QueryClientProvider>,
    );
}

describe('OutcomesList', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.sessionStorage.clear();
        window.history.replaceState({}, '', '/outcomes');

        vi.mocked(fetchGraduatesFn).mockResolvedValue(SAMPLE_GRADUATES);
        vi.mocked(listEmailOptOutsSafe).mockResolvedValue([
            { email: 'david@example.com', note: 'Requested removal', opted_out_at: '2026-09-01T00:00:00Z' },
        ]);
        vi.mocked(fetchOptedOutEmails).mockResolvedValue(new Set(['david@example.com']));
        vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as never);
        vi.mocked(restoreGraduatesFromPending).mockResolvedValue(undefined);
        vi.mocked(copySurveyAndOpenMailto).mockResolvedValue(undefined);
        vi.mocked(copyEligibleEmails).mockResolvedValue(undefined);
    });

    it('computes accurate KPIs from contacted/answered graduates and supports clickable KPI filtering', async () => {
        renderOutcomes();
        await screen.findByText('Alice Adams');

        // 4 contacted (s1, s2, s3, s4), 3 answered (s1, s2, s3) => 75% response rate
        // 1 working of 3 answered => 33% employment rate; 2 pending incl. 1 follow-up (s3); 2 not contacted
        const totalTile = screen.getByRole('button', { name: /Total graduates/i });
        expect(totalTile).toHaveTextContent('6');
        expect(totalTile).toHaveTextContent('2 not contacted');

        const responseTile = screen.getByRole('button', { name: /Response rate/i });
        expect(responseTile).toHaveTextContent('75%');
        expect(responseTile).toHaveTextContent('3 of 4 contacted');

        const workingTile = screen.getByRole('button', { name: /Currently working/i });
        expect(workingTile).toHaveTextContent('1');
        expect(workingTile).toHaveTextContent('33% of answered');

        const pendingTile = screen.getByRole('button', { name: /Pending responses/i });
        expect(pendingTile).toHaveTextContent('2');
        expect(pendingTile).toHaveTextContent('incl. 1 follow-up');

        // Click Currently working tile -> only Alice Adams
        fireEvent.click(workingTile);
        expect(screen.getByText('1 of 6 graduates')).toBeInTheDocument();
        expect(screen.getByText('Alice Adams')).toBeInTheDocument();
        expect(screen.queryByText('Brian Byrne')).not.toBeInTheDocument();

        // Click Pending responses tile -> Cara Collins & David Doyle
        fireEvent.click(pendingTile);
        expect(screen.getByText('2 of 6 graduates')).toBeInTheDocument();
        expect(screen.getByText('Cara Collins')).toBeInTheDocument();
        expect(screen.getByText('David Doyle')).toBeInTheDocument();
        expect(screen.queryByText('Alice Adams')).not.toBeInTheDocument();

        // Click Response rate tile -> Responded only (Alice & Brian)
        fireEvent.click(responseTile);
        expect(screen.getByText('2 of 6 graduates')).toBeInTheDocument();
        expect(screen.getByText('Alice Adams')).toBeInTheDocument();
        expect(screen.getByText('Brian Byrne')).toBeInTheDocument();

        // Click Total graduates tile -> resets filters back to all 6
        fireEvent.click(totalTile);
        expect(screen.getByText('6 of 6 graduates')).toBeInTheDocument();
    });

    it('renders always-visible filters, prevents 0-row conflict with Calls, and searches by phone and course', async () => {
        renderOutcomes();
        await screen.findByText('Alice Adams');

        // Filters are immediately visible (no hidden toggle required)
        const statusGroup = screen.getByRole('group', { name: 'Filter by status' });
        const employmentGroup = screen.getByRole('group', { name: 'Filter by employment' });
        const callsGroup = screen.getByRole('group', { name: 'Filter by calls' });

        // Select "Called, no answer" -> shows David Doyle
        fireEvent.click(within(callsGroup).getByRole('button', { name: /Called, no answer/i }));
        expect(screen.getByText('1 of 6 graduates')).toBeInTheDocument();
        expect(screen.getByText('David Doyle')).toBeInTheDocument();

        // Switch Employment to Working -> auto-resets Calls, hides Calls group, shows Alice (NOT 0 rows)
        fireEvent.click(within(employmentGroup).getByRole('button', { name: /^Working \(1\)$/ }));
        expect(screen.queryByRole('group', { name: 'Filter by calls' })).not.toBeInTheDocument();
        expect(screen.getByText('1 of 6 graduates')).toBeInTheDocument();
        expect(screen.getByText('Alice Adams')).toBeInTheDocument();

        // Reset Employment to All -> Calls group returns and is reset to All calls
        fireEvent.click(within(employmentGroup).getByRole('button', { name: 'All' }));
        expect(screen.getByRole('group', { name: 'Filter by calls' })).toBeInTheDocument();
        expect(screen.getByText('6 of 6 graduates')).toBeInTheDocument();

        // Select Called, no answer again then click Responded -> auto-resets Calls, hides Calls group
        fireEvent.click(within(screen.getByRole('group', { name: 'Filter by calls' })).getByRole('button', { name: /Called, no answer/i }));
        fireEvent.click(within(statusGroup).getByRole('button', { name: /Responded/i }));
        expect(screen.queryByRole('group', { name: 'Filter by calls' })).not.toBeInTheDocument();
        expect(screen.getByText('2 of 6 graduates')).toBeInTheDocument();

        // Reset to All, click Not Contacted then Not working -> resets Status to All and shows Brian & Cara (both Not working + re-sent pending)
        fireEvent.click(within(statusGroup).getByRole('button', { name: /Not Contacted/i }));
        fireEvent.click(within(employmentGroup).getByRole('button', { name: /Not working \(2\)/i }));
        expect(screen.getByText('2 of 6 graduates')).toBeInTheDocument();
        expect(screen.getByText('Brian Byrne')).toBeInTheDocument();
        expect(screen.getByText('Cara Collins')).toBeInTheDocument();

        // Clear filters
        fireEvent.click(screen.getByRole('button', { name: /Clear/i }));
        expect(screen.getByText('6 of 6 graduates')).toBeInTheDocument();

        // Phone search "087" matches Alice, David, Frank
        const search = screen.getByLabelText('Search graduates');
        fireEvent.change(search, { target: { value: '087' } });
        await waitFor(() => expect(screen.getByText('3 of 6 graduates')).toBeInTheDocument());
        expect(screen.getByText('Alice Adams')).toBeInTheDocument();
        expect(screen.getByText('David Doyle')).toBeInTheDocument();
        expect(screen.getByText('Frank Flynn')).toBeInTheDocument();

        // Course search "manual handling" matches Cara & Eva
        fireEvent.change(search, { target: { value: 'manual handling' } });
        await waitFor(() => expect(screen.getByText('2 of 6 graduates')).toBeInTheDocument());
        expect(screen.getByText('Cara Collins')).toBeInTheDocument();
        expect(screen.getByText('Eva Egan')).toBeInTheDocument();

        // Clear search and test course dropdown
        fireEvent.change(search, { target: { value: '' } });
        await waitFor(() => expect(screen.getByText('6 of 6 graduates')).toBeInTheDocument());
        fireEvent.change(screen.getByLabelText('Filter by course'), { target: { value: 'Safe Pass' } });
        expect(screen.getByText('2 of 6 graduates')).toBeInTheDocument();
        expect(screen.getByText('Alice Adams')).toBeInTheDocument();
        expect(screen.getByText('Cara Collins')).toBeInTheDocument();
    });

    it('renders Unsubscribed and No email badges on rows and Previously: Not working without Since on pending rows', async () => {
        // Also test a pending graduate with is_working=true and started_month to confirm Since never shows on pending
        vi.mocked(fetchGraduatesFn).mockResolvedValue([
            ...SAMPLE_GRADUATES,
            {
                student_id: 's7',
                first_name: 'Grace',
                last_name: 'Green',
                email: 'grace@example.com',
                phone: null,
                courses: ['First Aid'],
                is_working: true,
                started_month: '2025-10',
                field_of_work: 'Retail',
                employment_type: 'part_time',
                status_updated_at: null,
                tracking_status: 'pending',
                last_sent_at: '2026-10-03T10:00:00Z',
                called_no_answer_at: null,
                last_completed_date: DATE_2M_AGO,
                course_completed_dates: { 'First Aid': DATE_2M_AGO },
            },
        ]);

        renderOutcomes();
        await screen.findByText('Alice Adams');

        const davidRow = screen.getByText('David Doyle').closest('tr')!;
        expect(within(davidRow).getByText('Unsubscribed')).toBeInTheDocument();

        const evaRow = screen.getByText('Eva Egan').closest('tr')!;
        expect(within(evaRow).getByText('No email')).toBeInTheDocument();

        const aliceRow = screen.getByText('Alice Adams').closest('tr')!;
        expect(within(aliceRow).queryByText('Unsubscribed')).not.toBeInTheDocument();
        expect(within(aliceRow).queryByText('No email')).not.toBeInTheDocument();
        expect(within(aliceRow).getByText(/Since Apr 2026/i)).toBeInTheDocument();

        // Re-sent Not working shows "Previously: Not working" (never "No data" or "Since ...")
        const caraRow = screen.getByText('Cara Collins').closest('tr')!;
        expect(within(caraRow).getAllByText('Previously: Not working').length).toBeGreaterThan(0);
        expect(within(caraRow).queryByText('No data')).not.toBeInTheDocument();
        expect(within(caraRow).queryByText(/Since /i)).not.toBeInTheDocument();

        // Pending row with is_working=true must also NOT show "Since ..."
        const graceRow = screen.getByText('Grace Green').closest('tr')!;
        expect(within(graceRow).getAllByText(/Previously: Working · Part-time/i).length).toBeGreaterThan(0);
        expect(within(graceRow).queryByText(/Since /i)).not.toBeInTheDocument();
    });

    it('opens student detail on name click without selecting row, and supports Shift+click range selection', async () => {
        const onOpenStudentDetail = vi.fn();
        renderOutcomes({ onOpenStudentDetail });
        await screen.findByText('Alice Adams');

        // Clicking student name calls onOpenStudentDetail and does NOT select row
        fireEvent.click(screen.getByRole('button', { name: 'Alice Adams' }));
        expect(onOpenStudentDetail).toHaveBeenCalledWith('s1');
        expect(screen.getByLabelText('Select Alice Adams')).not.toBeChecked();
        expect(screen.queryByRole('button', { name: /Mark Pending/i })).not.toBeInTheDocument();

        // Select Alice (s1), then Shift+click Cara (s3) -> selects Alice, Brian, Cara
        fireEvent.click(screen.getByLabelText('Select Alice Adams'));
        expect(screen.getByLabelText('Select Alice Adams')).toBeChecked();

        fireEvent.click(screen.getByLabelText('Select Cara Collins'), { shiftKey: true });
        expect(screen.getByLabelText('Select Alice Adams')).toBeChecked();
        expect(screen.getByLabelText('Select Brian Byrne')).toBeChecked();
        expect(screen.getByLabelText('Select Cara Collins')).toBeChecked();
        expect(screen.getByLabelText('Select David Doyle')).not.toBeChecked();

        // Bulk bar shows 3 selected
        expect(screen.getByTitle('View selected list')).toHaveTextContent('3selected');
    });

    it('Send Email & Move to Pending skips Working/Unsubscribed/No email and supports Undo restore', async () => {
        renderOutcomes();
        await screen.findByText('Alice Adams');

        // Select all 6 graduates
        fireEvent.click(screen.getByLabelText('Select all shown graduates'));
        fireEvent.click(screen.getByRole('button', { name: /Send Email & Move to Pending/i }));

        await waitFor(() => expect(supabase.rpc).toHaveBeenCalledTimes(1));
        expect(supabase.rpc).toHaveBeenCalledWith('mark_students_outcomes_pending', {
            p_student_ids: ['s2', 's3', 's6'],
        });

        expect(copySurveyAndOpenMailto).toHaveBeenCalledTimes(1);
        const callArg = vi.mocked(copySurveyAndOpenMailto).mock.calls[0][0];
        expect(callArg.emails).toEqual(['brian@example.com', 'cara@example.com', 'frank@example.com']);
        expect(callArg.skippedNoteText).toBe(' · 1 already working, 1 unsubscribed, 1 without email skipped');
        expect(callArg.toastOptions?.duration).toBe(OUTCOME_UNDO_MS);
        expect(callArg.toastOptions?.action?.label).toBe('Undo');

        // Trigger Undo and verify snapshots are restored
        callArg.toastOptions!.action!.onClick();
        await waitFor(() => expect(restoreGraduatesFromPending).toHaveBeenCalledTimes(1));
        expect(restoreGraduatesFromPending).toHaveBeenCalledWith([
            { student_id: 's2', had_row: true, tracking_status: 'responded', last_sent_at: '2026-09-01T10:00:00Z' },
            { student_id: 's3', had_row: true, tracking_status: 'pending', last_sent_at: '2026-10-01T10:00:00Z' },
            { student_id: 's6', had_row: false, tracking_status: 'not_contacted', last_sent_at: null },
        ]);
        await waitFor(() => expect(showToast).toHaveBeenCalledWith('Pending status undone', 'info'));
    });

    it('Mark Pending skips Working/Unsubscribed/No email without opening mailto and supports Undo', async () => {
        renderOutcomes();
        await screen.findByText('Alice Adams');

        fireEvent.click(screen.getByLabelText('Select all shown graduates'));
        fireEvent.click(screen.getByRole('button', { name: 'Mark Pending' }));

        await waitFor(() => expect(supabase.rpc).toHaveBeenCalledTimes(1));
        expect(supabase.rpc).toHaveBeenCalledWith('mark_students_outcomes_pending', {
            p_student_ids: ['s2', 's3', 's6'],
        });
        expect(copySurveyAndOpenMailto).not.toHaveBeenCalled();

        expect(showToast).toHaveBeenCalledWith(
            'Marked 3 graduate(s) as pending. · 1 already working, 1 unsubscribed, 1 without email skipped',
            'success',
            expect.objectContaining({
                duration: OUTCOME_UNDO_MS,
                action: expect.objectContaining({ label: 'Undo' }),
            }),
        );

        const undoAction = vi.mocked(showToast).mock.calls[0][2]!.action!;
        undoAction.onClick();
        await waitFor(() => expect(restoreGraduatesFromPending).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(showToast).toHaveBeenCalledWith('Pending status undone', 'info'));
    });

    it('shows error toast without calling RPC when every selected graduate is skipped, and Copy Emails keeps Working people', async () => {
        renderOutcomes();
        await screen.findByText('Alice Adams');

        // Select Alice (working) + David (unsubscribed) + Eva (no email)
        fireEvent.click(screen.getByLabelText('Select Alice Adams'));
        fireEvent.click(screen.getByLabelText('Select David Doyle'));
        fireEvent.click(screen.getByLabelText('Select Eva Egan'));

        // Copy Emails still includes Working (Alice), skipping unsubscribed & no email
        fireEvent.click(screen.getByRole('button', { name: 'Copy Emails' }));
        await waitFor(() => expect(copyEligibleEmails).toHaveBeenCalledTimes(1));
        expect(copyEligibleEmails).toHaveBeenCalledWith(
            ['alice@example.com'],
            showToast,
            ' · 1 unsubscribed, 1 without email skipped',
        );

        // Mark Pending skips all three and does not call RPC
        fireEvent.click(screen.getByRole('button', { name: 'Mark Pending' }));
        await waitFor(() => expect(showToast).toHaveBeenCalledWith(
            'Everyone selected was skipped (already working, unsubscribed, missing an email) — nothing was updated.',
            'error',
        ));
        expect(supabase.rpc).not.toHaveBeenCalled();
    });

    it('switches to External Lists tab and forwards onOpenStudentByEmail to OutreachLists', async () => {
        const onOpenStudentByEmail = vi.fn();
        renderOutcomes({ onOpenStudentByEmail });
        await screen.findByText('Alice Adams');

        fireEvent.click(screen.getByRole('tab', { name: /External Lists/i }));
        expect(screen.getByTestId('outreach-lists-stub')).toBeInTheDocument();
        expect(mockOutreachLists).toHaveBeenCalledWith({ onOpenStudentByEmail });
    });

    it('preserves called_no_answer_at when saving Not Contacted, deletes otherwise, and clears call mark when Responded', async () => {
        const updateEq = vi.fn().mockResolvedValue({ error: null });
        const update = vi.fn().mockReturnValue({ eq: updateEq });
        const deleteEq = vi.fn().mockResolvedValue({ error: null });
        const del = vi.fn().mockReturnValue({ eq: deleteEq });
        const upsert = vi.fn().mockResolvedValue({ error: null });
        vi.mocked(supabase.from).mockReturnValue({ update, delete: del, upsert } as never);

        renderOutcomes();
        await screen.findByText('David Doyle');

        // 1. David Doyle has called_no_answer_at -> saving Not Contacted updates row instead of deleting
        const davidRow = screen.getByText('David Doyle').closest('tr')!;
        fireEvent.click(within(davidRow).getByRole('button', { name: /Status/i }));
        fireEvent.click(screen.getByRole('button', { name: 'Not Contacted' }));
        fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

        await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
        expect(update).toHaveBeenCalledWith({
            status: 'not_contacted',
            is_working: null,
            started_month: null,
            field_of_work: null,
            employment_type: null,
            last_invited_at: null,
            last_responded_at: null,
        });
        expect(updateEq).toHaveBeenCalledWith('student_id', 's4');
        expect(del).not.toHaveBeenCalled();

        // 2. Cara Collins has no call mark -> saving Not Contacted deletes row
        const caraRow = screen.getByText('Cara Collins').closest('tr')!;
        fireEvent.click(within(caraRow).getByRole('button', { name: /Status/i }));
        fireEvent.click(screen.getByRole('button', { name: 'Not Contacted' }));
        fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

        await waitFor(() => expect(del).toHaveBeenCalledTimes(1));
        expect(deleteEq).toHaveBeenCalledWith('student_id', 's3');

        // 3. Marking David Doyle as Responded + Working clears called_no_answer_at
        fireEvent.click(within(davidRow).getByRole('button', { name: /Status/i }));
        fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
        fireEvent.click(screen.getByRole('button', { name: 'Self-employed' }));
        fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

        await waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
        expect(upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                student_id: 's4',
                email: 'david@example.com',
                status: 'responded',
                is_working: true,
                employment_type: 'self_employed',
                called_no_answer_at: null,
                last_responded_at: expect.any(String),
            }),
            { onConflict: 'student_id' },
        );
    });

    it('filters graduates by course completion date (recent, older, per-course, and custom range) and sorts by Completed', async () => {
        renderOutcomes();
        await screen.findByText('Alice Adams');

        const dateSelect = screen.getByLabelText('Filter by completion date');
        const courseSelect = screen.getByLabelText('Filter by course');

        // 1. Recent: Last 30 days -> Alice (5d ago) & Cara (Manual Handling 10d ago)
        fireEvent.change(dateSelect, { target: { value: 'recent_30d' } });
        expect(screen.getByText('2 of 6 graduates')).toBeInTheDocument();
        expect(screen.getByText('Alice Adams')).toBeInTheDocument();
        expect(screen.getByText('Cara Collins')).toBeInTheDocument();
        expect(screen.queryByText('Brian Byrne')).not.toBeInTheDocument();

        // 2. Older: Over 3 months ago -> David (4m ago) & Eva (14m ago); Frank (no date) excluded
        fireEvent.change(dateSelect, { target: { value: 'older_3m' } });
        expect(screen.getByText('2 of 6 graduates')).toBeInTheDocument();
        expect(screen.getByText('David Doyle')).toBeInTheDocument();
        expect(screen.getByText('Eva Egan')).toBeInTheDocument();
        expect(screen.queryByText('Frank Flynn')).not.toBeInTheDocument();

        // 3. Older: Over 1 year ago -> only Eva (14m ago)
        fireEvent.change(dateSelect, { target: { value: 'older_1y' } });
        expect(screen.getByText('1 of 6 graduates')).toBeInTheDocument();
        expect(screen.getByText('Eva Egan')).toBeInTheDocument();

        // 4. Combining Course + Completion Date uses that course's own completion date:
        //    Cara completed Safe Pass 8 months ago (even though Manual Handling was 10 days ago)
        fireEvent.change(courseSelect, { target: { value: 'Safe Pass' } });
        fireEvent.change(dateSelect, { target: { value: 'older_6m' } });
        expect(screen.getByText('1 of 6 graduates')).toBeInTheDocument();
        expect(screen.getByText('Cara Collins')).toBeInTheDocument();
        expect(screen.queryByText('Alice Adams')).not.toBeInTheDocument();

        // Clear resets both Course and Completion date filters
        fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
        expect(screen.getByText('6 of 6 graduates')).toBeInTheDocument();
        expect(dateSelect).toHaveValue('all');
        expect(courseSelect).toHaveValue('all');

        // 5. Custom date range shows From/To inputs and filters inclusively
        fireEvent.change(dateSelect, { target: { value: 'custom' } });
        const customGroup = screen.getByRole('group', { name: 'Custom completion date range' });
        expect(customGroup).toBeInTheDocument();
        expect(screen.getByText('6 of 6 graduates')).toBeInTheDocument();

        // Pick "Today" as From -> no one completed today (Alice was 5 days ago), so 0 matches
        fireEvent.click(within(customGroup).getByLabelText('From'));
        fireEvent.click(screen.getByRole('button', { name: 'Today' }));
        expect(screen.getByText('0 of 6 graduates')).toBeInTheDocument();

        // Reset dates brings back all 6 while staying in custom mode
        fireEvent.click(within(customGroup).getByRole('button', { name: 'Reset dates' }));
        expect(screen.getByText('6 of 6 graduates')).toBeInTheDocument();

        // Clear exits custom mode back to "all"
        fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
        expect(screen.queryByRole('group', { name: 'Custom completion date range' })).not.toBeInTheDocument();

        // 6. Sorting by Completed column header: first click newest first, second click oldest first, missing date always last
        const completedHeader = screen.getByRole('button', { name: 'Completed' });
        const rowNames = () => screen.getAllByRole('row').slice(1).map(r => r.textContent || '');

        fireEvent.click(completedHeader);
        expect(rowNames().map(t => t.match(/Alice Adams|Cara Collins|Brian Byrne|David Doyle|Eva Egan|Frank Flynn/)?.[0])).toEqual([
            'Alice Adams',
            'Cara Collins',
            'Brian Byrne',
            'David Doyle',
            'Eva Egan',
            'Frank Flynn',
        ]);

        fireEvent.click(completedHeader);
        expect(rowNames().map(t => t.match(/Alice Adams|Cara Collins|Brian Byrne|David Doyle|Eva Egan|Frank Flynn/)?.[0])).toEqual([
            'Eva Egan',
            'David Doyle',
            'Brian Byrne',
            'Cara Collins',
            'Alice Adams',
            'Frank Flynn',
        ]);
    });
});
