import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useBulkActions } from './useBulkActions';
import type { EnrollmentRow } from './useEnrollments';

const updateIn = vi.fn().mockResolvedValue({ error: null });
const updateEq = vi.fn().mockResolvedValue({ error: null });
const updateMock = vi.fn().mockReturnValue({ in: updateIn, eq: updateEq });
const deleteIn = vi.fn().mockResolvedValue({ error: null });
const insertMock = vi.fn((rows: unknown[]) => ({
    select: vi.fn().mockResolvedValue({ data: rows, error: null }),
}));

vi.mock('../lib/supabase', () => ({
    supabase: {
        from: vi.fn(() => ({
            update: updateMock,
            delete: vi.fn(() => ({ in: deleteIn })),
            insert: insertMock,
        })),
    },
}));

function makeEnrollment(id: string, status: string, studentId = `stu-${id}`): EnrollmentRow {
    return {
        id,
        student_id: studentId,
        course_id: 'crs-1',
        status,
        course_variant: 'English',
        notes: null,
        is_priority: false,
        invited_date: null,
        confirmed_date: null,
        completed_date: null,
        invited_at: null,
        confirmed_at: null,
        completed_at: null,
        response_days: 7,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        students: null,
        courses: { id: 'crs-1', name: 'Web Dev', created_at: '2026-01-01T00:00:00Z' },
    } as EnrollmentRow;
}

describe('useBulkActions Undo System', () => {
    let queryClient: QueryClient;

    beforeEach(() => {
        vi.clearAllMocks();
        updateEq.mockResolvedValue({ error: null });
        queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    it('triggers bulk status update and provides an Undo action that restores previous statuses', async () => {
        const initialEnrollments = [
            makeEnrollment('enr-1', 'requested'),
            makeEnrollment('enr-2', 'requested'),
        ];
        let currentEnrollments = [...initialEnrollments];
        const setEnrollments = vi.fn((updater) => {
            if (typeof updater === 'function') {
                currentEnrollments = updater(currentEnrollments);
            } else {
                currentEnrollments = updater;
            }
        });

        const mockShowToast = vi.fn();
        const mockOpenInvite = vi.fn();
        const mockOpenConfirm = vi.fn();

        const { result } = renderHook(
            () =>
                useBulkActions({
                    enrollments: initialEnrollments,
                    setEnrollments,
                    showToast: mockShowToast,
                    openInviteModal: mockOpenInvite,
                    openConfirmModal: mockOpenConfirm,
                }),
            { wrapper }
        );

        // Select both enrollments
        act(() => {
            result.current.toggleSelect('enr-1');
            result.current.toggleSelect('enr-2');
        });

        expect(result.current.selectedIds.size).toBe(2);

        // Bulk update to 'rejected'
        await act(async () => {
            await result.current.bulkUpdateStatus('rejected');
        });

        // Verify toast was called with success and an Undo action
        expect(mockShowToast).toHaveBeenCalledWith(
            '2 enrollment(s) → rejected',
            'success',
            expect.objectContaining({
                action: expect.objectContaining({
                    label: 'Undo',
                    onClick: expect.any(Function),
                }),
            })
        );

        // Retrieve the undo callback
        const toastCall = mockShowToast.mock.calls.find(call => call[0].includes('2 enrollment(s) → rejected'));
        expect(toastCall).toBeDefined();
        const undoAction = toastCall![2].action;

        // Trigger Undo
        await act(async () => {
            await undoAction.onClick();
        });

        // Verify undo toast shown
        expect(mockShowToast).toHaveBeenCalledWith('Bulk status changes undone', 'info');
    });

    /** Renders the hook over `rows`, selects `ids`, runs the bulk change and returns its Undo. */
    async function bulkChange(rows: EnrollmentRow[], ids: string[], status: 'withdrawn' | 'completed' | 'rejected') {
        const showToast = vi.fn();
        const { result } = renderHook(
            () => useBulkActions({
                enrollments: rows,
                setEnrollments: vi.fn(),
                showToast,
                openInviteModal: vi.fn(),
                openConfirmModal: vi.fn(),
            }),
            { wrapper }
        );
        act(() => ids.forEach(id => result.current.toggleSelect(id)));
        await act(async () => { await result.current.bulkUpdateStatus(status); });
        const call = showToast.mock.calls.find(c => c[2]?.action?.label === 'Undo');
        expect(call).toBeDefined();
        return { showToast, undo: () => act(async () => { await call![2].action.onClick(); }) };
    }

    it('withdrawing also withdraws the student\'s other rows on the course, and Undo restores them too', async () => {
        const rows = [makeEnrollment('a', 'confirmed', 's1'), makeEnrollment('b', 'rejected', 's1')];
        const { undo } = await bulkChange(rows, ['a'], 'withdrawn');

        expect(updateIn).toHaveBeenCalledWith('id', ['a', 'b']);
        await undo();
        expect(updateEq.mock.calls.map(c => c[1]).sort()).toEqual(['a', 'b']);
        expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'rejected' }));
    });

    it('completing removes the still-requested duplicate, and Undo re-creates it', async () => {
        const rows = [makeEnrollment('a', 'confirmed', 's1'), makeEnrollment('b', 'requested', 's1')];
        const { showToast, undo } = await bulkChange(rows, ['a'], 'completed');

        expect(deleteIn).toHaveBeenCalledWith('id', ['b']);
        expect(showToast.mock.calls[0][0]).toBe('1 enrollment(s) → completed, removed 1 requested variant(s)');
        await undo();
        expect(insertMock).toHaveBeenCalledWith([expect.objectContaining({ id: 'b', status: 'requested' })]);
        expect(insertMock.mock.calls[0][0][0]).not.toHaveProperty('courses');
        expect(showToast).toHaveBeenLastCalledWith('Bulk status changes undone', 'info');
    });

    it('reports a failed Undo instead of claiming success', async () => {
        const { showToast, undo } = await bulkChange([makeEnrollment('a', 'requested')], ['a'], 'rejected');
        updateEq.mockResolvedValue({ error: { message: 'denied' } });

        await undo();
        expect(showToast).toHaveBeenLastCalledWith('Failed to undo status changes', 'error');
    });
});
