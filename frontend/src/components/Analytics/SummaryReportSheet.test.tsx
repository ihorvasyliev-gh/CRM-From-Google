import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import SummaryReportSheet from './SummaryReportSheet';
import type { Insights } from './insights';
import { buildNarrative } from './narrative';
import type { ReportCourseRow, SummaryReport } from './summaryReport';

const course = (i: number, registered: number, completed: number, runs = 1): ReportCourseRow => ({
    courseId: `c${i}`,
    name: `Course ${i}`,
    registered,
    completed,
    runs,
});

const TWO_MONTHS = [
    { month: '2026-01', registered: 3, completed: 1 },
    { month: '2026-02', registered: 2, completed: 2 },
];
const PERIOD = { start: '2026-01-01', end: '2026-02-28' };

function insights(courses: ReportCourseRow[], months: SummaryReport['months'] = TWO_MONTHS): Insights {
    const registrations = courses.reduce((s, c) => s + c.registered, 0);
    return {
        period: PERIOD,
        summary: {
            peopleRegistered: courses.length ? 1234 : 0,
            registrations,
            peopleCompleted: courses.length ? 7 : 0,
            completions: courses.reduce((s, c) => s + c.completed, 0),
            courseRuns: courses.reduce((s, c) => s + c.runs, 0),
            coursesDelivered: courses.filter(c => c.completed > 0).length,
            courses,
            months,
        },
        previous: null,
        fates: { total: registrations, completed: 2, confirmed: 1, invited: 0, waiting: registrations - 3, left: 0 },
        queue: { waiting: 9, invited: 2, confirmed: 4, courses: [{ courseId: 'c1', name: 'Course 1', waiting: 9, invited: 2, confirmed: 4 }] },
        outcomes: { graduates: 7, asked: 6, responded: 4, working: 3, notWorking: 1, fullTime: 2, partTime: 1, selfEmployed: 0, ceTus: 0, fields: [{ name: 'Construction', count: 3 }] },
        people: {
            total: courses.length ? 1234 : 0,
            languages: [{ name: 'English', count: 1000 }, { name: 'Ukrainian', count: 234 }],
            areas: [{ name: 'Cork City (North)', count: 800 }, { name: 'Not known', count: 434 }],
            ages: [{ name: '25–34', count: 1234 }],
        },
        multiCourse: 0,
    };
}

const sheet = (data: Insights, pages: 1 | 2 = 2) => <SummaryReportSheet insights={data} narrative={buildNarrative(data)} pages={pages} />;

