import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { PendingCompletionRequest } from '../lib/types';

export function usePendingApprovalsList(enabled: boolean = true) {
    return useQuery<PendingCompletionRequest[]>({
        queryKey: ['pending_completions'],
        queryFn: async () => {
            const { data, error } = await supabase.rpc('get_pending_completions');
            if (error) {
                // If user is viewer or unauthorized, return empty array silently
                if (error.message?.includes('Unauthorized') || error.code === '42501') {
                    return [];
                }
                throw error;
            }
            return (data || []) as PendingCompletionRequest[];
        },
        enabled,
        refetchInterval: 30_000,
    });
}

export function usePendingApprovalsCount(enabled: boolean = true) {
    const query = usePendingApprovalsList(enabled);
    return {
        count: query.data?.length ?? 0,
        isLoading: query.isLoading,
        error: query.error,
        refetch: query.refetch,
    };
}

export function useRequestCompletion() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ enrollmentIds, completedDate }: { enrollmentIds: string[]; completedDate?: string }) => {
            const { data, error } = await supabase.rpc('request_course_completion', {
                p_enrollment_ids: enrollmentIds,
                p_completed_date: completedDate || null,
            });
            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['pending_completions'] });
            queryClient.invalidateQueries({ queryKey: ['viewer_courses'] });
            queryClient.invalidateQueries({ queryKey: ['viewer_course_roster'] });
            queryClient.invalidateQueries({ queryKey: ['restricted_student_detail'] });
            queryClient.invalidateQueries({ queryKey: ['restricted_students_search'] });
            queryClient.invalidateQueries({ queryKey: ['enrollments'] });
        },
    });
}

export function useApproveCompletion() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ enrollmentIds }: { enrollmentIds: string[] }) => {
            const { data, error } = await supabase.rpc('approve_course_completion', {
                p_enrollment_ids: enrollmentIds,
            });
            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['pending_completions'] });
            queryClient.invalidateQueries({ queryKey: ['enrollments'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard_stats'] });
            queryClient.invalidateQueries({ queryKey: ['course_enrollment_counts'] });
            queryClient.invalidateQueries({ queryKey: ['courses'] });
            queryClient.invalidateQueries({ queryKey: ['viewer_courses'] });
            queryClient.invalidateQueries({ queryKey: ['viewer_course_roster'] });
            queryClient.invalidateQueries({ queryKey: ['restricted_student_detail'] });
            queryClient.invalidateQueries({ queryKey: ['restricted_students_search'] });
        },
    });
}

export function useRejectCompletion() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ enrollmentIds, reason }: { enrollmentIds: string[]; reason?: string }) => {
            const { data, error } = await supabase.rpc('reject_course_completion', {
                p_enrollment_ids: enrollmentIds,
                p_reason: reason || null,
            });
            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['pending_completions'] });
            queryClient.invalidateQueries({ queryKey: ['enrollments'] });
            queryClient.invalidateQueries({ queryKey: ['viewer_courses'] });
            queryClient.invalidateQueries({ queryKey: ['viewer_course_roster'] });
            queryClient.invalidateQueries({ queryKey: ['restricted_student_detail'] });
            queryClient.invalidateQueries({ queryKey: ['restricted_students_search'] });
        },
    });
}
