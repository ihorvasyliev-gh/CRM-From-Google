import { describe, it, expect } from 'vitest';
import type { EnrollmentWithRelations } from '../../lib/documentUtils';
import { courseRunDate, courseRunKey, isReportable } from './courseRuns';

type RunFields = Parameters<typeof courseRunKey>[0];
const run = (fields: Partial<RunFields>): RunFields => ({
    course_id: 'c1',
    course_variant: null,
    courses: { id: 'c1', name: 'Safe Pass' } as EnrollmentWithRelations['courses'],
    invited_date: null,
    confirmed_date: null,
    completed_date: null,
    ...fields,
});

describe('courseRuns', () => {
    it('dates a run by the course date, then by the completion date', () => {
        expect(courseRunDate(run({ invited_date: '2026-07-16', confirmed_date: '2026-07-16', completed_date: '2026-07-16' }))).toBe('2026-07-16');
        expect(courseRunDate(run({ confirmed_date: '2026-07-16' }))).toBe('2026-07-16');
        expect(courseRunDate(run({ completed_date: '2026-07-20' }))).toBe('2026-07-20');
        expect(courseRunDate(run({}))).toBeNull();
    });

    it('is one run per course, language and date', () => {
        const english = courseRunKey(run({ invited_date: '2026-07-16' }));
        expect(courseRunKey(run({ invited_date: '2026-07-16', course_variant: 'English' }))).toBe(english);
        expect(courseRunKey(run({ invited_date: '2026-07-16', course_variant: 'Safe Pass (English)' }))).toBe(english);
        expect(courseRunKey(run({ invited_date: '2026-07-16', course_variant: 'Ukrainian' }))).not.toBe(english);
        expect(courseRunKey(run({ invited_date: '2026-07-17' }))).not.toBe(english);
        expect(courseRunKey(run({ invited_date: '2026-07-16', course_id: 'c2' }))).not.toBe(english);
    });

    it('counts everything not marked "Ignore in reports"', () => {
        expect(isReportable({ exclude_from_reports: true })).toBe(false);
        expect(isReportable({ exclude_from_reports: false })).toBe(true);
        expect(isReportable({ exclude_from_reports: null })).toBe(true);
        expect(isReportable({})).toBe(true);
    });
});
