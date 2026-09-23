import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { EnrollmentRow } from './useEnrollments';
import { formatDateChoiceList, formatDateLong, formatDateLongWithWeekday, normalizeDateList, todayISO } from '../lib/dateUtils';
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
    // Multi-date mode: several groups of the same course, the student picks one date
    const [multiDate, setMultiDate] = useState(false);
    const [inviteDates, setInviteDates] = useState<string[]>([]);
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
        setMultiDate(false);
        setInviteDates([]);
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
            // A multi-date invite is pending on every offered date
            const offeredDates = e.invited_dates && e.invited_dates.length > 0
                ? e.invited_dates.map(d => d.split('T')[0])
                : (invitedD ? [invitedD] : []);

            // Pending: status 'invited', offered date matches, and deadline not expired
            if (e.status === 'invited' && offeredDates.includes(cleanDate)) {
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

    // Per-date participant limit of the course being invited to (null = unlimited)
    const targetMaxCapacity = targetCourseId
        ? enrollments.find(e => e.course_id === targetCourseId)?.courses?.max_capacity ?? null
        : null;

    function toggleInviteDate(date: string) {
        if (!date) return;
        setInviteDates(prev => prev.includes(date)
            ? prev.filter(d => d !== date)
            : normalizeDateList([...prev, date]));
    }

    // The dates the invitation will offer: one in single mode, 2+ in multi-date mode
    const selectedDates = multiDate ? inviteDates : (inviteDate ? [inviteDate] : []);
    const canInvite = multiDate ? inviteDates.length >= 2 : !!inviteDate;

    function buildInvitePayload(dates: string[], days: number) {
        const list = normalizeDateList(dates);
        return {
            status: 'invited',
            invited_date: list[0],
            invited_dates: list.length > 1 ? list : null,
            confirmed_date: null,
            invited_at: new Date().toISOString(),
            response_days: days,
        };
    }

    const inviteMutation = useMutation({
        mutationFn: async ({ ids, dates, days }: { ids: string[], dates: string[], days: number }) => {
            const first = enrollments.find(e => ids.includes(e.id));
            if (first && first.course_id) {
                await supabase.from('invite_dates').upsert(
                    normalizeDateList(dates).map(d => ({ course_id: first.course_id, invite_date: d })),
                    { onConflict: 'course_id,invite_date' }
                );
            }

            const updatePayload = buildInvitePayload(dates, days);

            const { error } = await supabase
                .from('enrollments')
                .update(updatePayload)
                .in('id', ids);
            if (error) throw error;

            return { ids, updatePayload };
        },
        onMutate: async ({ ids, dates, days }) => {
            await queryClient.cancelQueries({ queryKey: ['enrollments'] });
            const previousEnrollments = queryClient.getQueryData<EnrollmentRow[]>(['enrollments']);

            const updatePayload = buildInvitePayload(dates, days);

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
        if (!inviteDateTarget || !canInvite) return;
        inviteMutation.mutate({ ids: inviteDateTarget.ids, dates: selectedDates, days: responseDays });
        setInviteDateTarget(null);
    }

    async function handleInviteAndEmail() {
        if (!inviteDateTarget || !canInvite) return;
        const ids = inviteDateTarget.ids;
        const selectedEnrollments = enrollments.filter(e => ids.includes(e.id));
        const dates = normalizeDateList(selectedDates);
        const isMulti = dates.length > 1;

        const emails = selectedEnrollments
            .map(e => e.students?.email)
            .filter((email): email is string => !!email && email.trim() !== '');
        const uniqueEmails = [...new Set(emails)];
        const first = selectedEnrollments[0];
        const courseName = first ? getCoursePill(first) : 'Course';
        const dateFormatted = isMulti ? formatDateChoiceList(dates) : formatDateLong(dates[0]);
        const subject = encodeURIComponent(buildEmailSubject(courseName, dateFormatted));

        // The legacy long URL can carry only one date, so multi-date invites rely on the token link
        let confirmLink = `${window.location.origin}/confirm?course_id=${first?.course_id || ''}&date=${dates[0]}`;
        try {
            const { data: token, error } = isMulti
                ? await supabase.rpc('create_confirmation_token_multi', {
                    p_course_id: first?.course_id,
                    p_course_dates: dates,
                })
                : await supabase.rpc('create_confirmation_token', {
                    p_course_id: first?.course_id,
                    p_course_date: dates[0],
                });
            if (!error && token) {
                confirmLink = `${window.location.origin}/c/${token}`;
            } else if (isMulti) {
                console.error('Multi-date token generation failed:', error);
                showToast('Could not create the multi-date confirmation link. Is migration 59 applied?', 'error');
                return;
            }
        } catch (err) {
            console.error('Token generation failed, using long URL:', err);
            if (isMulti) {
                showToast('Could not create the multi-date confirmation link.', 'error');
                return;
            }
        }

        // Await the database update so mailto navigation doesn't abort the HTTP request
        try {
            await inviteMutation.mutateAsync({ ids, dates, days: responseDays });
        } catch (err) {
            console.error('Failed to complete invite mutation:', err);
            return;
        }

        const requiresEnglish = Boolean(first?.courses?.requires_english);
        const htmlBody = buildEmailBodyHtml(courseName, isMulti ? dates.map(formatDateLongWithWeekday) : dateFormatted, confirmLink, undefined, responseDays, requiresEnglish);

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
        multiDate,
        setMultiDate,
        inviteDates,
        toggleInviteDate,
        selectedDates,
        canInvite,
        responseDays,
        setResponseDays,
        savedInviteDates,
        targetCourseId,
        targetMaxCapacity,
        fetchCourseDates,
        getDateStats,
        openInviteModal,
        handleInviteWithDate,
        handleInviteAndEmail
    };
}
