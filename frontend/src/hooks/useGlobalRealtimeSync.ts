import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

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
    const { user } = useAuth();

    useEffect(() => {
        if (!user) return;

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
                if (status === 'SUBSCRIBED') {
                    console.log('global_sync channel subscribed successfully');
                } else if (status === 'CHANNEL_ERROR') {
                    console.error('global_sync channel error:', err);
                } else if ((status as string) === 'REJECTED') {
                    console.warn('global_sync channel subscription rejected:', err);
                }
            });

        return () => {
            supabase.removeChannel(channel);
        };
    }, [queryClient, user]);
}
