import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { EnrollmentRow } from './useEnrollments';
import { generateDocumentsArchive } from '../lib/documentUtils';

function todayISO(): string {
    return new Date().toISOString().split('T')[0];
}

function collectEmails(enrollments: EnrollmentRow[]): string {
    const emails = enrollments
        .map(e => e.students?.email)
        .filter((email): email is string => !!email && email.trim() !== '');
    return [...new Set(emails)].join('; ');
}

export function getCoursePill(enrollment: EnrollmentRow): string {
    const name = enrollment.courses?.name || 'Unknown';
    const variant = enrollment.course_variant?.trim();
    return variant ? `${name} (${variant})` : name;
}

interface UseBulkActionsProps {
    enrollments: EnrollmentRow[];
    setEnrollments: React.Dispatch<React.SetStateAction<EnrollmentRow[]>>;
    showToast: (msg: string, type: 'success' | 'error') => void;
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

    function toggleSelect(id: string) {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    function selectAllInList(items: EnrollmentRow[]) {
        const allSelected = items.every(e => selectedIds.has(e.id));
        setSelectedIds(prev => {
            const next = new Set(prev);
            items.forEach(e => {
                if (allSelected) next.delete(e.id);
                else next.add(e.id);
            });
            return next;
        });
    }

    function clearSelection() {
        setSelectedIds(new Set());
    }

    const bulkUpdateMutation = useMutation({
        mutationFn: async ({ newStatus, confirmedDate }: { newStatus: string, confirmedDate?: string }) => {
            let idsToUpdate = Array.from(selectedIds);
            const updatePayload: Record<string, string | null> = { status: newStatus };

            if (newStatus === 'confirmed' && confirmedDate) updatePayload.confirmed_date = confirmedDate;
            if (newStatus !== 'completed') updatePayload.completed_date = null;
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

                const updatePromises = selectedEnrollments.map(curr =>
                    supabase.from('enrollments').update({
                        status: 'completed',
                        completed_date: curr.confirmed_date || todayISO()
                    }).eq('id', curr.id)
                );
                const results = await Promise.all(updatePromises);
                const error = results.find(r => r.error)?.error;

                if (error) throw new Error('Error updating status');

                if (siblingRequestedIds.length > 0) {
                    await supabase.from('enrollments').delete().in('id', siblingRequestedIds);
                }

                return { idsToUpdate, updatePayload, type: 'completed' as const, siblingRequestedIds, selectedEnrollments };
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
            return { idsToUpdate, updatePayload, type: 'standard' as const };
        },
        onSuccess: (result) => {
            if (result.type === 'completed') {
                setEnrollments(prev => prev
                    .filter(e => !result.siblingRequestedIds.includes(e.id))
                    .map(e => {
                        if (result.idsToUpdate.includes(e.id)) {
                            const match = result.selectedEnrollments.find(se => se.id === e.id);
                            return { ...e, status: 'completed', completed_date: match?.confirmed_date || todayISO() } as EnrollmentRow;
                        }
                        return e;
                    })
                );
                setSelectedIds(new Set());
                const msg = `${result.idsToUpdate.length} enrollment(s) → completed`;
                const extra = result.siblingRequestedIds.length > 0 ? `, removed ${result.siblingRequestedIds.length} requested variant(s)` : '';
                showToast(msg + extra, 'success');
            } else {
                setEnrollments(prev => prev.map(e =>
                    result.idsToUpdate.includes(e.id)
                        ? { ...e, ...result.updatePayload } as EnrollmentRow
                        : e
                ));
                setSelectedIds(new Set());
                showToast(`${result.idsToUpdate.length} enrollment(s) → ${result.updatePayload.status}`, 'success');
            }
        },
        onError: () => showToast('Error updating status', 'error')
    });

    async function bulkUpdateStatus(newStatus: string, confirmedDate?: string) {
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
    }

    const bulkDeleteMutation = useMutation({
        mutationFn: async () => {
            const ids = Array.from(selectedIds);
            const { error } = await supabase.from('enrollments').delete().in('id', ids);
            if (error) throw error;
            return ids;
        },
        onMutate: async () => {
            await queryClient.cancelQueries({ queryKey: ['enrollments'] });
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
            if (context?.previousEnrollments) setEnrollments(context.previousEnrollments);
            showToast('Failed to delete enrollments', 'error');
        }
    });

    async function handleBulkDelete() {
        if (selectedIds.size === 0) return;
        bulkDeleteMutation.mutate();
    }

    async function handleCopyEmails(items: EnrollmentRow[], label: string) {
        const emailStr = collectEmails(items);
        if (!emailStr) { showToast('No emails to copy', 'error'); return; }
        await navigator.clipboard.writeText(emailStr);
        showToast(`${label} emails copied!`, 'success');
    }

    async function handleCopySelectedEmails(filteredEnrollments: EnrollmentRow[]) {
        const selected = filteredEnrollments.filter(e => selectedIds.has(e.id));
        await handleCopyEmails(selected, `${selected.length}`);
    }

    async function handleGenerateDocuments() {
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
            const d = new Date();
            const dateStr = `${String(d.getDate()).padStart(2, '0')} ${String(d.getMonth() + 1).padStart(2, '0')} ${d.getFullYear()}`;
            const archiveName = `${courseStr} ${dateStr}.zip`.replace(/[/\\?%*:|"<>]/g, '-');

            await generateDocumentsArchive(
                selectedEnrollments,
                templateDescriptors,
                archiveName,
                attTemplate?.storage_path,
                customVars,
                lblTemplate?.storage_path
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
    }

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
