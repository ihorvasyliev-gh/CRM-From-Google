import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { setupSleepAndWakeListener } from '../lib/realtimeSync';
import { ENROLLMENTS_KEY, patchCachedEnrollments } from '../lib/enrollmentCache';

/**
 * Global Supabase realtime subscription hook.
 *
 * Subscribes to postgres_changes on the enrollments, students, courses, employment_status,
 * outreach and student_flags tables and invalidates the relevant React Query caches
 * so that every page stays in sync without needing a manual refresh. Changed enrollments are
 * re-read one by one into the cached list rather than reloading all of them.
 *
 * A dropped channel is rebuilt, and once it is live again everything is reloaded: changes made
 * while it was down are never sent. Waking from sleep and coming back online rebuild it the same
 * way. A return to the tab only reloads when something was missed (or, as a safety net, when the
 * last reload is old): reloading every enrollment on each switch back from Outlook made the app
 * slow to come back to.
 *
 * Mount this hook **once** at the App level.
 */
// Viewer portal caches that depend on enrollment rows
const VIEWER_ENROLLMENT_KEYS = ['viewer_courses', 'viewer_course_roster', 'viewer_upcoming_courses', 'viewer_students_directory', 'restricted_student_detail'];

/** A return to the tab with a live channel reloads everything at most this often (safety net). */
const SOFT_RESYNC_MIN_INTERVAL_MS = 10 * 60_000;
/** A rebuilt channel that isn't live by then: reload anyway (realtime down, the API may be up). */
const REJOIN_RESYNC_FALLBACK_MS = 5_000;

/** The changed row's id: `new` for inserts and updates, `old` for deletes. */
function changedRowId(payload: unknown): string | undefined {
    const { new: next, old } = (payload ?? {}) as { new?: { id?: unknown }; old?: { id?: unknown } };
    const id = next?.id ?? old?.id;
    return typeof id === 'string' ? id : undefined;
}

