import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useInviteFlow } from './useInviteFlow';
import type { EnrollmentRow } from './useEnrollments';

const supabaseMocks = vi.hoisted(() => ({
    update: vi.fn(),
    upsert: vi.fn(),
    rpc: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
    supabase: {
        from: () => ({
            select: () => ({
                eq: () => ({
                    gte: () => ({
                        order: () => Promise.resolve({ data: [{ invite_date: '2026-08-26' }, { invite_date: '2026-08-27' }] })
                    })
                })
            }),
            upsert: (rows: unknown) => {
                supabaseMocks.upsert(rows);
                return Promise.resolve({ error: null });
            },
            update: (payload: unknown) => {
                supabaseMocks.update(payload);
                return { in: () => Promise.resolve({ error: null }) };
            }
        }),
        rpc: (name: string, args: unknown) => {
            supabaseMocks.rpc(name, args);
            return Promise.resolve({ data: 'token-xyz', error: null });
        }
    }
}));

const mockEnrollments: EnrollmentRow[] = [
    // 1. Active pending invite for 2026-08-26 (invited 1 day ago, 7 days limit)
    {
        id: 'en-1',
        student_id: 'st-1',
        course_id: 'c-1',
        status: 'invited',
        course_variant: null,
        notes: null,
        confirmed_date: null,
        confirmed_at: null,
        invited_date: '2026-08-26',
        invited_at: new Date(Date.now() - 1 * 86400000).toISOString(),
        completed_date: null,
        completed_at: null,
        is_priority: false,
        response_days: 7,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        students: null,
        courses: null
    },
    // 2. Expired invite for 2026-08-26 (invited 10 days ago, 7 days limit) -> should NOT count as pending
    {
        id: 'en-2',
        student_id: 'st-2',
        course_id: 'c-1',
        status: 'invited',
        course_variant: null,
        notes: null,
        confirmed_date: null,
        confirmed_at: null,
        invited_date: '2026-08-26',
        invited_at: new Date(Date.now() - 10 * 86400000).toISOString(),
        completed_date: null,
        completed_at: null,
        is_priority: false,
        response_days: 7,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        students: null,
        courses: null
    },
    // 3. Confirmed student for 2026-08-26
    {
        id: 'en-3',
        student_id: 'st-3',
        course_id: 'c-1',
        status: 'confirmed',
        course_variant: null,
        notes: null,
        confirmed_date: '2026-08-26',
        confirmed_at: new Date().toISOString(),
        invited_date: '2026-08-26',
        invited_at: new Date().toISOString(),
        completed_date: null,
        completed_at: null,
        is_priority: false,
        response_days: 7,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        students: null,
        courses: null
    },
    // 4. Confirmed student for 2026-08-26 (confirmed_date null, but invited_date 2026-08-26)
    {
        id: 'en-4',
        student_id: 'st-4',
        course_id: 'c-1',
        status: 'confirmed',
        course_variant: null,
        notes: null,
        confirmed_date: null,
        confirmed_at: new Date().toISOString(),
        invited_date: '2026-08-26',
        invited_at: new Date().toISOString(),
        completed_date: null,
        completed_at: null,
        is_priority: false,
        response_days: 7,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        students: null,
        courses: null
    },
    // 5. Active pending invite for another course c-2 on 2026-08-26 -> should be ignored when course is c-1
    {
        id: 'en-5',
        student_id: 'st-5',
        course_id: 'c-2',
        status: 'invited',
        course_variant: null,
        notes: null,
        confirmed_date: null,
        confirmed_at: null,
        invited_date: '2026-08-26',
        invited_at: new Date().toISOString(),
        completed_date: null,
        completed_at: null,
        is_priority: false,
        response_days: 7,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        students: null,
        courses: null
    },
    // 6. Confirmed student for 2026-08-27
    {
        id: 'en-6',
        student_id: 'st-6',
        course_id: 'c-1',
        status: 'confirmed',
        course_variant: null,
        notes: null,
        confirmed_date: '2026-08-27',
        confirmed_at: new Date().toISOString(),
        invited_date: '2026-08-27',
        invited_at: new Date().toISOString(),
        completed_date: null,
        completed_at: null,
        is_priority: false,
        response_days: 7,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        students: null,
        courses: null
    }
];

