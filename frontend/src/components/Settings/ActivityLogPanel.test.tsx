import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ActivityLogPanel, { type AuditLogEntry } from './ActivityLogPanel';
import { supabase } from '../../lib/supabase';

vi.mock('../../lib/supabase', () => ({
    supabase: {
        from: vi.fn(),
    },
}));

const mockFrom = vi.mocked(supabase.from);

interface QueryCallRecord {
    limitArg?: number;
    eqArgs: Array<[string, unknown]>;
    orArgs: string[];
}

function mockAuditQuerySequence(
    resolver: (call: QueryCallRecord, index: number) => Promise<{ data: AuditLogEntry[] | null; error: unknown }>,
) {
    const calls: QueryCallRecord[] = [];

    mockFrom.mockImplementation(() => {
        const index = calls.length;
        const record: QueryCallRecord = { eqArgs: [], orArgs: [] };
        calls.push(record);

        const builder: Record<string, any> = {
            select: vi.fn(() => builder),
            order: vi.fn(() => builder),
            limit: vi.fn((n: number) => {
                record.limitArg = n;
                return builder;
            }),
            eq: vi.fn((col: string, val: unknown) => {
                record.eqArgs.push([col, val]);
                return builder;
            }),
            or: vi.fn((filter: string) => {
                record.orArgs.push(filter);
                return builder;
            }),
            then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
                resolver(record, index).then(onFulfilled, onRejected),
        };
        return builder as never;
    });

    return calls;
}

function makeEntry(overrides: Partial<AuditLogEntry> & { id: string }): AuditLogEntry {
    return {
        created_at: '2026-05-12T10:15:00Z',
        actor_id: 'admin-1',
        actor_email: 'admin@example.ie',
        action: 'student.merge',
        entity_type: 'student',
        entity_id: 'stu-1',
        summary: 'Merged duplicate Alice Murphy',
        details: null,
        ...overrides,
    };
}

function renderPanel() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
        },
    });
    return render(
        <QueryClientProvider client={queryClient}>
            <ActivityLogPanel />
        </QueryClientProvider>,
    );
}

