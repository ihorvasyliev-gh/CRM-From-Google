import { describe, it, expect } from 'vitest';
import {
    computeAvailableCourseDates,
    computeColumnGroups,
    computeCourseActiveCounts,
    matchesAttributeFilters,
    pickTopN,
} from './boardFilters';
import type { EnrollmentRow } from '../../hooks/useEnrollments';
import type { StudentFlag } from '../../lib/types';

function makeRow(id: string, over: Partial<EnrollmentRow> = {}): EnrollmentRow {
    return {
        id,
        student_id: `st-${id}`,
        course_id: 'c-1',
        status: 'requested',
        course_variant: 'English',
        notes: null,
        is_priority: false,
        invited_date: null,
        invited_dates: null,
        confirmed_date: null,
        completed_date: null,
        invited_at: null,
        confirmed_at: null,
        completed_at: null,
        response_days: 7,
        completion_request_status: null,
        created_at: '2026-10-01T10:00:00Z',
        updated_at: '2026-10-01T10:00:00Z',
        students: {
            id: `st-${id}`,
            first_name: `First${id}`,
            last_name: 'Last',
            email: `${id}@example.com`,
            phone: '+353871234567',
            address: null,
            eircode: null,
            dob: null,
            created_at: '2026-01-01T00:00:00Z',
        },
        courses: {
            id: 'c-1',
            name: 'Safe Pass',
            max_capacity: 12,
            created_at: '2026-01-01T00:00:00Z',
        },
        ...over,
    } as EnrollmentRow;
}

describe('computeAvailableCourseDates', () => {
    const today = '2026-11-20';

    it('excludes withdrawn and rejected rows even when they carry future dates', () => {
        const rows = [
            makeRow('1', { status: 'confirmed', confirmed_date: '2026-11-27' }),
            makeRow('2', { status: 'withdrawn', confirmed_date: '2026-11-27' }),
            makeRow('3', { status: 'rejected', invited_date: '2026-11-27' }),
        ];
        const { availableCourseDates, courseDatesTotal } = computeAvailableCourseDates(rows, 'all', 'all', today);
        expect(availableCourseDates).toHaveLength(1);
        expect(availableCourseDates[0]).toMatchObject({ date: '2026-11-27', count: 1, confirmed: 1, invited: 0, isPast: false, maxCapacity: 12 });
        expect(courseDatesTotal).toBe(1);
    });

    it('includes past dates ONLY when confirmed or invited enrollments remain, marking them isPast', () => {
        const rows = [
            makeRow('past-conf', { status: 'confirmed', confirmed_date: '2026-11-18' }),
            makeRow('past-done', { status: 'completed', completed_date: '2026-11-10', confirmed_date: '2026-11-10' }),
            makeRow('future-inv', { status: 'invited', invited_date: '2026-11-27' }),
        ];
        const { availableCourseDates } = computeAvailableCourseDates(rows, 'all', 'all', today);
        expect(availableCourseDates.map(d => ({ date: d.date, isPast: d.isPast }))).toEqual([
            { date: '2026-11-18', isPast: true },
            { date: '2026-11-27', isPast: false },
        ]);
    });

    it('drops maxCapacity when multiple courses share the same date', () => {
        const rows = [
            makeRow('a', { course_id: 'c-1', status: 'confirmed', confirmed_date: '2026-11-27' }),
            makeRow('b', {
                course_id: 'c-2',
                status: 'confirmed',
                confirmed_date: '2026-11-27',
                courses: { id: 'c-2', name: 'First Aid', max_capacity: 8, created_at: '2026-01-01T00:00:00Z' },
            }),
        ];
        const allCourses = computeAvailableCourseDates(rows, 'all', 'all', today);
        expect(allCourses.availableCourseDates[0].maxCapacity).toBeNull();

        const oneCourse = computeAvailableCourseDates(rows, 'c-2', 'all', today);
        expect(oneCourse.availableCourseDates[0].maxCapacity).toBe(8);
    });
});

describe('computeCourseActiveCounts', () => {
    it('counts only requested, invited, and confirmed per course', () => {
        const rows = [
            makeRow('1', { course_id: 'c-1', status: 'requested' }),
            makeRow('2', { course_id: 'c-1', status: 'invited' }),
            makeRow('3', { course_id: 'c-1', status: 'confirmed' }),
            makeRow('4', { course_id: 'c-1', status: 'completed' }),
            makeRow('5', { course_id: 'c-1', status: 'withdrawn' }),
            makeRow('6', { course_id: 'c-2', status: 'requested' }),
        ];
        const counts = computeCourseActiveCounts(rows);
        expect(counts.get('c-1')).toBe(3);
        expect(counts.get('c-2')).toBe(1);
    });
});

