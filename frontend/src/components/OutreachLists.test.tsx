import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import OutreachLists from './OutreachLists';
import type { OutreachContact, OutreachList } from '../hooks/useOutreach';
import type { EmailOptOut } from '../lib/emailOptOut';
import { subscribeToasts, type ToastData } from '../lib/toast';
import { OUTCOME_UNDO_MS } from '../lib/outcomeUndo';
import { copySurveyAndOpenMailto } from '../lib/surveyEmail';

vi.mock('../lib/surveyEmail', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../lib/surveyEmail')>();
    return {
        ...actual,
        copySurveyAndOpenMailto: vi.fn(async (args: Parameters<typeof actual.copySurveyAndOpenMailto>[0]) => {
            const note = args.skippedNoteText ?? '';
            args.showToast(
                `Status requests sent to ${args.emails.length} ${args.noun}(s). Template copied!${note}`,
                'success',
                args.toastOptions,
            );
        }),
    };
});

const mockDb = vi.hoisted(() => ({
    lists: [] as OutreachList[],
    contacts: [] as OutreachContact[],
    optOuts: [] as EmailOptOut[],
    rpcCalls: [] as { fn: string; params: Record<string, unknown> }[],
    updateCalls: [] as { table: string; payload: Record<string, unknown>; column: string; value: unknown }[],
    fetchContactsCount: 0,
}));

vi.mock('../lib/supabase', () => ({
    supabase: {
        rpc: vi.fn((fn: string, params: Record<string, unknown>) => {
            mockDb.rpcCalls.push({ fn, params });
            return Promise.resolve({ data: null, error: null });
        }),
        from: vi.fn((table: string) => ({
            select: vi.fn(() => {
                if (table === 'outreach_lists') {
                    return {
                        order: vi.fn(async () => ({ data: mockDb.lists, error: null })),
                    };
                }
                if (table === 'outreach_contacts_view') {
                    return {
                        eq: vi.fn(() => ({
                            order: vi.fn(() => ({
                                order: vi.fn(() => ({
                                    range: vi.fn(async (from: number, to: number) => {
                                        if (from === 0) mockDb.fetchContactsCount += 1;
                                        return { data: mockDb.contacts.slice(from, to + 1), error: null };
                                    }),
                                })),
                            })),
                        })),
                    };
                }
                if (table === 'email_opt_outs') {
                    return {
                        order: vi.fn(async () => ({ data: mockDb.optOuts, error: null })),
                        in: vi.fn(async (_col: string, values: string[]) => {
                            const lookup = new Set(values.map(v => v.toLowerCase()));
                            return {
                                data: mockDb.optOuts
                                    .filter(o => lookup.has(o.email.toLowerCase()))
                                    .map(o => ({ email: o.email.toLowerCase() })),
                                error: null,
                            };
                        }),
                    };
                }
                return {
                    order: vi.fn(async () => ({ data: [], error: null })),
                };
            }),
            update: vi.fn((payload: Record<string, unknown>) => ({
                eq: vi.fn((column: string, value: unknown) => {
                    mockDb.updateCalls.push({ table, payload, column, value });
                    return Promise.resolve({ error: null });
                }),
            })),
            delete: vi.fn(() => ({
                eq: vi.fn(async () => ({ error: null })),
            })),
        })),
    },
}));

const makeContact = (overrides: Partial<OutreachContact>): OutreachContact => ({
    id: 'c-default',
    list_id: 'list-1',
    first_name: 'Default',
    last_name: 'Person',
    email: 'default@example.com',
    phone: null,
    external_ref: null,
    notes: null,
    status: 'not_contacted',
    is_working: null,
    started_month: null,
    field_of_work: null,
    employment_type: null,
    last_invited_at: null,
    last_responded_at: null,
    called_no_answer_at: null,
    created_at: '2026-01-01T00:00:00Z',
    in_crm: false,
    ...overrides,
});

const SAMPLE_LIST: OutreachList = {
    id: 'list-1',
    name: 'Action 11',
    created_at: '2026-01-01T00:00:00Z',
};

