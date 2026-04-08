import { useEffect, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { StudentFlag } from '../lib/types';

export function useStudentFlags(showToast: (msg: string, type: 'success' | 'error') => void) {
    const queryClient = useQueryClient();

    // Fetch all student flags with joined course name
    const fetchFlagsFn = async () => {
        const { data, error } = await supabase
            .from('student_flags')
            .select('*, courses(id, name)')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data as StudentFlag[];
    };

    const { data: flags = [] } = useQuery({
        queryKey: ['student_flags'],
        queryFn: fetchFlagsFn,
    });

    // Build a Map<student_id, StudentFlag[]> for O(1) lookups
    const flagsByStudentId = useMemo(() => {
        const map = new Map<string, StudentFlag[]>();
        flags.forEach(flag => {
            const existing = map.get(flag.student_id) || [];
            existing.push(flag);
            map.set(flag.student_id, existing);
        });
        return map;
    }, [flags]);

    // Realtime subscription
    useEffect(() => {
        const channel = supabase
            .channel('student_flags_changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'student_flags' },
                () => {
                    // Simply refetch on any change — flags are lightweight
                    queryClient.invalidateQueries({ queryKey: ['student_flags'] });
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [queryClient]);

    // Add flag mutation
    const addFlagMutation = useMutation({
        mutationFn: async ({ studentId, courseId, comment }: { studentId: string; courseId: string; comment: string }) => {
            const { data, error } = await supabase
                .from('student_flags')
                .insert({ student_id: studentId, course_id: courseId, comment: comment || null })
                .select('*, courses(id, name)')
                .single();
            if (error) throw error;
            return data as StudentFlag;
        },
        onSuccess: (newFlag) => {
            queryClient.setQueryData<StudentFlag[]>(['student_flags'], (old = []) => [newFlag, ...old]);
            showToast('Student flagged', 'success');
        },
        onError: () => {
            showToast('Failed to add flag', 'error');
        }
    });

    // Remove flag mutation
    const removeFlagMutation = useMutation({
        mutationFn: async (flagId: string) => {
            const { error } = await supabase.from('student_flags').delete().eq('id', flagId);
            if (error) throw error;
            return flagId;
        },
        onMutate: async (flagId) => {
            await queryClient.cancelQueries({ queryKey: ['student_flags'] });
            const previous = queryClient.getQueryData<StudentFlag[]>(['student_flags']);
            queryClient.setQueryData<StudentFlag[]>(['student_flags'], (old = []) =>
                old.filter(f => f.id !== flagId)
            );
            return { previous };
        },
        onSuccess: () => {
            showToast('Flag removed', 'success');
        },
        onError: (_err, _flagId, context) => {
            if (context?.previous) queryClient.setQueryData(['student_flags'], context.previous);
            showToast('Failed to remove flag', 'error');
        }
    });

    const addFlag = useCallback((studentId: string, courseId: string, comment: string) => {
        addFlagMutation.mutate({ studentId, courseId, comment });
    }, [addFlagMutation]);

    const removeFlag = useCallback((flagId: string) => {
        removeFlagMutation.mutate(flagId);
    }, [removeFlagMutation]);

    return {
        flags,
        flagsByStudentId,
        addFlag,
        removeFlag,
    };
}
