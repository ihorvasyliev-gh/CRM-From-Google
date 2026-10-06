import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { EnrollmentRow } from './useEnrollments';
import { daysBetween, formatDateLong, formatDateLongWithWeekday, normalizeDateList, todayISO } from '../lib/dateUtils';
import { buildEmailBodyHtml, buildEmailSubject } from '../lib/emailTemplates';
import { getCoursePill, type CourseEmailInfo } from '../lib/types';
import type { ShowToast } from '../lib/toast';
import { fetchOptedOutEmails, partitionByOptOut, skippedNote } from '../lib/emailOptOut';
import {
    emptySession, normalizeSession, SESSION_COLUMNS, sessionDays, sessionFromRow, sessionHasSchedule, sessionToRow, subjectDateLabel,
    type CourseSession,
} from '../lib/courseSessions';
import { COURSE_SESSIONS_QUERY_KEY } from './useCourseSessions';

export interface DateStats {
    pending: number;
    confirmed: number;
}

interface UseInviteFlowProps {
    enrollments: EnrollmentRow[];
    setEnrollments: React.Dispatch<React.SetStateAction<EnrollmentRow[]>>;
    clearSelection: () => void;
    showToast: ShowToast;
}

/** The course's own text for the email course card (none if it can't be loaded). */
async function fetchCourseInfo(courseId: string | undefined): Promise<CourseEmailInfo | null> {
    if (!courseId) return null;
    try {
        const { data, error } = await supabase.from('courses').select('email_templates').eq('id', courseId).maybeSingle();
        if (error) throw error;
        return data?.email_templates ?? null;
    } catch (err) {
        console.warn('Course email text unavailable (is migration 68 applied?):', err);
        return null;
    }
}

/** Time, place and days of one course date (none if not set or migration 79 isn't applied). */
async function fetchSession(courseId: string | undefined, date: string): Promise<CourseSession | null> {
    if (!courseId || !date) return null;
    try {
        const { data, error } = await supabase
            .from('invite_dates')
            .select(SESSION_COLUMNS)
            .eq('course_id', courseId)
            .eq('invite_date', date)
            .maybeSingle();
        if (error) throw error;
        const session = data ? sessionFromRow(data) : null;
        return sessionHasSchedule(session) ? session : null;
    } catch (err) {
        console.warn('Course date schedule unavailable (is migration 79 applied?):', err);
        return null;
    }
}

/** Time & place of an invitation that aren't tied to one course date. */
type SessionDefaults = Pick<CourseSession, 'start_time' | 'end_time' | 'location'>;
const NO_DEFAULTS: SessionDefaults = { start_time: null, end_time: null, location: null };

/** A start time that isn't before its end time (both HH:MM). */
const badRange = (start: string | null | undefined, end: string | null | undefined) => !!start && !!end && start >= end;

/** Why the schedule can't be saved, or null. */
export function scheduleProblem(sessions: CourseSession[]): string | null {
    for (const s of sessions) {
        if (badRange(s.start_time, s.end_time)) return 'The end time must be after the start time.';
        if (sessionDays(s).some(d => badRange(d.start ?? s.start_time, d.end ?? s.end_time))) return 'A day ends before it starts — check its time.';
    }
    return null;
}

/** Short token link to the confirmation page; null if a multi-date link can't be made. */
async function createConfirmLink(courseId: string | undefined, dates: string[]): Promise<string | null> {
    const isMulti = dates.length > 1;
    try {
        const { data: token, error } = isMulti
            ? await supabase.rpc('create_confirmation_token_multi', { p_course_id: courseId, p_course_dates: dates })
            : await supabase.rpc('create_confirmation_token', { p_course_id: courseId, p_course_date: dates[0] });
        if (!error && token) return `${window.location.origin}/c/${token}`;
        if (isMulti) {
            console.error('Multi-date token generation failed:', error);
            return null;
        }
    } catch (err) {
        console.error('Token generation failed, using long URL:', err);
        if (isMulti) return null;
    }
    // The legacy long URL can carry only one date
    return `${window.location.origin}/confirm?course_id=${courseId || ''}&date=${dates[0]}`;
}

