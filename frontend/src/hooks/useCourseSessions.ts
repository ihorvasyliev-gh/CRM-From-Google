import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { fetchAllPages } from '../lib/queries';
import { courseDateKey, SESSION_COLUMNS, sessionFromRow, shareSessionMap, type CourseSession } from '../lib/courseSessions';

export const COURSE_SESSIONS_QUERY_KEY = ['course_sessions'] as const;

const EMPTY: ReadonlyMap<string, CourseSession> = new Map();

/** Course dates that have a time, a place or several days, keyed by courseDateKey. */
async function fetchCourseSessions(): Promise<ReadonlyMap<string, CourseSession>> {
    try {
        const data = await fetchAllPages<Record<string, unknown>>((from, to) =>
            supabase
                .from('invite_dates')
                .select(SESSION_COLUMNS)
                .or('start_time.not.is.null,end_time.not.is.null,location.not.is.null,days.not.is.null')
                .order('course_id')
                .order('invite_date')
                .range(from, to)
        );
        const map = new Map<string, CourseSession>();
        for (const row of data) {
            const session = sessionFromRow(row as Parameters<typeof sessionFromRow>[0]);
            if (session && typeof row.course_id === 'string') map.set(courseDateKey(row.course_id, session.date), session);
        }
        return map;
    } catch (error) {
        console.warn('Course date schedules unavailable (is migration 79 applied?):', error);
        return EMPTY;
    }
}

/** Time, place and days of every scheduled course date (admin pages only: viewers can't read invite_dates). */
export function useCourseSessions(enabled = true): ReadonlyMap<string, CourseSession> {
    const { data } = useQuery({
        queryKey: COURSE_SESSIONS_QUERY_KEY,
        queryFn: fetchCourseSessions,
        staleTime: 60_000,
        enabled,
        // React Query only shares plain objects and arrays between fetches, not a Map
        structuralSharing: (prev, next) => shareSessionMap(prev as ReadonlyMap<string, CourseSession> | undefined, next as ReadonlyMap<string, CourseSession>),
    });
    return data ?? EMPTY;
}
