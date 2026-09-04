import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useBulkActions } from './useBulkActions';
import type { EnrollmentRow } from './useEnrollments';

const updateMock = vi.fn().mockReturnValue({
    in: vi.fn().mockResolvedValue({ error: null }),
    eq: vi.fn().mockResolvedValue({ error: null }),
});

vi.mock('../lib/supabase', () => ({
    supabase: {
        from: vi.fn(() => ({
            update: updateMock,
            delete: vi.fn(() => ({
                in: vi.fn().mockResolvedValue({ error: null }),
            })),
        })),
    },
}));

function makeEnrollment(id: string, status: string): EnrollmentRow {
    return {
        id,
        student_id: `stu-${id}`,
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
});
