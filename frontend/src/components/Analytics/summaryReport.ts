import type { EnrollmentWithRelations } from '../../lib/documentUtils';
import { formatLocalDate } from '../../lib/dateUtils';

/**
 * The one-page report: who registered and who completed a course within a period.
 *
 * Each figure is dated by its own event: a registration by the day the student registered
 * (created_at), a completion by the day the course was completed (completed_date). A person
 * counts once per course, so the languages of a course (Safe Pass and Safe Pass in Ukrainian)
 * are one course and a student queued in two of them is one registration.
 */

/** Inclusive period, both ends YYYY-MM-DD. */
export interface ReportPeriod {
    start: string;
    end: string;
}

export interface ReportCourseRow {
    courseId: string;
    name: string;
    /** People who registered for this course in the period */
    registered: number;
    /** People who completed this course in the period */
    completed: number;
}

export interface ReportMonth {
    /** YYYY-MM */
    month: string;
    registered: number;
    completed: number;
}

export interface SummaryReport {
    /** Different people who registered for at least one course */
    peopleRegistered: number;
    /** Course registrations (one per person per course) */
    registrations: number;
    /** Different people who completed at least one course */
    peopleCompleted: number;
    /** Course completions (one per person per course) */
    completions: number;
    /** Courses with at least one completion */
    coursesDelivered: number;
    /** Every course with a registration or a completion, most registrations first */
    courses: ReportCourseRow[];
    /** Every month of the period, in order */
    months: ReportMonth[];
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Local YYYY-MM-DD of a Date. */
export function toDayKey(d: Date): string {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local day of a timestamp (created_at is UTC; a late-evening registration belongs to that Irish day). */
function timestampDay(value: string | null | undefined): string | null {
    if (!value) return null;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : toDayKey(d);
}

export function registrationDay(e: Pick<EnrollmentWithRelations, 'created_at'>): string | null {
    return timestampDay(e.created_at);
}

/**
 * The day the course was completed, or null when the enrollment is not completed. completed_date
 * is the course date (set from the confirmed date on completion); older rows fall back to the
 * moment it was marked completed, then to the confirmed course date.
 */
export function completionDay(
    e: Pick<EnrollmentWithRelations, 'status' | 'completed_date' | 'completed_at' | 'confirmed_date'>,
): string | null {
    if (e.status !== 'completed') return null;
    if (e.completed_date) return e.completed_date.slice(0, 10);
    return timestampDay(e.completed_at) ?? (e.confirmed_date ? e.confirmed_date.slice(0, 10) : null);
}

function monthsOf(period: ReportPeriod): string[] {
    const months: string[] = [];
    let y = Number(period.start.slice(0, 4));
    let m = Number(period.start.slice(5, 7));
    const endKey = period.end.slice(0, 7);
    // A bound keeps a mistyped year from building thousands of months
    for (let i = 0; i < 1200; i++) {
        const key = `${y}-${pad(m)}`;
        if (key > endKey) break;
        months.push(key);
        m++;
        if (m > 12) { m = 1; y++; }
    }
    return months;
}

export function buildSummaryReport(enrollments: EnrollmentWithRelations[], period: ReportPeriod): SummaryReport {
    const inPeriod = (day: string | null): day is string => !!day && day >= period.start && day <= period.end;

    // course → person → earliest day in the period
    const registeredBy = new Map<string, Map<string, string>>();
    const completedBy = new Map<string, Map<string, string>>();
    const names = new Map<string, string>();

    const note = (target: Map<string, Map<string, string>>, courseId: string, person: string, day: string) => {
        let people = target.get(courseId);
        if (!people) {
            people = new Map();
            target.set(courseId, people);
        }
        const seen = people.get(person);
        if (!seen || day < seen) people.set(person, day);
    };

    for (const e of enrollments) {
        const courseId = e.course_id || e.courses?.id || '';
        if (!courseId) continue;
        const person = e.student_id || e.students?.id || e.id;
        const registered = registrationDay(e);
        const completed = completionDay(e);
        if (!inPeriod(registered) && !inPeriod(completed)) continue;

        if (!names.has(courseId) && e.courses?.name) names.set(courseId, e.courses.name.trim());
        if (inPeriod(registered)) note(registeredBy, courseId, person, registered);
        if (inPeriod(completed)) note(completedBy, courseId, person, completed);
    }

    const courseIds = new Set([...registeredBy.keys(), ...completedBy.keys()]);
    const courses: ReportCourseRow[] = [...courseIds]
        .map(courseId => ({
            courseId,
            name: names.get(courseId) || 'Unnamed course',
            registered: registeredBy.get(courseId)?.size ?? 0,
            completed: completedBy.get(courseId)?.size ?? 0,
        }))
        .sort((a, b) => b.registered - a.registered || b.completed - a.completed || a.name.localeCompare(b.name));

    const monthIndex = new Map(monthsOf(period).map(month => [month, { month, registered: 0, completed: 0 }]));
    const peopleRegistered = new Set<string>();
    const peopleCompleted = new Set<string>();
    for (const people of registeredBy.values()) {
        for (const [person, day] of people) {
            peopleRegistered.add(person);
            const bucket = monthIndex.get(day.slice(0, 7));
            if (bucket) bucket.registered++;
        }
    }
    for (const people of completedBy.values()) {
        for (const [person, day] of people) {
            peopleCompleted.add(person);
            const bucket = monthIndex.get(day.slice(0, 7));
            if (bucket) bucket.completed++;
        }
    }

    return {
        peopleRegistered: peopleRegistered.size,
        registrations: courses.reduce((sum, c) => sum + c.registered, 0),
        peopleCompleted: peopleCompleted.size,
        completions: courses.reduce((sum, c) => sum + c.completed, 0),
        coursesDelivered: courses.filter(c => c.completed > 0).length,
        courses,
        months: [...monthIndex.values()],
    };
}

/**
 * The first `limit` courses; when there are more, the last row folds the rest into
 * "Other courses (n)" so the table still fits on the page and the totals still add up.
 */
export function foldCourses(courses: ReportCourseRow[], limit: number): ReportCourseRow[] {
    if (courses.length <= limit) return courses;
    const kept = courses.slice(0, Math.max(0, limit - 1));
    const rest = courses.slice(kept.length);
    return [
        ...kept,
        {
            courseId: 'other',
            name: `Other courses (${rest.length})`,
            registered: rest.reduce((sum, c) => sum + c.registered, 0),
            completed: rest.reduce((sum, c) => sum + c.completed, 0),
        },
    ];
}

/** A chart tick step of 1, 2 or 5 × 10ⁿ giving at most four steps up to `max`. */
export function niceStep(max: number): number {
    if (max <= 4) return 1;
    const raw = max / 4;
    const pow = 10 ** Math.floor(Math.log10(raw));
    return [1, 2, 5, 10].map(m => m * pow).find(s => s >= raw) ?? 10 * pow;
}

export type ReportPresetId = 'ytd' | 'last-year' | '12m' | 'this-month' | 'last-month' | 'this-quarter' | 'last-quarter';

export const REPORT_PRESETS: { id: ReportPresetId; label: string }[] = [
    { id: 'ytd', label: 'This year' },
    { id: 'last-year', label: 'Last year' },
    { id: '12m', label: 'Last 12 months' },
    { id: 'this-quarter', label: 'This quarter' },
    { id: 'last-quarter', label: 'Last quarter' },
    { id: 'this-month', label: 'This month' },
    { id: 'last-month', label: 'Last month' },
];

/** The period a preset covers, counted from `today` (a period that has not ended stops at today). */
export function presetPeriod(id: ReportPresetId, today: Date = new Date()): ReportPeriod {
    const y = today.getFullYear();
    const m = today.getMonth();
    const todayKey = toDayKey(today);
    const day = (year: number, month: number, date: number) => toDayKey(new Date(year, month, date));
    const quarterStart = m - (m % 3);
    switch (id) {
        case 'ytd':
            return { start: day(y, 0, 1), end: todayKey };
        case 'last-year':
            return { start: day(y - 1, 0, 1), end: day(y - 1, 11, 31) };
        case '12m':
            // Whole months, so the chart has twelve full columns: 1 Nov 2025 – 13 Oct 2026
            return { start: day(y, m - 11, 1), end: todayKey };
        case 'this-quarter':
            return { start: day(y, quarterStart, 1), end: todayKey };
        case 'last-quarter':
            return { start: day(y, quarterStart - 3, 1), end: day(y, quarterStart, 0) };
        case 'this-month':
            return { start: day(y, m, 1), end: todayKey };
        case 'last-month':
            return { start: day(y, m - 1, 1), end: day(y, m, 0) };
    }
}

const dayDate = (key: string) => new Date(`${key}T12:00:00`);

/** "1 January – 13 October 2026"; the year is written once when both ends share it. */
export function formatPeriodLabel(period: ReportPeriod): string {
    const long = { day: 'numeric', month: 'long', year: 'numeric' } as const;
    const end = formatLocalDate(dayDate(period.end), long);
    if (period.start === period.end) return end;
    const sameYear = period.start.slice(0, 4) === period.end.slice(0, 4);
    const start = formatLocalDate(dayDate(period.start), sameYear ? { day: 'numeric', month: 'long' } : long);
    return `${start} – ${end}`;
}