/** Put the HTML email on the clipboard and open a BCC draft in the mail client. */
async function copyHtmlAndOpenDraft(
    htmlBody: string,
    emails: (string | null | undefined)[],
    subject: string,
    note: string,
    showToast: ShowToast
) {
    try {
        await navigator.clipboard.write([new ClipboardItem({
            'text/html': new Blob([htmlBody], { type: 'text/html' }),
            'text/plain': new Blob(['Please view this email in an HTML-compatible client.'], { type: 'text/plain' }),
        })]);
        showToast(`HTML template copied! Press Ctrl+V in your email client.${note}`, 'success');
    } catch (err) {
        console.error('Failed to copy HTML to clipboard:', err);
        showToast('Could not copy HTML to clipboard.', 'error');
    }
    const unique = [...new Set(emails.filter((e): e is string => !!e && e.trim() !== ''))];
    const bcc = unique.map(e => encodeURIComponent(e)).join(',');
    window.location.href = `mailto:?bcc=${bcc}&subject=${encodeURIComponent(subject)}`;
}

/**
 * Attendance reminder for confirmed people (one course + date): copies the email and opens
 * a BCC draft. Status stays unchanged. Returns false if nothing was sent.
 * A course that is tomorrow (any time of day) gets the "day before" text instead.
 */
