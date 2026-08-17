import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { usePendingApprovalsList, useRequestCompletion, useApproveCompletion, useRejectCompletion } from './useApprovals';
import { supabase } from '../lib/supabase';

vi.mock('../lib/supabase', () => ({
    supabase: {
        rpc: vi.fn(),
    },
}));

function createWrapper() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
        },
    });
    return ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
}

describe('useApprovals hooks', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('fetches pending completions list successfully', async () => {
        const mockPending = [
            {
                enrollment_id: 'en-1',
                student_id: 'st-1',
                student_name: 'John Doe',
                student_email: 'john@example.com',
                student_phone: '123456',
                course_id: 'c-1',
                course_name: 'Safe Pass',
                course_variant: null,
                confirmed_date: '2026-05-01',
                pending_completion_date: '2026-05-01',
                completion_requested_at: '2026-05-01T10:00:00Z',
                completion_requested_by: 'viewer@test.com',
            },
        ];

        (supabase.rpc as any).mockResolvedValueOnce({
            data: mockPending,
            error: null,
        });

        const { result } = renderHook(() => usePendingApprovalsList(true), {
            wrapper: createWrapper(),
        });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data).toEqual(mockPending);
        expect(supabase.rpc).toHaveBeenCalledWith('get_pending_completions');
    });

    it('handles unauthorized error gracefully for viewers', async () => {
        (supabase.rpc as any).mockResolvedValueOnce({
            data: null,
            error: { message: 'Unauthorized: Viewers cannot access pending approvals list' },
        });

        const { result } = renderHook(() => usePendingApprovalsList(true), {
            wrapper: createWrapper(),
        });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data).toEqual([]);
    });

    it('executes request_course_completion RPC on mutation', async () => {
        (supabase.rpc as any).mockResolvedValueOnce({
            data: { success: true, updated_count: 1 },
            error: null,
        });

        const { result } = renderHook(() => useRequestCompletion(), {
            wrapper: createWrapper(),
        });

        await result.current.mutateAsync({
            enrollmentIds: ['en-1'],
            completedDate: '2026-05-01',
        });

        expect(supabase.rpc).toHaveBeenCalledWith('request_course_completion', {
            p_enrollment_ids: ['en-1'],
            p_completed_date: '2026-05-01',
        });
    });

    it('executes approve_course_completion RPC on mutation', async () => {
        (supabase.rpc as any).mockResolvedValueOnce({
            data: { success: true, updated_count: 1 },
            error: null,
        });

        const { result } = renderHook(() => useApproveCompletion(), {
            wrapper: createWrapper(),
        });

        await result.current.mutateAsync({
            enrollmentIds: ['en-1', 'en-2'],
        });

        expect(supabase.rpc).toHaveBeenCalledWith('approve_course_completion', {
            p_enrollment_ids: ['en-1', 'en-2'],
        });
    });

    it('executes reject_course_completion RPC on mutation', async () => {
        (supabase.rpc as any).mockResolvedValueOnce({
            data: { success: true, updated_count: 1 },
            error: null,
        });

        const { result } = renderHook(() => useRejectCompletion(), {
            wrapper: createWrapper(),
        });

        await result.current.mutateAsync({
            enrollmentIds: ['en-1'],
            reason: 'Incomplete practical',
        });

        expect(supabase.rpc).toHaveBeenCalledWith('reject_course_completion', {
            p_enrollment_ids: ['en-1'],
            p_reason: 'Incomplete practical',
        });
    });
});
