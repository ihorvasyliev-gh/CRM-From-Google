import type { EnrollmentRow } from '../../hooks/useEnrollments';
import { fullName, getCoursePill } from '../../lib/types';
import { formatDayDateShort, normalizeDateList } from '../../lib/dateUtils';

/**
 * Who a dialog is about and which course: "Anna Murphy · Safe Pass (English)" for one person,
 * "5 people · Safe Pass" for several (the language only when they all share it).
 */
export function describePeople(people: readonly EnrollmentRow[]): string {
    if (people.length === 0) return '';
    const who = people.length === 1 ? (fullName(people[0].students) || '1 person') : `${people.length} people`;
    const pills = new Set(people.map(getCoursePill));
    const courses = new Set(people.map(e => e.courses?.name).filter(Boolean));
    const course = pills.size === 1 ? [...pills][0] : courses.size === 1 ? [...courses][0] : `${courses.size} courses`;
    return `${who} · ${course}`;
}

/**
 * The course dates these people are invited for, e.g. "Fri, 20 Nov" or "Fri, 20 Nov or Fri, 27 Nov"
 * (a multi-date invitation); null when nobody has an invitation.
 */
export function invitedForLabel(people: readonly EnrollmentRow[]): string | null {
    const dates = normalizeDateList(people.flatMap(e =>
        e.status !== 'invited' ? [] : e.invited_dates && e.invited_dates.length > 1 ? e.invited_dates : e.invited_date ? [e.invited_date] : []
    ).map(d => d.split('T')[0]));
    if (dates.length === 0) return null;
    if (dates.length > 3) return `${dates.length} different dates`;
    return dates.map(formatDayDateShort).join(' or ');
}
