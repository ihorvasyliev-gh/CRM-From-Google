import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { setupSleepAndWakeListener } from '../lib/realtimeSync';

/**
 * Global Supabase realtime subscription hook.
 *
 * Subscribes to postgres_changes on the enrollments, students, courses,
 * and employment_status tables and invalidates the relevant React Query caches
 * so that every page stays in sync without needing a manual refresh.
 *
 * Includes automatic wake-from-sleep detection, channel error recovery,
 * and cache invalidation on resume so data stays fresh.
 *
 * Mount this hook **once** at the App level.
 */
export function useGlobalRealtimeSync() {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const activeChannelRef = useRef<any>(null);
    const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const subscribeChannelRef = useRef<() => void>(() => {});
    const lastResyncRef = useRef<number>(0);
    const pendingResyncRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const subscribeChannel = useCallback(() => {
        if (!user) return;

        if (activeChannelRef.current) {
            try {
                supabase.removeChannel(activeChannelRef.current);
            } catch (e) {
                console.warn('[useGlobalRealtimeSync] Error removing channel:', e);
            }
            activeChannelRef.current = null;
        }

        const channel = supabase
            .channel('global_sync')
            // ─── Enrollments ─────────────────────────────────
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'enrollments' },
                (payload) => {
                    console.log('Realtime update: enrollments changed', payload);
                    queryClient.invalidateQueries({ queryKey: ['enrollments'], type: 'active' });
                    queryClient.invalidateQueries({ queryKey: ['dashboard_stats'], type: 'active' });
                    queryClient.invalidateQueries({ queryKey: ['outcomes_graduates'], type: 'active' });
                    queryClient.invalidateQueries({ queryKey: ['course_enrollment_counts'], type: 'active' });
                }
            )
            // ─── Students ───────────────────────────────────
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'students' },
                (payload) => {
                    console.log('Realtime update: students changed', payload);
                    queryClient.invalidateQueries({ queryKey: ['students'], type: 'active' });
                    queryClient.invalidateQueries({ queryKey: ['dashboard_stats'], type: 'active' });
                }
            )
            // ─── Courses ────────────────────────────────────
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'courses' },
                (payload) => {
                    console.log('Realtime update: courses changed', payload);
                    queryClient.invalidateQueries({ queryKey: ['courses'], type: 'active' });
                    queryClient.invalidateQueries({ queryKey: ['doc_courses'], type: 'active' });
                    queryClient.invalidateQueries({ queryKey: ['dashboard_stats'], type: 'active' });
                }
            )
            // ─── Employment Status ───────────────────────────
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'employment_status' },
                (payload) => {
                    console.log('Realtime update: employment_status changed', payload);
                    queryClient.invalidateQueries({ queryKey: ['outcomes_graduates'], type: 'active' });
                    queryClient.invalidateQueries({ queryKey: ['analytics_employment_statuses_v1'], type: 'active' });
                }
            )
            .subscribe((status, err) => {
                // Ignore late status callbacks from channels we already replaced/removed —
                // otherwise removing the old channel ("CLOSED") would schedule a pointless resubscribe loop.
                if (activeChannelRef.current !== channel) return;
                if (status === 'SUBSCRIBED') {
                    console.log('global_sync channel subscribed successfully');
                    if (retryTimeoutRef.current) {
                        clearTimeout(retryTimeoutRef.current);
                        retryTimeoutRef.current = null;
                    }
                } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                    console.error(`global_sync channel status ${status}:`, err);
                    if (!retryTimeoutRef.current) {
                        retryTimeoutRef.current = setTimeout(() => {
                            retryTimeoutRef.current = null;
                            subscribeChannelRef.current?.();
                        }, 5000);
                    }
                } else if ((status as string) === 'REJECTED') {
                    console.warn('global_sync channel subscription rejected:', err);
                }
            });

        activeChannelRef.current = channel;
    }, [queryClient, user]);

    useEffect(() => {
        subscribeChannelRef.current = subscribeChannel;
    }, [subscribeChannel]);

    useEffect(() => {
        if (!user) return;

        // Data was just fetched on mount — don't resync again on the very next focus event
        lastResyncRef.current = Date.now();
        subscribeChannel();

        // Listen for sleep/wake and custom reconnect events to resync data & channels.
        // Focus/visibility fire very often (every alt-tab), so they only trigger a resync when the
        // data is reasonably old; sleep gaps, network recovery and explicit reconnects always resync.
        // Bursts (focus + visibilitychange fire together) are coalesced into a single refetch.
        const SOFT_RESYNC_MIN_INTERVAL_MS = 60_000;
        const handleResync = (reason?: string) => {
            const isSoft = reason === 'focus' || reason === 'visibility';
            if (isSoft && Date.now() - lastResyncRef.current < SOFT_RESYNC_MIN_INTERVAL_MS) return;
            if (pendingResyncRef.current) return;

            pendingResyncRef.current = setTimeout(() => {
                pendingResyncRef.current = null;
                lastResyncRef.current = Date.now();
                console.log(`[useGlobalRealtimeSync] Resyncing active queries (source: ${reason || 'unknown'})`);
                queryClient.invalidateQueries({ type: 'active' });

                const channelState = activeChannelRef.current?.state;
                if (!isSoft || channelState !== 'joined') {
                    subscribeChannelRef.current?.();
                }
            }, 300);
        };

        const cleanupWake = setupSleepAndWakeListener((reason) => handleResync(reason));

        const handleCustomReconnect = () => handleResync('crm:realtime-reconnect');
        window.addEventListener('crm:realtime-reconnect', handleCustomReconnect);

        return () => {
            cleanupWake();
            window.removeEventListener('crm:realtime-reconnect', handleCustomReconnect);
            if (pendingResyncRef.current) {
                clearTimeout(pendingResyncRef.current);
                pendingResyncRef.current = null;
            }
            if (retryTimeoutRef.current) {
                clearTimeout(retryTimeoutRef.current);
                retryTimeoutRef.current = null;
            }
            if (activeChannelRef.current) {
                supabase.removeChannel(activeChannelRef.current);
                activeChannelRef.current = null;
            }
        };
    }, [queryClient, user, subscribeChannel]);
}
