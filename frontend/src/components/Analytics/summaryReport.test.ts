import { describe, it, expect } from 'vitest';
import type { EnrollmentWithRelations } from '../../lib/documentUtils';
import {
    buildSummaryReport,
    completionDay,
    foldCourses,
    formatPeriodLabel,
    niceStep,
    presetPeriod,
    type ReportCourseRow,
} from './summaryReport';

const COURSES: Record<string, string> = { safe: 'Safe Pass', sna: 'SNA Level 5', barista: 'Barista' };

function enrollment(
    id: string,
    studentId: string,
    courseId: string,
    registered: string,
    extra: Partial<EnrollmentWithRelations> = {},
): EnrollmentWithRelations {
    return {
        id,
        student_id: studentId,
        course_id: courseId,
        status: 'requested',
        course_variant: null,
        notes: null,
        confirmed_date: null,
        confirmed_at: null,
        invited_date: null,
        invited_at: null,
        completed_date: null,
        completed_at: null,
        is_priority: false,
        response_days: null,
        // Midday UTC: the same calendar day in any time zone the tests run in
        created_at: `${registered}T12:00:00Z`,
        updated_at: `${registered}T12:00:00Z`,
        courses: { id: courseId, name: COURSES[courseId] },
        students: { id: studentId },
        ...extra,
    } as EnrollmentWithRelations;
}

const completed = (date: string): Partial<EnrollmentWithRelations> => ({
    status: 'completed',
    completed_date: date,
    completed_at: `${date}T16:00:00Z`,
});

const YEAR_2026 = { start: '2026-01-01', end: '2026-10-13' };

describe('buildSummaryReport', () => {
    it('counts a person once per course, whatever the language', () => {
        const report = buildSummaryReport([
            enrollment('1', 'ann', 'safe', '2026-03-02'),
            enrollment('2', 'ann', 'safe', '2026-03-05', { course_variant: 'Ukrainian' }),
            enrollment('3', 'bob', 'safe', '2026-04-01', { course_variant: 'Safe Pass (Ukrainian)' }),
        ], YEAR_2026);

        expect(report.courses).toEqual([{ courseId: 'safe', name: 'Safe Pass', registered: 2, completed: 0, runs: 0 }]);
        expect(report.registrations).toBe(2);
        expect(report.peopleRegistered).toBe(2);
    });

    it('dates completions by the course date, not by the registration', () => {
        const report = buildSummaryReport([
            // Registered last year, completed this year: a completion only
            enrollment('1', 'ann', 'sna', '2025-11-20', completed('2026-02-10')),
            // Registered this year, completed after the period: a registration only
            enrollment('2', 'bob', 'sna', '2026-09-01', completed('2026-11-02')),
            // Both inside
            enrollment('3', 'cat', 'sna', '2026-01-15', completed('2026-03-01')),
        ], YEAR_2026);

        expect(report.courses).toEqual([{ courseId: 'sna', name: 'SNA Level 5', registered: 2, completed: 2, runs: 2 }]);
        expect(report.peopleCompleted).toBe(2);
        expect(report.completions).toBe(2);
    });

    it('leaves out what happened outside the period', () => {
        const report = buildSummaryReport([
            enrollment('1', 'ann', 'safe', '2025-12-31', completed('2025-12-31')),
            enrollment('2', 'bob', 'barista', '2026-10-14'),
        ], YEAR_2026);

        expect(report.courses).toEqual([]);
        expect(report.registrations).toBe(0);
        expect(report.completions).toBe(0);
    });

    it('counts different people across courses once, course registrations per course', () => {
        const report = buildSummaryReport([
            enrollment('1', 'ann', 'safe', '2026-02-01', completed('2026-02-20')),
            enrollment('2', 'ann', 'barista', '2026-02-01', completed('2026-03-20')),
            enrollment('3', 'bob', 'barista', '2026-05-01'),
        ], YEAR_2026);

        expect(report.peopleRegistered).toBe(2);
        expect(report.registrations).toBe(3);
        expect(report.peopleCompleted).toBe(1);
        expect(report.completions).toBe(2);
        expect(report.coursesDelivered).toBe(2);
        // Most registrations first
        expect(report.courses.map(c => c.courseId)).toEqual(['barista', 'safe']);
    });

    it('puts every month of the period in order, across a new year', () => {
        const report = buildSummaryReport([
            enrollment('1', 'ann', 'safe', '2025-11-03'),
            enrollment('2', 'bob', 'safe', '2026-01-20', completed('2026-02-02')),
            enrollment('3', 'cat', 'barista', '2026-01-21'),
        ], { start: '2025-11-01', end: '2026-02-28' });

        expect(report.months).toEqual([
            { month: '2025-11', registered: 1, completed: 0 },
            { month: '2025-12', registered: 0, completed: 0 },
            { month: '2026-01', registered: 2, completed: 0 },
            { month: '2026-02', registered: 0, completed: 1 },
        ]);
    });

    it('counts a course run per course, language and date', () => {
        const run = (date: string, variant: string | null = null): Partial<EnrollmentWithRelations> => ({
            ...completed(date),
            confirmed_date: date,
            invited_date: date,
            course_variant: variant,
        });
        const report = buildSummaryReport([
            enrollment('1', 'ann', 'safe', '2026-02-01', run('2026-03-10')),
            enrollment('2', 'bob', 'safe', '2026-02-02', run('2026-03-10')),
            enrollment('3', 'cat', 'safe', '2026-02-03', run('2026-03-10', 'Ukrainian')),
            enrollment('4', 'dan', 'safe', '2026-04-01', run('2026-05-12')),
            enrollment('5', 'eve', 'barista', '2026-04-01', run('2026-05-12')),
        ], YEAR_2026);

        expect(report.courses.find(c => c.courseId === 'safe')?.runs).toBe(3);
        expect(report.courseRuns).toBe(4);
        expect(report.coursesDelivered).toBe(2);
    });

    it('leaves out course runs marked "Ignore in reports" entirely', () => {
        const report = buildSummaryReport([
            enrollment('1', 'ann', 'safe', '2026-02-01', { ...completed('2026-03-10'), exclude_from_reports: true }),
            enrollment('2', 'bob', 'safe', '2026-02-01', { exclude_from_reports: true }),
            enrollment('3', 'cat', 'safe', '2026-02-05', { ...completed('2026-03-12'), exclude_from_reports: null }),
        ], YEAR_2026);

        expect(report.courses).toEqual([{ courseId: 'safe', name: 'Safe Pass', registered: 1, completed: 1, runs: 1 }]);
        expect(report.peopleRegistered).toBe(1);
        expect(report.peopleCompleted).toBe(1);
    });

    it('counts courses delivered only where someone completed', () => {
        const report = buildSummaryReport([
            enrollment('1', 'ann', 'safe', '2026-02-01', completed('2026-02-20')),
            enrollment('2', 'bob', 'barista', '2026-05-01', { status: 'withdrawn' }),
        ], YEAR_2026);

        expect(report.coursesDelivered).toBe(1);
        expect(report.courses).toHaveLength(2);
    });
});