describe('useInviteFlow getDateStats', () => {
    function createWrapper() {
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false } }
        });
        return ({ children }: { children: React.ReactNode }) => (
            <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        );
    }

    it('correctly calculates pending and confirmed statistics for course dates', async () => {
        const { result } = renderHook(() => useInviteFlow({
            enrollments: mockEnrollments,
            setEnrollments: vi.fn(),
            clearSelection: vi.fn(),
            showToast: vi.fn()
        }), { wrapper: createWrapper() });

        // Open modal for enrollment en-1 (course c-1)
        await act(async () => {
            result.current.openInviteModal(['en-1'], false);
        });

        expect(result.current.targetCourseId).toBe('c-1');

        // Check date 2026-08-26:
        // - Active pending: en-1 (en-2 is expired, en-5 is course c-2) -> 1 pending
        // - Confirmed: en-3 and en-4 -> 2 confirmed
        const statsAug26 = result.current.getDateStats('2026-08-26');
        expect(statsAug26.pending).toBe(1);
        expect(statsAug26.confirmed).toBe(2);

        // Check date 2026-08-27:
        // - Active pending: 0
        // - Confirmed: en-6 -> 1 confirmed
        const statsAug27 = result.current.getDateStats('2026-08-27');
        expect(statsAug27.pending).toBe(0);
        expect(statsAug27.confirmed).toBe(1);

        // Check date with no enrollments
        const statsEmpty = result.current.getDateStats('2026-08-28');
        expect(statsEmpty.pending).toBe(0);
        expect(statsEmpty.confirmed).toBe(0);
    });

    it('handles legacy invitations without invited_at as active pending', async () => {
        const legacyEnrollments: EnrollmentRow[] = [
            {
                id: 'en-legacy',
                student_id: 'st-legacy',
                course_id: 'c-legacy',
                status: 'invited',
                course_variant: null,
                notes: null,
                confirmed_date: null,
                confirmed_at: null,
                invited_date: '2026-09-01',
                invited_at: null,
                completed_date: null,
                completed_at: null,
                is_priority: false,
                response_days: 7,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                students: null,
                courses: null
            }
        ];

        const { result } = renderHook(() => useInviteFlow({
            enrollments: legacyEnrollments,
            setEnrollments: vi.fn(),
            clearSelection: vi.fn(),
            showToast: vi.fn()
        }), { wrapper: createWrapper() });

        await act(async () => {
            result.current.openInviteModal(['en-legacy'], false);
        });

        const stats = result.current.getDateStats('2026-09-01');
        expect(stats.pending).toBe(1);
        expect(stats.confirmed).toBe(0);
    });
});

