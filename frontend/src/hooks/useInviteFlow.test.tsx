import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useInviteFlow } from './useInviteFlow';
import type { EnrollmentRow } from './useEnrollments';

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
            upsert: () => Promise.resolve({ error: null }),
            update: () => ({
                in: () => Promise.resolve({ error: null })
            })
        }),
        rpc: () => Promise.resolve({ data: 'token-xyz', error: null })
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