export async function sendReminderEmail(
    selected: EnrollmentRow[],
    showToast: ShowToast
): Promise<boolean> {
    const confirmed = selected.filter(e => e.status === 'confirmed');
    if (confirmed.length === 0) {
        showToast('Reminders go to confirmed people — none selected.', 'error');
        return false;
    }
    // Date the person confirmed for (older rows only have the invited date)
    const courseDate = (e: EnrollmentRow) => (e.confirmed_date || e.invited_date || '').split('T')[0];
    // One email = one course card, so everyone must share the course and date
    if (new Set(confirmed.map(e => `${e.course_id}|${courseDate(e)}`)).size > 1) {
        showToast('Select people from one course and the same date to send a reminder.', 'error');
        return false;
    }

    let optedOut: Set<string>;
    try {
        optedOut = await fetchOptedOutEmails(confirmed.map(e => e.students?.email));
    } catch (err) {
        console.error('Failed to check the unsubscribe list:', err);
        showToast('Could not check the unsubscribe list. Please try again.', 'error');
        return false;
    }
    const { allowed, skipped } = partitionByOptOut(confirmed, e => e.students?.email, optedOut);
    if (allowed.length === 0) {
        showToast('Everyone selected has unsubscribed from emails — no reminder sent.', 'error');
        return false;
    }

    const first = allowed[0];
    const date = courseDate(first);
    const courseName = getCoursePill(first);
    const [courseInfo, session] = await Promise.all([fetchCourseInfo(first.course_id), fetchSession(first.course_id, date)]);
    // Multi-day courses are reminded about before their first day (the date they are kept under)
    const kind = date && daysBetween(todayISO(), date) === 1 ? 'reminder_tomorrow' : 'reminder';
    const htmlBody = buildEmailBodyHtml(courseName, date ? formatDateLongWithWeekday(date) : '', undefined, undefined, undefined, Boolean(first.courses?.requires_english), kind, courseInfo, session ? [session] : null);

    const notConfirmed = selected.length - confirmed.length;
    const note = skippedNote(skipped.length)
        + (notConfirmed ? ` · ${notConfirmed} not confirmed skipped` : '')
        + (kind === 'reminder_tomorrow' ? ' · course is tomorrow — day-before text used' : '');
    const subjectDate = session ? subjectDateLabel([session]) : date ? formatDateLong(date) : '';
    await copyHtmlAndOpenDraft(htmlBody, allowed.map(e => e.students?.email), buildEmailSubject(courseName, subjectDate, undefined, kind), note, showToast);
    return true;
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
    // Time, place and days of each course date: as saved, and as edited in this dialog
    const [savedSessions, setSavedSessions] = useState<Record<string, CourseSession>>({});
    const [sessionDrafts, setSessionDrafts] = useState<Record<string, CourseSession>>({});
    // Time & place a new course date starts with: the course's latest, then whatever was last typed
    const [sessionDefaults, setSessionDefaults] = useState<SessionDefaults>(NO_DEFAULTS);
    // False until migration 79 adds the schedule columns
    const [scheduleSupported, setScheduleSupported] = useState(true);

    async function fetchCourseDates(courseId: string) {
        setTargetCourseId(courseId);
        const today = todayISO();
        const { data, error } = await supabase
            .from('invite_dates')
            .select(SESSION_COLUMNS)
            .eq('course_id', courseId)
            .order('invite_date', { ascending: true });
        if (error) {
            console.warn('Course date schedules unavailable (is migration 79 applied?):', error);
            setScheduleSupported(false);
            const { data: plain } = await supabase
                .from('invite_dates')
                .select('invite_date')
                .eq('course_id', courseId)
                .gte('invite_date', today)
                .order('invite_date', { ascending: true });
            setSavedInviteDates(plain ? plain.map((d: { invite_date: string }) => d.invite_date) : []);
            return;
        }
        setScheduleSupported(true);
        const sessions = (data || []).map(sessionFromRow).filter((s): s is CourseSession => !!s);
        setSavedInviteDates(sessions.map(s => s.date).filter(d => d >= today));
        setSavedSessions(Object.fromEntries(sessions.map(s => [s.date, s])));
        // The course's latest date with a time or place sets the defaults for a new date
        const latest = [...sessions].reverse().find(s => s.start_time || s.end_time || s.location);
        setSessionDefaults(latest ? { start_time: latest.start_time, end_time: latest.end_time, location: latest.location } : NO_DEFAULTS);
    }

    function openInviteModal(ids: string[], bulk: boolean) {
        setInviteDateTarget({ ids, bulk });
        setInviteDate(todayISO());
        setMultiDate(false);
        setInviteDates([]);
        setResponseDays(7);
        setSavedSessions({});
        setSessionDrafts({});
        setSessionDefaults(NO_DEFAULTS);
        const first = enrollments.find(e => ids.includes(e.id));
        if (first && first.course_id) {
            fetchCourseDates(first.course_id);
        } else {
            setTargetCourseId(null);
            setSavedInviteDates([]);
        }
    }

    /** The course date as it will be saved: edited here, else as saved, else a new one with the defaults. */
    function sessionFor(date: string): CourseSession {
        const saved = savedSessions[date];
        return sessionDrafts[date]
            ?? (sessionHasSchedule(saved) ? saved : { ...emptySession(date), ...sessionDefaults });
    }

    /** Edit a course date's time, place or days; a new time or place also becomes the default for new dates. */
    function updateSession(date: string, patch: Partial<Omit<CourseSession, 'date'>>) {
        if (!date) return;
        const next = { ...sessionFor(date), ...patch, date };
        setSessionDrafts(prev => ({ ...prev, [date]: next }));
        if ('start_time' in patch || 'end_time' in patch || 'location' in patch) {
            setSessionDefaults({ start_time: next.start_time, end_time: next.end_time, location: next.location });
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
    const selectedSessions = scheduleSupported ? selectedDates.map(d => normalizeSession(sessionFor(d))) : [];
    const scheduleError = scheduleProblem(selectedSessions);
    // Places this course used before, newest first
    const locationSuggestions = [...new Set(Object.values(savedSessions).reverse().map(x => x.location).filter((l): l is string => !!l))];
    const canInvite = (multiDate ? inviteDates.length >= 2 : !!inviteDate) && !scheduleError;

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
        mutationFn: async ({ ids, dates, days, sessions }: { ids: string[], dates: string[], days: number, sessions: CourseSession[] }) => {
            const first = enrollments.find(e => ids.includes(e.id));
            if (first && first.course_id) {
                const courseId = first.course_id;
                const plainRows = normalizeDateList(dates).map(d => ({ course_id: courseId, invite_date: d }));
                const { error: sessionError } = sessions.length > 0
                    ? await supabase.from('invite_dates').upsert(sessions.map(s => sessionToRow(courseId, s)), { onConflict: 'course_id,invite_date' })
                    : await supabase.from('invite_dates').upsert(plainRows, { onConflict: 'course_id,invite_date' });
                if (sessionError && sessions.length > 0) {
                    console.error('Saving the course date schedule failed:', sessionError);
                    await supabase.from('invite_dates').upsert(plainRows, { onConflict: 'course_id,invite_date' });
                    showToast('Time & place were not saved (is migration 79 applied?)', 'error');
                }
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
            queryClient.invalidateQueries({ queryKey: COURSE_SESSIONS_QUERY_KEY });
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
        inviteMutation.mutate({ ids: inviteDateTarget.ids, dates: selectedDates, days: responseDays, sessions: selectedSessions });
        setInviteDateTarget(null);
    }

    async function handleInviteAndEmail() {
        if (!inviteDateTarget || !canInvite) return;
        const targetEnrollments = enrollments.filter(e => inviteDateTarget.ids.includes(e.id));

        // People who unsubscribed stay in the CRM but are neither invited nor emailed
        let optedOut: Set<string>;
        try {
            optedOut = await fetchOptedOutEmails(targetEnrollments.map(e => e.students?.email));
        } catch (err) {
            console.error('Failed to check the unsubscribe list:', err);
            showToast('Could not check the unsubscribe list. Please try again.', 'error');
            return;
        }
        const { allowed: selectedEnrollments, skipped } = partitionByOptOut(targetEnrollments, e => e.students?.email, optedOut);
        if (selectedEnrollments.length === 0) {
            showToast('Everyone selected has unsubscribed from emails — nobody was invited.', 'error');
            return;
        }
        const ids = selectedEnrollments.map(e => e.id);
        const dates = normalizeDateList(selectedDates);

        const first = selectedEnrollments[0];
        const courseName = first ? getCoursePill(first) : 'Course';
        const sessions = selectedSessions.length > 0 ? selectedSessions : dates.map(emptySession);
        const dateFormatted = subjectDateLabel(sessions);

        const confirmLink = await createConfirmLink(first?.course_id, dates);
        if (!confirmLink) {
            showToast('Could not create the multi-date confirmation link. Is migration 59 applied?', 'error');
            return;
        }
        const courseInfo = await fetchCourseInfo(first?.course_id);

        // Await the database update so mailto navigation doesn't abort the HTTP request
        try {
            await inviteMutation.mutateAsync({ ids, dates, days: responseDays, sessions: selectedSessions });
        } catch (err) {
            console.error('Failed to complete invite mutation:', err);
            return;
        }

        const requiresEnglish = Boolean(first?.courses?.requires_english);
        const htmlBody = buildEmailBodyHtml(courseName, dates.map(formatDateLongWithWeekday), confirmLink, undefined, responseDays, requiresEnglish, 'invite', courseInfo, sessions);
        await copyHtmlAndOpenDraft(htmlBody, selectedEnrollments.map(e => e.students?.email), buildEmailSubject(courseName, dateFormatted), skippedNote(skipped.length), showToast);
        setInviteDateTarget(null);
    }

    /** Remind the selected confirmed people that their course is coming up. */
    async function handleSendReminder(ids: string[]) {
        if (await sendReminderEmail(enrollments.filter(e => ids.includes(e.id)), showToast)) clearSelection();
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
        scheduleSupported,
        scheduleError,
        sessionFor,
        updateSession,
        locationSuggestions,
        responseDays,
        setResponseDays,
        savedInviteDates,
        targetCourseId,
        targetMaxCapacity,
        fetchCourseDates,
        getDateStats,
        openInviteModal,
        handleInviteWithDate,
        handleInviteAndEmail,
        handleSendReminder
    };
}

/** Everything the invite dialogs need from useInviteFlow. */
export type InviteFlow = ReturnType<typeof useInviteFlow>;
