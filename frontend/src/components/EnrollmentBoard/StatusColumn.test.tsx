import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import StatusColumn from './StatusColumn';
import { TooltipProvider } from '../ui/Tooltip';
import type { EnrollmentRow } from '../../hooks/useEnrollments';

const row = (n: number) => ({
    id: `e-${n}`,
    student_id: `s-${n}`,
    course_id: 'c-1',
    status: 'requested',
    course_variant: null,
    created_at: `2026-01-0${n}T00:00:00Z`,
    is_priority: false,
    notes: null,
    students: { id: `s-${n}`, first_name: `Student${n}`, last_name: 'Test', email: null, phone: null },
    courses: { id: 'c-1', name: 'SafePass' },
}) as unknown as EnrollmentRow;

function setup() {
    const toggleSelect = vi.fn();
    const selectMany = vi.fn();
    render(
        <TooltipProvider>
            <DndContext>
                <StatusColumn
                    status="requested"
                    items={[1, 2, 3, 4, 5].map(row)}
                    selectedIds={new Set()}
                    selectAllInList={vi.fn()}
                    handleCopyEmails={vi.fn()}
                    toggleSelect={toggleSelect}
                    selectMany={selectMany}
                    togglePriority={vi.fn()}
                    openEditNote={vi.fn()}
                    queuePositions={new Map()}
                    queueDetails={new Map()}
                    flagsByStudentId={new Map()}
                    completedCoursesByStudentId={new Map()}
                    onFlagClick={vi.fn()}
                    emptyFlags={[]}
                    emptyCompletedCourses={[]}
                    sessions={new Map()}
                    filters={{}}
                />
            </DndContext>
        </TooltipProvider>
    );
    const card = (n: number) => screen.getByRole('checkbox', { name: `Select Student${n} Test` });
    return { toggleSelect, selectMany, card };
}

describe('StatusColumn: Shift+click', () => {
    it('selects every card from the last one clicked to this one, in either direction', () => {
        const { toggleSelect, selectMany, card } = setup();

        fireEvent.click(card(2));
        expect(toggleSelect).toHaveBeenCalledWith('e-2');

        fireEvent.click(card(4), { shiftKey: true });
        expect(selectMany).toHaveBeenCalledWith(['e-2', 'e-3', 'e-4']);

        fireEvent.click(card(1), { shiftKey: true });
        expect(selectMany).toHaveBeenLastCalledWith(['e-1', 'e-2', 'e-3', 'e-4']);
        expect(toggleSelect).toHaveBeenCalledTimes(1);
    });

    it('is a plain click when no card was clicked before', () => {
        const { toggleSelect, selectMany, card } = setup();
        fireEvent.click(card(3), { shiftKey: true });
        expect(toggleSelect).toHaveBeenCalledWith('e-3');
        expect(selectMany).not.toHaveBeenCalled();
    });
});

describe('StatusColumn: a changed row', () => {
    it('shows a student\'s new phone number as soon as the row changes', () => {
        const props = {
            status: 'requested', selectedIds: new Set<string>(), selectAllInList: vi.fn(), handleCopyEmails: vi.fn(),
            toggleSelect: vi.fn(), togglePriority: vi.fn(), openEditNote: vi.fn(), queuePositions: new Map(),
            queueDetails: new Map(), flagsByStudentId: new Map(), completedCoursesByStudentId: new Map(),
            onFlagClick: vi.fn(), emptyFlags: [], emptyCompletedCourses: [], sessions: new Map(), filters: {},
        };
        const withPhone = (phone: string) => [1, 2].map(n => {
            const r = row(n);
            return n === 1 ? { ...r, students: { ...r.students!, phone } } as EnrollmentRow : r;
        });
        const ui = (items: EnrollmentRow[]) => (
            <TooltipProvider><DndContext><StatusColumn {...props} items={items} /></DndContext></TooltipProvider>
        );
        const { rerender } = render(ui(withPhone('0851234567')));
        expect(screen.getByText('085 123 4567')).toBeInTheDocument();

        // Only the student's phone differs: id, status, notes and dates are the same
        rerender(ui(withPhone('0879998888')));
        expect(screen.getByText('087 999 8888')).toBeInTheDocument();
        expect(screen.queryByText('085 123 4567')).not.toBeInTheDocument();
    });
});