describe('SummaryReportSheet', () => {
    it('shows the period, key figures with badges, highlights, monthly chart and courses with waiting queue', () => {
        const data = {
            ...insights([course(1, 4, 2, 3), course(2, 1, 1, 1)]),
            previous: {
                period: { start: '2025-11-01', end: '2025-12-31' },
                peopleRegistered: 1000,
                registrations: 4,
                peopleCompleted: 5,
                completions: 2,
            },
        };
        render(sheet(data, 1));

        expect(screen.getByText('1 January – 28 February 2026')).toBeInTheDocument();
        expect(screen.getByText('Key highlights')).toBeInTheDocument();
        expect(screen.getByText('1,234')).toBeInTheDocument();
        expect(screen.getByText('▲ 23%')).toBeInTheDocument();
        expect(screen.getByText('5 course registrations')).toBeInTheDocument();
        expect(screen.getByText('with graduates, across 2 courses')).toBeInTheDocument();
        // 3 working out of 6 surveyed = 50%
        expect(screen.getByText('50%')).toBeInTheDocument();
        expect(screen.getByText('3 of 6 surveyed (4 answered)')).toBeInTheDocument();
        expect(screen.getByRole('img', { name: 'Registrations and completions by month' })).toBeInTheDocument();
        const table = screen.getByRole('table');
        expect(within(table).getByText('Waiting now')).toBeInTheDocument();
        expect(within(table).getByText('Course 1')).toBeInTheDocument();
        expect(within(table).getByText('Course 2')).toBeInTheDocument();
        expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
    });

    it('adds a second page with pipeline, employment funnel + donut + sectors, and participant profile histogram', () => {
        render(sheet(insights([course(1, 4, 2, 3)])));

        expect(screen.getAllByRole('article')).toHaveLength(2);
        const second = screen.getByRole('article', { name: 'Courses report, page 2' });
        expect(within(second).getByText(/^Of 4 registrations made in the period/)).toBeInTheDocument();
        expect(within(second).getByText('Longest waiting lists today')).toBeInTheDocument();
        expect(within(second).getByText(/were surveyed; 4 \(67%\) answered/)).toBeInTheDocument();
        expect(within(second).getByText('Type of work')).toBeInTheDocument();
        expect(within(second).getByRole('img', { name: 'Type of work breakdown' })).toBeInTheDocument();
        expect(within(second).getByRole('img', { name: 'Age distribution of registrants' })).toBeInTheDocument();
        expect(within(second).getByText('Construction')).toBeInTheDocument();
        expect(within(second).getByText('Full-time')).toBeInTheDocument();
        expect(within(second).getByText('Ukrainian')).toBeInTheDocument();
        expect(within(second).getByText(/How the figures are counted/)).toBeInTheDocument();
        expect(within(second).getByText('Page 2 of 2')).toBeInTheDocument();
    });

    it('renders Self-employed and CE / TUS slices in the Type of work breakdown', () => {
        const base = insights([course(1, 4, 2, 1)]);
        const data: Insights = {
            ...base,
            outcomes: {
                graduates: 10,
                asked: 10,
                responded: 8,
                working: 6,
                notWorking: 2,
                fullTime: 2,
                partTime: 1,
                selfEmployed: 1,
                ceTus: 1,
                fields: [{ name: 'Retail', count: 6 }],
            },
        };
        render(sheet(data, 2));

        const second = screen.getByRole('article', { name: 'Courses report, page 2' });
        expect(within(second).getByText('Type of work')).toBeInTheDocument();
        expect(within(second).getByText('Full-time')).toBeInTheDocument();
        expect(within(second).getByText('Part-time')).toBeInTheDocument();
        expect(within(second).getByText('Self-employed')).toBeInTheDocument();
        expect(within(second).getByText('CE / TUS')).toBeInTheDocument();
        expect(within(second).getByText('Not said')).toBeInTheDocument();
        expect(within(second).getByText(/1 self-employed and 1 on CE \/ TUS/)).toBeInTheDocument();
    });

    it('shows up to 15 courses individually without folding into "Other courses"', () => {
        const eleven = Array.from({ length: 11 }, (_, i) => course(i + 1, 20 - i, 1));
        render(sheet(insights(eleven), 1));

        const rows = within(screen.getByRole('table')).getAllByRole('row');
        // Header, 11 courses, total
        expect(rows).toHaveLength(13);
        expect(screen.getByText('Course 11')).toBeInTheDocument();
        expect(screen.queryByText(/Other courses/)).not.toBeInTheDocument();
    });

    it('folds a very long course list into "Other courses" so it stays on the page', () => {
        const many = Array.from({ length: 30 }, (_, i) => course(i + 1, 30 - i, 1));
        render(sheet(insights(many), 1));

        const rows = within(screen.getByRole('table')).getAllByRole('row');
        // Header, 15 rows (14 courses and "Other"), total
        expect(rows).toHaveLength(17);
        expect(screen.getByText('Other courses (16)')).toBeInTheDocument();
    });

    it('says so when nothing happened in the period, without an empty chart', () => {
        const quiet = TWO_MONTHS.map(m => ({ ...m, registered: 0, completed: 0 }));
        render(sheet(insights([], quiet), 1));

        expect(screen.getByText('No registrations or completions in this period.')).toBeInTheDocument();
        expect(screen.queryByRole('img', { name: 'Registrations and completions by month' })).not.toBeInTheDocument();
        expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });

    it('reconciles table Waiting now totals when inactive courses also hold waiting registrations', () => {
        const base = insights([course(1, 4, 2, 1)]);
        const data: Insights = {
            ...base,
            queue: {
                waiting: 14,
                invited: 0,
                confirmed: 0,
                courses: [
                    { courseId: 'c1', name: 'Course 1', waiting: 9, invited: 0, confirmed: 0 },
                    { courseId: 'inactive-course', name: 'Old Course', waiting: 5, invited: 0, confirmed: 0 },
                ],
            },
        };
        render(sheet(data, 1));

        expect(screen.getByText(/5 additional waiting registrations are in other courses \(total waiting today: 14\)/)).toBeInTheDocument();
    });

    it('handles zero working responses and missing dates of birth gracefully on page 2', () => {
        const base = insights([course(1, 4, 2, 1)]);
        const data: Insights = {
            ...base,
            outcomes: { graduates: 7, asked: 6, responded: 2, working: 0, notWorking: 2, fullTime: 0, partTime: 0, selfEmployed: 0, ceTus: 0, fields: [] },
            people: {
                ...base.people,
                ages: [{ name: 'Not known', count: 1234 }],
            },
        };
        render(sheet(data, 2));

        const second = screen.getByRole('article', { name: 'Courses report, page 2' });
        expect(within(second).getByText('No working responses yet.')).toBeInTheDocument();
        expect(within(second).getByText('No sectors reported yet.')).toBeInTheDocument();
        expect(within(second).getByText('Date of birth not recorded.')).toBeInTheDocument();
    });
});
