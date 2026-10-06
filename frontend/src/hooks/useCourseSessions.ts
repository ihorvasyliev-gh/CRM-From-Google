import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { courseDateKey, SESSION_COLUMNS, sessionFromRow, type CourseSession } from '../lib/courseSessions';

export const COURSE_SESSIONS_QUERY_KEY = ['course_sessions'] as const;

const EMPTY: ReadonlyMap<string, CourseSession> = new Map();

/** Course dates that have a time, a place or several days, keyed by courseDateKey. */
async function fetchCourseSessions(): Promise<ReadonlyMap<string, CourseSession>> {
    const { data, error } = await supabase
        .from('invite_dates')
        .select(SESSION_COLUMNS)
        .or('start_time.not.is.null,end_time.not.is.null,location.not.is.null,days.not.is.null');
    if (error) {
        console.warn('Course date schedules unavailable (is migration 79 applied?):', error);
        return EMPTY;
    }
    const map = new Map<string, CourseSession>();
    for (const row of data || []) {
        const session = sessionFromRow(row);
        if (session && row.course_id) map.set(courseDateKey(row.course_id, session.date), session);
    }
    return map;
}

/** Time, place and days of every scheduled course date (admin pages only: viewers can't read invite_dates). */
export function useCourseSessions(enabled = true): ReadonlyMap<string, CourseSession> {
    const { data } = useQuery({
        queryKey: COURSE_SESSIONS_QUERY_KEY,
        queryFn: fetchCourseSessions,
        staleTime: 60_000,
        enabled,
    });
    return data ?? EMPTY;
}