describe('useInviteFlow multi-date invitations', () => {
    function createWrapper() {
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false } }
        });
        return ({ children }: { children: React.ReactNode }) => (
            <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        );
    }

    function renderInviteFlow(enrollments: EnrollmentRow[] = mockEnrollments) {
        return renderHook(() => useInviteFlow({
            enrollments,
            setEnrollments: vi.fn(),
            clearSelection: vi.fn(),
            showToast: vi.fn()
        }), { wrapper: createWrapper() });
    }

    it('counts a multi-date invite as pending on every offered date', async () => {
        const multi: EnrollmentRow = {
            ...mockEnrollments[0],
            id: 'en-multi',
            invited_date: '2026-10-14',
            invited_dates: ['2026-10-14', '2026-10-15'],
            invited_at: new Date().toISOString(),
        };
        const { result } = renderInviteFlow([multi]);
        await act(async () => {
            result.current.openInviteModal(['en-multi'], false);
        });
        expect(result.current.getDateStats('2026-10-14').pending).toBe(1);
        expect(result.current.getDateStats('2026-10-15').pending).toBe(1);
        expect(result.current.getDateStats('2026-10-16').pending).toBe(0);
    });

    it('needs at least two dates before inviting', async () => {
        const { result } = renderInviteFlow();
        await act(async () => {
            result.current.openInviteModal(['en-1'], false);
        });
        act(() => result.current.setMultiDate(true));
        expect(result.current.canInvite).toBe(false);

        act(() => result.current.toggleInviteDate('2026-10-16'));
        expect(result.current.canInvite).toBe(false);

        act(() => result.current.toggleInviteDate('2026-10-14'));
        expect(result.current.inviteDates).toEqual(['2026-10-14', '2026-10-16']);
        expect(result.current.canInvite).toBe(true);

        act(() => result.current.toggleInviteDate('2026-10-16'));
        expect(result.current.inviteDates).toEqual(['2026-10-14']);
    });

    it('stores every offered date and keeps the earliest as invited_date', async () => {
        supabaseMocks.update.mockClear();
        supabaseMocks.upsert.mockClear();
        const { result } = renderInviteFlow();
        await act(async () => {
            result.current.openInviteModal(['en-1'], false);
        });
        act(() => {
            result.current.setMultiDate(true);
            result.current.toggleInviteDate('2026-10-15');
            result.current.toggleInviteDate('2026-10-14');
        });
        await act(async () => {
            await result.current.handleInviteWithDate();
        });

        await vi.waitFor(() => expect(supabaseMocks.update).toHaveBeenCalled());
        expect(supabaseMocks.update).toHaveBeenCalledWith(expect.objectContaining({
            status: 'invited',
            invited_date: '2026-10-14',
            invited_dates: ['2026-10-14', '2026-10-15'],
        }));
        expect(supabaseMocks.upsert).toHaveBeenCalledWith([
            { course_id: 'c-1', invite_date: '2026-10-14' },
            { course_id: 'c-1', invite_date: '2026-10-15' },
        ]);
    });

    it('clears invited_dates for a single-date invite', async () => {
        supabaseMocks.update.mockClear();
        const { result } = renderInviteFlow();
        await act(async () => {
            result.current.openInviteModal(['en-1'], false);
        });
        act(() => result.current.setInviteDate('2026-10-20'));
        await act(async () => {
            await result.current.handleInviteWithDate();
        });

        await vi.waitFor(() => expect(supabaseMocks.update).toHaveBeenCalled());
        expect(supabaseMocks.update).toHaveBeenCalledWith(expect.objectContaining({
            invited_date: '2026-10-20',
            invited_dates: null,
        }));
    });

    it('creates a multi-date confirmation token for Invite & Email', async () => {
        supabaseMocks.rpc.mockClear();
        vi.stubGlobal('ClipboardItem', class { constructor(public items: unknown) {} });
        const { result } = renderInviteFlow();
        await act(async () => {
            result.current.openInviteModal(['en-1'], false);
        });
        act(() => {
            result.current.setMultiDate(true);
            result.current.toggleInviteDate('2026-10-16');
            result.current.toggleInviteDate('2026-10-14');
            result.current.toggleInviteDate('2026-10-15');
        });
        await act(async () => {
            await result.current.handleInviteAndEmail();
        });

        expect(supabaseMocks.rpc).toHaveBeenCalledWith('create_confirmation_token_multi', {
            p_course_id: 'c-1',
            p_course_dates: ['2026-10-14', '2026-10-15', '2026-10-16'],
        });
        expect(supabaseMocks.rpc).not.toHaveBeenCalledWith('create_confirmation_token', expect.anything());
        vi.unstubAllGlobals();
    });

    it('sends a reminder to confirmed people only, without a confirm link or status change', async () => {
        supabaseMocks.rpc.mockClear();
        supabaseMocks.update.mockClear();
        vi.stubGlobal('ClipboardItem', class { constructor(public items: Record<string, Blob>) {} });
        const write = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', { value: { write }, configurable: true });
        const { result } = renderInviteFlow();
        // en-1 is only invited, en-3 confirmed for 26 Aug
        await act(async () => {
            await result.current.handleSendReminder(['en-1', 'en-3']);
        });

        expect(write).toHaveBeenCalledTimes(1);
        const html = await (write.mock.calls[0][0][0].items['text/html'] as Blob).text();
        expect(html).toContain('Your place is reserved');
        expect(html).toContain('26 Aug 2026');
        expect(html).not.toContain('Confirm My Place');
        expect(supabaseMocks.rpc).not.toHaveBeenCalled();
        expect(supabaseMocks.update).not.toHaveBeenCalled();
    });

    it('refuses a reminder for people on different dates', async () => {
        const write = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', { value: { write }, configurable: true });
        const { result } = renderInviteFlow();
        await act(async () => {
            await result.current.handleSendReminder(['en-3', 'en-6']);
        });
        expect(write).not.toHaveBeenCalled();
        vi.unstubAllGlobals();
    });
});
