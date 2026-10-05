import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { EnrollmentRow } from './useEnrollments';
import type { EnrollmentStatus } from '../lib/types';
import { linkedRows, restoreEnrollments, statusUpdate, takeEnrollmentSnapshot } from '../lib/enrollmentStatus';
import { todayISO } from '../lib/dateUtils';
import { fetchOptedOutEmails, partitionByOptOut, skippedNote } from '../lib/emailOptOut';


function collectEmails(enrollments: EnrollmentRow[]): string {
    const emails = enrollments
        .map(e => e.students?.email)
        .filter((email): email is string => !!email && email.trim() !== '');
    return [...new Set(emails)].join('; ');
}

interface UseBulkActionsProps {
    enrollments: EnrollmentRow[];
    setEnrollments: React.Dispatch<React.SetStateAction<EnrollmentRow[]>>;
    showToast: (
        msg: string,
        type: 'success' | 'error' | 'info',
        options?: { action?: { label: string; onClick: () => void }; duration?: number }
    ) => void;
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

    const { mutate: mutateBulkStatus } = useMutation({
        mutationFn: async ({ newStatus, confirmedDate }: { newStatus: EnrollmentStatus, confirmedDate?: string }) => {
            const chosen = enrollments.filter(e => selectedIds.has(e.id));
            const { alsoUpdate, remove } = linkedRows(enrollments, chosen, newStatus);
            const updatedRows = [...chosen, ...alsoUpdate];
            // Every row the change writes or deletes, as it was, for Undo
            const snapshots = updatedRows.map(takeEnrollmentSnapshot);

            // A completion's dates depend on each row; every other status writes the same fields to all
            const fieldsById = new Map(updatedRows.map(e => [e.id, statusUpdate(e, newStatus, { confirmedDate })]));
            const results = newStatus === 'completed'
                ? await Promise.all(updatedRows.map(e => supabase.from('enrollments').update(fieldsById.get(e.id)!).eq('id', e.id)))
                : [await supabase.from('enrollments').update(statusUpdate(undefined, newStatus, { confirmedDate })).in('id', updatedRows.map(e => e.id))];
            const failed = results.find(r => r.error);
            if (failed?.error) throw failed.error;

            let removeFailed = false;
            if (remove.length > 0) {
                const { error: removeError } = await supabase.from('enrollments').delete().in('id', remove.map(e => e.id));
                if (removeError) console.error('Failed to remove requested duplicates:', removeError);
                removeFailed = !!removeError;
            }
            return { newStatus, fieldsById, snapshots, removed: removeFailed ? [] : remove, removeFailed };
        },
        onSuccess: ({ newStatus, fieldsById, snapshots, removed, removeFailed }) => {
            const removedIds = new Set(removed.map(e => e.id));
            setEnrollments(prev => prev
                .filter(e => !removedIds.has(e.id))
                .map(e => fieldsById.has(e.id) ? { ...e, ...fieldsById.get(e.id)! } : e)
            );
            setSelectedIds(new Set());

            const undo = async () => {
                try {
                    await restoreEnrollments(snapshots, removed);
                    const byId = new Map(snapshots.map(snap => [snap.id, snap]));
                    setEnrollments(prev => [
                        ...removed.filter(r => !prev.some(e => e.id === r.id)),
                        ...prev.map(e => byId.has(e.id) ? { ...e, ...byId.get(e.id)! } : e),
                    ]);
                    showToast('Bulk status changes undone', 'info');
                } catch (err) {
                    console.error('Undo failed:', err);
                    showToast('Failed to undo status changes', 'error');
                } finally {
                    queryClient.invalidateQueries({ queryKey: ['enrollments'] });
                }
            };

            if (removeFailed) {
                queryClient.invalidateQueries({ queryKey: ['enrollments'] });
                showToast(`${fieldsById.size} enrollment(s) → ${newStatus}, but the requested duplicates could not be removed`, 'error');
                return;
            }
            const extra = removed.length > 0 ? `, removed ${removed.length} requested variant(s)` : '';
            showToast(`${fieldsById.size} enrollment(s) → ${newStatus}${extra}`, 'success', {
                action: { label: 'Undo', onClick: () => { void undo(); } },
                duration: 7000,
            });
        },
        onError: (err) => {
            console.error('Bulk status update failed:', err);
            // Some rows may have been written before the failure: show what the database has
            queryClient.invalidateQueries({ queryKey: ['enrollments'] });
            showToast('Error updating status', 'error');
        }
    });

    const bulkUpdateStatus = useCallback(async (newStatus: EnrollmentStatus, confirmedDate?: string) => {
        if (selectedIds.size === 0) return;

        if (newStatus === 'invited') {
            openInviteModal(Array.from(selectedIds), true);
            return;
        }

        if (newStatus === 'confirmed' && !confirmedDate) {
            const ids = Array.from(selectedIds);
            const firstId = ids[0];
            const first = enrollments.find(e => e.id === firstId);
            const defaultDate = first?.invited_date || todayISO();
            if (first) {
                openConfirmModal(ids, defaultDate, first.course_id);
            }
            return;
        }

        mutateBulkStatus({ newStatus, confirmedDate });
    }, [selectedIds, enrollments, openInviteModal, openConfirmModal, mutateBulkStatus]);

    const { mutate: mutateBulkDelete } = useMutation({
        mutationFn: async () => {
            const ids = Array.from(selectedIds);
            const { error } = await supabase.from('enrollments').delete().in('id', ids);
            if (error) throw error;
            return ids;
        },
        onMutate: async () => {
            queryClient.cancelQueries({ queryKey: ['enrollments'] });
            const previousEnrollments = queryClient.getQueryData<EnrollmentRow[]>(['enrollments']);
            const ids = Array.from(selectedIds);
            setEnrollments(prev => prev.filter(e => !ids.includes(e.id)));
            return { previousEnrollments, ids };
        },
        onSuccess: (ids) => {
            setSelectedIds(new Set());
            showToast(`${ids.length} enrollment(s) deleted`, 'success');
        },
        onError: (_err, _variables, context) => {
            if (context?.previousEnrollments) {
                setEnrollments(context.previousEnrollments);
            } else {
                queryClient.invalidateQueries({ queryKey: ['enrollments'] });
            }
            showToast('Failed to delete enrollments', 'error');
        }
    });

    const handleBulkDelete = useCallback(async () => {
        if (selectedIds.size === 0) return;
        mutateBulkDelete();
    }, [selectedIds, mutateBulkDelete]);

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

    return {
        selectedIds,
        toggleSelect,
        deselect,
        selectAllInList,
        clearSelection,
        bulkUpdateStatus,
        handleBulkDelete,
        handleCopyEmails,
        handleCopySelectedEmails
    };
}
