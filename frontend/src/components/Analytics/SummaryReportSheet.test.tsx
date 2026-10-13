import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import SummaryReportSheet from './SummaryReportSheet';
import type { ReportCourseRow, SummaryReport } from './summaryReport';

const course = (i: number, registered: number, completed: number): ReportCourseRow => ({
    courseId: `c${i}`,
    name: `Course ${i}`,
    registered,
    completed,
});

function report(courses: ReportCourseRow[], months: SummaryReport['months']): SummaryReport {
    return {
        peopleRegistered: 1234,
        registrations: courses.reduce((s, c) => s + c.registered, 0),
        peopleCompleted: 7,
        completions: courses.reduce((s, c) => s + c.completed, 0),
        coursesDelivered: courses.filter(c => c.completed > 0).length,
        courses,
        months,
    };
}

const TWO_MONTHS = [
    { month: '2026-01', registered: 3, completed: 1 },
    { month: '2026-02', registered: 2, completed: 2 },
];
const PERIOD = { start: '2026-01-01', end: '2026-02-28' };

describe('SummaryReportSheet', () => {
    it('shows the period, the key figures and a row per course', () => {
        render(<SummaryReportSheet report={report([course(1, 4, 2), course(2, 1, 1)], TWO_MONTHS)} period={PERIOD} />);

        expect(screen.getByText('1 January – 28 February 2026')).toBeInTheDocument();
        expect(screen.getByText('1,234')).toBeInTheDocument();
        expect(screen.getByText('5 course registrations')).toBeInTheDocument();
        expect(screen.getByRole('img', { name: 'Registrations and completions by month' })).toBeInTheDocument();
        const table = screen.getByRole('table');
        expect(within(table).getByText('Course 1')).toBeInTheDocument();
        expect(within(table).getByText('Course 2')).toBeInTheDocument();
    });

    it('folds a long course list into "Other courses" so it stays on one page', () => {
        const many = Array.from({ length: 30 }, (_, i) => course(i + 1, 30 - i, 1));
        render(<SummaryReportSheet report={report(many, TWO_MONTHS)} period={PERIOD} />);

        const rows = within(screen.getByRole('table')).getAllByRole('row');
        // Header, 16 rows (15 courses and "Other"), total
        expect(rows).toHaveLength(18);
        expect(screen.getByText('Other courses (15)')).toBeInTheDocument();
    });

    it('says so when nothing happened in the period, without an empty chart', () => {
        const quiet = TWO_MONTHS.map(m => ({ ...m, registered: 0, completed: 0 }));
        render(<SummaryReportSheet report={report([], quiet)} period={PERIOD} />);

        expect(screen.getByText('No registrations or completions in this period.')).toBeInTheDocument();
        expect(screen.queryByRole('img', { name: 'Registrations and completions by month' })).not.toBeInTheDocument();
        expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });
});
