import { describe, it, expect } from 'vitest';
import type { EnrollmentWithRelations } from '../../lib/documentUtils';
import type { EmploymentStatusRow } from '../../lib/types';
import { ageGroup, ageOn, buildInsights, dataSpan, previousPeriod } from './insights';
import { buildNarrative } from './narrative';

const COURSES: Record<string, string> = { safe: 'Safe Pass', sna: 'SNA Level 5', barista: 'Barista' };
const TODAY = new Date(2026, 10, 13, 12);
const YEAR = { start: '2026-01-01', end: '2026-11-13' };

function enrollment(
    id: string,
    studentId: string,
    courseId: string,
    registered: string,
    extra: Partial<EnrollmentWithRelations> = {},
    student: Partial<NonNullable<EnrollmentWithRelations['students']>> = {},
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
        students: { id: studentId, address: null, eircode: null, dob: null, ...student },
        ...extra,
    } as EnrollmentWithRelations;
}

const completed = (date: string): Partial<EnrollmentWithRelations> => ({
    status: 'completed',
    completed_date: date,
    completed_at: `${date}T16:00:00Z`,
});

const survey = (studentId: string, extra: Partial<EmploymentStatusRow>): EmploymentStatusRow => ({
    id: `es-${studentId}`,
    student_id: studentId,
    email: null,
    is_working: null,
    started_month: null,
    field_of_work: null,
    employment_type: null,
    status: 'pending',
    last_invited_at: null,
    last_responded_at: null,
    ...extra,
});

describe('previousPeriod', () => {
    it('takes the whole months before a period of whole months', () => {
        expect(previousPeriod({ start: '2026-10-01', end: '2026-10-31' })).toEqual({ start: '2026-09-01', end: '2026-09-30' });
        expect(previousPeriod({ start: '2026-07-01', end: '2026-09-30' })).toEqual({ start: '2026-04-01', end: '2026-06-30' });
        expect(previousPeriod({ start: '2025-01-01', end: '2025-12-31' })).toEqual({ start: '2024-01-01', end: '2024-12-31' });
    });

    it('takes the same dates a year earlier for a year to date', () => {
        expect(previousPeriod(YEAR)).toEqual({ start: '2025-01-01', end: '2025-11-13' });
    });

    it('otherwise takes the same number of days just before', () => {
        expect(previousPeriod({ start: '2026-11-04', end: '2026-11-13' })).toEqual({ start: '2026-10-25', end: '2026-11-03' });
    });
});

describe('age', () => {
    it('counts whole years up to the day', () => {
        expect(ageOn('2000-11-13', TODAY)).toBe(26);
        expect(ageOn('2000-11-14', TODAY)).toBe(25);
        expect(ageOn(null, TODAY)).toBeNull();
        expect(ageOn('not a date', TODAY)).toBeNull();
    });

    it('groups ages', () => {
        expect([17, 18, 24, 25, 44, 45, 55, 80, null].map(ageGroup)).toEqual(
            ['Under 18', '18–24', '18–24', '25–34', '35–44', '45–54', '55+', '55+', 'Not known'],
        );
    });
});

