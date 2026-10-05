import { useEffect, useRef } from 'react';
import type { RealtimePostgresUpdatePayload } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { showNotification, isNotificationSupported } from '../lib/notifications';
import { useAuth } from '../contexts/AuthContext';
import { getUserRole } from '../lib/roles';
import { subscribeWithRetry } from '../lib/realtimeSync';
import { fullName } from '../lib/types';

/** A confirmation is new if it was stamped in the update itself (confirmation flows set confirmed_at = now()). */
const NEW_CONFIRMATION_WINDOW_MS = 2 * 60 * 1000;

/**
 * Whether an UPDATE of a confirmed enrollment is the confirmation itself rather than a later edit
 * (notes, priority, reminder…). Realtime sends only the primary key as the old row (the table has
 * no REPLICA IDENTITY FULL), so the old status can't be compared; both timestamps here come from
 * the database, so the browser's clock doesn't matter.
 */
export function isNewConfirmation(payload: Pick<RealtimePostgresUpdatePayload<{ confirmed_at: string | null }>, 'commit_timestamp' | 'new'>): boolean {
    const confirmedAt = Date.parse(payload.new.confirmed_at ?? '');
    const committedAt = Date.parse(payload.commit_timestamp);
    if (Number.isNaN(confirmedAt) || Number.isNaN(committedAt)) return false;
    return Math.abs(committedAt - confirmedAt) <= NEW_CONFIRMATION_WINDOW_MS;
}

/**
 * Listens for enrollment confirmations via Supabase Realtime
 * and fires a native browser notification for each one.
 *
 * Must be called inside the authenticated part of the app
 * so it stays active across all pages.
 */
export function useConfirmationNotifier() {
    const { user } = useAuth();
    // Track IDs we've already notified to avoid duplicates from optimistic updates
    const notifiedIds = useRef<Set<string>>(new Set());

    useEffect(() => {
        if (!user) return;
        // External Lists users can't see enrollments
        if (getUserRole(user) === 'outreach') return;
        if (!isNotificationSupported()) return;

        return subscribeWithRetry(() => supabase
            .channel('confirmation_notifier')
            .on<{ id: string; confirmed_at: string | null }>(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'enrollments',
                    filter: 'status=eq.confirmed',
                },
                async (payload) => {
                    const id = payload.new.id;
                    if (!isNewConfirmation(payload)) return;
                    // De-duplicate
                    if (notifiedIds.current.has(id)) return;
                    notifiedIds.current.add(id);

                    // Fetch student & course names for a nice notification
                    const { data } = await supabase
                        .from('enrollments')
                        .select('students(first_name, last_name), courses(name)')
                        .eq('id', id)
                        .single();

                    if (!data) return;

                    // Without generated database types the client reads embedded rows as arrays; these are single rows
                    const { students: student, courses: course } = data as unknown as {
                        students: { first_name: string; last_name: string } | null;
                        courses: { name: string } | null;
                    };
                    const studentName = fullName(student) || 'A student';
                    const courseName = course?.name || 'a course';

                    showNotification('✅ Enrollment Confirmed', {
                        body: `${studentName} confirmed for ${courseName}`,
                        icon: '/favicon.ico',
                        tag: `confirm-${id}`, // prevents duplicate system notifications
                    });

                    // Keep the set from growing indefinitely using FIFO eviction
                    if (notifiedIds.current.size > 500) {
                        const oldestId = notifiedIds.current.values().next().value;
                        if (oldestId) notifiedIds.current.delete(oldestId);
                    }
                }
            ), 'confirmation_notifier');
    }, [user]);
}
