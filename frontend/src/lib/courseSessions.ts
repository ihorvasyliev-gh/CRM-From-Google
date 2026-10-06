// ─── Course dates with a schedule (migration 79) ───────────────
// A course date — an invite_dates row: course + first day — can carry its time, its place
// and, for a course that runs over several days, every day it meets. Enrollments keep
// pointing at the first day, so capacity, reminders and documents work per course date
// exactly as before.
import { daysBetween, formatDateChoiceList, formatDateLong, formatDayDateShort, formatLocalDate, normalizeDateList } from './dateUtils';
import { courseDatesOf } from './courseDates';
import type { Enrollment } from './types';

export interface SessionDay {
    /** YYYY-MM-DD */
    date: string;
    /** HH:MM — only where this day differs from the course date's default time */
    start?: string;
    end?: string;
}

export interface CourseSession {
    /** First day (YYYY-MM-DD): the course date enrollments point at */
    date: string;
    /** Default time of every day, HH:MM (null = not set) */
    start_time: string | null;
    end_time: string | null;
    location: string | null;
    /** Every day of a multi-day course, the first included; null = a one-day course */
    days: SessionDay[] | null;
}

/** Longer weekly courses are summed up ("Every Wednesday for 8 weeks") instead of listed day by day. */
export const WEEKLY_SUMMARY_MIN_DAYS = 6;

/** 'HH:MM:SS' or 'H:MM' → 'HH:MM'; anything that isn't a time → null. */
export function normalizeTime(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const m = /^(\d{1,2}):(\d{2})/.exec(value.trim());
    if (!m || +m[1] > 23 || +m[2] > 59) return null;
    return `${m[1].padStart(2, '0')}:${m[2]}`;
}

const dayOf = (d: string) => d.slice(0, 10);
const isIsoDate = (d: unknown): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d);

/** Sorted days from `first` on, one entry per date (the first entry of a date wins); null for a one-day course. */
function cleanDays(first: string, raw: unknown): SessionDay[] | null {
    if (!Array.isArray(raw)) return null;
    const byDate = new Map<string, SessionDay>();
    for (const item of raw) {
        const date = isIsoDate(item) ? item : (item && typeof item === 'object' && isIsoDate((item as SessionDay).date) ? (item as SessionDay).date : null);
        if (!date) continue;
        const key = dayOf(date);
        if (key < first || byDate.has(key)) continue;
        const day: SessionDay = { date: key };
        if (item && typeof item === 'object') {
            const start = normalizeTime((item as SessionDay).start);
            const end = normalizeTime((item as SessionDay).end);
            if (start) day.start = start;
            if (end) day.end = end;
        }
        byDate.set(key, day);
    }
    if (!byDate.has(first)) byDate.set(first, { date: first });
    const days = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
    return days.length > 1 ? days : null;
}

/** A course date without a schedule. */
export function emptySession(date: string): CourseSession {
    return { date: dayOf(date), start_time: null, end_time: null, location: null, days: null };
}

/** A course date from an invite_dates row or the public get_confirmation_sessions RPC. */
export function sessionFromRow(row: {
    invite_date?: string | null;
    course_date?: string | null;
    start_time?: unknown;
    end_time?: unknown;
    location?: unknown;
    days?: unknown;
}): CourseSession | null {
    const raw = row.invite_date || row.course_date;
    if (!isIsoDate(raw)) return null;
    const date = dayOf(raw);
    const location = typeof row.location === 'string' && row.location.trim() ? row.location.trim() : null;
    return {
        date,
        start_time: normalizeTime(row.start_time),
        end_time: normalizeTime(row.end_time),
        location,
        days: cleanDays(date, row.days),
    };
}

/** The same course date with its day overrides that equal the default time dropped. */
export function normalizeSession(s: CourseSession): CourseSession {
    const days = cleanDays(s.date, s.days)?.map(d => {
        const day: SessionDay = { date: d.date };
        if (d.start && d.start !== s.start_time) day.start = d.start;
        if (d.end && d.end !== s.end_time) day.end = d.end;
        return day;
    }) ?? null;
    const location = s.location?.trim() || null;
    return { date: dayOf(s.date), start_time: normalizeTime(s.start_time), end_time: normalizeTime(s.end_time), location, days };
}

/** Every day of the course date (at least the first). */
export function sessionDays(s: CourseSession): SessionDay[] {
    return s.days && s.days.length > 1 ? s.days : [{ date: s.date, ...(s.days?.[0] ?? {}) }];
}

export function isMultiDay(s: CourseSession): boolean {
    return sessionDays(s).length > 1;
}

/** Time of one day: its own, or the course date's default. */
export function dayTime(s: CourseSession, day: SessionDay): { start: string | null; end: string | null } {
    return { start: day.start ?? s.start_time, end: day.end ?? s.end_time };
}

/** Some day runs at a different time than the default. */
export function hasDayOverrides(s: CourseSession): boolean {
    return sessionDays(s).some(d => (d.start && d.start !== s.start_time) || (d.end && d.end !== s.end_time));
}