export function useGlobalRealtimeSync() {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const activeChannelRef = useRef<RealtimeChannel | null>(null);
    const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const subscribeChannelRef = useRef<() => void>(() => {});
    const lastResyncRef = useRef<number>(0);
    const pendingResyncRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Changes may have been missed (the channel dropped, or is being rebuilt): reload everything
    // once it is live again
    const needsResyncRef = useRef(false);
    const fallbackResyncRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Realtime events arrive in bursts (a bulk action on 30 enrollments = 30 events). Each
    // invalidation cancels the in-flight refetch and starts a new full-table fetch, so without
    // coalescing a burst meant dozens of back-to-back requests and board re-renders.
    const pendingKeysRef = useRef<Set<string>>(new Set());
    const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const burstStartRef = useRef<number>(0);
    // Enrollments changed in this burst: only these rows are re-read into the cached list
    // (null: an event without an id, so the whole list is reloaded)
    const pendingEnrollmentIdsRef = useRef<Set<string> | null>(new Set());

    const flushInvalidations = useCallback(() => {
        flushTimerRef.current = null;
        burstStartRef.current = 0;
        const keys = Array.from(pendingKeysRef.current);
        pendingKeysRef.current.clear();
        const enrollmentIds = pendingEnrollmentIdsRef.current;
        pendingEnrollmentIdsRef.current = new Set();
        // Not just the active queries: a page that isn't open (the board while on Students) would
        // otherwise show its old data when opened again within its staleTime
        keys.forEach(key => {
            if (key === ENROLLMENTS_KEY[0] && enrollmentIds) {
                // An open student card's own list, kept under the same prefix, is small: reloaded
                queryClient.invalidateQueries({ queryKey: [...ENROLLMENTS_KEY, 'by_student'] });
                void patchCachedEnrollments(queryClient, Array.from(enrollmentIds)).then(patched => {
                    if (!patched) queryClient.invalidateQueries({ queryKey: ENROLLMENTS_KEY });
                });
                return;
            }
            queryClient.invalidateQueries({ queryKey: [key] });
        });
    }, [queryClient]);

    const queueInvalidation = useCallback((keys: string[]) => {
        keys.forEach(key => pendingKeysRef.current.add(key));
        const now = Date.now();
        if (!burstStartRef.current) burstStartRef.current = now;
        if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
        // Trailing 250ms debounce, but never hold updates back for more than ~1s during a long burst
        const wait = now - burstStartRef.current >= 1000 ? 0 : 250;
        flushTimerRef.current = setTimeout(flushInvalidations, wait);
    }, [flushInvalidations]);

    // Open pages reload now, the rest when opened
    const resyncAll = useCallback((source: string) => {
        needsResyncRef.current = false;
        if (fallbackResyncRef.current) {
            clearTimeout(fallbackResyncRef.current);
            fallbackResyncRef.current = null;
        }
        lastResyncRef.current = Date.now();
        console.log(`[useGlobalRealtimeSync] Resyncing active queries (source: ${source})`);
        queryClient.invalidateQueries();
    }, [queryClient]);

    const subscribeChannel = useCallback(() => {
        if (!user) return;

        const old = activeChannelRef.current;
        // Cleared before removing: a channel removed before it has joined reports "CLOSED" right
        // away, and that must not be taken for a dropped connection (error log + a resubscribe)
        activeChannelRef.current = null;
        if (old) {
            try {
                supabase.removeChannel(old);
            } catch (e) {
                console.warn('[useGlobalRealtimeSync] Error removing channel:', e);
            }
        }

        const channel = supabase
            .channel('global_sync')
            // ─── Enrollments ─────────────────────────────────
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'enrollments' },
                payload => {
                    const id = changedRowId(payload);
                    if (id) pendingEnrollmentIdsRef.current?.add(id);
                    else pendingEnrollmentIdsRef.current = null;
                    queueInvalidation(['enrollments', 'dashboard_stats', 'outcomes_graduates', 'course_enrollment_counts', 'pending_completions', ...VIEWER_ENROLLMENT_KEYS]);
                }
            )
            // ─── Students ───────────────────────────────────
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'students' },
                () => {
                    queueInvalidation(['students', 'dashboard_stats', 'viewer_students_directory', 'viewer_course_roster', 'restricted_student_detail']);
                }
            )
            // ─── Courses ────────────────────────────────────
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'courses' },
                () => {
                    queueInvalidation(['courses', 'doc_courses', 'dashboard_stats', 'viewer_courses', 'viewer_upcoming_courses']);
                }
            )
            // ─── Employment Status ───────────────────────────
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'employment_status' },
                () => {
                    queueInvalidation(['outcomes_graduates', 'analytics_employment_statuses_v1']);
                }
            )
            // ─── External outreach lists (e.g. Action 11) ────
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'outreach_contacts' },
                () => {
                    queueInvalidation(['outreach_contacts']);
                }
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'outreach_lists' },
                () => {
                    queueInvalidation(['outreach_lists']);
                }
            )
            // ─── Student flags (board cards, student drawer) ─
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'student_flags' },
                () => {
                    queueInvalidation(['student_flags']);
                }
            )
            .subscribe((status, err) => {
                // Ignore late status callbacks from channels we already replaced/removed —
                // otherwise removing the old channel ("CLOSED") would schedule a pointless resubscribe loop.
                if (activeChannelRef.current !== channel) return;
                if (status === 'SUBSCRIBED') {
                    if (retryTimeoutRef.current) {
                        clearTimeout(retryTimeoutRef.current);
                        retryTimeoutRef.current = null;
                    }
                    // Live again after a drop: reload now that no further change can be missed.
                    // A hidden tab waits until it is shown (handleResync, 'visibility').
                    if (needsResyncRef.current && document.visibilityState !== 'hidden') resyncAll('channel back');
                } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                    // Changes made while the channel is down are never sent
                    needsResyncRef.current = true;
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
    }, [user, queueInvalidation, resyncAll]);

    useEffect(() => {
        subscribeChannelRef.current = subscribeChannel;
    }, [subscribeChannel]);

    useEffect(() => {
        if (!user) return;

        // Data was just fetched on mount — don't resync again on the very next focus event
        lastResyncRef.current = Date.now();
        needsResyncRef.current = false;
        subscribeChannel();
        const pendingKeys = pendingKeysRef.current;

        // Joined, over a socket that is still open (after a sleep the socket can be gone before
        // the channel hears of it)
        const isChannelLive = () => activeChannelRef.current?.state === 'joined' && supabase.realtime?.isConnected() !== false;

        // Sleep/wake, network and explicit reconnect events. Focus/visibility fire on every alt-tab:
        // with a live channel nothing was missed, so they only reload after a drop, or when the
        // last reload is old. Sleep gaps, network recovery and explicit reconnects rebuild the
        // channel. Bursts (focus + visibilitychange fire together) are coalesced.
        const handleResync = (reason?: string) => {
            const isSoft = reason === 'focus' || reason === 'visibility';
            if (isSoft && !needsResyncRef.current && isChannelLive()
                && Date.now() - lastResyncRef.current < SOFT_RESYNC_MIN_INTERVAL_MS) return;
            if (pendingResyncRef.current) return;

            pendingResyncRef.current = setTimeout(() => {
                pendingResyncRef.current = null;
                const source = reason || 'unknown';
                if (isSoft && isChannelLive()) {
                    resyncAll(source);
                    return;
                }
                // Rebuilt, then reloaded once live (subscribeChannel), so nothing changed in between is missed
                needsResyncRef.current = true;
                subscribeChannelRef.current?.();
                if (fallbackResyncRef.current) clearTimeout(fallbackResyncRef.current);
                fallbackResyncRef.current = setTimeout(() => {
                    fallbackResyncRef.current = null;
                    if (needsResyncRef.current && document.visibilityState !== 'hidden') resyncAll(`${source}, realtime not back`);
                }, REJOIN_RESYNC_FALLBACK_MS);
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
            if (fallbackResyncRef.current) {
                clearTimeout(fallbackResyncRef.current);
                fallbackResyncRef.current = null;
            }
            if (retryTimeoutRef.current) {
                clearTimeout(retryTimeoutRef.current);
                retryTimeoutRef.current = null;
            }
            if (flushTimerRef.current) {
                clearTimeout(flushTimerRef.current);
                flushTimerRef.current = null;
            }
            pendingKeys.clear();
            pendingEnrollmentIdsRef.current = new Set();
            burstStartRef.current = 0;
            const channel = activeChannelRef.current;
            activeChannelRef.current = null; // before removing, as in subscribeChannel
            if (channel) supabase.removeChannel(channel);
        };
    }, [queryClient, user, subscribeChannel, resyncAll]);
}
