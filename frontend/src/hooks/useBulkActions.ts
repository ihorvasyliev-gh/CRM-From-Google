import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { EnrollmentRow } from './useEnrollments';
import { generateDocumentsArchive } from '../lib/documentUtils';
import { cleanVariant } from '../lib/types';
import { todayISO, formatDateSpaces } from '../lib/dateUtils';


function collectEmails(enrollments: EnrollmentRow[]): string {
    const emails = enrollments
        .map(e => e.students?.email)
        .filter((email): email is string => !!email && email.trim() !== '');
    return [...new Set(emails)].join('; ');
}

export function getCoursePill(enrollment: EnrollmentRow): string {
    const name = enrollment.courses?.name || 'Unknown';
    const variant = enrollment.course_variant;
    const cleaned = cleanVariant(name, variant);
    return `${name} (${cleaned})`;
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
    const [generatingDocs, setGeneratingDocs] = useState(false);

    const toggleSelect = useCallback((id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
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
        setSelectedIds(new Set());
    }, []);

    const bulkUpdateMutation = useMutation({
        mutationFn: async ({ newStatus, confirmedDate }: { newStatus: string, confirmedDate?: string }) => {
            let idsToUpdate = Array.from(selectedIds);
            const updatePayload: Record<string, string | null> = { status: newStatus };

            // Snapshot previous state of selected enrollments for Undo capability
            const previousSnapshots = enrollments
                .filter(e => selectedIds.has(e.id))
                .map(e => ({
                    id: e.id,
                    status: e.status,
                    confirmed_date: e.confirmed_date,
                    confirmed_at: e.confirmed_at,
                    completed_date: e.completed_date,
                    completed_at: e.completed_at,
                    invited_date: e.invited_date,
                    invited_at: e.invited_at,
                }));

            if (newStatus === 'confirmed') {
                if (confirmedDate) updatePayload.confirmed_date = confirmedDate;
                updatePayload.confirmed_at = new Date().toISOString();
            }
            if (newStatus !== 'completed') {
                updatePayload.completed_date = null;
                updatePayload.completed_at = null;
            }
            if (newStatus !== 'confirmed' && newStatus !== 'completed') {
                updatePayload.confirmed_at = null;
            }
            if (newStatus === 'requested' || newStatus === 'rejected') {
                updatePayload.confirmed_date = null;
                updatePayload.invited_date = null;
                updatePayload.invited_at = null;
            }

            if (newStatus === 'completed') {
                const selectedEnrollments = enrollments.filter(e => selectedIds.has(e.id));
                const siblingRequestedIds: string[] = [];

                selectedEnrollments.forEach(curr => {
                    enrollments.filter(e =>
                        e.student_id === curr.student_id &&
                        e.course_id === curr.course_id &&
                        !selectedIds.has(e.id) &&
                        e.status === 'requested'
                    ).forEach(r => siblingRequestedIds.push(r.id));
                });

                const updatePromises = selectedEnrollments.map(curr => {
                    const completedAt = new Date().toISOString();
                    const confirmedAt = curr.confirmed_at || completedAt;
                    return supabase.from('enrollments').update({
                        status: 'completed',
                        completed_date: curr.confirmed_date || todayISO(),
                        completed_at: completedAt,
                        confirmed_at: confirmedAt
                    }).eq('id', curr.id);
                });
                const results = await Promise.all(updatePromises);
                const error = results.find(r => r.error)?.error;

                if (error) throw new Error('Error updating status');

                if (siblingRequestedIds.length > 0) {
                    await supabase.from('enrollments').delete().in('id', siblingRequestedIds);
                }

                return { idsToUpdate, updatePayload, type: 'completed' as const, siblingRequestedIds, selectedEnrollments, previousSnapshots };
            }

            if (newStatus === 'withdrawn') {
                const selectedEnrollments = enrollments.filter(e => selectedIds.has(e.id));
                const extraIds: string[] = [];
                selectedEnrollments.forEach(curr => {
                    enrollments.filter(e =>
                        e.student_id === curr.student_id &&
                        e.course_id === curr.course_id &&
                        !selectedIds.has(e.id)
                    ).forEach(r => extraIds.push(r.id));
                });
                idsToUpdate = [...idsToUpdate, ...extraIds];
            }

            const { error } = await supabase.from('enrollments').update(updatePayload).in('id', idsToUpdate);
            if (error) throw new Error('Error updating status');
            return { idsToUpdate, updatePayload, type: 'standard' as const, previousSnapshots };
        },
        onSuccess: (result) => {
            const rollback = async () => {
                try {
                    const updatePromises = result.previousSnapshots.map(snap =>
                        supabase.from('enrollments').update({
                            status: snap.status,
                            confirmed_date: snap.confirmed_date,
                            confirmed_at: snap.confirmed_at,
                            completed_date: snap.completed_date,
                            completed_at: snap.completed_at,
                            invited_date: snap.invited_date,
                            invited_at: snap.invited_at,
                        }).eq('id', snap.id)
                    );
                    await Promise.all(updatePromises);

                    setEnrollments(prev => prev.map(e => {
                        const match = result.previousSnapshots.find(s => s.id === e.id);
                        return match ? ({ ...e, ...match } as EnrollmentRow) : e;
                    }));
                    queryClient.invalidateQueries({ queryKey: ['enrollments'] });
                    showToast('Bulk status changes undone', 'info');
                } catch {
                    showToast('Failed to undo status changes', 'error');
                }
            };

            if (result.type === 'completed') {
                setEnrollments(prev => prev
                    .filter(e => !result.siblingRequestedIds.includes(e.id))
                    .map(e => {
                        if (result.idsToUpdate.includes(e.id)) {
                            const match = result.selectedEnrollments.find(se => se.id === e.id);
                            const completedAt = new Date().toISOString();
                            const confirmedAt = match?.confirmed_at || completedAt;
                            return {
                                ...e,
                                status: 'completed',
                                completed_date: match?.confirmed_date || todayISO(),
                                completed_at: completedAt,
                                confirmed_at: confirmedAt
                            } as EnrollmentRow;
                        }
                        return e;
                    })
                );
                setSelectedIds(new Set());
                const msg = `${result.idsToUpdate.length} enrollment(s) → completed`;
                const extra = result.siblingRequestedIds.length > 0 ? `, removed ${result.siblingRequestedIds.length} requested variant(s)` : '';
                showToast(msg + extra, 'success', {
                    action: {
                        label: 'Undo',
                        onClick: () => { void rollback(); },
                    },
                    duration: 7000,
                });
            } else {
                setEnrollments(prev => prev.map(e =>
                    result.idsToUpdate.includes(e.id)
                        ? { ...e, ...result.updatePayload } as EnrollmentRow
                        : e
                ));
                setSelectedIds(new Set());
                showToast(
                    `${result.idsToUpdate.length} enrollment(s) → ${result.updatePayload.status}`,
                    'success',
                    {
                        action: {
                            label: 'Undo',
                            onClick: () => { void rollback(); },
                        },
                        duration: 7000,
                    }
                );
            }
        },
        onError: () => showToast('Error updating status', 'error')
    });

    const bulkUpdateStatus = useCallback(async (newStatus: string, confirmedDate?: string) => {
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

        bulkUpdateMutation.mutate({ newStatus, confirmedDate });
    }, [selectedIds, enrollments, openInviteModal, openConfirmModal, bulkUpdateMutation]);

    const bulkDeleteMutation = useMutation({
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
        bulkDeleteMutation.mutate();
    }, [selectedIds, bulkDeleteMutation]);

    const handleCopyEmails = useCallback(async (items: EnrollmentRow[], label: string) => {
        const emailStr = collectEmails(items);
        if (!emailStr) { showToast('No emails to copy', 'error'); return; }
        try {
            await navigator.clipboard.writeText(emailStr);
            showToast(`${label} emails copied!`, 'success');
        } catch (err) {
            console.error('Clipboard copy failed:', err);
            showToast('Failed to copy emails to clipboard', 'error');
        }
    }, [showToast]);

    const handleCopySelectedEmails = useCallback(async (filteredEnrollments: EnrollmentRow[]) => {
        const selected = filteredEnrollments.filter(e => selectedIds.has(e.id));
        await handleCopyEmails(selected, `${selected.length}`);
    }, [selectedIds, handleCopyEmails]);

    const handleGenerateDocuments = useCallback(async () => {
        if (selectedIds.size === 0) return;
        setGeneratingDocs(true);
        try {
            const [docRes, attRes, varsRes, lblRes] = await Promise.all([
                supabase.from('document_templates').select('*').eq('is_active', true).order('created_at', { ascending: true }),
                supabase.from('attendance_templates').select('*').order('updated_at', { ascending: false }).limit(1),
                supabase.from('template_variables').select('var_key, var_value'),
                supabase.from('label_templates').select('*').order('updated_at', { ascending: false }).limit(1)
            ]);

            const customVars: Record<string, string> = {};
            if (varsRes.data) {
                varsRes.data.forEach((v: { var_key: string; var_value: string }) => {
                    customVars[v.var_key] = v.var_value;
                });
            }

            const error = docRes.error;
            const data = docRes.data;

            if (error || !data || data.length === 0) {
                throw new Error('No active template found. Please upload and activate at least one template.');
            }

            const templateDescriptors = data.map((t: { name: string; storage_path: string }) => ({
                name: t.name,
                storagePath: t.storage_path,
            }));
            const attTemplate = attRes.data && attRes.data.length > 0 ? attRes.data[0] : null;
            const lblTemplate = lblRes.data && lblRes.data.length > 0 ? lblRes.data[0] : null;

            const selectedEnrollments = enrollments.filter(e => selectedIds.has(e.id));
            const firstSelected = selectedEnrollments[0];
            const courseStr = firstSelected ? getCoursePill(firstSelected) : 'Selected_Enrollments';
            const rawDate = firstSelected?.confirmed_date || firstSelected?.invited_date || firstSelected?.completed_date;
            const dateStr = formatDateSpaces(rawDate) || formatDateSpaces(todayISO());
            const archiveName = `${courseStr} ${dateStr}.zip`.replace(/[/\\?%*:|"<>]/g, '-');

            const { getConfig } = await import('../lib/appConfig');
            const excelColumns = getConfig().excelColumns;

            await generateDocumentsArchive(
                selectedEnrollments,
                templateDescriptors,
                archiveName,
                attTemplate?.storage_path,
                customVars,
                lblTemplate?.storage_path,
                excelColumns,
                (msg) => showToast(msg, 'error')
            );

            showToast(`Generated ${selectedEnrollments.length} document(s) with ${templateDescriptors.length} template(s)!`, 'success');
            clearSelection();
        } catch (err: unknown) {
            console.error('Generation error:', err);
            const msg = err instanceof Error ? err.message : 'Unknown error';
            showToast(`Generation failed: ${msg}`, 'error');
        } finally {
            setGeneratingDocs(false);
        }
    }, [selectedIds, enrollments, showToast, clearSelection]);

    return {
        selectedIds,
        generatingDocs,
        toggleSelect,
        selectAllInList,
        clearSelection,
        bulkUpdateStatus,
        handleBulkDelete,
        handleCopyEmails,
        handleCopySelectedEmails,
        handleGenerateDocuments
    };
}