const SAMPLE_CONTACTS: OutreachContact[] = [
    makeContact({
        id: 'c1',
        first_name: 'Alice',
        last_name: 'Byrne',
        email: 'alice@example.com',
        phone: '+353871112222',
        external_ref: 'IRIS-101',
        in_crm: true,
        status: 'responded',
        is_working: true,
        started_month: '2026-03',
        field_of_work: 'Hospitality',
        employment_type: 'full_time',
        last_responded_at: '2026-04-01T10:00:00Z',
    }),
    makeContact({
        id: 'c2',
        first_name: 'Bob',
        last_name: 'Kelly',
        email: 'bob@example.com',
        phone: '085 782 3299',
        external_ref: 'IRIS-102',
        in_crm: false,
        status: 'pending',
        is_working: false,
        last_invited_at: '2026-04-05T10:00:00Z',
        called_no_answer_at: '2026-04-06T12:00:00Z',
    }),
    makeContact({
        id: 'c3',
        first_name: 'Cara',
        last_name: 'Nolan',
        email: 'cara@example.com',
        phone: '+353861234567',
        external_ref: 'IRIS-103',
        status: 'not_contacted',
    }),
    makeContact({
        id: 'c4',
        first_name: 'Dan',
        last_name: 'Ryan',
        email: 'dan@unsub.ie',
        phone: null,
        external_ref: 'IRIS-104',
        status: 'not_contacted',
    }),
    makeContact({
        id: 'c5',
        first_name: 'Eve',
        last_name: 'Walsh',
        email: '',
        phone: '+353890001111',
        external_ref: 'IRIS-105',
        status: 'not_contacted',
    }),
];

function renderOutreach(props: Parameters<typeof OutreachLists>[0] = {}) {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
        },
    });
    return render(
        <QueryClientProvider client={queryClient}>
            <OutreachLists {...props} />
        </QueryClientProvider>,
    );
}

