import { sessionDays, type CourseSession } from '../../lib/courseSessions';

export interface CapacityInfo {
    max: number;
    confirmed: number;
    isFull: boolean;
}

export function formatCourseDate(dateStr: string): string {
    try {
        return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-GB', {
            weekday: 'short',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
        });
    } catch {
        return dateStr;
    }
}

/** "Thu 1 October 2026", or "4 days · starts Thu 1 October 2026" for a multi-day course. */
export function courseDateLine(date: string, session: CourseSession | undefined): string {
    const days = session ? sessionDays(session).length : 1;
    return days > 1 ? `${days} days · starts ${formatCourseDate(date)}` : formatCourseDate(date);
}
