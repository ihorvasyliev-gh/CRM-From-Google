import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import CourseMatrixTab from './CourseMatrixTab';
import { courseRunKey } from './courseRuns';
import type { EnrollmentWithRelations } from '../../lib/documentUtils';

beforeAll(() => {
    // Recharts' ResponsiveContainer measures its box; jsdom has no ResizeObserver
    globalThis.ResizeObserver ??= class {
        observe() {}
        unobserve() {}
        disconnect() {}
    } as unknown as typeof ResizeObserver;
});

const graduate = (id: string, courseId: string, name: string, date: string, extra: Partial<EnrollmentWithRelations> = {}) => ({
    id,
    student_id: `s-${id}`,
    course_id: courseId,
    status: 'completed',
    course_variant: null,
    invited_date: date,
    confirmed_date: date,
    completed_date: date,
    created_at: '2026-01-01T12:00:00Z',
    courses: { id: courseId, name },
    students: { id: `s-${id}` },
    ...extra,
}) as unknown as EnrollmentWithRelations;

describe('CourseMatrixTab — conducted course runs', () => {
    const counted = [graduate('1', 'safe', 'SafePass', '2026-07-16'), graduate('2', 'safe', 'SafePass', '2026-07-16')];
    const ignored = [graduate('3', 'manual', 'Manual Handling', '2026-06-30', { exclude_from_reports: true })];

    it('lists ignored runs apart and marks one as ignored by its run key', () => {
        const onSetRunIgnored = vi.fn().mockResolvedValue(undefined);
        render(<CourseMatrixTab enrollments={counted} ignoredEnrollments={ignored} onDrillDown={() => {}} onSetRunIgnored={onSetRunIgnored} />);

        expect(screen.getByText('1 cohorts with completions · 1 ignored in reports')).toBeInTheDocument();

        const runs = screen.getByRole('table');
        const ignoredRow = within(runs).getByText('Manual Handling').closest('tr')!;
        expect(within(ignoredRow).getByText('Ignored in reports')).toBeInTheDocument();
        expect(within(ignoredRow).getByRole('button', { name: /Count again/ })).toBeInTheDocument();

        const countedRow = within(runs).getByText('SafePass').closest('tr')!;
        expect(within(countedRow).getByText('2')).toBeInTheDocument();
        fireEvent.click(within(countedRow).getByRole('button', { name: /Ignore/ }));
        expect(onSetRunIgnored).toHaveBeenCalledWith(courseRunKey(counted[0]), true);
    });

    it('opens the graduates of a run without toggling it', () => {
        const onDrillDown = vi.fn();
        const onSetRunIgnored = vi.fn();
        render(<CourseMatrixTab enrollments={counted} onDrillDown={onDrillDown} onSetRunIgnored={onSetRunIgnored} />);

        fireEvent.click(screen.getByRole('button', { name: /View graduates/ }));
        expect(onDrillDown).toHaveBeenCalledWith(expect.stringContaining('SafePass'), counted);
        expect(onSetRunIgnored).not.toHaveBeenCalled();
    });
});