describe('completionDay', () => {
    it('is the course date of a completed enrollment', () => {
        expect(completionDay({ status: 'completed', completed_date: '2026-03-04', completed_at: '2026-03-09T10:00:00Z', confirmed_date: null })).toBe('2026-03-04');
    });

    it('falls back to when it was marked completed, then to the confirmed date', () => {
        expect(completionDay({ status: 'completed', completed_date: null, completed_at: '2026-03-09T12:00:00Z', confirmed_date: '2026-03-01' })).toBe('2026-03-09');
        expect(completionDay({ status: 'completed', completed_date: null, completed_at: null, confirmed_date: '2026-03-01' })).toBe('2026-03-01');
        expect(completionDay({ status: 'completed', completed_date: null, completed_at: null, confirmed_date: null })).toBeNull();
    });

    it('is null for an enrollment that is not completed', () => {
        expect(completionDay({ status: 'confirmed', completed_date: '2026-03-04', completed_at: null, confirmed_date: '2026-03-04' })).toBeNull();
    });
});

describe('foldCourses', () => {
    const row = (id: string, registered: number, completedCount: number, runs = 1): ReportCourseRow => ({ courseId: id, name: id, registered, completed: completedCount, runs });

    it('keeps short lists as they are', () => {
        const rows = [row('a', 3, 1), row('b', 2, 2)];
        expect(foldCourses(rows, 2)).toBe(rows);
    });

    it('folds the rest into one "Other courses" row that keeps the totals', () => {
        const folded = foldCourses([row('a', 9, 1), row('b', 5, 2), row('c', 3, 3), row('d', 2, 0), row('e', 1, 1)], 3);
        expect(folded).toEqual([
            row('a', 9, 1),
            row('b', 5, 2),
            { courseId: 'other', name: 'Other courses (3)', registered: 6, completed: 4, runs: 3 },
        ]);
    });
});

describe('presetPeriod', () => {
    const today = new Date(2026, 9, 13); // 13 Oct 2026

    it('covers the expected days', () => {
        expect(presetPeriod('ytd', today)).toEqual({ start: '2026-01-01', end: '2026-10-13' });
        expect(presetPeriod('last-year', today)).toEqual({ start: '2025-01-01', end: '2025-12-31' });
        expect(presetPeriod('12m', today)).toEqual({ start: '2025-11-01', end: '2026-10-13' });
        expect(presetPeriod('this-quarter', today)).toEqual({ start: '2026-10-01', end: '2026-10-13' });
        expect(presetPeriod('last-quarter', today)).toEqual({ start: '2026-07-01', end: '2026-09-30' });
        expect(presetPeriod('this-month', today)).toEqual({ start: '2026-10-01', end: '2026-10-13' });
        expect(presetPeriod('last-month', today)).toEqual({ start: '2026-09-01', end: '2026-09-30' });
    });

    it('steps back over the new year', () => {
        const january = new Date(2026, 0, 15);
        expect(presetPeriod('last-month', january)).toEqual({ start: '2025-12-01', end: '2025-12-31' });
        expect(presetPeriod('last-quarter', january)).toEqual({ start: '2025-10-01', end: '2025-12-31' });
        expect(presetPeriod('12m', january)).toEqual({ start: '2025-02-01', end: '2026-01-15' });
    });
});

describe('formatPeriodLabel', () => {
    it('writes the year once when both ends share it', () => {
        expect(formatPeriodLabel({ start: '2026-01-01', end: '2026-10-13' })).toBe('1 January – 13 October 2026');
    });

    it('writes both years across a new year, and one day as one date', () => {
        expect(formatPeriodLabel({ start: '2025-11-01', end: '2026-10-13' })).toBe('1 November 2025 – 13 October 2026');
        expect(formatPeriodLabel({ start: '2026-10-13', end: '2026-10-13' })).toBe('13 October 2026');
    });
});

describe('niceStep', () => {
    it('steps by 1, 2 or 5 × 10ⁿ in at most four steps', () => {
        expect(niceStep(3)).toBe(1);
        expect(niceStep(7)).toBe(2);
        expect(niceStep(18)).toBe(5);
        expect(niceStep(41)).toBe(20);
        expect(niceStep(160)).toBe(50);
    });
});