describe('StatusColumn: date groups, Top N, and collapse rail', () => {
    const baseProps = {
        selectedIds: new Set<string>(),
        selectAllInList: vi.fn(),
        handleCopyEmails: vi.fn(),
        toggleSelect: vi.fn(),
        togglePriority: vi.fn(),
        openEditNote: vi.fn(),
        queuePositions: new Map<string, number>(),
        queueDetails: new Map<string, string>(),
        flagsByStudentId: new Map(),
        completedCoursesByStudentId: new Map(),
        onFlagClick: vi.fn(),
        emptyFlags: [],
        emptyCompletedCourses: [],
        sessions: new Map(),
        filters: {},
    };

    it('renders date group headers in Confirmed and selects a whole cohort on click', () => {
        const selectAllInList = vi.fn();
        const items = [
            { ...row(1), status: 'confirmed', confirmed_date: '2026-12-01' } as EnrollmentRow,
            { ...row(2), status: 'confirmed', confirmed_date: '2026-12-01' } as EnrollmentRow,
            { ...row(3), status: 'confirmed', confirmed_date: '2026-12-08' } as EnrollmentRow,
        ];
        render(
            <TooltipProvider>
                <DndContext>
                    <StatusColumn {...baseProps} status="confirmed" items={items} selectAllInList={selectAllInList} />
                </DndContext>
            </TooltipProvider>
        );

        expect(screen.getByTestId('date-group-date:2026-12-01')).toBeInTheDocument();
        expect(screen.getByTestId('date-group-date:2026-12-08')).toBeInTheDocument();

        const selectBtns = screen.getAllByRole('button', { name: /^Select all \d+ in/ });
        fireEvent.click(selectBtns[0]);
        expect(selectAllInList).toHaveBeenCalledWith([items[0], items[1]]);
    });

    it('selects Top N from Requested queue while skipping unsubscribed & no-email rows by default', () => {
        const onSelectTopN = vi.fn();
        const items = [1, 2, 3, 4].map(n => ({
            ...row(n),
            students: { id: `s-${n}`, first_name: `S${n}`, last_name: 'T', email: n === 1 ? '' : `s${n}@example.com`, phone: null },
        } as unknown as EnrollmentRow));
        render(
            <TooltipProvider>
                <DndContext>
                    <StatusColumn
                        {...baseProps}
                        status="requested"
                        items={items}
                        onSelectTopN={onSelectTopN}
                        optedOutEmails={new Set(['s2@example.com'])}
                    />
                </DndContext>
            </TooltipProvider>
        );

        fireEvent.click(screen.getByRole('button', { name: 'Select top N in queue' }));
        fireEvent.change(screen.getByLabelText('Custom number of students'), { target: { value: '2' } });
        fireEvent.click(screen.getByRole('button', { name: 'Pick' }));

        // Skips e-1 (no email) and e-2 (unsubscribed), picks e-3 & e-4
        expect(onSelectTopN).toHaveBeenCalledWith(['e-3', 'e-4']);
    });

    it('renders a compact vertical rail when collapsed and expands on click', () => {
        const onToggleCollapse = vi.fn();
        render(
            <TooltipProvider>
                <DndContext>
                    <StatusColumn {...baseProps} status="completed" items={[row(1), row(2)]} collapsed canCollapse onToggleCollapse={onToggleCollapse} />
                </DndContext>
            </TooltipProvider>
        );

        const expandBtn = screen.getByRole('button', { name: 'Expand Completed column (2)' });
        fireEvent.click(expandBtn);
        expect(onToggleCollapse).toHaveBeenCalledTimes(1);
    });
});
