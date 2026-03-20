import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { showNotification, isNotificationSupported } from '../lib/notifications';

/**
 * Listens for enrollment confirmations via Supabase Realtime
 * and fires a native browser notification for each one.
 *
 * Must be called inside the authenticated part of the app
 * so it stays active across all pages.
 */
export function useConfirmationNotifier() {
    // Track IDs we've already notified to avoid duplicates from optimistic updates
    const notifiedIds = useRef<Set<string>>(new Set());

    useEffect(() => {
        if (!isNotificationSupported()) return;

        const channel = supabase
            .channel('confirmation_notifier')
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'enrollments',
                    filter: 'status=eq.confirmed',
                },
                async (payload) => {
                    const id = payload.new.id as string;

                    // Only fire when status actually changed to confirmed
                    if (payload.old.status === 'confirmed') return;
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

                    const student = (data as any).students;
                    const course = (data as any).courses;
                    const studentName = student
                        ? `${student.first_name} ${student.last_name}`
                        : 'A student';
                    const courseName = course?.name || 'a course';

                    showNotification('✅ Enrollment Confirmed', {
                        body: `${studentName} confirmed for ${courseName}`,
                        icon: '/favicon.ico',
                        tag: `confirm-${id}`, // prevents duplicate system notifications
                    });

                    // Keep the set from growing indefinitely
                    if (notifiedIds.current.size > 500) {
                        notifiedIds.current.clear();
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);
}
