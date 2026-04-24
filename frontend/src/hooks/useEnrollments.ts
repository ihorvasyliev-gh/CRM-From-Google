import { useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { EnrollmentWithRelations } from '../lib/documentUtils';

export type EnrollmentRow = EnrollmentWithRelations;

function todayISO(): string {
    return new Date().toISOString().split('T')[0];
}

interface UseEnrollmentsProps {
    showToast: (msg: string, type: 'success' | 'error') => void;
    openInviteModal: (ids: string[], bulk: boolean) => void;
    openConfirmModal: (id: string, defaultDate: string, courseId: string) => void;
}

export function useEnrollments({ showToast, openInviteModal, openConfirmModal }: UseEnrollmentsProps) {
    const queryClient = useQueryClient();

    // Ref to access current enrollments without re-creating callbacks
    const enrollmentsRef = useRef<EnrollmentRow[]>([]);

    const fetchEnrollmentsFn = async () => {
        let allData: EnrollmentRow[] = [];
        let from = 0;
        const limit = 1000;

        while (true) {
            const { data, error } = await supabase
                .from('enrollments')
                .select('*, students(id, first_name, last_name, email, phone, address, eircode, dob), courses(id, name)')
                .order('created_at', { ascending: false })
                .range(from, from + limit - 1);
                
            if (error) throw error;
            if (!data || data.length === 0) break;
            
            allData = [...allData, ...data as EnrollmentRow[]];
            
            if (data.length < limit) break;
            from += limit;
        }
        
        return allData;
    };

    const { data: enrollments = [], refetch: fetchEnrollments } = useQuery({
        queryKey: ['enrollments'],
        queryFn: fetchEnrollmentsFn,
    });

    // Keep ref in sync
    enrollmentsRef.current = enrollments;

    // Provide a backward-compatible setEnrollments for other hooks that might still depend on it
    const setEnrollments = useCallback(
        (updater: React.SetStateAction<EnrollmentRow[]>) => {
            queryClient.setQueryData<EnrollmentRow[]>(['enrollments'], (old = []) => {
                return typeof updater === 'function' ? updater(old) : updater;
            });
        },
        [queryClient]
    );

    // Setup realtime subscription
    useEffect(() => {
        const channel = supabase
            .channel('enrollments_changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'enrollments' },
                async (payload) => {
                    if (payload.eventType === 'INSERT') {
                        // Fetch the full joined record for the new insertion
                        const { data } = await supabase
                            .from('enrollments')
                            .select('*, students(id, first_name, last_name, email, phone, address, eircode, dob), courses(id, name)')
                            .eq('id', payload.new.id)
                            .single();

                        if (data) {
                            setEnrollments(prev => {
                                // Prevent duplicates if already added optimistically
                                if (prev.some(e => e.id === data.id)) return prev;
                                return [data as EnrollmentRow, ...prev];
                            });
                        }
                    } else if (payload.eventType === 'UPDATE') {
                        setEnrollments(prev => prev.map(e =>
                            e.id === payload.new.id ? { ...e, ...payload.new } : e
                        ));
                    } else if (payload.eventType === 'DELETE') {
                        setEnrollments(prev => prev.filter(e => e.id !== payload.old.id));
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [setEnrollments]);

    // ─── Status Update Mutation ──────────────────────────────────
    const updateStatusMutation = useMutation({
        mutationFn: async ({ id, newStatus, confirmedDate, invitedDate }: { id: string, newStatus: string, confirmedDate?: string, invitedDate?: string }) => {
            const current = enrollments.find(e => e.id === id);

            const updatePayload: Record<string, string | null> = { status: newStatus };
            if (newStatus === 'confirmed' && confirmedDate) updatePayload.confirmed_date = confirmedDate;
            if (newStatus === 'invited' && invitedDate) updatePayload.invited_date = invitedDate;
            if (newStatus === 'completed') updatePayload.completed_date = current?.confirmed_date || todayISO();
            else updatePayload.completed_date = null;

            if (newStatus === 'requested' || newStatus === 'rejected') {
                updatePayload.confirmed_date = null;
                updatePayload.invited_date = null;
                updatePayload.invited_at = null;
            }

            if (newStatus === 'completed' && current) {
                const { error } = await supabase.from('enrollments').update(updatePayload).eq('id', id);
                if (error) throw new Error('Error updating status');

                const siblingRequestedIds = enrollments
                    .filter(e =>
                        e.student_id === current.student_id &&
                        e.course_id === current.course_id &&
                        e.id !== id &&
                        e.status === 'requested'
                    ).map(e => e.id);

                if (siblingRequestedIds.length > 0) {
                    await supabase.from('enrollments').delete().in('id', siblingRequestedIds);
                }
                return { id, updatePayload, siblingRequestedIds, type: 'completed' as const };
            }

            if (newStatus === 'withdrawn' && current) {
                const relatedIds = enrollments
                    .filter(e => e.student_id === current.student_id && e.course_id === current.course_id)
                    .map(e => e.id);

                const { error } = await supabase.from('enrollments').update(updatePayload).in('id', relatedIds);
                if (error) throw new Error('Error updating status');
                return { id, updatePayload, relatedIds, type: 'withdrawn' as const };
            }

            // Default fallback
            const { error } = await supabase.from('enrollments').update(updatePayload).eq('id', id);
            if (error) throw new Error('Error updating status');
            return { id, updatePayload, type: 'single' as const };
        },
        onMutate: async ({ id, newStatus, confirmedDate, invitedDate }) => {
            // Cancel without awaiting to avoid blocking the UI thread
            queryClient.cancelQueries({ queryKey: ['enrollments'] });
            const previousEnrollments = queryClient.getQueryData<EnrollmentRow[]>(['enrollments']);
            
            setEnrollments(prev => prev.map(e => {
                if (e.id === id) {
                    const optimisticUpdate: Partial<EnrollmentRow> = { status: newStatus as any };
                    if (newStatus === 'confirmed' && confirmedDate) optimisticUpdate.confirmed_date = confirmedDate;
                    if (newStatus === 'invited' && invitedDate) optimisticUpdate.invited_date = invitedDate;
                    if (newStatus === 'completed') optimisticUpdate.completed_date = e.confirmed_date || todayISO();
                    else optimisticUpdate.completed_date = null;

                    if (newStatus === 'requested' || newStatus === 'rejected') {
                        optimisticUpdate.confirmed_date = null;
                        optimisticUpdate.invited_date = null;
                        optimisticUpdate.invited_at = null;
                    }
                    return { ...e, ...optimisticUpdate } as EnrollmentRow;
                }
                return e;
            }));

            return { previousEnrollments };
        },
        onSuccess: (result) => {
            if (result.type === 'completed') {
                setEnrollments(prev => prev
                    .filter(e => !result.siblingRequestedIds.includes(e.id))
                    .map(e => e.id === result.id ? { ...e, ...result.updatePayload } as EnrollmentRow : e)
                );
                const deletedCount = result.siblingRequestedIds.length;
                showToast(`Completed! ${deletedCount > 0 ? `Removed ${deletedCount} requested variant(s)` : ''}`, 'success');
            } else if (result.type === 'withdrawn') {
                setEnrollments(prev => prev.map(e =>
                    result.relatedIds.includes(e.id) ? { ...e, ...result.updatePayload } as EnrollmentRow : e
                ));
                showToast(`Updated ${result.relatedIds.length} related enrollment(s)`, 'success');
            } else {
                setEnrollments(prev => prev.map(e =>
                    e.id === result.id ? { ...e, ...result.updatePayload } as EnrollmentRow : e
                ));
            }
        },
        onError: (_err, _variables, context) => {
            if (context?.previousEnrollments) setEnrollments(context.previousEnrollments);
            showToast('Error updating status', 'error');
        }
    });

    const updateStatus = useCallback(async (id: string, newStatus: string, confirmedDate?: string, invitedDate?: string) => {
        const current = enrollmentsRef.current.find(e => e.id === id);
        if (newStatus === 'invited' && !invitedDate) {
            openInviteModal([id], false);
            return;
        }
        if (newStatus === 'confirmed' && !confirmedDate) {
            const defaultDate = current?.invited_date || todayISO();
            if (current) openConfirmModal(id, defaultDate, current.course_id);
            return;
        }
        updateStatusMutation.mutate({ id, newStatus, confirmedDate, invitedDate });
    }, [openInviteModal, openConfirmModal, updateStatusMutation]);

    // ─── Toggle Priority Mutation ────────────────────────────────
    const togglePriorityMutation = useMutation({
        mutationFn: async ({ id, currentPriority }: { id: string, currentPriority: boolean }) => {
            const newPriority = !currentPriority;
            const { error } = await supabase.from('enrollments').update({ is_priority: newPriority }).eq('id', id);
            if (error) throw error;
            return { id, newPriority };
        },
        onMutate: async ({ id, currentPriority }) => {
            queryClient.cancelQueries({ queryKey: ['enrollments'] });
            const previousEnrollments = queryClient.getQueryData<EnrollmentRow[]>(['enrollments']);
            setEnrollments(prev => prev.map(e => e.id === id ? { ...e, is_priority: !currentPriority } : e));
            return { previousEnrollments };
        },
        onError: (_err, _variables, context) => {
            if (context?.previousEnrollments) setEnrollments(context.previousEnrollments);
            showToast('Failed to update priority', 'error');
        }
    });

    const togglePriority = useCallback(async (id: string, currentPriority: boolean) => {
        togglePriorityMutation.mutate({ id, currentPriority });
    }, [togglePriorityMutation]);

    // ─── Update Note Mutation ────────────────────────────────────
    const updateNoteMutation = useMutation({
        mutationFn: async ({ id, noteText }: { id: string, noteText: string }) => {
            const { error } = await supabase.from('enrollments').update({ notes: noteText }).eq('id', id);
            if (error) throw error;
            return { id, noteText };
        },
        onMutate: async ({ id, noteText }) => {
            queryClient.cancelQueries({ queryKey: ['enrollments'] });
            const previousEnrollments = queryClient.getQueryData<EnrollmentRow[]>(['enrollments']);
            setEnrollments(prev => prev.map(e => e.id === id ? { ...e, notes: noteText } : e));
            return { previousEnrollments };
        },
        onSuccess: () => showToast('Note updated', 'success'),
        onError: (_err, _variables, context) => {
            if (context?.previousEnrollments) setEnrollments(context.previousEnrollments);
            showToast('Failed to update note', 'error');
        }
    });

    const updateNote = useCallback(async (id: string, noteText: string) => {
        updateNoteMutation.mutate({ id, noteText });
        return true;
    }, [updateNoteMutation]);

    // ─── Delete Enrollment Mutation ──────────────────────────────
    const deleteEnrollmentMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from('enrollments').delete().eq('id', id);
            if (error) throw error;
            return id;
        },
        onMutate: async (id) => {
            queryClient.cancelQueries({ queryKey: ['enrollments'] });
            const previousEnrollments = queryClient.getQueryData<EnrollmentRow[]>(['enrollments']);
            setEnrollments(prev => prev.filter(e => e.id !== id));
            return { previousEnrollments };
        },
        onSuccess: () => showToast('Enrollment deleted', 'success'),
        onError: (_err, _variables, context) => {
            if (context?.previousEnrollments) setEnrollments(context.previousEnrollments);
            showToast('Failed to delete enrollment', 'error');
        }
    });

    const deleteEnrollment = useCallback(async (id: string) => {
        deleteEnrollmentMutation.mutate(id);
        return true;
    }, [deleteEnrollmentMutation]);

    return {
        enrollments,
        setEnrollments, // For other hooks to do optimistic updates easily
        fetchEnrollments,
        updateStatus,
        togglePriority,
        updateNote,
        deleteEnrollment
    };
}
