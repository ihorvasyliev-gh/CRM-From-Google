import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { EnrollmentRow } from './useEnrollments';
import { formatDateLong } from '../lib/dateUtils';
import { buildEmailBodyHtml, buildEmailSubject } from '../lib/appConfig';
import { getCoursePill } from './useBulkActions';

function todayISO(): string {
    return new Date().toISOString().split('T')[0];
}

interface UseInviteFlowProps {
    enrollments: EnrollmentRow[];
    setEnrollments: React.Dispatch<React.SetStateAction<EnrollmentRow[]>>;
    clearSelection: () => void;
    showToast: (msg: string, type: 'success' | 'error') => void;
}

export function useInviteFlow({
    enrollments,
    setEnrollments,
    clearSelection,
    showToast
}: UseInviteFlowProps) {
    const queryClient = useQueryClient();
    const [inviteDateTarget, setInviteDateTarget] = useState<{ ids: string[]; bulk: boolean } | null>(null);
    const [inviteDate, setInviteDate] = useState(todayISO());
    const [savedInviteDates, setSavedInviteDates] = useState<string[]>([]);

    async function fetchCourseDates(courseId: string) {
        const today = todayISO();
        const { data } = await supabase
            .from('invite_dates')
            .select('invite_date')
            .eq('course_id', courseId)
            .gte('invite_date', today)
            .order('invite_date', { ascending: true });
        setSavedInviteDates(data ? data.map((d: { invite_date: string }) => d.invite_date) : []);
    }

    function openInviteModal(ids: string[], bulk: boolean) {
        setInviteDateTarget({ ids, bulk });
        setInviteDate(todayISO());
        const first = enrollments.find(e => ids.includes(e.id));
        if (first && first.course_id) {
            fetchCourseDates(first.course_id);
        }
    }

    const inviteMutation = useMutation({
        mutationFn: async ({ ids, date }: { ids: string[], date: string }) => {
            const first = enrollments.find(e => ids.includes(e.id));
            if (first && first.course_id) {
                await supabase.from('invite_dates').upsert(
                    { course_id: first.course_id, invite_date: date },
                    { onConflict: 'course_id,invite_date' }
                );
            }

            const now = new Date().toISOString();
            const updatePayload = { status: 'invited', invited_date: date, confirmed_date: null, invited_at: now };

            const { error } = await supabase
                .from('enrollments')
                .update(updatePayload)
                .in('id', ids);
            if (error) throw error;

            return { ids, updatePayload };
        },
        onMutate: async ({ ids, date }) => {
            await queryClient.cancelQueries({ queryKey: ['enrollments'] });
            const previousEnrollments = queryClient.getQueryData<EnrollmentRow[]>(['enrollments']);

            const now = new Date().toISOString();
            const updatePayload = { status: 'invited', invited_date: date, confirmed_date: null, invited_at: now };

            setEnrollments(prev => prev.map(e =>
                ids.includes(e.id) ? { ...e, ...updatePayload } as EnrollmentRow : e
            ));
            return { previousEnrollments };
        },
        onSuccess: (data) => {
            clearSelection();
            showToast(`${data.ids.length} enrollment(s) → invited`, 'success');
        },
        onError: (_err, _variables, context) => {
            if (context?.previousEnrollments) setEnrollments(context.previousEnrollments);
            showToast('Error updating status', 'error');
        }
    });

    async function handleInviteWithDate() {
        if (!inviteDateTarget) return;
        inviteMutation.mutate({ ids: inviteDateTarget.ids, date: inviteDate });
        setInviteDateTarget(null);
    }

    async function handleInviteAndEmail() {
        if (!inviteDateTarget) return;
        const ids = inviteDateTarget.ids;
        const selectedEnrollments = enrollments.filter(e => ids.includes(e.id));

        // Fire and forget optimistic mutation
        inviteMutation.mutate({ ids, date: inviteDate });

        const emails = selectedEnrollments
            .map(e => e.students?.email)
            .filter((email): email is string => !!email && email.trim() !== '');
        const uniqueEmails = [...new Set(emails)];
        const first = selectedEnrollments[0];
        const courseName = first ? getCoursePill(first) : 'Course';
        const dateFormatted = formatDateLong(inviteDate);
        const subject = encodeURIComponent(buildEmailSubject(courseName, dateFormatted));

        let confirmLink = `${window.location.origin}/confirm?course_id=${first?.course_id || ''}&date=${inviteDate}`;
        try {
            const { data: token, error } = await supabase.rpc('create_confirmation_token', {
                p_course_id: first?.course_id,
                p_course_date: inviteDate,
            });
            if (!error && token) {
                confirmLink = `${window.location.origin}/c/${token}`;
            }
        } catch (err) {
            console.error('Token generation failed, using long URL:', err);
        }

        const htmlBody = buildEmailBodyHtml(courseName, dateFormatted, confirmLink);

        try {
            const blobHtml = new Blob([htmlBody], { type: "text/html" });
            const blobText = new Blob(["Please view this email in an HTML-compatible client."], { type: "text/plain" });
            const data = [new ClipboardItem({
                "text/html": blobHtml,
                "text/plain": blobText,
            })];
            await navigator.clipboard.write(data);
            showToast('HTML template copied! Press Ctrl+V in your email client.', 'success');
        } catch (err) {
            console.error('Failed to copy HTML to clipboard:', err);
            showToast('Could not copy HTML to clipboard.', 'error');
        }

        const bcc = uniqueEmails.map(e => encodeURIComponent(e)).join(',');

        window.location.href = `mailto:?bcc=${bcc}&subject=${subject}`;
        setInviteDateTarget(null);
    }

    return {
        inviteDateTarget,
        setInviteDateTarget,
        inviteDate,
        setInviteDate,
        savedInviteDates,
        openInviteModal,
        handleInviteWithDate,
        handleInviteAndEmail
    };
}