describe('OutreachLists', () => {
    let toasts: ToastData[] = [];
    let unsubscribeToasts: () => void;
    let clipboardWriteText: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();
        toasts = [];
        unsubscribeToasts = subscribeToasts(t => toasts.push(t));

        mockDb.lists = [SAMPLE_LIST];
        mockDb.contacts = SAMPLE_CONTACTS.map(c => ({ ...c }));
        mockDb.optOuts = [{ email: 'dan@unsub.ie', note: 'Requested opt-out', opted_out_at: '2026-03-10T00:00:00Z' }];
        mockDb.rpcCalls = [];
        mockDb.updateCalls = [];
        mockDb.fetchContactsCount = 0;

        clipboardWriteText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText: clipboardWriteText },
            configurable: true,
            writable: true,
        });
    });

    afterEach(() => {
        unsubscribeToasts();
    });

    it('renders clickable In CRM button when onOpenStudentByEmail is passed and static badge when omitted', async () => {
        const onOpenStudentByEmail = vi.fn();
        const { unmount } = renderOutreach({ onOpenStudentByEmail });

        await screen.findByText('Alice Byrne');
        const crmBtn = screen.getByRole('button', { name: 'In CRM' });
        expect(crmBtn).toHaveAttribute('title', 'Open student card in CRM');
        fireEvent.click(crmBtn);

        expect(onOpenStudentByEmail).toHaveBeenCalledTimes(1);
        expect(onOpenStudentByEmail).toHaveBeenCalledWith('alice@example.com');
        // Clicking the badge must not select the row
        expect(screen.queryByRole('button', { name: 'Clear selection' })).not.toBeInTheDocument();

        unmount();

        // Without onOpenStudentByEmail (e.g. outreach/viewer role): plain static span
        renderOutreach();
        await screen.findByText('Alice Byrne');
        const crmSpan = screen.getByText('In CRM');
        expect(crmSpan.tagName).toBe('SPAN');
        expect(screen.queryByRole('button', { name: 'In CRM' })).not.toBeInTheDocument();
    });

    it('renders accurate KPI tiles from computeOutcomeStats and filters on tile click', async () => {
        renderOutreach();

        await screen.findByText('Alice Byrne');

        // Contacts: 5 total, 3 not contacted
        const contactsTile = screen.getByRole('button', { name: /Contacts/i });
        expect(within(contactsTile).getByText('5')).toBeInTheDocument();
        expect(within(contactsTile).getByText('3 not contacted')).toBeInTheDocument();

        // Response rate: 2 answered (Alice + Bob previously answered) of 2 contacted = 100%
        const responseTile = screen.getByRole('button', { name: /Response rate/i });
        expect(within(responseTile).getByText('100%')).toBeInTheDocument();
        expect(within(responseTile).getByText('2 of 2 contacted')).toBeInTheDocument();

        // Currently working: 1 working of 2 answered = 50%
        const workingTile = screen.getByRole('button', { name: /Currently working/i });
        expect(within(workingTile).getByText('1')).toBeInTheDocument();
        expect(within(workingTile).getByText('50% of answered')).toBeInTheDocument();

        // Pending responses: 1 pending, incl. 1 follow-up (Bob)
        const pendingTile = screen.getByRole('button', { name: /Pending responses/i });
        expect(within(pendingTile).getByText('1')).toBeInTheDocument();
        expect(within(pendingTile).getByText('incl. 1 follow-up')).toBeInTheDocument();

        // Click "Currently working" -> shows only Alice and hides Calls filter group
        fireEvent.click(workingTile);
        expect(screen.getByText('Alice Byrne')).toBeInTheDocument();
        expect(screen.queryByText('Bob Kelly')).not.toBeInTheDocument();
        expect(screen.queryByRole('group', { name: 'Calls filter' })).not.toBeInTheDocument();

        // Click "Pending responses" -> shows only Bob and restores Calls filter group
        fireEvent.click(pendingTile);
        expect(screen.getByText('Bob Kelly')).toBeInTheDocument();
        expect(screen.queryByText('Alice Byrne')).not.toBeInTheDocument();
        expect(screen.getByRole('group', { name: 'Calls filter' })).toBeInTheDocument();

        // Click "Response rate" -> filters to responded (Alice) and hides Calls filter group
        fireEvent.click(responseTile);
        expect(screen.getByText('Alice Byrne')).toBeInTheDocument();
        expect(screen.queryByText('Cara Nolan')).not.toBeInTheDocument();
        expect(screen.queryByRole('group', { name: 'Calls filter' })).not.toBeInTheDocument();

        // Click "Contacts" -> resets all filters
        fireEvent.click(contactsTile);
        expect(screen.getByText('Alice Byrne')).toBeInTheDocument();
        expect(screen.getByText('Bob Kelly')).toBeInTheDocument();
        expect(screen.getByText('Cara Nolan')).toBeInTheDocument();
        expect(screen.getByText('Dan Ryan')).toBeInTheDocument();
        expect(screen.getByText('Eve Walsh')).toBeInTheDocument();
    });

    it('shows dash and empty hints on KPI tiles when no surveys have been sent yet', async () => {
        mockDb.contacts = [makeContact({ id: 'c-only', first_name: 'Nora', last_name: 'O\'Neill', email: 'nora@example.com' })];
        renderOutreach();

        await screen.findByText("Nora O'Neill");
        const responseTile = screen.getByRole('button', { name: /Response rate/i });
        expect(within(responseTile).getByText('—')).toBeInTheDocument();
        expect(within(responseTile).getByText('No surveys sent yet')).toBeInTheDocument();

        const workingTile = screen.getByRole('button', { name: /Currently working/i });
        expect(within(workingTile).getByText('No answers yet')).toBeInTheDocument();
    });

    it('supports Working/Not working filters, conflict prevention, phone search, email badges, and Since display', async () => {
        // Add a pending row with is_working=true & started_month to verify "Since" only shows for status==='responded'
        mockDb.contacts = [
            ...SAMPLE_CONTACTS,
            makeContact({
                id: 'c6',
                first_name: 'Fiona',
                last_name: 'Burke',
                email: 'fiona@example.com',
                status: 'pending',
                is_working: true,
                started_month: '2025-11',
            }),
        ];

        renderOutreach();
        await screen.findByText('Alice Byrne');

        // Unsubscribed and No email badges rendered from optOuts query and empty email
        expect(await screen.findByText('Unsubscribed')).toBeInTheDocument();
        expect(screen.getByText('No email')).toBeInTheDocument();

        // "Since" renders only for responded + working (Alice), not for pending (Fiona)
        expect(screen.getByText('Since Mar 2026')).toBeInTheDocument();
        expect(screen.queryByText('Since Nov 2025')).not.toBeInTheDocument();

        // Filter Not working -> shows Bob (previously not working)
        const employmentGroup = screen.getByRole('group', { name: 'Employment filter' });
        fireEvent.click(within(employmentGroup).getByRole('button', { name: /Not working/i }));
        expect(screen.getByText('Bob Kelly')).toBeInTheDocument();
        expect(screen.queryByText('Alice Byrne')).not.toBeInTheDocument();
        expect(screen.queryByText('Cara Nolan')).not.toBeInTheDocument();

        // Conflict prevention: choosing Not Contacted then Working resets status to All
        const statusGroup = screen.getByRole('group', { name: 'Status filter' });
        fireEvent.click(within(statusGroup).getByRole('button', { name: /Not Contacted/i }));
        expect(screen.getByText('Cara Nolan')).toBeInTheDocument();
        fireEvent.click(within(employmentGroup).getByRole('button', { name: /^Working/i }));
        expect(screen.getByText('Alice Byrne')).toBeInTheDocument();
        expect(within(statusGroup).getByRole('button', { name: /^All /i })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.queryByRole('group', { name: 'Calls filter' })).not.toBeInTheDocument();

        // Conflict prevention: choosing Called, no answer then Responded auto-resets Calls filter
        fireEvent.click(within(employmentGroup).getByRole('button', { name: /All employment/i }));
        const callsGroup = screen.getByRole('group', { name: 'Calls filter' });
        fireEvent.click(within(callsGroup).getByRole('button', { name: /Called, no answer/i }));
        expect(screen.getByText('Bob Kelly')).toBeInTheDocument();
        expect(screen.queryByText('Alice Byrne')).not.toBeInTheDocument();

        fireEvent.click(within(statusGroup).getByRole('button', { name: /Responded/i }));
        expect(screen.getByText('Alice Byrne')).toBeInTheDocument();
        expect(screen.queryByRole('group', { name: 'Calls filter' })).not.toBeInTheDocument();

        // Reset filters and test phone number search
        fireEvent.click(screen.getByRole('button', { name: /Clear filters/i }));
        const searchInput = screen.getByPlaceholderText('Name, email, phone, IRIS ID, field…');
        fireEvent.change(searchInput, { target: { value: '085 782' } });

        await waitFor(() => {
            expect(screen.getByText('Bob Kelly')).toBeInTheDocument();
            expect(screen.queryByText('Alice Byrne')).not.toBeInTheDocument();
            expect(screen.queryByText('Cara Nolan')).not.toBeInTheDocument();
        });
    });

    it('supports Shift+click range selection on both table rows and checkboxes without double-firing', async () => {
        renderOutreach();
        await screen.findByText('Alice Byrne');

        // 1) Row Shift+click: click Alice row, then Shift+click Dan row -> selects Alice, Bob, Cara, Dan (4)
        const aliceRow = screen.getByText('Alice Byrne').closest('tr')!;
        const danRow = screen.getByText('Dan Ryan').closest('tr')!;
        fireEvent.click(aliceRow);
        fireEvent.click(danRow, { shiftKey: true });

        expect(screen.getByLabelText('Select Alice Byrne')).toBeChecked();
        expect(screen.getByLabelText('Select Bob Kelly')).toBeChecked();
        expect(screen.getByLabelText('Select Cara Nolan')).toBeChecked();
        expect(screen.getByLabelText('Select Dan Ryan')).toBeChecked();
        expect(screen.getByLabelText('Select Eve Walsh')).not.toBeChecked();
        expect(screen.getByTitle('View selected list')).toHaveTextContent('4selected');

        // Clear selection via OutcomeBulkBar
        fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
        expect(screen.queryByTitle('View selected list')).not.toBeInTheDocument();

        // 2) Checkbox Shift+click: click Alice checkbox, then Shift+click Cara checkbox -> selects Alice, Bob, Cara (3)
        fireEvent.click(screen.getByLabelText('Select Alice Byrne'));
        fireEvent.click(screen.getByLabelText('Select Cara Nolan'), { shiftKey: true });

        expect(screen.getByLabelText('Select Alice Byrne')).toBeChecked();
        expect(screen.getByLabelText('Select Bob Kelly')).toBeChecked();
        expect(screen.getByLabelText('Select Cara Nolan')).toBeChecked();
        expect(screen.getByLabelText('Select Dan Ryan')).not.toBeChecked();
        expect(screen.getByTitle('View selected list')).toHaveTextContent('3selected');
    });

    it('Mark Pending skips Working, Unsubscribed, and No email contacts, does not open mailto, and Undo restores them', async () => {
        renderOutreach();
        await screen.findByText('Alice Byrne');

        // Select all 5 contacts
        fireEvent.click(screen.getByLabelText('Select all'));
        expect(screen.getByTitle('View selected list')).toHaveTextContent('5selected');

        // Click Mark Pending
        fireEvent.click(screen.getByRole('button', { name: /Mark Pending/i }));

        await waitFor(() => {
            expect(mockDb.rpcCalls).toHaveLength(1);
        });
        expect(mockDb.rpcCalls[0]).toEqual({
            fn: 'mark_outreach_contacts_pending',
            params: { p_ids: ['c2', 'c3'] },
        });
        // Must NOT open mailto
        expect(copySurveyAndOpenMailto).not.toHaveBeenCalled();

        const markToast = toasts.find(t => t.message.includes('Marked 2 contact(s) as pending'));
        expect(markToast).toBeDefined();
        expect(markToast?.type).toBe('success');
        expect(markToast?.message).toContain('1 already working');
        expect(markToast?.message).toContain('1 unsubscribed');
        expect(markToast?.message).toContain('1 without email');
        expect(markToast?.duration).toBe(OUTCOME_UNDO_MS);
        expect(markToast?.action?.label).toBe('Undo');

        // Selection cleared after marking
        await waitFor(() => {
            expect(screen.queryByTitle('View selected list')).not.toBeInTheDocument();
        });

        // Trigger Undo -> restores Bob and Cara to previous status & last_invited_at and refetches
        const fetchesBeforeUndo = mockDb.fetchContactsCount;
        markToast!.action!.onClick();

        await waitFor(() => {
            expect(mockDb.updateCalls).toHaveLength(2);
        });
        expect(mockDb.updateCalls).toEqual([
            {
                table: 'outreach_contacts',
                payload: { status: 'pending', last_invited_at: '2026-04-05T10:00:00Z' },
                column: 'id',
                value: 'c2',
            },
            {
                table: 'outreach_contacts',
                payload: { status: 'not_contacted', last_invited_at: null },
                column: 'id',
                value: 'c3',
            },
        ]);
        await waitFor(() => {
            expect(mockDb.fetchContactsCount).toBeGreaterThan(fetchesBeforeUndo);
            expect(toasts.some(t => t.message === 'Pending status undone' && t.type === 'success')).toBe(true);
        });
    });

    it('Send Email & Move to Pending skips ineligible contacts, opens BCC mailto, and Undo restores them', async () => {
        renderOutreach();
        await screen.findByText('Alice Byrne');

        fireEvent.click(screen.getByLabelText('Select all'));
        fireEvent.click(screen.getByRole('button', { name: /Send Email & Move to Pending/i }));

        await waitFor(() => {
            expect(mockDb.rpcCalls).toHaveLength(1);
        });
        expect(mockDb.rpcCalls[0]).toEqual({
            fn: 'mark_outreach_contacts_pending',
            params: { p_ids: ['c2', 'c3'] },
        });
        expect(copySurveyAndOpenMailto).toHaveBeenCalledTimes(1);
        expect(copySurveyAndOpenMailto).toHaveBeenCalledWith(expect.objectContaining({
            emails: ['bob@example.com', 'cara@example.com'],
            noun: 'contact',
            html: expect.stringContaining('/status?list=list-1'),
            skippedNoteText: ' · 1 already working, 1 unsubscribed, 1 without email skipped',
            toastOptions: expect.objectContaining({
                duration: OUTCOME_UNDO_MS,
                action: expect.objectContaining({ label: 'Undo' }),
            }),
        }));

        const sendToast = toasts.find(t => t.message.includes('Status requests sent to 2 contact(s)'));
        expect(sendToast).toBeDefined();
        expect(sendToast?.message).toContain('1 already working');
        expect(sendToast?.message).toContain('1 unsubscribed');
        expect(sendToast?.message).toContain('1 without email');
        expect(sendToast?.duration).toBe(OUTCOME_UNDO_MS);
        expect(sendToast?.action?.label).toBe('Undo');

        sendToast!.action!.onClick();
        await waitFor(() => {
            expect(mockDb.updateCalls).toHaveLength(2);
            expect(toasts.some(t => t.message === 'Pending status undone')).toBe(true);
        });
    });

    it('shows error toast and skips RPC when every selected contact is ineligible, while Copy Emails still includes working contacts', async () => {
        renderOutreach();
        await screen.findByText('Alice Byrne');

        // Select Alice (working), Dan (unsubscribed), Eve (no email)
        fireEvent.click(screen.getByLabelText('Select Alice Byrne'));
        fireEvent.click(screen.getByLabelText('Select Dan Ryan'));
        fireEvent.click(screen.getByLabelText('Select Eve Walsh'));

        // Mark Pending: everyone skipped
        fireEvent.click(screen.getByRole('button', { name: /Mark Pending/i }));
        await waitFor(() => {
            expect(toasts.some(t => t.type === 'error' && t.message.includes('already working'))).toBe(true);
        });
        expect(mockDb.rpcCalls).toHaveLength(0);

        // Copy Emails: includes working contact Alice, skips unsubscribed Dan and no-email Eve
        fireEvent.click(screen.getByRole('button', { name: 'Copy Emails' }));
        await waitFor(() => {
            expect(clipboardWriteText).toHaveBeenCalledWith('alice@example.com');
        });
        expect(toasts.some(t =>
            t.type === 'success'
            && t.message.includes('1 email(s) copied!')
            && t.message.includes('1 unsubscribed')
            && t.message.includes('1 without email'),
        )).toBe(true);
    });

    it('clears called_no_answer_at when saving Responded and preserves it when resetting to Not Contacted', async () => {
        renderOutreach();
        await screen.findByText('Bob Kelly');

        // Open OutcomeEditModal for Bob (who has called_no_answer_at set)
        const bobRow = screen.getByText('Bob Kelly').closest('tr')!;
        fireEvent.click(within(bobRow).getByRole('button', { name: /Status/i }));
        expect(await screen.findByText('Edit Employment Status')).toBeInTheDocument();

        // Save as Responded -> No (not working)
        fireEvent.click(screen.getByRole('button', { name: 'Responded' }));
        fireEvent.click(screen.getByRole('button', { name: 'No' }));
        fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

        await waitFor(() => {
            expect(mockDb.updateCalls).toHaveLength(1);
        });
        expect(mockDb.updateCalls[0]).toEqual({
            table: 'outreach_contacts',
            column: 'id',
            value: 'c2',
            payload: expect.objectContaining({
                status: 'responded',
                is_working: false,
                called_no_answer_at: null,
                last_responded_at: expect.any(String),
            }),
        });

        // Re-open OutcomeEditModal for Bob and reset to Not Contacted
        mockDb.updateCalls = [];
        fireEvent.click(within(bobRow).getByRole('button', { name: /Status/i }));
        expect(await screen.findByText('Edit Employment Status')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Not Contacted' }));
        fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

        await waitFor(() => {
            expect(mockDb.updateCalls).toHaveLength(1);
        });
        expect(mockDb.updateCalls[0]).toEqual({
            table: 'outreach_contacts',
            column: 'id',
            value: 'c2',
            payload: expect.objectContaining({
                status: 'not_contacted',
                last_invited_at: null,
                last_responded_at: null,
            }),
        });
        expect(mockDb.updateCalls[0].payload).not.toHaveProperty('called_no_answer_at');
    });
});
