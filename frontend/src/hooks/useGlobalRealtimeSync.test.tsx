import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useGlobalRealtimeSync } from './useGlobalRealtimeSync';

type Handler = (payload: unknown) => void;
const handlers: Record<string, Handler> = {};

vi.mock('../lib/supabase', () => {
    const channel = {
        on: vi.fn((_type: string, filter: { table: string }, cb: Handler) => {
            handlers[filter.table] = cb;
            return channel;
        }),
        subscribe: vi.fn(() => channel),
    };
    return {
        supabase: {
            channel: vi.fn(() => channel),
            removeChannel: vi.fn(),
        },
    };
});

vi.mock('../contexts/AuthContext', () => ({
    useAuth: () => ({ user: { id: 'u-1' } }),
}));

vi.mock('../lib/realtimeSync', () => ({
    setupSleepAndWakeListener: () => () => {},
}));

function setup() {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    renderHook(() => useGlobalRealtimeSync(), { wrapper });
    const invalidatedKeys = () => invalidate.mock.calls.map(([filters]) => (filters as { queryKey: string[] }).queryKey[0]);
    return { invalidate, invalidatedKeys };
}

describe('useGlobalRealtimeSync', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('coalesces a burst of realtime events into one invalidation per query key', () => {
        const { invalidate, invalidatedKeys } = setup();

        act(() => {
            for (let i = 0; i < 30; i++) handlers.enrollments({ eventType: 'UPDATE' });
            handlers.students({ eventType: 'UPDATE' });
        });
        expect(invalidate).not.toHaveBeenCalled();

        act(() => { vi.advanceTimersByTime(250); });

        expect(invalidatedKeys().sort()).toEqual(
            [
                'course_enrollment_counts', 'dashboard_stats', 'enrollments', 'outcomes_graduates', 'students',
                'viewer_courses', 'viewer_course_roster', 'viewer_upcoming_courses', 'viewer_students_directory', 'restricted_student_detail',
            ].sort()
        );
    });

    it('does not hold updates back for more than ~1s during a continuous burst', () => {
        const { invalidatedKeys } = setup();

        // An event every 200ms keeps resetting the 250ms debounce
        for (let t = 0; t <= 1000; t += 200) {
            act(() => {
                handlers.enrollments({ eventType: 'UPDATE' });
                vi.advanceTimersByTime(200);
            });
        }

        expect(invalidatedKeys()).toContain('enrollments');
    });
});
