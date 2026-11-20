import { useState, useCallback, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { EnrollmentRow } from './useEnrollments';
import type { EnrollmentStatus } from '../lib/types';
import type { ShowToast } from '../lib/toast';
import { changeEnrollmentStatus } from '../lib/enrollmentStatus';
import { undoStatusChange, UNDO_TOAST_MS } from '../lib/statusUndo';
import { cancelListReload, restoreCachedRows } from '../lib/enrollmentCache';
import { todayISO } from '../lib/dateUtils';
import { fetchOptedOutEmails, partitionByOptOut, skippedNote } from '../lib/emailOptOut';
import { formatPhoneDisplay } from '../lib/contactUtils';


function collectEmails(enrollments: EnrollmentRow[]): string {
    const emails = enrollments
        .map(e => e.students?.email)
        .filter((email): email is string => !!email && email.trim() !== '');
    return [...new Set(emails)].join('; ');
}

function collectPhones(enrollments: EnrollmentRow[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const e of enrollments) {
        const raw = e.students?.phone?.trim();
        if (!raw) continue;
        const formatted = formatPhoneDisplay(raw);
        if (!seen.has(formatted)) {
            seen.add(formatted);
            result.push(formatted);
        }
    }
    return result;
}

interface UseBulkActionsProps {
    enrollments: EnrollmentRow[];
    setEnrollments: React.Dispatch<React.SetStateAction<EnrollmentRow[]>>;
    showToast: ShowToast;
    openInviteModal: (ids: string[], bulk: boolean) => void;
    openConfirmModal: (ids: string[], defaultDate: string, courseId: string) => void;
}

export function useBulkActions({
    enrollments,
    setEnrollments,
    showToast,
    openInviteModal,
    openConfirmModal
}: UseBulkActionsProps) {
    const queryClient = useQueryClient();
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const toggleSelect = useCallback((id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    /** Removes an id from the selection if present (never adds it, unlike toggleSelect). */
    const deselect = useCallback((id: string) => {
        setSelectedIds(prev => {
            if (!prev.has(id)) return prev;
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
    }, []);

    /**
     * Drops from the selection every card that is no longer shown (filtered out, or gone), so the
     * bar's count and its actions always match the cards the user can see.
     */
    const keepOnly = useCallback((shown: ReadonlySet<string>) => {
        setSelectedIds(prev => {
            if (prev.size === 0) return prev;
            const next = new Set([...prev].filter(id => shown.has(id)));
            return next.size === prev.size ? prev : next;
        });
    }, []);

    /** Adds these ids to the selection (Shift+click on the board picks a run of cards). */
    const selectMany = useCallback((ids: string[]) => {
        setSelectedIds(prev => {
            if (ids.every(id => prev.has(id))) return prev;
            const next = new Set(prev);
            ids.forEach(id => next.add(id));
            return next;
        });
    }, []);

    /** Replaces the selection with these exact ids (Top-N picker in a queue). */
    const replaceSelection = useCallback((ids: string[]) => {
        setSelectedIds(new Set(ids));
    }, []);

    const selectAllInList = useCallback((items: EnrollmentRow[]) => {
        setSelectedIds(prev => {
            const allSelected = items.every(i => prev.has(i.id));
            const next = new Set(prev);
            items.forEach(i => allSelected ? next.delete(i.id) : next.add(i.id));
            return next;
        });
    }, []);

    const clearSelection = useCallback(() => {
        // Keep the same Set instance when already empty so memoized columns don't re-render
        setSelectedIds(prev => (prev.size === 0 ? prev : new Set()));
    }, []);

    const { mutate: mutateBulkStatus, isPending: statusPending } = useMutation({
        mutationFn: ({ newStatus, confirmedDate, explicitIds }: { newStatus: EnrollmentStatus, confirmedDate?: string, explicitIds?: string[] }) => {
            const idSet = explicitIds ? new Set(explicitIds) : selectedIds;
            const chosen = enrollments.filter(e => idSet.has(e.id));
            return changeEnrollmentStatus(enrollments, chosen, newStatus, { confirmedDate });
        },
        onSuccess: ({ updated, removed, removeFailed, undo: undoData }, { newStatus, explicitIds }) => {
            const saved = new Map(updated.map(snap => [snap.id, snap]));
            const removedIds = new Set(removed.map(e => e.id));
            setEnrollments(prev => prev
                .filter(e => !removedIds.has(e.id))
                .map(e => saved.has(e.id) ? { ...e, ...saved.get(e.id)! } : e)
            );
            if (!explicitIds) setSelectedIds(new Set());

            const undo = () => undoStatusChange({
                queryClient, setEnrollments, undo: undoData, removedRows: removed, showToast,
                doneMessage: 'Bulk status changes undone', failMessage: 'Failed to undo status changes',
            });

            if (removeFailed) {
                queryClient.invalidateQueries({ queryKey: ['enrollments'] });
                showToast(`${updated.length} enrollment(s) → ${newStatus}, but the requested duplicates could not be removed`, 'error');
                return;
            }
            const removedCount = undoData.removed.length;
            const extra = removedCount > 0 ? `, removed ${removedCount} requested variant(s)` : '';
            showToast(`${updated.length} enrollment(s) → ${newStatus}${extra}`, 'success', {
                action: { label: 'Undo', onClick: () => { void undo(); } },
                duration: UNDO_TOAST_MS,
            });
        },
        onError: (err) => {
            console.error('Bulk status update failed:', err);
            // Some rows may have been written before the failure: show what the database has
            queryClient.invalidateQueries({ queryKey: ['enrollments'] });
            showToast('Error updating status', 'error');
        }
    });

    const { mutate: mutateBulkPriority, isPending: priorityPending } = useMutation({
        mutationFn: async ({ ids, priority }: { ids: string[]; priority: boolean }) => {
            const { error } = await supabase.from('enrollments').update({ is_priority: priority }).in('id', ids);
            if (error) throw error;
            return { ids, priority };
        },
        onMutate: async ({ ids, priority }) => {
            cancelListReload(queryClient);
            const previousEnrollments = queryClient.getQueryData<EnrollmentRow[]>(['enrollments']);
            const idSet = new Set(ids);
            setEnrollments(prev => prev.map(e => idSet.has(e.id) ? { ...e, is_priority: priority } : e));
            return { previousEnrollments, ids };
        },
        onSuccess: ({ ids, priority }) => {
            setSelectedIds(new Set());
            showToast(priority ? `${ids.length} enrollment(s) marked as priority` : `Removed priority from ${ids.length} enrollment(s)`, 'success');
        },
        onError: (_err, _vars, context) => {
            if (context?.previousEnrollments) {
                restoreCachedRows(queryClient, context.previousEnrollments, context.ids);
            } else {
                queryClient.invalidateQueries({ queryKey: ['enrollments'] });
            }
            showToast('Failed to update priority', 'error');
        },
    });

    const busyRef = useRef(false);

    const bulkUpdateStatus = useCallback(async (newStatus: EnrollmentStatus, confirmedDate?: string) => {
        // While a change is being saved a second one waits: the bar shows "saving…"
        if (selectedIds.size === 0 || busyRef.current) return;

        if (newStatus === 'invited') {
            openInviteModal(Array.from(selectedIds), true);
            return;
        }

        if (newStatus === 'confirmed' && !confirmedDate) {
            const ids = Array.from(selectedIds);
            // One course date belongs to one course (the invite dialog has the same rule)
            const chosen = enrollments.filter(e => selectedIds.has(e.id));
            if (new Set(chosen.map(e => e.course_id)).size > 1) {
                showToast('Select people from one course to confirm: a course date belongs to one course.', 'error');
                return;
            }
            const firstId = ids[0];
            const first = enrollments.find(e => e.id === firstId);
            const defaultDate = first?.confirmed_date || first?.invited_date || todayISO();
            if (first) {
                openConfirmModal(ids, defaultDate, first.course_id);
            }
            return;
        }

        mutateBulkStatus({ newStatus, confirmedDate });
    }, [selectedIds, enrollments, openInviteModal, openConfirmModal, mutateBulkStatus, showToast]);

    /** Restores an explicit list of enrollments (e.g. selected rows in SecondaryPanel) to Requested, with Undo. */
    const bulkRestoreIds = useCallback((ids: string[]) => {
        if (ids.length === 0 || busyRef.current) return;
        mutateBulkStatus({ newStatus: 'requested', explicitIds: ids });
    }, [mutateBulkStatus]);

    const bulkSetPriority = useCallback((priority: boolean) => {
        if (selectedIds.size === 0 || busyRef.current) return;
        mutateBulkPriority({ ids: Array.from(selectedIds), priority });
    }, [selectedIds, mutateBulkPriority]);

    const { mutate: mutateBulkDelete, isPending: deletePending } = useMutation({
        mutationFn: async (explicitIds?: string[]) => {
            const ids = explicitIds ?? Array.from(selectedIds);
            const { error } = await supabase.from('enrollments').delete().in('id', ids);
            if (error) throw error;
            return { ids, explicit: !!explicitIds };
        },
        onMutate: async (explicitIds?: string[]) => {
            cancelListReload(queryClient);
            const previousEnrollments = queryClient.getQueryData<EnrollmentRow[]>(['enrollments']);
            const ids = explicitIds ?? Array.from(selectedIds);
            const idSet = new Set(ids);
            setEnrollments(prev => prev.filter(e => !idSet.has(e.id)));
            return { previousEnrollments, ids };
        },
        onSuccess: ({ ids, explicit }) => {
            if (!explicit) setSelectedIds(new Set());
            showToast(`${ids.length} enrollment(s) deleted`, 'success');
        },
        onError: (_err, _variables, context) => {
            if (context?.previousEnrollments) {
                restoreCachedRows(queryClient, context.previousEnrollments, context.ids);
            } else {
                queryClient.invalidateQueries({ queryKey: ['enrollments'] });
            }
            showToast('Failed to delete enrollments', 'error');
        }
    });

    const busy = statusPending || deletePending || priorityPending;
    useEffect(() => { busyRef.current = busy; }, [busy]);

    const handleBulkDelete = useCallback(async () => {
        if (selectedIds.size === 0 || busyRef.current) return;
        mutateBulkDelete(undefined);
    }, [selectedIds, mutateBulkDelete]);

    const bulkDeleteIds = useCallback((ids: string[]) => {
        if (ids.length === 0 || busyRef.current) return;
        mutateBulkDelete(ids);
    }, [mutateBulkDelete]);

    const handleCopyEmails = useCallback(async (items: EnrollmentRow[], label: string) => {
        let skipped: number;
        try {
            // Leave out people who unsubscribed from our emails
            const optedOut = await fetchOptedOutEmails(items.map(e => e.students?.email));
            const parts = partitionByOptOut(items, e => e.students?.email, optedOut);
            items = parts.allowed;
            skipped = new Set(parts.skipped.map(e => e.students?.email?.trim().toLowerCase())).size;
        } catch (err) {
            console.error('Failed to check the unsubscribe list:', err);
            showToast('Could not check the unsubscribe list. Please try again.', 'error');
            return;
        }
        const emailStr = collectEmails(items);
        if (!emailStr) { showToast(skipped ? 'Everyone selected has unsubscribed from emails' : 'No emails to copy', 'error'); return; }
        try {
            await navigator.clipboard.writeText(emailStr);
            showToast(`${label} emails copied!${skippedNote(skipped)}`, 'success');
        } catch (err) {
            console.error('Clipboard copy failed:', err);
            showToast('Failed to copy emails to clipboard', 'error');
        }
    }, [showToast]);

    const handleCopySelectedEmails = useCallback(async (filteredEnrollments: EnrollmentRow[]) => {
        const selected = filteredEnrollments.filter(e => selectedIds.has(e.id));
        await handleCopyEmails(selected, `${selected.length}`);
    }, [selectedIds, handleCopyEmails]);

    const handleCopySelectedPhones = useCallback(async (filteredEnrollments: EnrollmentRow[]) => {
        const selected = filteredEnrollments.filter(e => selectedIds.has(e.id));
        const phones = collectPhones(selected);
        if (phones.length === 0) {
            showToast('No phone numbers to copy', 'error');
            return;
        }
        try {
            await navigator.clipboard.writeText(phones.join('\n'));
            showToast(`${phones.length} phone number${phones.length === 1 ? '' : 's'} copied!`, 'success');
        } catch (err) {
            console.error('Clipboard copy failed:', err);
            showToast('Failed to copy phone numbers', 'error');
        }
    }, [selectedIds, showToast]);

    return {
        selectedIds,
        /** A bulk status change, priority change or delete is being saved */
        busy,
        toggleSelect,
        deselect,
        selectMany,
        replaceSelection,
        keepOnly,
        selectAllInList,
        clearSelection,
        bulkUpdateStatus,
        bulkSetPriority,
        bulkRestoreIds,
        bulkDeleteIds,
        handleBulkDelete,
        handleCopyEmails,
        handleCopySelectedEmails,
        handleCopySelectedPhones,
    };
}
