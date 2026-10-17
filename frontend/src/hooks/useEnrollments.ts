import { useEffect, useCallback, useRef, useSyncExternalStore } from 'react';
import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { ENROLLMENT_SELECT, fetchAllPages } from '../lib/queries';
import type { EnrollmentWithRelations } from '../lib/documentUtils';
import type { EnrollmentStatus } from '../lib/types';
import type { ShowToast } from '../lib/toast';
import { todayISO } from '../lib/dateUtils';
import { changeEnrollmentStatus, linkedRows, restoreEnrollments, statusUpdate, type EnrollmentSnapshot } from '../lib/enrollmentStatus';
import {
    ENROLLMENTS_KEY, cancelListReload, isPartialList, markListPartial, noteFullLoad, refreshCachedEnrollments,
    restoreCachedRows, subscribePartialList, withHistory,
} from '../lib/enrollmentCache';

export type EnrollmentRow = EnrollmentWithRelations;

/** A status change, taken from the rows loaded when it was asked for. */
interface StatusChange {
    all: EnrollmentRow[];
    row: EnrollmentRow;
    status: EnrollmentStatus;
    dates: { confirmedDate?: string; invitedDate?: string };
}

interface UseEnrollmentsProps {
    showToast: ShowToast;
    openInviteModal: (ids: string[], bulk: boolean) => void;
    openConfirmModal: (id: string, defaultDate: string, courseId: string) => void;
}


/** The statuses the board and dashboard work with; completed, withdrawn and rejected are history. */
const CURRENT_STATUSES = '(requested,invited,confirmed)';
/** History changed within this many days comes with the current enrollments (recent activity). */
const RECENT_HISTORY_DAYS = 30;

type EnrollmentQuery = ReturnType<ReturnType<typeof supabase.from>['select']>;

/**
 * Enrollments newest first; id breaks ties (rows imported together share created_at). `part`
 * narrows them: the current ones (and history changed since `since`), or the rest.
 */
function readEnrollments(part?: { current: boolean; since: string }): Promise<EnrollmentRow[]> {
    const narrow = (query: EnrollmentQuery) => !part ? query
        : part.current ? query.or(`status.in.${CURRENT_STATUSES},updated_at.gte.${part.since}`)
            : query.not('status', 'in', CURRENT_STATUSES).or(`updated_at.lt.${part.since},updated_at.is.null`);
    return fetchAllPages((from, to) => narrow(supabase.from('enrollments').select(ENROLLMENT_SELECT))
        .order('created_at', { ascending: false })
        .order('id')
        .range(from, to)
    ) as Promise<EnrollmentRow[]>;
}

/** Every enrollment, newest first. */
export function readAllEnrollments(): Promise<EnrollmentRow[]> {
    return readEnrollments();
}

/**
 * The query function of the cached ['enrollments'] list. The first load comes in two parts: the
 * current enrollments (about a sixth of them) are shown as soon as they arrive, so the board and
 * dashboard don't wait for years of completed courses, which follow.
 */
export async function fetchAllEnrollments(context?: { client?: QueryClient }): Promise<EnrollmentRow[]> {
    const client = context?.client;
    let rows: EnrollmentRow[];
    if (client && !client.getQueryData(ENROLLMENTS_KEY)) {
        const since = new Date(Date.now() - RECENT_HISTORY_DAYS * 86_400_000).toISOString().slice(0, 10);
        // Both parts are requested at once; the smaller one arrives first
        const historyRead = readEnrollments({ current: false, since });
        historyRead.catch(() => { /* thrown where it is awaited below */ });
        const current = await readEnrollments({ current: true, since });
        // Shown while the rest loads (the query stays "fetching")
        client.setQueryData(ENROLLMENTS_KEY, current);
        markListPartial(client);
        const history = await historyRead;
        // The current rows as cached now: changes made to them meanwhile are kept
        rows = withHistory(client.getQueryData<EnrollmentRow[]>(ENROLLMENTS_KEY) ?? current, history);
    } else {
        rows = await readEnrollments();
    }
    // Later catch-ups (after a dropped realtime channel) read only what changed after this load
    noteFullLoad(rows);
    return rows;
}