describe('buildInsights', () => {
    const rows = [
        // Anna: completed Safe Pass, is waiting for SNA
        enrollment('1', 'anna', 'safe', '2026-02-10', completed('2026-03-05'), { address: 'Blackpool, Cork', dob: '1990-01-01' }),
        enrollment('2', 'anna', 'sna', '2026-04-01'),
        // Bohdan: queued for Safe Pass in two languages, invited in one
        enrollment('3', 'bohdan', 'safe', '2026-05-02', { course_variant: 'Ukrainian', status: 'invited' }, { address: 'Douglas', dob: '2004-06-01' }),
        enrollment('4', 'bohdan', 'safe', '2026-05-02'),
        // Ciara: completed both courses, and works
        enrollment('5', 'ciara', 'safe', '2026-01-15', completed('2026-03-05')),
        enrollment('6', 'ciara', 'barista', '2026-01-15', completed('2026-06-20')),
        // Dara withdrew; Eoin registered last year and completed this year
        enrollment('7', 'dara', 'barista', '2026-06-01', { status: 'withdrawn' }),
        enrollment('8', 'eoin', 'safe', '2025-03-01', completed('2026-03-05')),
        // Left out of reports
        enrollment('9', 'finn', 'sna', '2026-02-01', { ...completed('2026-02-20'), exclude_from_reports: true }),
    ];
    const statuses = [
        survey('ciara', { status: 'responded', is_working: true, employment_type: 'full_time', field_of_work: 'hospitality' }),
        survey('anna', { status: 'responded', is_working: false }),
        survey('eoin', { status: 'pending' }),
        survey('finn', { status: 'responded', is_working: true }),
    ];
    const insights = buildInsights(rows, statuses, YEAR, { today: TODAY });

    it('counts the period like the report', () => {
        expect(insights.summary.peopleRegistered).toBe(4);
        expect(insights.summary.registrations).toBe(6);
        expect(insights.summary.peopleCompleted).toBe(3);
        expect(insights.summary.completions).toBe(4);
    });

    it('compares with the period before only when it holds something', () => {
        expect(insights.previous).toEqual({
            period: { start: '2025-01-01', end: '2025-11-13' },
            peopleRegistered: 1, registrations: 1, peopleCompleted: 0, completions: 0,
        });
        expect(buildInsights(rows, statuses, { start: '2025-01-01', end: '2025-12-31' }, { today: TODAY }).previous).toBeNull();
        expect(buildInsights(rows, statuses, YEAR, { today: TODAY, compare: false }).previous).toBeNull();
    });

    it('says what became of the registrations, one per person and course, by how far it got', () => {
        // Bohdan's two languages of Safe Pass are one registration, counted as invited
        expect(insights.fates).toEqual({ total: 6, completed: 3, confirmed: 0, invited: 1, waiting: 1, left: 1 });
    });

    it("counts today's queue by enrollment, longest waiting list first", () => {
        expect(insights.queue.waiting).toBe(2);
        expect(insights.queue.invited).toBe(1);
        expect(insights.queue.confirmed).toBe(0);
        expect(insights.queue.courses.map(c => [c.name, c.waiting, c.invited])).toEqual([['Safe Pass', 1, 1], ['SNA Level 5', 1, 0]]);
    });

    it('reads the survey of the people who completed in the period', () => {
        expect(insights.outcomes).toEqual({
            graduates: 3, asked: 3, responded: 2, working: 1, notWorking: 1, fullTime: 1, partTime: 0,
            fields: [{ name: 'Hospitality', count: 1 }],
        });
        expect(insights.multiCourse).toBe(1);
    });

    it('describes who registered, with what is not known last', () => {
        expect(insights.people.total).toBe(4);
        expect(insights.people.languages).toEqual([{ name: 'English', count: 4 }, { name: 'Ukrainian', count: 1 }]);
        expect(insights.people.areas).toEqual([
            { name: 'Cork City North', count: 1 },
            { name: 'Cork City South', count: 1 },
            { name: 'Not known', count: 2 },
        ]);
        expect(insights.people.ages).toEqual([
            { name: '18–24', count: 1 },
            { name: '35–44', count: 1 },
            { name: 'Not known', count: 2 },
        ]);
    });

    it('finds the span of the data', () => {
        expect(dataSpan(rows, TODAY)).toEqual({ start: '2025-03-01', end: '2026-11-13' });
        expect(dataSpan([], TODAY)).toBeNull();
    });

    it('is written up in sentences', () => {
        const text = buildNarrative(insights);
        expect(text.summary[0]).toBe(
            'In the period 1 January – 13 November 2026, 4 people registered for a course (6 course registrations) and 3 people completed one (4 completions).',
        );
        expect(text.summary[1]).toBe(
            'Compared with 1 January – 13 November 2025, registrations were up 500% (1 → 6) and completions were up from none to 4.',
        );
        expect(text.summary).toContain('2 course runs with graduates were held across 2 courses, about 2 graduates per run.');
        expect(text.summary).toContain('1 person completed more than one course in the period.');
        expect(text.courses[0]).toBe('Demand was highest for Safe Pass: 3 registrations, 50% of all. Next came Barista (2) and SNA Level 5 (1).');
        expect(text.courses).toContain('1 course had registrations but no completions in the period: SNA Level 5 (1).');
        expect(text.pipeline[0]).toBe(
            'Of the 6 registrations made in the period, 3 (50%) have already completed the course, 1 is confirmed or invited, ' +
            '1 (17%) is still waiting for an invitation and 1 withdrew or was not accepted.',
        );
        expect(text.pipeline[1]).toBe(
            'Today 2 registrations are waiting for an invitation, 1 is invited and waiting for a reply, and 0 are confirmed for a coming date.',
        );
        expect(text.outcomes[0]).toBe(
            '3 of the 3 people who completed a course in the period (100%) were sent the employment survey, and 2 answered (67% of those asked).',
        );
        expect(text.outcomes[1]).toBe('Of those who answered, 1 (50%) is working: 1 full-time.');
        expect(text.outcomes[text.outcomes.length - 1]).toBe('With only 2 answers, these percentages are a rough guide.');
        expect(text.people[0]).toBe('100% of the people who registered chose a course in English; 25% in Ukrainian.');
    });

    it('says so when nothing happened', () => {
        const quiet = buildNarrative(buildInsights([], [], YEAR, { today: TODAY }));
        expect(quiet.summary).toEqual(['There were no registrations or course completions in the period 1 January – 13 November 2026.']);
        expect(quiet.courses).toEqual([]);
        expect(quiet.pipeline).toEqual(['Nobody is waiting, invited or confirmed at the moment.']);
        expect(quiet.people).toEqual([]);
    });
});