describe('matchesAttributeFilters', () => {
    const flags = new Map<string, StudentFlag[]>([
        ['st-flagged', [{ id: 'f1', student_id: 'st-flagged', course_id: 'c-1', comment: 'No show', created_at: '2026-01-01' }]],
    ]);
    const optedOut = new Set(['unsub@example.com']);
    const defaults = { priorityOnly: false, flagFilter: 'all' as const, pendingApprovalOnly: false, hasNoteOnly: false, emailFilter: 'all' as const };

    it('filters priority, flags, pending approvals, notes, and email reachability', () => {
        const normal = makeRow('normal');
        const flagged = makeRow('flagged', { student_id: 'st-flagged', is_priority: true, notes: 'Call first', completion_request_status: 'pending' });
        const unsub = makeRow('unsub', { students: { ...normal.students!, email: 'UNSUB@example.com' } });
        const noEmail = makeRow('noemail', { students: { ...normal.students!, email: '' } });

        expect(matchesAttributeFilters(flagged, { ...defaults, priorityOnly: true }, flags, optedOut)).toBe(true);
        expect(matchesAttributeFilters(normal, { ...defaults, priorityOnly: true }, flags, optedOut)).toBe(false);

        expect(matchesAttributeFilters(flagged, { ...defaults, flagFilter: 'flagged' }, flags, optedOut)).toBe(true);
        expect(matchesAttributeFilters(flagged, { ...defaults, flagFilter: 'unflagged' }, flags, optedOut)).toBe(false);

        expect(matchesAttributeFilters(flagged, { ...defaults, pendingApprovalOnly: true }, flags, optedOut)).toBe(true);
        expect(matchesAttributeFilters(flagged, { ...defaults, hasNoteOnly: true }, flags, optedOut)).toBe(true);

        expect(matchesAttributeFilters(unsub, { ...defaults, emailFilter: 'unreachable' }, flags, optedOut)).toBe(true);
        expect(matchesAttributeFilters(noEmail, { ...defaults, emailFilter: 'unreachable' }, flags, optedOut)).toBe(true);
        expect(matchesAttributeFilters(normal, { ...defaults, emailFilter: 'emailable' }, flags, optedOut)).toBe(true);
        expect(matchesAttributeFilters(unsub, { ...defaults, emailFilter: 'emailable' }, flags, optedOut)).toBe(false);
    });
});

describe('computeColumnGroups', () => {
    const today = '2026-11-20';

    it('groups confirmed rows into Priority, past dates, upcoming dates, and undated', () => {
        const items = [
            makeRow('p', { status: 'confirmed', is_priority: true, confirmed_date: '2026-12-04' }),
            makeRow('past', { status: 'confirmed', confirmed_date: '2026-11-18' }),
            makeRow('d1a', { status: 'confirmed', confirmed_date: '2026-11-27' }),
            makeRow('d1b', { status: 'confirmed', confirmed_date: '2026-11-27' }),
            makeRow('none', { status: 'confirmed', confirmed_date: null }),
        ];
        const groups = computeColumnGroups(items, 'confirmed', 'date-asc', today);
        expect(groups?.map(g => ({ key: g.key, count: g.items.length, isPast: g.isPast, maxCapacity: g.maxCapacity }))).toEqual([
            { key: 'priority', count: 1, isPast: false, maxCapacity: undefined },
            { key: 'date:2026-11-18', count: 1, isPast: true, maxCapacity: 12 },
            { key: 'date:2026-11-27', count: 2, isPast: false, maxCapacity: 12 },
            { key: 'undated', count: 1, isPast: false, maxCapacity: undefined },
        ]);
    });

    it('returns null for requested, name sort, or a single upcoming cohort', () => {
        const single = [makeRow('a', { status: 'confirmed', confirmed_date: '2026-11-27' })];
        expect(computeColumnGroups(single, 'confirmed', 'date-asc', today)).toBeNull();
        expect(computeColumnGroups(single, 'requested', 'date-asc', today)).toBeNull();
        expect(computeColumnGroups(
            [makeRow('a', { status: 'confirmed', confirmed_date: '2026-11-27' }), makeRow('b', { status: 'confirmed', confirmed_date: '2026-12-04' })],
            'confirmed',
            'name',
            today,
        )).toBeNull();
    });
});

describe('pickTopN', () => {
    it('picks the first N rows, optionally skipping unsubscribed and no-email students', () => {
        const optedOut = new Set(['skip@example.com']);
        const items = [
            makeRow('1', { students: { ...makeRow('1').students!, email: 'skip@example.com' } }),
            makeRow('2', { students: { ...makeRow('2').students!, email: '' } }),
            makeRow('3', { students: { ...makeRow('3').students!, email: 'ok1@example.com' } }),
            makeRow('4', { students: { ...makeRow('4').students!, email: 'ok2@example.com' } }),
            makeRow('5', { students: { ...makeRow('5').students!, email: 'ok3@example.com' } }),
        ];

        expect(pickTopN(items, 2, optedOut, true)).toEqual(['3', '4']);
        expect(pickTopN(items, 2, optedOut, false)).toEqual(['1', '2']);
    });
});
