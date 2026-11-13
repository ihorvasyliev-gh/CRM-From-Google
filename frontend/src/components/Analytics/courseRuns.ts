import type { EnrollmentWithRelations } from '../../lib/documentUtils';
import { cleanVariant } from '../../lib/types';

/**
 * Course runs: a course, in one language, on one date ("Safe Pass · Ukrainian · 16/07/2026").
 * Analytics lists them under Courses & cohorts, where a run can be marked "Ignore in reports"
 * (enrollments.exclude_from_reports, migration 82): its enrollments then count nowhere in
 * Analytics or the one-page report.
 */

type RunFields = Pick<EnrollmentWithRelations, 'course_id' | 'course_variant' | 'courses' | 'invited_date' | 'confirmed_date' | 'completed_date'>;

/** Counted in Analytics and reports: not in a course run marked "Ignore in reports". */
export function isReportable(e: Pick<EnrollmentWithRelations, 'exclude_from_reports'>): boolean {
    return !e.exclude_from_reports;
}

/**
 * The date of an enrollment's course run: the course date it was invited to (the date it
 * confirmed, once confirmed), else the date it was completed.
 */
export function courseRunDate(e: RunFields): string | null {
    return (e.invited_date || e.confirmed_date || e.completed_date)?.slice(0, 10) || null;
}

export function courseRunKey(e: RunFields): string {
    const variant = cleanVariant(e.courses?.name || '', e.course_variant);
    return `${e.course_id || 'unknown'}|${variant.toLowerCase()}|${courseRunDate(e) || 'no-date'}`;
}

export interface CourseRun {
    key: string;
    courseId: string;
    courseName: string;
    /** Language of the run ("English", "Ukrainian") */
    variant: string;
    date: string | null;
    /** Marked "Ignore in reports": none of its enrollments is counted */
    ignored: boolean;
    /** The people who completed it (only the counted ones, unless the run is ignored) */
    graduates: EnrollmentWithRelations[];
}

/**
 * Course runs with graduates, newest first, ignored ones included (to count them again).
 * `isShown` narrows the graduates listed, e.g. to those who completed within a period.
 */
export function listCourseRuns(
    enrollments: EnrollmentWithRelations[],
    isShown: (e: EnrollmentWithRelations) => boolean = () => true,
): CourseRun[] {
    const groups = new Map<string, CourseRun & { counted: number }>();
    for (const e of enrollments) {
        const key = courseRunKey(e);
        let group = groups.get(key);
        if (!group) {
            const courseName = e.courses?.name || 'Unknown course';
            group = {
                key,
                courseId: e.course_id || 'unknown',
                courseName,
                variant: cleanVariant(courseName, e.course_variant),
                date: courseRunDate(e),
                ignored: false,
                graduates: [],
                counted: 0,
            };
            groups.set(key, group);
        }
        if (isReportable(e)) group.counted++;
        if (e.status === 'completed' && isShown(e)) group.graduates.push(e);
    }
    return [...groups.values()]
        .map(({ counted, ...run }) => {
            const ignored = counted === 0;
            // A counted run lists only its counted graduates (one may have been added after it was ignored)
            return { ...run, ignored, graduates: ignored ? run.graduates : run.graduates.filter(isReportable) };
        })
        .filter(run => run.graduates.length > 0)
        .sort((a, b) => {
            if (!a.date && !b.date) return a.courseName.localeCompare(b.courseName);
            if (!a.date) return 1;
            if (!b.date) return -1;
            return b.date.localeCompare(a.date) || a.courseName.localeCompare(b.courseName);
        });
}