describe('ActivityLogPanel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders audit log entries with event badges, summaries, and actor emails (or System fallback)', async () => {
        const entries = [
            makeEntry({
                id: 'e1',
                action: 'student.merge',
                summary: 'Merged duplicate Alice Murphy',
                actor_email: 'ihor@example.ie',
            }),
            makeEntry({
                id: 'e2',
                action: 'student.delete',
                summary: 'Deleted student John Doe',
                actor_email: 'sarah@example.ie',
            }),
            makeEntry({
                id: 'e3',
                action: 'user.role_changed',
                summary: 'Promoted viewer to admin',
                actor_email: null,
            }),
        ];

        mockAuditQuerySequence(async () => ({ data: entries, error: null }));

        renderPanel();

        expect(await screen.findByText('Merged duplicate Alice Murphy')).toBeInTheDocument();
        expect(screen.getByText('Merged')).toBeInTheDocument();
        expect(screen.getByText('ihor@example.ie')).toBeInTheDocument();

        expect(screen.getByText('Deleted student John Doe')).toBeInTheDocument();
        expect(screen.getByText('Student deleted')).toBeInTheDocument();
        expect(screen.getByText('sarah@example.ie')).toBeInTheDocument();

        expect(screen.getByText('Promoted viewer to admin')).toBeInTheDocument();
        expect(screen.getByText('Role changed')).toBeInTheDocument();
        expect(screen.getByText('System')).toBeInTheDocument();
    });

    it('filters by event type using the action dropdown', async () => {
        const calls = mockAuditQuerySequence(async call => {
            const actionEq = call.eqArgs.find(([col]) => col === 'action')?.[1];
            if (actionEq === 'course.archived') {
                return {
                    data: [
                        makeEntry({
                            id: 'e-arch',
                            action: 'course.archived',
                            summary: 'Archived Barista course',
                            actor_email: 'ops@example.ie',
                        }),
                    ],
                    error: null,
                };
            }
            return {
                data: [makeEntry({ id: 'e-all', summary: 'Initial merge event' })],
                error: null,
            };
        });

        renderPanel();
        expect(await screen.findByText('Initial merge event')).toBeInTheDocument();

        const select = screen.getByLabelText('Filter by event type');
        fireEvent.change(select, { target: { value: 'course.archived' } });

        expect(await screen.findByText('Archived Barista course')).toBeInTheDocument();
        expect(screen.getByText('Course archived')).toBeInTheDocument();
        expect(calls[calls.length - 1].eqArgs).toContainEqual(['action', 'course.archived']);
    });

    it('debounces search input and applies escaped ilike filters across summary, actor_email, and action', async () => {
        const calls = mockAuditQuerySequence(async call => {
            if (call.orArgs.length > 0) {
                return {
                    data: [
                        makeEntry({
                            id: 'e-search',
                            action: 'email.opted_out',
                            summary: 'alice_100% opted out',
                            actor_email: 'alice@example.ie',
                        }),
                    ],
                    error: null,
                };
            }
            return {
                data: [makeEntry({ id: 'e-init', summary: 'Initial event' })],
                error: null,
            };
        });

        renderPanel();
        expect(await screen.findByText('Initial event')).toBeInTheDocument();

        const searchInput = screen.getByLabelText('Search activity log');
        fireEvent.change(searchInput, { target: { value: 'alice_100%' } });

        expect(await screen.findByText('alice_100% opted out')).toBeInTheDocument();
        expect(screen.getByText('Unsubscribed')).toBeInTheDocument();

        const lastOr = calls[calls.length - 1].orArgs[0];
        expect(lastOr).toBe(
            'summary.ilike.%alice\\_100\\%%,actor_email.ilike.%alice\\_100\\%%,action.ilike.%alice\\_100\\%%',
        );
    });

    it('paginates with "Load more events" when more than PAGE_SIZE rows are returned', async () => {
        const page1PlusSentinel = Array.from({ length: 41 }, (_, i) =>
            makeEntry({ id: `row-${i + 1}`, summary: `Audit event #${i + 1}` }),
        );
        const page2All = Array.from({ length: 45 }, (_, i) =>
            makeEntry({ id: `row-${i + 1}`, summary: `Audit event #${i + 1}` }),
        );

        const calls = mockAuditQuerySequence(async call => {
            if ((call.limitArg ?? 0) > 41) {
                return { data: page2All, error: null };
            }
            return { data: page1PlusSentinel, error: null };
        });

        renderPanel();

        expect(await screen.findByText('Audit event #1')).toBeInTheDocument();
        expect(screen.getByText('Audit event #40')).toBeInTheDocument();
        // The 41st sentinel row is sliced off
        expect(screen.queryByText('Audit event #41')).not.toBeInTheDocument();
        expect(calls[0].limitArg).toBe(41);

        const loadMoreBtn = screen.getByRole('button', { name: 'Load more events' });
        fireEvent.click(loadMoreBtn);

        expect(await screen.findByText('Audit event #45')).toBeInTheDocument();
        expect(calls[calls.length - 1].limitArg).toBe(81);

        // No more rows beyond 45 -> button disappears
        await waitFor(() => {
            expect(screen.queryByRole('button', { name: 'Load more events' })).not.toBeInTheDocument();
        });
    });

    it('shows graceful "Activity log not enabled yet" empty state when audit_log table is missing (PGRST205)', async () => {
        mockAuditQuerySequence(async () => ({
            data: null,
            error: { code: 'PGRST205', message: "Could not find the table 'public.audit_log'" },
        }));

        renderPanel();

        expect(await screen.findByText('Activity log not enabled yet')).toBeInTheDocument();
        expect(screen.getByText(/Run migration 100/i)).toBeInTheDocument();
    });

    it('renders an error card on unexpected query failure', async () => {
        mockAuditQuerySequence(async () => ({
            data: null,
            error: { code: '42501', message: 'permission denied for table audit_log' },
        }));

        renderPanel();

        expect(await screen.findByText('Could not load activity log. Please try again.')).toBeInTheDocument();
    });
});
