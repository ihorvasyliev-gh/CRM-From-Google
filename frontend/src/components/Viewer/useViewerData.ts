import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import type { ViewerCourse, ViewerUpcomingCourse } from '../../lib/types';

/** All courses with per-status counts. Shared cache between every viewer page. */
export function useViewerCourses() {
    return useQuery<ViewerCourse[]>({
        queryKey: ['viewer_courses'],
        queryFn: async () => {
            const { data, error } = await supabase.rpc('get_viewer_courses');
            if (error) throw error;
            return ((data || []) as Record<string, unknown>[]).map(c => ({
                id: c.id as string,
                name: c.name as string,
                created_at: c.created_at as string,
                total_count: Number(c.total_count || 0),
                requested_count: Number(c.requested_count || 0),
                invited_count: Number(c.invited_count || 0),
                confirmed_count: Number(c.confirmed_count || 0),
                completed_count: Number(c.completed_count || 0),
                rejected_count: Number(c.rejected_count || 0),
                pending_approval_count: Number(c.pending_approval_count || 0),
            }));
        },
        staleTime: 60_000,
    });
}

/** Upcoming course sessions (today onwards), chronological. */
export function useViewerUpcoming() {
    return useQuery<ViewerUpcomingCourse[]>({
        queryKey: ['viewer_upcoming_courses'],
        queryFn: async () => {
            const { data, error } = await supabase.rpc('get_viewer_upcoming_courses');
            if (error) throw error;
            return ((data || []) as Record<string, unknown>[]).map(row => ({
                course_id: row.course_id as string,
                course_name: row.course_name as string,
                course_date: row.course_date as string,
                confirmed_count: Number(row.confirmed_count || 0),
                pending_count: Number(row.pending_count || 0),
                total_active_count: Number(row.total_active_count || 0),
            }));
        },
        staleTime: 60_000,
        refetchInterval: 60_000,
    });
}

/** Earliest upcoming session per course id. */
export function useNextSessionByCourse(upcoming: ViewerUpcomingCourse[]) {
    return useMemo(() => {
        const map = new Map<string, ViewerUpcomingCourse>();
        for (const s of upcoming) {
            const existing = map.get(s.course_id);
            if (!existing || s.course_date < existing.course_date) map.set(s.course_id, s);
        }
        return map;
    }, [upcoming]);
}
