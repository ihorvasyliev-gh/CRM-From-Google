import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

/**
 * Global Supabase realtime subscription hook.
 *
 * Subscribes to postgres_changes on the enrollments, students, and courses
 * tables and invalidates the relevant React Query caches so that every page
 * stays in sync without needing a manual refresh.
 *
 * Mount this hook **once** at the App level.
 */
export function useGlobalRealtimeSync() {
    const queryClient = useQueryClient();

    useEffect(() => {
        const channel = supabase
            .channel('global_sync')
            // ─── Enrollments ─────────────────────────────────
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'enrollments' },
                () => {
                    queryClient.invalidateQueries({ queryKey: ['enrollments'] });
                    queryClient.invalidateQueries({ queryKey: ['dashboard_stats'] });
                    queryClient.invalidateQueries({ queryKey: ['dashboard_recent'] });
                    queryClient.invalidateQueries({ queryKey: ['outcomes_graduates'] });
                    queryClient.invalidateQueries({ queryKey: ['course_enrollment_counts'] });
                }
            )
            // ─── Students ───────────────────────────────────
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'students' },
                () => {
                    queryClient.invalidateQueries({ queryKey: ['students'] });
                    queryClient.invalidateQueries({ queryKey: ['dashboard_stats'] });
                }
            )
            // ─── Courses ────────────────────────────────────
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'courses' },
                () => {
                    queryClient.invalidateQueries({ queryKey: ['courses'] });
                    queryClient.invalidateQueries({ queryKey: ['doc_courses'] });
                    queryClient.invalidateQueries({ queryKey: ['dashboard_stats'] });
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [queryClient]);
}
