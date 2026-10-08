import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useGlobalRealtimeSync } from './useGlobalRealtimeSync';
import { supabase } from '../lib/supabase';

type Handler = (payload: unknown) => void;
const handlers: Record<string, Handler> = {};
// The channel's subscribe callback (status changes)
const channelStatus: { cb?: (status: string, err?: unknown) => void } = {};

vi.mock('../lib/supabase', () => {
    const channel = {
        on: vi.fn((_type: string, filter: { table: string }, cb: Handler) => {
            handlers[filter.table] = cb;
            return channel;
        }),
        subscribe: vi.fn((cb: (status: string, err?: unknown) => void) => {
            channelStatus.cb = cb;
            return channel;
        }),
    };
    return {
        supabase: {
            channel: vi.fn(() => channel),
            // Like a channel that hasn't joined yet: phoenix reports "CLOSED" before removal returns
            removeChannel: vi.fn(() => channelStatus.cb?.('CLOSED')),
        },
    };
});

vi.mock('../contexts/AuthContext', () => ({
    useAuth: () => ({ user: { id: 'u-1' } }),
}));

vi.mock('../lib/realtimeSync', () => ({
    setupSleepAndWakeListener: () => () => {},
}));

const patchCachedEnrollments = vi.fn<(client: unknown, ids: string[]) => Promise<boolean>>();
vi.mock('../lib/enrollmentCache', () => ({
    ENROLLMENTS_KEY: ['enrollments'],
    patchCachedEnrollments: (client: unknown, ids: string[]) => patchCachedEnrollments(client, ids),
}));

function setup() {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { unmount } = renderHook(() => useGlobalRealtimeSync(), { wrapper });
    const invalidatedKeys = () => invalidate.mock.calls.map(([filters]) => (filters as { queryKey: string[] }).queryKey[0]);
    return { invalidate, invalidatedKeys, unmount };
}

describe('useGlobalRealtimeSync', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        patchCachedEnrollments.mockReset().mockResolvedValue(true);
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

    it('re-reads only the changed enrollments instead of reloading the list', async () => {
        const { invalidatedKeys } = setup();

        act(() => {
            handlers.enrollments({ eventType: 'UPDATE', new: { id: 'e-1' }, old: { id: 'e-1' } });
            handlers.enrollments({ eventType: 'INSERT', new: { id: 'e-2' }, old: {} });
            handlers.enrollments({ eventType: 'DELETE', new: {}, old: { id: 'e-3' } });
            handlers.enrollments({ eventType: 'UPDATE', new: { id: 'e-1' }, old: { id: 'e-1' } });
        });
        await act(async () => { vi.advanceTimersByTime(250); });

        expect(patchCachedEnrollments).toHaveBeenCalledTimes(1);
        expect(patchCachedEnrollments.mock.calls[0][1].sort()).toEqual(['e-1', 'e-2', 'e-3']);
        expect(invalidatedKeys()).not.toContain('enrollments');
        // The counts that depend on enrollments are still refreshed
        expect(invalidatedKeys()).toContain('dashboard_stats');
    });

    it('reloads the whole list when the changes could not be patched in', async () => {
        patchCachedEnrollments.mockResolvedValue(false);
        const { invalidatedKeys } = setup();

        act(() => { handlers.enrollments({ eventType: 'UPDATE', new: { id: 'e-1' } }); });
        await act(async () => { vi.advanceTimersByTime(250); });

        expect(patchCachedEnrollments).toHaveBeenCalledTimes(1);
        expect(invalidatedKeys()).toContain('enrollments');
    });

    it('reloads the whole list when an event in the burst has no row id', async () => {
        const { invalidatedKeys } = setup();

        act(() => {
            handlers.enrollments({ eventType: 'UPDATE', new: { id: 'e-1' } });
            handlers.enrollments({ eventType: 'UPDATE' });
        });
        await act(async () => { vi.advanceTimersByTime(250); });

        expect(patchCachedEnrollments).not.toHaveBeenCalled();
        expect(invalidatedKeys()).toContain('enrollments');

        // The next burst starts over with patching
        act(() => { handlers.enrollments({ eventType: 'UPDATE', new: { id: 'e-2' } }); });
        await act(async () => { vi.advanceTimersByTime(250); });
        expect(patchCachedEnrollments).toHaveBeenCalledWith(expect.anything(), ['e-2']);
    });

    it('does not take its own removal of the channel for a dropped connection', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const { unmount } = setup();
        vi.mocked(supabase.channel).mockClear();

        unmount();
        act(() => { vi.advanceTimersByTime(10_000); });

        expect(supabase.removeChannel).toHaveBeenCalled();
        expect(error).not.toHaveBeenCalled();
        expect(supabase.channel).not.toHaveBeenCalled(); // no resubscribe
        error.mockRestore();
    });
});
