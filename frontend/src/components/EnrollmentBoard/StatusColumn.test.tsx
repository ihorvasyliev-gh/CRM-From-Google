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