/** "10:00 – 14:00", "from 10:00", "until 14:00" or ''. */
export function formatTimeRange(start: string | null | undefined, end: string | null | undefined): string {
    if (start && end) return `${start} – ${end}`;
    if (start) return `from ${start}`;
    if (end) return `until ${end}`;
    return '';
}

/** Time, place or more than one day is set. */
export function sessionHasSchedule(s: CourseSession | null | undefined): s is CourseSession {
    return !!s && (isMultiDay(s) || !!s.start_time || !!s.end_time || !!s.location || hasDayOverrides(s));
}

const weekdayLong = (date: string) => formatLocalDate(new Date(`${date}T12:00:00`), { weekday: 'long' });

/**
 * "Every Wednesday for 8 weeks" for a long course that meets once a week at the same time;
 * null when the days are better listed one by one.
 */
export function weeklySummary(s: CourseSession): { weekday: string; weeks: number; first: string; last: string } | null {
    const days = sessionDays(s);
    if (days.length < WEEKLY_SUMMARY_MIN_DAYS || hasDayOverrides(s)) return null;
    for (let i = 1; i < days.length; i++) {
        if (daysBetween(days[i - 1].date, days[i].date) !== 7) return null;
    }
    return { weekday: weekdayLong(days[0].date), weeks: days.length, first: days[0].date, last: days[days.length - 1].date };
}

/** `count` weekly dates from `first` on (first included). */
export function weeklyDates(first: string, count: number): string[] {
    const start = new Date(`${dayOf(first)}T12:00:00`);
    return Array.from({ length: Math.max(1, count) }, (_, i) => {
        const d = new Date(start);
        d.setDate(start.getDate() + i * 7);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
}

/** Short note for board cards: "4 days · 10:00", "10:00 – 14:00", or ''. */
export function sessionShortNote(s: CourseSession | null | undefined): string {
    if (!s) return '';
    const days = sessionDays(s);
    if (days.length > 1) return [`${days.length} days`, s.start_time].filter(Boolean).join(' · ');
    return formatTimeRange(dayTime(s, days[0]).start, dayTime(s, days[0]).end);
}

/** Several lines for a tooltip: the days, the time and the place. */
export function sessionTooltip(s: CourseSession | null | undefined): string {
    if (!sessionHasSchedule(s)) return '';
    const days = sessionDays(s);
    const lines: string[] = [];
    const weekly = weeklySummary(s);
    if (weekly) {
        lines.push(`Every ${weekly.weekday} for ${weekly.weeks} weeks: ${formatDayDateShort(weekly.first)} – ${formatDayDateShort(weekly.last)}`);
    } else if (days.length > 1) {
        lines.push(...days.map((d, i) => {
            const own = hasDayOverrides(s) ? formatTimeRange(dayTime(s, d).start, dayTime(s, d).end) : '';
            return `Day ${i + 1}: ${formatDayDateShort(d.date)}${own ? ` · ${own}` : ''}`;
        }));
    }
    const time = hasDayOverrides(s) && days.length > 1 ? '' : formatTimeRange(dayTime(s, days[0]).start, dayTime(s, days[0]).end);
    if (time) lines.push(`Time: ${time}`);
    if (s.location) lines.push(`Place: ${s.location}`);
    return lines.join('\n');
}

/** {date} in the email subject: the first day, with the number of days of a multi-day course. */
export function subjectDateLabel(sessions: CourseSession[]): string {
    const list = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
    if (list.length === 0) return '';
    const counts = new Set(list.map(s => sessionDays(s).length));
    const daysNote = counts.size === 1 && list[0] && sessionDays(list[0]).length > 1
        ? ` (${sessionDays(list[0]).length} days${list.length > 1 ? ' each' : ''})`
        : '';
    const dates = list.length === 1 ? formatDateLong(list[0].date) : formatDateChoiceList(normalizeDateList(list.map(s => s.date)));
    return dates + daysNote;
}

/** The invite_dates columns of a course date, ready to upsert. */
export function sessionToRow(courseId: string, s: CourseSession) {
    const clean = normalizeSession(s);
    return {
        course_id: courseId,
        invite_date: clean.date,
        start_time: clean.start_time,
        end_time: clean.end_time,
        location: clean.location,
        days: clean.days,
    };
}

/** invite_dates columns read for course dates with their schedule. */
export const SESSION_COLUMNS = 'course_id, invite_date, start_time, end_time, location, days';

/** Key of a course date, as stored in invite_dates (course_id + invite_date). */
export const courseDateKey = (courseId: string, date: string) => `${courseId}|${date.slice(0, 10)}`;

/** The scheduled course date an enrollment belongs to (none while a multi-date invite is open). */
export function sessionForEnrollment(
    e: Pick<Enrollment, 'course_id' | 'status' | 'confirmed_date' | 'invited_date' | 'invited_dates' | 'completed_date'>,
    sessions: ReadonlyMap<string, CourseSession>,
): CourseSession | null {
    if (sessions.size === 0 || !e.course_id) return null;
    const dates = courseDatesOf(e);
    return dates.length === 1 ? sessions.get(courseDateKey(e.course_id, dates[0])) ?? null : null;
}
