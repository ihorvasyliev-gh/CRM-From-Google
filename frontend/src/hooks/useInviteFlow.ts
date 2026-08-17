import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { EnrollmentRow } from './useEnrollments';
import { formatDateLong, todayISO } from '../lib/dateUtils';
import { buildEmailBodyHtml, buildEmailSubject } from '../lib/appConfig';
import { getCoursePill } from './useBulkActions';

export interface DateStats {
    pending: number;
    confirmed: number;
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
    const [responseDays, setResponseDays] = useState(7);
    const [savedInviteDates, setSavedInviteDates] = useState<string[]>([]);
    const [targetCourseId, setTargetCourseId] = useState<string | null>(null);

    async function fetchCourseDates(courseId: string) {
        setTargetCourseId(courseId);
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
        setResponseDays(7);
        const first = enrollments.find(e => ids.includes(e.id));
        if (first && first.course_id) {
            fetchCourseDates(first.course_id);
        } else {
            setTargetCourseId(null);
            setSavedInviteDates([]);
        }
    }

    const getDateStats = useCallback((dateStr: string, courseIdOverride?: string | null): DateStats => {
        if (!dateStr) return { pending: 0, confirmed: 0 };
        const cleanDate = dateStr.split('T')[0];
        const effectiveCourseId = courseIdOverride !== undefined ? courseIdOverride : targetCourseId;
        const now = Date.now();

        let pending = 0;
        let confirmed = 0;

        for (const e of enrollments) {
            if (effectiveCourseId && e.course_id !== effectiveCourseId) continue;

            const invitedD = e.invited_date ? e.invited_date.split('T')[0] : null;
            const confirmedD = e.confirmed_date ? e.confirmed_date.split('T')[0] : null;

            // Pending: status 'invited', invited_date matches, and deadline not expired
            if (e.status === 'invited' && invitedD === cleanDate) {
                const days = e.response_days ?? 7;
                const isExpired = e.invited_at
                    ? new Date(e.invited_at).getTime() + days * 24 * 60 * 60 * 1000 < now
                    : false;
                if (!isExpired) {
                    pending++;
                }
            }

            // Confirmed: status 'confirmed' and matching date
            if (e.status === 'confirmed') {
                if (confirmedD === cleanDate || (!confirmedD && invitedD === cleanDate)) {
                    confirmed++;
                }
            }
        }

        return { pending, confirmed };
    }, [enrollments, targetCourseId]);

    const inviteMutation = useMutation({
        mutationFn: async ({ ids, date, days }: { ids: string[], date: string, days: number }) => {
            const first = enrollments.find(e => ids.includes(e.id));
            if (first && first.course_id) {
                await supabase.from('invite_dates').upsert(
                    { course_id: first.course_id, invite_date: date },
                    { onConflict: 'course_id,invite_date' }
                );
            }

            const now = new Date().toISOString();
            const updatePayload = { status: 'invited', invited_date: date, confirmed_date: null, invited_at: now, response_days: days };

            const { error } = await supabase
                .from('enrollments')
                .update(updatePayload)
                .in('id', ids);
            if (error) throw error;

            return { ids, updatePayload };
        },
        onMutate: async ({ ids, date, days }) => {
            await queryClient.cancelQueries({ queryKey: ['enrollments'] });
            const previousEnrollments = queryClient.getQueryData<EnrollmentRow[]>(['enrollments']);

            const now = new Date().toISOString();
            const updatePayload = { status: 'invited', invited_date: date, confirmed_date: null, invited_at: now, response_days: days };

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
            if (context?.previousEnrollments) {
                setEnrollments(context.previousEnrollments);
            } else {
                queryClient.invalidateQueries({ queryKey: ['enrollments'] });
            }
            showToast('Error updating status', 'error');
        }
    });

    async function handleInviteWithDate() {
        if (!inviteDateTarget) return;
        inviteMutation.mutate({ ids: inviteDateTarget.ids, date: inviteDate, days: responseDays });
        setInviteDateTarget(null);
    }

    async function handleInviteAndEmail() {
        if (!inviteDateTarget) return;
        const ids = inviteDateTarget.ids;
        const selectedEnrollments = enrollments.filter(e => ids.includes(e.id));

        // Await the database update so mailto navigation doesn't abort the HTTP request
        try {
            await inviteMutation.mutateAsync({ ids, date: inviteDate, days: responseDays });
        } catch (err) {
            console.error('Failed to complete invite mutation:', err);
            return;
        }

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

        const htmlBody = buildEmailBodyHtml(courseName, dateFormatted, confirmLink, undefined, responseDays);

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
        responseDays,
        setResponseDays,
        savedInviteDates,
        targetCourseId,
        fetchCourseDates,
        getDateStats,
        openInviteModal,
        handleInviteWithDate,
        handleInviteAndEmail
    };
}
