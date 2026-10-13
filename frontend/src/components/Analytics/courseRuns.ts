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
