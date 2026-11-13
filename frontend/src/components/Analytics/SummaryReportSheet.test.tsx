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
        outcomes: { graduates: 7, asked: 6, responded: 4, working: 3, notWorking: 1, fullTime: 2, partTime: 1, fields: [{ name: 'Construction', count: 3 }] },
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
    it('shows the period, a summary in words, the key figures and a row per course', () => {
        render(sheet(insights([course(1, 4, 2, 3), course(2, 1, 1, 1)]), 1));

        expect(screen.getByText('1 January – 28 February 2026')).toBeInTheDocument();
        expect(screen.getByText(/^In the period 1 January – 28 February 2026, 1,234 people registered for a course/)).toBeInTheDocument();
        expect(screen.getByText('1,234')).toBeInTheDocument();
        expect(screen.getByText('5 course registrations')).toBeInTheDocument();
        expect(screen.getByText('with graduates, across 2 courses')).toBeInTheDocument();
        expect(screen.getByText('75%')).toBeInTheDocument();
        expect(screen.getByRole('img', { name: 'Registrations and completions by month' })).toBeInTheDocument();
        const table = screen.getByRole('table');
        expect(within(table).getByText('Course 1')).toBeInTheDocument();
        expect(within(table).getByText('Course 2')).toBeInTheDocument();
        expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
    });

    it('adds a second page about the queue, employment and who registered', () => {
        render(sheet(insights([course(1, 4, 2, 3)])));

        expect(screen.getAllByRole('article')).toHaveLength(2);
        const second = screen.getByRole('article', { name: 'Courses report, page 2' });
        expect(within(second).getByText(/^Of the 4 registrations made in the period/)).toBeInTheDocument();
        expect(within(second).getByText('Longest waiting lists today')).toBeInTheDocument();
        expect(within(second).getByText(/were sent the employment survey, and 4 answered/)).toBeInTheDocument();
        expect(within(second).getByText('Construction')).toBeInTheDocument();
        expect(within(second).getByText('Ukrainian')).toBeInTheDocument();
        expect(within(second).getByText('How the figures are counted')).toBeInTheDocument();
        expect(within(second).getByText('Page 2 of 2')).toBeInTheDocument();
    });

    it('folds a long course list into "Other courses" so it stays on the page', () => {
        const many = Array.from({ length: 30 }, (_, i) => course(i + 1, 30 - i, 1));
        render(sheet(insights(many), 1));

        const rows = within(screen.getByRole('table')).getAllByRole('row');
        // Header, 10 rows (9 courses and "Other"), total
        expect(rows).toHaveLength(12);
        expect(screen.getByText('Other courses (21)')).toBeInTheDocument();
    });

    it('says so when nothing happened in the period, without an empty chart', () => {
        const quiet = TWO_MONTHS.map(m => ({ ...m, registered: 0, completed: 0 }));
        render(sheet(insights([], quiet), 1));

        expect(screen.getByText('No registrations or completions in this period.')).toBeInTheDocument();
        expect(screen.queryByRole('img', { name: 'Registrations and completions by month' })).not.toBeInTheDocument();
        expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });
});