/**
 * The cached list of every enrollment. `complete` is false while only its first part (the current
 * enrollments) has arrived: what needs every enrollment waits for it.
 */
export function useEnrollmentList() {
    const query = useQuery({ queryKey: ENROLLMENTS_KEY, queryFn: fetchAllEnrollments });
    const partial = useSyncExternalStore(subscribePartialList, isPartialList);
    return { ...query, complete: query.data !== undefined && !partial };
}

export function useEnrollments({ showToast, openInviteModal, openConfirmModal }: UseEnrollmentsProps) {
    const queryClient = useQueryClient();

    // Ref to access current enrollments without re-creating callbacks
    const enrollmentsRef = useRef<EnrollmentRow[]>([]);

    const { data: enrollments = [], refetch: fetchEnrollments, complete } = useEnrollmentList();

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
        mutationFn: ({ all, row, status, dates }: StatusChange) => changeEnrollmentStatus(all, [row], status, dates),
        onMutate: async ({ all, row, status, dates }) => {
            // Cancel without awaiting to avoid blocking the UI thread
            cancelListReload(queryClient);
            const previousEnrollments = queryClient.getQueryData<EnrollmentRow[]>(['enrollments']);
            // Show the change straight away; the saved values replace it once the database answers
            const fields = statusUpdate(row, status, dates);
            const { alsoUpdate, remove } = linkedRows(all, [row], status);
            const updated = new Set([row.id, ...alsoUpdate.map(e => e.id)]);
            const removed = new Set(remove.map(e => e.id));
            setEnrollments(prev => prev
                .filter(e => !removed.has(e.id))
                .map(e => updated.has(e.id) ? { ...e, ...fields } : e)
            );
            return { previousEnrollments, changedIds: [...updated, ...removed] };
        },
        onSuccess: ({ updated, removed, removeFailed }, { status }) => {
            const saved = new Map(updated.map(snap => [snap.id, snap]));
            const removedIds = new Set(removed.map(e => e.id));
            setEnrollments(prev => prev
                .filter(e => !removedIds.has(e.id))
                .map(e => saved.has(e.id) ? { ...e, ...saved.get(e.id)! } : e)
            );
            if (removeFailed) {
                queryClient.invalidateQueries({ queryKey: ['enrollments'] });
                showToast('Completed, but the requested duplicate(s) could not be removed', 'error');
            } else if (status === 'completed') {
                showToast(removed.length > 0 ? `Completed! Removed ${removed.length} requested variant(s)` : 'Completed!', 'success');
            } else if (status === 'withdrawn') {
                showToast(`Updated ${updated.length} related enrollment(s)`, 'success');
            }
        },
        onError: (err, _variables, context) => {
            console.error('Status update failed:', err);
            if (context?.previousEnrollments) {
                restoreCachedRows(queryClient, context.previousEnrollments, context.changedIds);
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
        if (!current) return;
        mutateStatus({ all, row: current, status: newStatus, dates: { confirmedDate, invitedDate } });
    }, [openInviteModal, openConfirmModal, mutateStatus]);

    // ─── Toggle Priority Mutation ────────────────────────────────
    const { mutate: mutatePriority } = useMutation({
        mutationFn: async ({ id, currentPriority }: { id: string, currentPriority: boolean }) => {
            const newPriority = !currentPriority;
            const { error } = await supabase.from('enrollments').update({ is_priority: newPriority }).eq('id', id);
            if (error) throw error;
            return { id, newPriority };
        },
        onMutate: async ({ id, currentPriority }) => {
            cancelListReload(queryClient);
            const previousEnrollments = queryClient.getQueryData<EnrollmentRow[]>(['enrollments']);
            setEnrollments(prev => prev.map(e => e.id === id ? { ...e, is_priority: !currentPriority } : e));
            return { previousEnrollments };
        },
        onError: (_err, variables, context) => {
            if (context?.previousEnrollments) restoreCachedRows(queryClient, context.previousEnrollments, [variables.id]);
            showToast('Failed to update priority', 'error');
        }
    });

    const togglePriority = useCallback((id: string, currentPriority: boolean) => {
        mutatePriority({ id, currentPriority });
    }, [mutatePriority]);

    // ─── Update Note Mutation ────────────────────────────────────
    const { mutateAsync: saveNote } = useMutation({
        mutationFn: async ({ id, noteText }: { id: string, noteText: string }) => {
            const { error } = await supabase.from('enrollments').update({ notes: noteText }).eq('id', id);
            if (error) throw error;
            return { id, noteText };
        },
        onMutate: async ({ id, noteText }) => {
            cancelListReload(queryClient);
            const previousEnrollments = queryClient.getQueryData<EnrollmentRow[]>(['enrollments']);
            setEnrollments(prev => prev.map(e => e.id === id ? { ...e, notes: noteText } : e));
            return { previousEnrollments };
        },
        onSuccess: () => showToast('Note updated', 'success'),
        onError: (_err, variables, context) => {
            if (context?.previousEnrollments) restoreCachedRows(queryClient, context.previousEnrollments, [variables.id]);
            showToast('Failed to update note', 'error');
        }
    });

    /** Resolves to whether the note was saved (a failure is already reported by a toast). */
    const updateNote = useCallback(async (id: string, noteText: string): Promise<boolean> => {
        try {
            await saveNote({ id, noteText });
            return true;
        } catch {
            return false;
        }
    }, [saveNote]);

    // ─── Delete Enrollment Mutation ──────────────────────────────
    const { mutateAsync: removeEnrollment } = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from('enrollments').delete().eq('id', id);
            if (error) throw error;
            return id;
        },
        onMutate: async (id) => {
            cancelListReload(queryClient);
            const previousEnrollments = queryClient.getQueryData<EnrollmentRow[]>(['enrollments']);
            setEnrollments(prev => prev.filter(e => e.id !== id));
            return { previousEnrollments };
        },
        onSuccess: () => showToast('Enrollment deleted', 'success'),
        onError: (_err, id, context) => {
            if (context?.previousEnrollments) restoreCachedRows(queryClient, context.previousEnrollments, [id]);
            showToast('Failed to delete enrollment', 'error');
        }
    });

    /** Resolves to whether the enrollment was deleted (a failure is already reported by a toast). */
    const deleteEnrollment = useCallback(async (id: string): Promise<boolean> => {
        try {
            await removeEnrollment(id);
            return true;
        } catch {
            return false;
        }
    }, [removeEnrollment]);

    // ─── Restore Snapshot (Undo) ─────────────────────────────────
    // Writes back the exact previous status + date fields, instead of re-running the status
    // flow (which would reopen the invite/confirm date pickers and lose the original dates).
    const { mutate: mutateRestore } = useMutation({
        mutationFn: async (snapshots: EnrollmentSnapshot[]) => {
            await restoreEnrollments(snapshots);
            return snapshots;
        },
        onMutate: async (snapshots) => {
            cancelListReload(queryClient);
            const previousEnrollments = queryClient.getQueryData<EnrollmentRow[]>(['enrollments']);
            const byId = new Map(snapshots.map(snap => [snap.id, snap]));
            setEnrollments(prev => prev.map(e => {
                const snap = byId.get(e.id);
                return snap ? ({ ...e, ...snap } as EnrollmentRow) : e;
            }));
            return { previousEnrollments };
        },
        onSuccess: () => showToast('Change undone', 'success'),
        onError: (_err, snapshots, context) => {
            if (context?.previousEnrollments) restoreCachedRows(queryClient, context.previousEnrollments, snapshots.map(snap => snap.id));
            showToast('Failed to undo change', 'error');
        },
        onSettled: (_data, _err, snapshots) => {
            void refreshCachedEnrollments(queryClient, snapshots.map(snap => snap.id));
        },
    });

    const restoreSnapshots = useCallback((snapshots: EnrollmentSnapshot[]) => {
        if (snapshots.length > 0) mutateRestore(snapshots);
    }, [mutateRestore]);

    return {
        enrollments,
        /** False while older history (completed, withdrawn, rejected) is still loading */
        complete,
        setEnrollments, // For other hooks to do optimistic updates easily
        fetchEnrollments,
        updateStatus,
        togglePriority,
        updateNote,
        deleteEnrollment,
        restoreSnapshots,
    };
}
