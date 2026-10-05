import { useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { fetchAllPages } from '../lib/queries';
import type { StudentFlag } from '../lib/types';
import type { ShowToast } from '../lib/toast';

export function useStudentFlags(showToast: ShowToast) {
    const queryClient = useQueryClient();

    // All student flags with the course name, newest first (paged: one request stops at 1000 rows)
    const fetchFlagsFn = () => fetchAllPages((from, to) => supabase
        .from('student_flags')
        .select('*, courses(id, name)')
        .order('created_at', { ascending: false })
        .order('id')
        .range(from, to)
    ) as Promise<StudentFlag[]>;

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

    // Realtime changes refresh ['student_flags'] through useGlobalRealtimeSync

    // Add flag mutation
    const { mutate: mutateAddFlag } = useMutation({
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
    const { mutate: mutateRemoveFlag } = useMutation({
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
        mutateAddFlag({ studentId, courseId, comment });
    }, [mutateAddFlag]);

    const removeFlag = useCallback((flagId: string) => {
        mutateRemoveFlag(flagId);
    }, [mutateRemoveFlag]);

    return {
        flags,
        flagsByStudentId,
        addFlag,
        removeFlag,
    };
}
