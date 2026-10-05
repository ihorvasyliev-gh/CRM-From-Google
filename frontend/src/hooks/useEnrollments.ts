import { useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { ENROLLMENT_SELECT, fetchAllPages } from '../lib/queries';
import type { EnrollmentWithRelations } from '../lib/documentUtils';
import type { EnrollmentStatus } from '../lib/types';
import { todayISO } from '../lib/dateUtils';
import { linkedRows, restoreEnrollments, statusUpdate, type EnrollmentSnapshot, type StatusFields } from '../lib/enrollmentStatus';

export type EnrollmentRow = EnrollmentWithRelations;

/** A status change, worked out before it is written so the optimistic update and the write agree. */
interface StatusChange {
    fields: Partial<StatusFields> & { status: EnrollmentStatus };
    /** Rows written with `fields`: the chosen one, plus the student's other rows on the course for a withdrawal */
    updateIds: string[];
    /** Still-requested rows of the course that a completion deletes */
    removeIds: string[];
}

interface UseEnrollmentsProps {
    showToast: (msg: string, type: 'success' | 'error') => void;
    openInviteModal: (ids: string[], bulk: boolean) => void;
    openConfirmModal: (id: string, defaultDate: string, courseId: string) => void;
}


export async function fetchAllEnrollments(): Promise<EnrollmentRow[]> {
    // Newest first; id breaks ties (rows imported together share created_at)
    return fetchAllPages((from, to) => supabase
        .from('enrollments')
        .select(ENROLLMENT_SELECT)
        .order('created_at', { ascending: false })
        .order('id')
        .range(from, to)
    ) as Promise<EnrollmentRow[]>;
}

export function useEnrollments({ showToast, openInviteModal, openConfirmModal }: UseEnrollmentsProps) {
    const queryClient = useQueryClient();

    // Ref to access current enrollments without re-creating callbacks
    const enrollmentsRef = useRef<EnrollmentRow[]>([]);

    const { data: enrollments = [], refetch: fetchEnrollments } = useQuery({
        queryKey: ['enrollments'],
        queryFn: fetchAllEnrollments,
    });

    // Keep ref in sync
    useEffect(() => {
        enrollmentsRef.current = enrollments;
    }, [enrollments]);

    // Provide a backward-compatible setEnrollments for other hooks that might still depend on it
    const setEnrollments = useCallback(
        (updater: React.SetStateAction<EnrollmentRow[]>) => {
            queryClient.setQueryData<EnrollmentRow[]>(['enrollments'], (old = []) => {
                return typeof updater === 'function' ? updater(old) : updater;
            });
        },
        [queryClient]
    );

    // Realtime subscription is handled globally by useGlobalRealtimeSync in App.tsx

    // ─── Status Update Mutation ──────────────────────────────────
    const { mutate: mutateStatus } = useMutation({
        mutationFn: async (change: StatusChange) => {
            const { error } = await supabase.from('enrollments').update(change.fields).in('id', change.updateIds);
            if (error) throw error;
            if (change.removeIds.length === 0) return { ...change, removeFailed: false };
            // The status is saved by now; report a failed clean-up instead of claiming the rows are gone
            const { error: removeError } = await supabase.from('enrollments').delete().in('id', change.removeIds);
            if (removeError) console.error('Failed to remove requested duplicates:', removeError);
            return { ...change, removeFailed: !!removeError };
        },
        onMutate: async ({ fields, updateIds, removeIds }) => {
            // Cancel without awaiting to avoid blocking the UI thread
            queryClient.cancelQueries({ queryKey: ['enrollments'] });
            const previousEnrollments = queryClient.getQueryData<EnrollmentRow[]>(['enrollments']);
            const updated = new Set(updateIds);
            const removed = new Set(removeIds);
            setEnrollments(prev => prev
                .filter(e => !removed.has(e.id))
                .map(e => updated.has(e.id) ? { ...e, ...fields } : e)
            );
            return { previousEnrollments };
        },
        onSuccess: ({ fields, updateIds, removeIds, removeFailed }) => {
            if (removeFailed) {
                queryClient.invalidateQueries({ queryKey: ['enrollments'] });
                showToast(`Completed, but ${removeIds.length} requested duplicate(s) could not be removed`, 'error');
            } else if (fields.status === 'completed') {
                showToast(removeIds.length > 0 ? `Completed! Removed ${removeIds.length} requested variant(s)` : 'Completed!', 'success');
            } else if (fields.status === 'withdrawn') {
                showToast(`Updated ${updateIds.length} related enrollment(s)`, 'success');
            }
        },
        onError: (err, _variables, context) => {
            console.error('Status update failed:', err);
            if (context?.previousEnrollments) {
                setEnrollments(context.previousEnrollments);
            } else {
                queryClient.invalidateQueries({ queryKey: ['enrollments'] });
            }
            showToast('Error updating status', 'error');
        }
    });

    const updateStatus = useCallback(async (id: string, newStatus: EnrollmentStatus, confirmedDate?: string, invitedDate?: string) => {
        const all = enrollmentsRef.current;
        const current = all.find(e => e.id === id);
        if (newStatus === 'invited' && !invitedDate) {
            openInviteModal([id], false);
            return;
        }
        if (newStatus === 'confirmed' && !confirmedDate) {
            const defaultDate = current?.invited_date || todayISO();
            if (current) openConfirmModal(id, defaultDate, current.course_id);
            return;
        }
        const { alsoUpdate, remove } = current ? linkedRows(all, [current], newStatus) : { alsoUpdate: [], remove: [] };
        mutateStatus({
            fields: statusUpdate(current, newStatus, { confirmedDate, invitedDate }),
            updateIds: [id, ...alsoUpdate.map(e => e.id)],
            removeIds: remove.map(e => e.id),
        });
    }, [openInviteModal, openConfirmModal, mutateStatus]);

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

    // ─── Restore Snapshot (Undo) ─────────────────────────────────
    // Writes back the exact previous status + date fields, instead of re-running the status
    // flow (which would reopen the invite/confirm date pickers and lose the original dates).
    const restoreMutation = useMutation({
        mutationFn: async (snapshots: EnrollmentSnapshot[]) => {
            await restoreEnrollments(snapshots);
            return snapshots;
        },
        onMutate: async (snapshots) => {
            queryClient.cancelQueries({ queryKey: ['enrollments'] });
            const previousEnrollments = queryClient.getQueryData<EnrollmentRow[]>(['enrollments']);
            const byId = new Map(snapshots.map(snap => [snap.id, snap]));
            setEnrollments(prev => prev.map(e => {
                const snap = byId.get(e.id);
                return snap ? ({ ...e, ...snap } as EnrollmentRow) : e;
            }));
            return { previousEnrollments };
        },
        onSuccess: () => showToast('Change undone', 'success'),
        onError: (_err, _variables, context) => {
            if (context?.previousEnrollments) setEnrollments(context.previousEnrollments);
            showToast('Failed to undo change', 'error');
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['enrollments'] });
        },
    });

    const restoreSnapshots = useCallback((snapshots: EnrollmentSnapshot[]) => {
        if (snapshots.length > 0) restoreMutation.mutate(snapshots);
    }, [restoreMutation]);

    return {
        enrollments,
        setEnrollments, // For other hooks to do optimistic updates easily
        fetchEnrollments,
        updateStatus,
        togglePriority,
        updateNote,
        deleteEnrollment,
        restoreSnapshots,
    };
}
