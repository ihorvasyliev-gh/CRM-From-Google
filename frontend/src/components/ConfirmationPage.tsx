import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import {
    CheckCircle,
    AlertCircle,
    Loader2,
    Mail,
    GraduationCap,
    RefreshCw,
    Users,
    Calendar,
    CalendarX,
    Download,
    ExternalLink,
    ArrowLeft,
    Copy,
    Check,
    Star,
    Clock,
    MapPin,
    Link2Off,
} from 'lucide-react';
import { getGoogleCalendarUrl, downloadIcsFile, type CalendarEventParams } from '../lib/calendarUtils';
import { dayTime, formatTimeRange, hasDayOverrides, isMultiDay, sessionDays, sessionFromRow, sessionHasSchedule, weeklySummary, type CourseSession } from '../lib/courseSessions';
import { placeHref } from '../lib/maps';
import { emailProblem } from '../lib/emailValidation';
import { fullName, type DeclineReason } from '../lib/types';
import FieldError from './ui/FieldError';
import {
    ContactFooter,
    ORGANIZER_EMAIL,
    PublicAlert,
    PublicCardHeader,
    PublicEmailField,
    PublicLayout,
    PublicMessage,
    primaryButtonCls,
    publicLabelCls,
    secondaryButtonCls,
} from './PublicPage';

type PageState = 'loading' | 'form' | 'pick' | 'success' | 'invalid' | 'error' | 'decline' | 'declined' | 'full';
type Field = 'email' | 'reason' | 'person';

interface CapacityInfo {
    max: number;
    confirmed: number;
    isFull: boolean;
}

/** How often the confirmed-places counter is refreshed while the page is open. */
const CAPACITY_REFRESH_MS = 30_000;

interface MatchedStudent {
    student_id: string;
    first_name: string;
    last_name: string;
}

const DECLINE_CHOICES: { value: DeclineReason; label: string; hint: string }[] = [
    { value: 'other_date', label: 'Keep me for a later date', hint: "We'll invite you again when there's a new date." },
    { value: 'not_interested', label: "I'm no longer interested", hint: "We'll take you off the list for this course." },
];

const NETWORK_ERROR = 'Could not connect. Please check your internet connection and try again.';
const SERVER_ERROR = 'Something went wrong on our side. Please try again in a moment.';

function formatCourseDate(dateStr: string): string {
    try {
        return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-GB', {
            weekday: 'short',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
    } catch {
        return dateStr;
    }
}

/** "Olena", "Olena and Taras", "Olena, Taras and Ivan" */
function joinNames(names: string[]): string {
    return names.length <= 1 ? names[0] ?? '' : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** Moves focus to a field once the error under it is on screen */
function focusField(selector: string) {
    setTimeout(() => document.querySelector<HTMLElement>(selector)?.focus(), 0);
}

/** A choice drawn as a card: dates, people, "what would you like" */
function optionCardCls(selected: boolean, disabled = false) {
    return `flex gap-3 p-3.5 rounded-xl border-2 transition-colors touch-manipulation has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-brand-500/40 ${
        disabled
            ? 'border-border-subtle bg-surface-elevated/40 opacity-60 cursor-not-allowed'
            : selected
                ? 'border-emerald-600 bg-success/10 cursor-pointer'
                : 'border-border-strong bg-surface hover:border-brand-500/50 cursor-pointer'
    }`;
}

export default function ConfirmationPage() {
    const [state, setState] = useState<PageState>('loading');
    const [courseName, setCourseName] = useState('');
    const [courseId, setCourseId] = useState('');
    const [courseDate, setCourseDate] = useState('');
    const [email, setEmail] = useState('');
    const [resultMessage, setResultMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    // Under a field ("Enter your email address")
    const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
    // About the whole form: the server said no, or the connection dropped (`retryable`)
    const [inlineError, setInlineError] = useState('');
    const [retryable, setRetryable] = useState(false);
    // Multi-date: the chosen date filled up, or none chosen yet
    const [dateError, setDateError] = useState('');
    const [matchedStudents, setMatchedStudents] = useState<MatchedStudent[]>([]);
    const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
    const [copiedCoordinatorEmail, setCopiedCoordinatorEmail] = useState(false);
    const [capacity, setCapacity] = useState<CapacityInfo | null>(null);
    // Multi-date invitation: the dates offered (2+) and places left on each.
    // In this mode `courseDate` holds the date the student picked ('' until chosen).
    const [courseDates, setCourseDates] = useState<string[]>([]);
    const [dateCapacity, setDateCapacity] = useState<Record<string, CapacityInfo | null>>({});
    const isMultiDate = courseDates.length > 1;
    // Time, place and days of each offered date (empty when none are set)
    const [sessions, setSessions] = useState<Record<string, CourseSession>>({});
    const anyMultiDay = Object.values(sessions).some(isMultiDay);
    // "Can't make it?": the answer, who it is for when several people share the email,
    // and whether to offer email instead (migration 89 not applied yet)
    const [declineReason, setDeclineReason] = useState<DeclineReason | ''>('');
    const [declinePeople, setDeclinePeople] = useState<MatchedStudent[]>([]);
    const [declineIds, setDeclineIds] = useState<Set<string>>(new Set());
    const [declineByEmail, setDeclineByEmail] = useState(false);
    const [declinedName, setDeclinedName] = useState('');

    // Guard against double-click race conditions
    const submittingRef = useRef(false);

    // Store URL info for retry capability
    const urlInfoRef = useRef<{ type: 'token'; value: string } | { type: 'courseId'; value: string; date?: string } | null>(null);

    /** Loads "X of Y places confirmed" for the course date. Returns true when fully booked. */
    const fetchCapacity = useCallback(async (id: string, date: string | null | undefined): Promise<boolean> => {
        if (!id || !date) { setCapacity(null); return false; }
        const info = await loadCapacity(id, date);
        setCapacity(info);
        return Boolean(info?.isFull);
    }, []);

    /** Loads places for every offered date of a multi-date invite. Returns true when all are fully booked. */
    const fetchDateCapacities = useCallback(async (id: string, dates: string[]): Promise<Record<string, CapacityInfo | null>> => {
        const infos = await Promise.all(dates.map(d => loadCapacity(id, d)));
        const byDate = Object.fromEntries(dates.map((d, i) => [d, infos[i]]));
        setDateCapacity(byDate);
        return byDate;
    }, []);

    /** Schedule of the offered dates; informational, so a failure (e.g. migration 79 missing) just hides it. */
    const loadSessions = useCallback(async (token: string) => {
        try {
            const { data, error } = await supabase.rpc('get_confirmation_sessions', { p_token: token });
            if (error || !Array.isArray(data)) return;
            const list = data.map(sessionFromRow).filter(sessionHasSchedule);
            setSessions(Object.fromEntries(list.map(x => [x.date, x])));
        } catch (err) {
            console.warn('get_confirmation_sessions exception:', err);
        }
    }, []);

    /**
     * Shows the date the person is actually confirmed for, with its time and place.
     * Keeps the link's date when it is unknown (e.g. migration 86 missing).
     */
    const loadConfirmedSession = useCallback(async (emailAddress: string, studentId: string | null) => {
        try {
            const { data, error } = await supabase.rpc('get_confirmed_session', {
                p_email: emailAddress,
                p_course_id: courseId,
                p_student_id: studentId,
            });
            const session = !error && Array.isArray(data) && data[0] ? sessionFromRow(data[0]) : null;
            if (!session) return;
            setCourseDate(session.date);
            if (sessionHasSchedule(session)) setSessions(prev => ({ ...prev, [session.date]: session }));
        } catch (err) {
            console.warn('get_confirmed_session exception:', err);
        }
    }, [courseId]);

    const resolveToken = useCallback(async (token: string) => {
        void loadSessions(token);
        try {
            const { data, error } = await supabase.rpc('resolve_confirmation_token', { p_token: token });
            if (error) {
                console.error('Token resolve error:', error);
                setState('error');
                return;
            }
            if (!data || data.length === 0) {
                setState('invalid');
                return;
            }
            const row = data[0];
            setCourseId(row.course_id);
            setCourseName(row.course_name);
            const offered: string[] = Array.isArray(row.course_dates)
                ? [...new Set<string>(row.course_dates.filter(Boolean))].sort()
                : [];
            if (offered.length > 1) {
                setCourseDates(offered);
                setCourseDate('');
                const byDate = await fetchDateCapacities(row.course_id, offered);
                setState(allDatesFull(offered, byDate) ? 'full' : 'form');
                return;
            }
            if (row.course_date) setCourseDate(row.course_date);
            const isFull = await fetchCapacity(row.course_id, row.course_date);
            setState(isFull ? 'full' : 'form');
        } catch (err) {
            console.error('Token resolve exception:', err);
            setState('error');
        }
    }, [fetchCapacity, fetchDateCapacities, loadSessions]);

    const fetchCourseInfo = useCallback(async (id: string, date?: string) => {
        try {
            const { data, error } = await supabase.rpc('get_public_course_info', { p_course_id: id });
            if (error) {
                console.error('Course info error:', error);
                setState('error');
                return;
            }
            if (!data || data.length === 0) {
                setState('invalid');
                return;
            }
            setCourseName(data[0].course_name);
            const isFull = await fetchCapacity(id, date);
            setState(isFull ? 'full' : 'form');
        } catch (err) {
            console.error('Course info exception:', err);
            setState('error');
        }
    }, [fetchCapacity]);

    // Read parameters from URL on mount
    useEffect(() => {
        const path = window.location.pathname;

        // Short token URL: /c/Xk9mQ2
        if (path.startsWith('/c/')) {
            const token = path.split('/c/')[1];
            if (!token) { setState('invalid'); return; }
            urlInfoRef.current = { type: 'token', value: token };
            resolveToken(token);
            return;
        }

        // Legacy URL: /confirm?course_id=...&date=...
        const params = new URLSearchParams(window.location.search);
        const id = params.get('course_id');
        const date = params.get('date');
        if (!id) {
            setState('invalid');
            return;
        }
        setCourseId(id);
        if (date) setCourseDate(date);
        urlInfoRef.current = { type: 'courseId', value: id, date: date || undefined };
        fetchCourseInfo(id, date || undefined);
    }, [resolveToken, fetchCourseInfo]);

    // Keep the places counter fresh while the person is deciding; close the
    // form as soon as the last place is taken.
    useEffect(() => {
        if (state !== 'form' || !courseId || isMultiDate || !courseDate || !capacity) return;
        const timer = setInterval(async () => {
            if (submittingRef.current) return;
            const isFull = await fetchCapacity(courseId, courseDate);
            if (isFull && !submittingRef.current) setState('full');
        }, CAPACITY_REFRESH_MS);
        return () => clearInterval(timer);
    }, [state, courseId, courseDate, capacity, isMultiDate, fetchCapacity]);

    // Multi-date: refresh every offered date; drop the chosen date if it fills up.
    const hasLimitedDates = Object.values(dateCapacity).some(Boolean);
    useEffect(() => {
        if (state !== 'form' || !courseId || !isMultiDate || !hasLimitedDates) return;
        const timer = setInterval(async () => {
            if (submittingRef.current) return;
            const byDate = await fetchDateCapacities(courseId, courseDates);
            if (submittingRef.current) return;
            if (allDatesFull(courseDates, byDate)) { setState('full'); return; }
            if (courseDate && byDate[courseDate]?.isFull) {
                setCourseDate('');
                setDateError('Sorry, the date you selected has just filled up. Please choose another date.');
            }
        }, CAPACITY_REFRESH_MS);
        return () => clearInterval(timer);
    }, [state, courseId, courseDate, courseDates, isMultiDate, hasLimitedDates, fetchDateCapacities]);

    function showError(message: string, canRetry = false) {
        setInlineError(message);
        setRetryable(canRetry);
    }

    function clearError(field: Field) {
        setInlineError('');
        setErrors(prev => {
            if (!prev[field]) return prev;
            const rest = { ...prev };
            delete rest[field];
            return rest;
        });
    }

    /** Switches screens, leaving the previous screen's messages behind */
    function goTo(next: PageState) {
        setErrors({});
        showError('');
        setDateError('');
        setState(next);
    }

    /** Server rejected a confirmation because the course date filled up. */
    async function handleCourseFull() {
        if (isMultiDate) {
            // Another date may still have places: refresh and let the student pick again
            const byDate = await fetchDateCapacities(courseId, courseDates);
            if (courseDate && byDate[courseDate]) {
                byDate[courseDate] = { ...byDate[courseDate]!, isFull: true };
                setDateCapacity({ ...byDate });
            }
            if (allDatesFull(courseDates, byDate)) {
                goTo('full');
                return;
            }
            setCourseDate('');
            goTo('form');
            setDateError('Sorry, the date you selected has just filled up. Please choose another date.');
            return;
        }
        setCapacity(prev => prev ? { ...prev, confirmed: Math.max(prev.confirmed, prev.max), isFull: true } : prev);
        goTo('full');
    }

    /** Extra RPC argument: the date picked from a multi-date invite. */
    function chosenDateArg(): { p_course_date?: string } {
        return isMultiDate && courseDate ? { p_course_date: courseDate } : {};
    }

    /** The date(s) the invitation is about, for emails to the coordinator. */
    function invitationDatesLabel(): string {
        if (isMultiDate) return courseDates.map(formatCourseDate).join(' / ');
        return courseDate ? formatCourseDate(courseDate) : 'the scheduled date';
    }

    // One place for every offered option: shown once under the choices
    const offeredPlaces = courseDates.map(d => sessions[d]?.location ?? '');
    const sharedPlace = isMultiDate && offeredPlaces[0] && offeredPlaces.every(p => p === offeredPlaces[0]) ? offeredPlaces[0] : '';

    // The confirmed date's schedule for the calendar buttons (one event per course day)
    const confirmedSession = courseDate ? sessions[courseDate] : undefined;
    const calendarDays = confirmedSession
        ? sessionDays(confirmedSession).map(d => {
            const t = dayTime(confirmedSession, d);
            return { date: d.date, startTime: t.start ?? undefined, endTime: t.end ?? undefined };
        })
        : [];
    const calendarParams: CalendarEventParams = {
        courseName,
        courseDate,
        startTime: confirmedSession?.start_time ?? undefined,
        endTime: confirmedSession?.end_time ?? undefined,
        location: confirmedSession?.location ?? undefined,
        days: calendarDays.length > 1 ? calendarDays : undefined,
    };

    function handleRetry() {
        setState('loading');
        const info = urlInfoRef.current;
        if (!info) { setState('invalid'); return; }
        if (info.type === 'token') {
            resolveToken(info.value);
        } else {
            fetchCourseInfo(info.value, info.date);
        }
    }

    function handleEmailChange(value: string) {
        if (value === email) return;
        setEmail(value);
        clearError('email');
        // The people found for the old address don't apply to the new one
        if (declinePeople.length) {
            setDeclinePeople([]);
            setDeclineIds(new Set());
            clearError('person');
        }
    }

    async function handleSubmit(e?: React.FormEvent) {
        e?.preventDefault();
        if (submittingRef.current) return;

        const badEmail = emailProblem(email);
        if (badEmail) {
            setErrors({ email: badEmail });
            focusField('#student-email');
            return;
        }
        if (isMultiDate && !courseDate) {
            setDateError('Choose the date you would like to attend.');
            focusField('input[name="course-date"]:not(:disabled)');
            return;
        }

        const trimmedEmail = email.trim().toLowerCase();
        submittingRef.current = true;
        setIsSubmitting(true);
        showError('');
        try {
            let students: MatchedStudent[] | null = null;
            try {
                const { data, error: findError } = await supabase.rpc('find_students_by_email', {
                    p_email: trimmedEmail,
                    p_course_id: courseId,
                });
                if (!findError && data) {
                    students = data;
                }
            } catch (findErr) {
                console.warn('find_students_by_email exception:', findErr);
            }

            // No match or a single match: confirm straight away
            if (!students || students.length <= 1) {
                const { data, error } = await supabase.rpc('public_confirm_enrollment', {
                    p_email: trimmedEmail,
                    p_course_id: courseId,
                    p_student_id: students?.[0]?.student_id ?? null,
                    ...chosenDateArg(),
                });
                if (error) {
                    console.error('public_confirm_enrollment error:', error);
                    showError(SERVER_ERROR);
                    return;
                }
                if (data && data.success) {
                    setResultMessage(data.message || 'Your attendance has been confirmed! We look forward to seeing you.');
                    await loadConfirmedSession(trimmedEmail, students?.[0]?.student_id ?? null);
                    goTo('success');
                } else if (data?.code === 'course_full') {
                    await handleCourseFull();
                } else {
                    showError(data?.message || 'We could not confirm your place. Please try again.');
                }
                return;
            }

            // Several people share this email: ask who is coming
            setMatchedStudents(students);
            setSelectedStudentIds(new Set());
            goTo('pick');
        } catch (err) {
            console.error('Submit error:', err);
            showError(NETWORK_ERROR, true);
        } finally {
            setIsSubmitting(false);
            submittingRef.current = false;
        }
    }

    /** Fully booked view: someone who already has a place (e.g. added by the organizer) checks it by email. */
    async function handleCheckPlace(e?: React.FormEvent) {
        e?.preventDefault();
        if (submittingRef.current) return;

        const badEmail = emailProblem(email);
        if (badEmail) {
            setErrors({ email: badEmail });
            focusField('#check-email');
            return;
        }

        const trimmedEmail = email.trim().toLowerCase();
        submittingRef.current = true;
        setIsSubmitting(true);
        showError('');
        try {
            // Returns only pending invitations, i.e. people who have no place yet
            const { data: pending, error: findError } = await supabase.rpc('find_students_by_email', {
                p_email: trimmedEmail,
                p_course_id: courseId,
            });
            if (findError) {
                showError(SERVER_ERROR);
                return;
            }
            if (pending && pending.length > 0) {
                // A place may have come free since the page loaded: then they confirm as usual
                const stillFull = isMultiDate
                    ? allDatesFull(courseDates, await fetchDateCapacities(courseId, courseDates))
                    : await fetchCapacity(courseId, courseDate);
                if (stillFull) {
                    showError("This email doesn't have a place in this group yet, and all places are taken.");
                } else {
                    goTo('form');
                }
                return;
            }

            // No pending invitation, so nothing is confirmed here: the reply only says
            // whether this email already has a place on the course
            const { data, error } = await supabase.rpc('public_confirm_enrollment', {
                p_email: trimmedEmail,
                p_course_id: courseId,
                p_student_id: null,
            });
            if (error) {
                console.error('public_confirm_enrollment error:', error);
                showError(SERVER_ERROR);
                return;
            }
            if (data?.success) {
                setResultMessage(data.message || 'You have a place on this course. We look forward to seeing you!');
                await loadConfirmedSession(trimmedEmail, null);
                goTo('success');
            } else {
                showError(data?.message || 'No place found for this email.');
            }
        } catch (err) {
            console.error('Check place error:', err);
            showError(NETWORK_ERROR, true);
        } finally {
            setIsSubmitting(false);
            submittingRef.current = false;
        }
    }

    function toggleStudent(studentId: string) {
        setSelectedStudentIds(prev => {
            const next = new Set(prev);
            if (next.has(studentId)) next.delete(studentId);
            else next.add(studentId);
            return next;
        });
        setInlineError('');
    }

    async function handleConfirmSelected() {
        if (selectedStudentIds.size === 0) return;
        if (submittingRef.current) return;
        submittingRef.current = true;
        setIsSubmitting(true);
        showError('');

        try {
            const trimmedEmail = email.trim().toLowerCase();
            const ids = Array.from(selectedStudentIds);
            const results: { id: string; success: boolean; message: string; code?: string }[] = [];

            for (const studentId of ids) {
                const { data, error } = await supabase.rpc('public_confirm_enrollment', {
                    p_email: trimmedEmail,
                    p_course_id: courseId,
                    p_student_id: studentId,
                    ...chosenDateArg(),
                });
                results.push({
                    id: studentId,
                    success: !error && (data?.success ?? false),
                    message: error ? SERVER_ERROR : data?.message || '',
                    code: data?.code
                });
            }

            if (results.some(r => r.success)) {
                const confirmedNames = matchedStudents
                    .filter(s => results.some(r => r.success && r.id === s.student_id))
                    .map(s => fullName(s))
                    .join(', ');
                const note = results.every(r => r.success)
                    ? ' We look forward to seeing you!'
                    : results.some(r => r.code === 'course_full')
                        ? ` Unfortunately the course filled up before everyone could be confirmed — please email ${ORGANIZER_EMAIL} about the next course.`
                        : '';
                setResultMessage(`Attendance confirmed for: ${confirmedNames}.${note}`);
                await loadConfirmedSession(trimmedEmail, results.find(r => r.success)?.id ?? null);
                goTo('success');
            } else if (results.some(r => r.code === 'course_full')) {
                await handleCourseFull();
            } else {
                showError(results[0]?.message || 'We could not confirm your place. Please try again.');
            }
        } catch (err) {
            console.error('Confirm selected error:', err);
            showError(NETWORK_ERROR, true);
        } finally {
            setIsSubmitting(false);
            submittingRef.current = false;
        }
    }

    function openDecline() {
        setDeclinePeople([]);
        setDeclineIds(new Set());
        goTo('decline');
    }

    function toggleDeclinePerson(studentId: string) {
        setDeclineIds(prev => {
            const next = new Set(prev);
            if (next.has(studentId)) next.delete(studentId);
            else next.add(studentId);
            return next;
        });
        clearError('person');
    }

    /** "Can't make it?": records the answer on the invitation for the organizer (migration 89). */
    async function handleReportCantAttend(e?: React.FormEvent) {
        e?.preventDefault();
        if (submittingRef.current) return;

        const found: Partial<Record<Field, string>> = {};
        if (!declineReason) found.reason = 'Choose one of the options';
        const badEmail = emailProblem(email);
        if (badEmail) found.email = badEmail;
        if (declinePeople.length > 1 && declineIds.size === 0) found.person = "Tick who can't come";
        setErrors(found);
        if (found.reason) { focusField('input[name="decline-reason"]'); return; }
        if (found.email) { focusField('#decline-email'); return; }
        if (found.person) { focusField('input[name="decline-person"]'); return; }

        const trimmedEmail = email.trim().toLowerCase();
        // Several people share the email: one answer for each person ticked
        const targets: (string | null)[] = declinePeople.length > 1 ? [...declineIds] : [null];
        submittingRef.current = true;
        setIsSubmitting(true);
        showError('');
        try {
            const names: string[] = [];
            for (const studentId of targets) {
                const { data, error } = await supabase.rpc('public_report_cant_attend', {
                    p_email: trimmedEmail,
                    p_course_id: courseId,
                    p_reason: declineReason,
                    p_student_id: studentId,
                });
                if (error) {
                    // Most likely the database doesn't have this yet: offer email instead
                    console.error('public_report_cant_attend error:', error);
                    setDeclineByEmail(true);
                    return;
                }
                if (data?.code === 'choose_person' && Array.isArray(data.people)) {
                    setDeclinePeople(data.people);
                    setDeclineIds(new Set());
                    focusField('input[name="decline-person"]');
                    return;
                }
                if (data?.code === 'not_found') {
                    setErrors({ email: data.message || 'We could not find an invitation for this course with this email.' });
                    focusField('#decline-email');
                    return;
                }
                if (!data?.success) {
                    showError(data?.message || 'We could not save your answer. Please try again.');
                    return;
                }
                const person = declinePeople.find(p => p.student_id === studentId);
                const name = person?.first_name || data.first_name;
                if (name) names.push(name);
            }
            setDeclinedName(joinNames(names));
            goTo('declined');
        } catch (err) {
            console.error('public_report_cant_attend exception:', err);
            showError(NETWORK_ERROR, true);
        } finally {
            setIsSubmitting(false);
            submittingRef.current = false;
        }
    }

    function handleCopyCoordinatorEmail() {
        Promise.resolve(navigator.clipboard?.writeText(ORGANIZER_EMAIL)).catch(() => {});
        setCopiedCoordinatorEmail(true);
        setTimeout(() => setCopiedCoordinatorEmail(false), 2000);
    }

    /** mailto: to the coordinator; `message` is the paragraph(s) between the greeting and the email line. */
    function coordinatorMailto(subjectPrefix: string, message: string): string {
        const subject = `${subjectPrefix}: ${courseName || 'Course'}`;
        const emailLine = email.trim() ? `Registered email: ${email.trim()}\n` : '';
        const body = `Hello Igor,\n\n${message}\n\n${emailLine}Thank you!`;
        return `mailto:${ORGANIZER_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    }

    const getRescheduleMailtoUrl = () => coordinatorMailto('Waiting list / Reschedule',
        `I am unable to attend the upcoming session for "${courseName}" on ${invitationDatesLabel()}.\n\nPlease keep me on the waiting list for future dates.`);
    const getPriorityMailtoUrl = () => coordinatorMailto('Priority for next course',
        `I received an invitation for "${courseName}" on ${invitationDatesLabel()}, but all places were already taken when I tried to confirm.\n\nI am still interested — please give me priority for the next available course date.`);
    const getWithdrawMailtoUrl = () => coordinatorMailto('Cancel registration',
        `I am no longer interested in attending "${courseName}" on ${invitationDatesLabel()}.\n\nPlease cancel my registration and remove me from the waiting list.`);
    const getCantAttendMailtoUrl = () => declineReason === 'other_date'
        ? getRescheduleMailtoUrl()
        : declineReason === 'not_interested'
            ? getWithdrawMailtoUrl()
            : coordinatorMailto("Can't attend", `I can't attend "${courseName}" on ${invitationDatesLabel()}.`);

    const needsDate = isMultiDate && !courseDate;

    // ─── Render ─────────────────────────────────────────────

    return (
        <PublicLayout title="Confirm your place" footer="Cork City Partnership · Course confirmation">
            {/* ─── Loading ─── */}
            {state === 'loading' && (
                <div className="p-6 sm:p-8 space-y-6" aria-busy="true">
                    <div className="flex items-center gap-3 animate-pulse" aria-hidden="true">
                        <div className="w-11 h-11 bg-surface-elevated rounded-xl" />
                        <div className="space-y-2 flex-1">
                            <div className="h-3 w-28 bg-surface-elevated rounded-sm" />
                            <div className="h-5 w-48 bg-border-strong/60 rounded-sm" />
                        </div>
                    </div>
                    <div className="space-y-3 pt-2 animate-pulse" aria-hidden="true">
                        <div className="h-3 w-32 bg-surface-elevated rounded-sm" />
                        <div className="h-12 w-full bg-surface-elevated/70 rounded-xl border border-border-subtle" />
                    </div>
                    <div role="status" className="h-13 w-full bg-success/10 rounded-xl flex items-center justify-center gap-2 text-status-confirmed">
                        <Loader2 size={20} className="animate-spin" aria-hidden="true" />
                        <span className="text-sm font-medium">Loading course invitation...</span>
                    </div>
                </div>
            )}

            {/* ─── Could not load ─── */}
            {state === 'error' && (
                <PublicMessage icon={AlertCircle} tone="warning" title="Connection problem">
                    <p className="text-muted text-sm leading-relaxed max-w-xs -mt-1">
                        We couldn't load the course details. Please check your internet connection and try again.
                    </p>
                    <div className="w-full flex flex-col gap-2.5 mt-1">
                        <button type="button" onClick={handleRetry} className={primaryButtonCls}>
                            <RefreshCw size={18} aria-hidden="true" /> Try again
                        </button>
                        <button type="button" onClick={() => window.location.reload()} className={secondaryButtonCls}>
                            Reload page
                        </button>
                    </div>
                    <ContactFooter prompt="Still not working?" subject="Course confirmation page not loading" />
                </PublicMessage>
            )}

            {/* ─── Invalid Link ─── */}
            {state === 'invalid' && (
                <PublicMessage icon={Link2Off} tone="danger" title="This link has expired">
                    <p className="text-muted text-sm leading-relaxed max-w-xs -mt-1">
                        This confirmation link is no longer valid. Ask the organizer and they'll send you a new invitation.
                    </p>
                    <a
                        href={`mailto:${ORGANIZER_EMAIL}?subject=${encodeURIComponent('Expired confirmation link')}`}
                        className={`${secondaryButtonCls} mt-1`}
                    >
                        <Mail size={16} aria-hidden="true" /> Ask for a new invitation
                    </a>
                    <p className="text-xs text-muted">{ORGANIZER_EMAIL}</p>
                </PublicMessage>
            )}

            {/* ─── Form State (Main Confirmation) ─── */}
            {state === 'form' && (
                <form onSubmit={handleSubmit} noValidate className="flex flex-col">
                    <PublicCardHeader
                        icon={GraduationCap}
                        eyebrow="Course invitation"
                        title={courseName}
                        below={!isMultiDate && capacity && <CapacityMeter capacity={capacity} />}
                    >
                        {isMultiDate ? (
                            <p className="flex items-center gap-1.5 text-sm text-primary font-medium mt-1.5">
                                <Calendar size={14} className="text-brand-600 dark:text-brand-400 shrink-0" aria-hidden="true" />
                                <span>{courseDates.length} {anyMultiDay ? 'options' : 'dates'} available — choose one below</span>
                            </p>
                        ) : courseDate && (
                            <>
                                <p className="flex items-center gap-1.5 text-sm text-primary font-medium mt-1.5">
                                    <Calendar size={14} className="text-brand-600 dark:text-brand-400 shrink-0" aria-hidden="true" />
                                    <span>{courseDateLine(courseDate, sessions[courseDate])}</span>
                                </p>
                                {sessions[courseDate] && <SessionDetails session={sessions[courseDate]} />}
                            </>
                        )}
                    </PublicCardHeader>

                    <div className="p-5 sm:p-6 space-y-5">
                        {isMultiDate && (
                            <fieldset>
                                <legend className={publicLabelCls}>
                                    {anyMultiDay ? 'Choose your option' : 'Choose your date'}
                                </legend>
                                <div className="space-y-2">
                                    {courseDates.map((d, i) => {
                                        const info = dateCapacity[d];
                                        const isFull = Boolean(info?.isFull);
                                        const isSelected = courseDate === d;
                                        const placesText = placesLeftText(info);
                                        const left = info ? Math.max(info.max - info.confirmed, 0) : null;
                                        const almostFull = !isFull && left !== null && info && (left <= 3 || left / info.max <= 0.25);
                                        return (
                                            <label
                                                key={d}
                                                data-testid="date-option"
                                                className={`${optionCardCls(isSelected, isFull)} ${sessions[d] ? 'items-start' : 'items-center'}`}
                                            >
                                                <input
                                                    type="radio"
                                                    name="course-date"
                                                    value={d}
                                                    checked={isSelected}
                                                    disabled={isFull || isSubmitting}
                                                    onChange={() => { setCourseDate(d); setDateError(''); setInlineError(''); }}
                                                    aria-describedby={dateError ? 'course-date-error' : undefined}
                                                    className={`w-4 h-4 accent-emerald-700 shrink-0 ${sessions[d] ? 'mt-0.5' : ''}`}
                                                />
                                                <span className="flex-1 min-w-0">
                                                    <span className={`block text-sm font-semibold ${isFull ? 'text-muted line-through' : 'text-primary'}`}>
                                                        {sessions[d] && isMultiDay(sessions[d]) ? `Option ${i + 1}` : (
                                                            <>{anyMultiDay && <span className="text-muted font-medium">Option {i + 1} · </span>}{formatCourseDate(d)}</>
                                                        )}
                                                    </span>
                                                    {sessions[d] && <SessionDetails session={sessions[d]} showPlace={!sharedPlace} />}
                                                </span>
                                                {placesText && (
                                                    <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-md border ${
                                                        isFull
                                                            ? 'text-status-rejected bg-danger/10 border-danger/25'
                                                            : almostFull
                                                                ? 'text-status-requested bg-warning/15 border-warning/30'
                                                                : 'text-status-confirmed bg-success/10 border-success/25'
                                                    }`}>
                                                        {placesText}
                                                    </span>
                                                )}
                                            </label>
                                        );
                                    })}
                                </div>
                                {sharedPlace && (
                                    <div className="mt-2.5 text-sm">
                                        <PlaceLine place={sharedPlace} />
                                    </div>
                                )}
                                {dateError && (
                                    <div id="course-date-error" className="mt-2.5">
                                        <PublicAlert>{dateError}</PublicAlert>
                                    </div>
                                )}
                            </fieldset>
                        )}

                        <PublicEmailField
                            id="student-email"
                            label="Your email"
                            value={email}
                            disabled={isSubmitting}
                            onChange={handleEmailChange}
                            error={errors.email}
                            hint="Please use the same email address that received the invitation."
                        />

                        <div className="space-y-2.5">
                            {inlineError && <PublicAlert action={retryable && <RetryButton onClick={() => handleSubmit()} />}>{inlineError}</PublicAlert>}

                            <button
                                type="submit"
                                disabled={isSubmitting || needsDate}
                                aria-describedby={needsDate ? 'confirm-needs-date' : undefined}
                                className={primaryButtonCls}
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 size={20} className="animate-spin" aria-hidden="true" />
                                        <span>Confirming...</span>
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle size={19} className="shrink-0" aria-hidden="true" />
                                        <span className="flex flex-col items-center leading-tight">
                                            <span>Confirm My Participation</span>
                                            {isMultiDate && courseDate && (
                                                <span className="text-sm font-medium text-white/90 mt-0.5">{courseDateLine(courseDate, sessions[courseDate])}</span>
                                            )}
                                        </span>
                                    </>
                                )}
                            </button>
                            {needsDate && (
                                <p id="confirm-needs-date" className="text-xs text-muted text-center">Choose a date above to continue.</p>
                            )}
                        </div>

                        <button type="button" onClick={openDecline} className={secondaryButtonCls}>
                            <CalendarX size={16} className="text-status-requested shrink-0" aria-hidden="true" />
                            <span>{isMultiDate ? 'None of these dates work for me? Let us know' : "Can't make it to this date? Let us know"}</span>
                        </button>

                        <ContactFooter prompt="Questions or difficulties?" subject={`Question about ${courseName}`} />
                    </div>
                </form>
            )}

            {/* ─── Course Fully Booked ─── */}
            {state === 'full' && (
                <div className="flex flex-col animate-fadeIn">
                    <PublicCardHeader
                        icon={Users}
                        eyebrow="Fully booked"
                        tone="danger"
                        title={courseName}
                        below={!isMultiDate && capacity && <CapacityMeter capacity={capacity} />}
                    >
                        <div className="space-y-1 mt-1.5">
                            {(isMultiDate ? courseDates : courseDate ? [courseDate] : []).map(d => (
                                <p key={d} className="flex items-center gap-1.5 text-sm text-primary font-medium">
                                    <Calendar size={14} className="text-brand-600 dark:text-brand-400 shrink-0" aria-hidden="true" />
                                    <span>{formatCourseDate(d)}</span>
                                </p>
                            ))}
                        </div>
                    </PublicCardHeader>

                    <div className="p-5 sm:p-6 space-y-5">
                        <div>
                            <h2 className="text-base font-bold text-primary">
                                {isMultiDate ? 'All places for these dates have been taken' : 'All places for this date have been taken'}
                            </h2>
                            <p className="text-sm text-muted mt-1.5 leading-relaxed">
                                {isMultiDate ? 'Sorry, all offered dates are now full' : 'Sorry, this course date is now full'}, so confirmations are closed.
                            </p>
                        </div>

                        {/* People already in the group (confirmed earlier or added by the organizer) see their place here */}
                        <form onSubmit={handleCheckPlace} noValidate className="p-4 rounded-xl bg-surface-elevated/50 border border-border-subtle space-y-3">
                            <div>
                                <h2 className="text-sm font-bold text-primary">Already have a place?</h2>
                                <p className="text-sm text-muted mt-0.5 leading-relaxed">
                                    If you confirmed earlier or the organizer added you to the group, enter your email to see your place.
                                </p>
                            </div>
                            <PublicEmailField
                                id="check-email"
                                label="Your email"
                                value={email}
                                disabled={isSubmitting}
                                onChange={handleEmailChange}
                                error={errors.email}
                            />
                            {inlineError && <PublicAlert action={retryable && <RetryButton onClick={() => handleCheckPlace()} />}>{inlineError}</PublicAlert>}
                            <button type="submit" disabled={isSubmitting} className={secondaryButtonCls}>
                                {isSubmitting && <Loader2 size={16} className="animate-spin shrink-0" aria-hidden="true" />}
                                <span>Check my place</span>
                            </button>
                        </form>

                        <div className="space-y-2.5">
                            <p className="text-sm text-muted leading-relaxed">
                                No place yet? If you're still interested, email the organizer and you'll get <strong className="text-primary">priority for the next course</strong>.
                            </p>
                            <a
                                href={getPriorityMailtoUrl()}
                                className="w-full flex items-center justify-center gap-2 bg-brand-700 hover:bg-brand-800 active:scale-[0.98] text-white font-bold text-base py-3.5 px-6 rounded-xl shadow-md shadow-brand-700/20 transition-all touch-manipulation"
                            >
                                <Star size={18} className="shrink-0" aria-hidden="true" />
                                <span>Get priority for the next course</span>
                            </a>
                            <p className="text-xs text-muted leading-normal text-center">
                                Opens an email to {ORGANIZER_EMAIL}, ready to send.
                            </p>
                        </div>

                        <ContactFooter prompt="Questions or difficulties?" subject={`Question about ${courseName}`} />
                    </div>
                </div>
            )}

            {/* ─── Can't make it ─── */}
            {state === 'decline' && (
                <div className="flex flex-col animate-fadeIn">
                    <PublicCardHeader
                        icon={CalendarX}
                        tone="warning"
                        title={isMultiDate ? 'None of these dates work?' : "Can't make it?"}
                    >
                        <p className="text-sm text-primary font-medium mt-1 wrap-break-word">{courseName}</p>
                        <p className="text-sm text-muted">{invitationDatesLabel()}</p>
                    </PublicCardHeader>

                    {declineByEmail ? (
                        <div className="p-5 sm:p-6 space-y-4">
                            <PublicAlert>We couldn't save your answer here. Please send it by email instead, it's ready to go.</PublicAlert>

                            <div className="space-y-2.5">
                                <MailOption
                                    href={getRescheduleMailtoUrl()}
                                    icon={Calendar}
                                    title="Keep me on the waiting list for future dates"
                                />
                                <MailOption
                                    href={getWithdrawMailtoUrl()}
                                    icon={CalendarX}
                                    title="I'm no longer interested in this course"
                                />
                            </div>

                            <div className="pt-3.5 border-t border-border-subtle flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm text-muted">
                                    Email: <span className="text-primary font-medium">{ORGANIZER_EMAIL}</span>
                                </p>
                                <button
                                    type="button"
                                    onClick={handleCopyCoordinatorEmail}
                                    className="hit-area inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium text-primary bg-surface-elevated hover:bg-border-strong/60 rounded-lg transition-colors active:scale-95 touch-manipulation cursor-pointer"
                                >
                                    {copiedCoordinatorEmail ? (
                                        <>
                                            <Check size={14} className="text-status-confirmed" aria-hidden="true" />
                                            <span className="text-status-confirmed">Copied!</span>
                                        </>
                                    ) : (
                                        <>
                                            <Copy size={14} className="text-muted" aria-hidden="true" />
                                            <span>Copy address</span>
                                        </>
                                    )}
                                </button>
                            </div>

                            <button type="button" onClick={() => goTo('form')} className={secondaryButtonCls}>
                                <ArrowLeft size={15} aria-hidden="true" /> Back to confirmation
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={handleReportCantAttend} noValidate className="p-5 sm:p-6 space-y-5">
                            <p className="text-sm text-muted leading-relaxed -mt-1">
                                Let us know, and the organizer will take it from here.
                            </p>

                            <fieldset>
                                <legend className={publicLabelCls}>What would you like?</legend>
                                <div className="space-y-2">
                                    {DECLINE_CHOICES.map(choice => (
                                        <label key={choice.value} className={`${optionCardCls(declineReason === choice.value)} items-start`}>
                                            <input
                                                type="radio"
                                                name="decline-reason"
                                                value={choice.value}
                                                checked={declineReason === choice.value}
                                                disabled={isSubmitting}
                                                onChange={() => { setDeclineReason(choice.value); clearError('reason'); }}
                                                aria-invalid={errors.reason ? true : undefined}
                                                aria-describedby={errors.reason ? 'decline-reason-error' : undefined}
                                                className="w-4 h-4 mt-0.5 accent-emerald-700 shrink-0"
                                            />
                                            <span className="min-w-0">
                                                <span className="block text-sm font-semibold text-primary">{choice.label}</span>
                                                <span className="block text-sm text-muted mt-0.5 leading-snug">{choice.hint}</span>
                                            </span>
                                        </label>
                                    ))}
                                </div>
                                <FieldError id="decline-reason" message={errors.reason} />
                            </fieldset>

                            <PublicEmailField
                                id="decline-email"
                                label="Your email"
                                value={email}
                                disabled={isSubmitting}
                                onChange={handleEmailChange}
                                error={errors.email}
                                hint="The address that received the invitation."
                            />

                            {declinePeople.length > 1 && (
                                <fieldset className="animate-fadeIn">
                                    <legend className={publicLabelCls}>Who can't come?</legend>
                                    <p className="text-sm text-muted -mt-1 mb-2.5">More than one person is registered with this email.</p>
                                    <div className="space-y-2">
                                        {declinePeople.map(person => (
                                            <label key={person.student_id} className={`${optionCardCls(declineIds.has(person.student_id))} items-center`}>
                                                <input
                                                    type="checkbox"
                                                    name="decline-person"
                                                    checked={declineIds.has(person.student_id)}
                                                    disabled={isSubmitting}
                                                    onChange={() => toggleDeclinePerson(person.student_id)}
                                                    aria-invalid={errors.person ? true : undefined}
                                                    aria-describedby={errors.person ? 'decline-person-error' : undefined}
                                                    className="w-5 h-5 accent-emerald-700 shrink-0"
                                                />
                                                <span className="text-base font-semibold text-primary">{fullName(person)}</span>
                                            </label>
                                        ))}
                                    </div>
                                    <FieldError id="decline-person" message={errors.person} />
                                </fieldset>
                            )}

                            <div className="space-y-2.5">
                                {inlineError && <PublicAlert action={retryable && <RetryButton onClick={() => handleReportCantAttend()} />}>{inlineError}</PublicAlert>}
                                <button type="submit" disabled={isSubmitting} className={primaryButtonCls}>
                                    {isSubmitting ? (
                                        <>
                                            <Loader2 size={20} className="animate-spin" aria-hidden="true" />
                                            <span>Sending...</span>
                                        </>
                                    ) : (
                                        <span>Send my answer</span>
                                    )}
                                </button>
                                <p className="text-sm text-muted text-center">
                                    Prefer email?{' '}
                                    <a href={getCantAttendMailtoUrl()} className="hit-area text-brand-700 dark:text-brand-300 font-medium underline underline-offset-2">
                                        Write to the organizer
                                    </a>
                                </p>
                            </div>

                            <button type="button" onClick={() => goTo('form')} disabled={isSubmitting} className={secondaryButtonCls}>
                                <ArrowLeft size={15} aria-hidden="true" /> Back to confirmation
                            </button>
                        </form>
                    )}
                </div>
            )}

            {/* ─── Answer to "Can't make it?" saved ─── */}
            {state === 'declined' && (
                <PublicMessage icon={CheckCircle} tone="success" title={`Thanks for letting us know${declinedName ? `, ${declinedName}` : ''}`}>
                    <p className="text-muted text-sm leading-relaxed max-w-xs -mt-1">
                        {declineReason === 'other_date'
                            ? "We've passed it on to the organizer. You'll get a new invitation when there's another date."
                            : "We've passed it on to the organizer, who will take you off the list for this course."}
                    </p>
                    <button
                        type="button"
                        onClick={() => goTo('form')}
                        className="hit-area text-sm text-muted hover:text-primary underline underline-offset-2 transition-colors touch-manipulation py-1"
                    >
                        Changed your mind? Confirm your place instead
                    </button>
                    <ContactFooter prompt="Anything else?" subject={`Question about ${courseName}`} />
                </PublicMessage>
            )}

            {/* ─── Shared email: who is coming ─── */}
            {state === 'pick' && (
                <div className="flex flex-col animate-fadeIn">
                    <PublicCardHeader icon={Users} title="Who is coming?">
                        <p className="text-sm text-muted mt-1 leading-relaxed">
                            More than one person is registered with <strong className="text-primary break-all">{email}</strong>. Tick everyone who is coming.
                        </p>
                        {isMultiDate && courseDate && (
                            <p className="flex items-center gap-1.5 text-sm text-primary font-medium mt-1.5">
                                <Calendar size={14} className="text-brand-600 dark:text-brand-400 shrink-0" aria-hidden="true" />
                                <span>{courseDateLine(courseDate, sessions[courseDate])}</span>
                            </p>
                        )}
                    </PublicCardHeader>

                    <div className="p-5 sm:p-6 space-y-4">
                        <fieldset>
                            <legend className="sr-only">People registered with this email</legend>
                            <div className="space-y-2">
                                {matchedStudents.map((student) => (
                                    <label key={student.student_id} className={`${optionCardCls(selectedStudentIds.has(student.student_id))} items-center`}>
                                        <input
                                            type="checkbox"
                                            checked={selectedStudentIds.has(student.student_id)}
                                            disabled={isSubmitting}
                                            onChange={() => toggleStudent(student.student_id)}
                                            className="w-5 h-5 accent-emerald-700 shrink-0"
                                        />
                                        <span className="text-base font-semibold text-primary">{fullName(student)}</span>
                                    </label>
                                ))}
                            </div>
                        </fieldset>

                        <div className="space-y-2.5">
                            {inlineError && <PublicAlert action={retryable && <RetryButton onClick={() => handleConfirmSelected()} />}>{inlineError}</PublicAlert>}
                            <button
                                type="button"
                                onClick={handleConfirmSelected}
                                disabled={isSubmitting || selectedStudentIds.size === 0}
                                aria-describedby={selectedStudentIds.size === 0 ? 'pick-hint' : undefined}
                                className={primaryButtonCls}
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 size={18} className="animate-spin" aria-hidden="true" />
                                        <span>Confirming...</span>
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle size={18} aria-hidden="true" />
                                        <span>
                                            {selectedStudentIds.size === 0
                                                ? 'Confirm'
                                                : `Confirm ${selectedStudentIds.size} ${selectedStudentIds.size === 1 ? 'person' : 'people'}`}
                                        </span>
                                    </>
                                )}
                            </button>
                            {selectedStudentIds.size === 0 && (
                                <p id="pick-hint" className="text-xs text-muted text-center">Tick at least one name.</p>
                            )}
                        </div>

                        <button type="button" onClick={() => goTo('form')} disabled={isSubmitting} className={secondaryButtonCls}>
                            <ArrowLeft size={15} aria-hidden="true" /> Back to email
                        </button>
                    </div>
                </div>
            )}

            {/* ─── Success Screen with Calendar Integration ─── */}
            {state === 'success' && (
                <PublicMessage icon={CheckCircle} tone="success" title="You're All Set!">
                    <p className="text-muted text-sm leading-relaxed max-w-xs -mt-1">
                        {resultMessage || 'Your attendance has been confirmed! We look forward to seeing you at the course.'}
                    </p>

                    {/* Ticket */}
                    <div className="w-full p-4 bg-surface-elevated/50 rounded-xl border border-border-subtle text-left space-y-2">
                        <p className="text-xs font-semibold text-status-confirmed uppercase tracking-wider">Your place</p>
                        <p className="text-base font-bold text-primary wrap-break-word">{courseName}</p>
                        {courseDate && (
                            <p className="flex items-center gap-2 text-sm text-primary font-medium pt-2 border-t border-border-subtle">
                                <Calendar size={15} className="text-brand-600 dark:text-brand-400 shrink-0" aria-hidden="true" />
                                <span>{courseDateLine(courseDate, sessions[courseDate])}</span>
                            </p>
                        )}
                        {courseDate && sessions[courseDate] && <SessionDetails session={sessions[courseDate]} />}
                    </div>

                    {/* ─── Add to Calendar ─── */}
                    {courseDate && (
                        <div className="w-full text-left space-y-2.5">
                            <h2 className="text-sm font-bold text-primary">Add to your calendar</h2>
                            <p className="text-sm text-muted leading-normal -mt-1">
                                {calendarDays.length > 1 ? 'Save all course days' : 'Save the course date'} so you don't miss {calendarDays.length > 1 ? 'any of them' : 'it'}.
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                {calendarDays.length <= 1 && (
                                    <a
                                        href={getGoogleCalendarUrl(calendarParams)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={calendarButtonCls}
                                    >
                                        <ExternalLink size={15} className="text-brand-600 dark:text-brand-400 shrink-0" aria-hidden="true" />
                                        <span>Google Calendar</span>
                                    </a>
                                )}
                                <button
                                    type="button"
                                    onClick={() => downloadIcsFile(calendarParams)}
                                    className={`${calendarButtonCls} ${calendarDays.length > 1 ? 'sm:col-span-2' : ''}`}
                                >
                                    <Download size={15} className="text-status-confirmed shrink-0" aria-hidden="true" />
                                    <span>Apple / Outlook (.ics){calendarDays.length > 1 ? ` — all ${calendarDays.length} days` : ''}</span>
                                </button>
                            </div>
                            {calendarDays.length > 1 && (
                                <div className="space-y-1.5">
                                    <p className="text-sm text-muted">Google Calendar: add each day</p>
                                    <div className="grid grid-cols-2 gap-2">
                                        {calendarDays.map((d, i) => (
                                            <a
                                                key={d.date}
                                                href={getGoogleCalendarUrl({ ...calendarParams, courseDate: d.date, startTime: d.startTime, endTime: d.endTime, titleSuffix: `Day ${i + 1} of ${calendarDays.length}` })}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className={`${calendarButtonCls} min-h-11 py-2 text-xs`}
                                            >
                                                <ExternalLink size={12} className="text-brand-600 dark:text-brand-400 shrink-0" aria-hidden="true" />
                                                <span>Day {i + 1} · {formatCourseDate(d.date).replace(/ \d{4}$/, '')}</span>
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <ContactFooter prompt="Need to change plans or have any questions?" subject={`Confirmed course question - ${courseName}`} />
                </PublicMessage>
            )}
        </PublicLayout>
    );
}

/** Next to a "Could not connect" message */
function RetryButton({ onClick }: { onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="hit-area shrink-0 text-sm font-semibold underline underline-offset-2 touch-manipulation"
        >
            Try again
        </button>
    );
}

const calendarButtonCls =
    'flex items-center justify-center gap-2 py-3 px-3.5 rounded-xl border border-border-strong bg-surface hover:bg-surface-elevated ' +
    'text-primary text-sm font-semibold transition-colors active:scale-[0.98] touch-manipulation text-center';

/** One of the ready-to-send emails offered when the answer can't be saved on the page */
function MailOption({ href, icon: Icon, title }: { href: string; icon: typeof Mail; title: string }) {
    return (
        <a
            href={href}
            className="flex items-start gap-3.5 p-4 rounded-xl border-2 border-border-strong bg-surface hover:border-brand-500/50 transition-colors touch-manipulation active:scale-[0.99]"
        >
            <span className="p-2.5 rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-400 shrink-0" aria-hidden="true">
                <Icon size={18} />
            </span>
            <span className="min-w-0 flex-1">
                <span className="flex items-start justify-between gap-2">
                    <span className="text-sm font-bold text-primary">{title}</span>
                    <Mail size={14} className="text-muted shrink-0 mt-0.5" aria-hidden="true" />
                </span>
                <span className="block text-sm text-muted mt-1 leading-snug">Opens an email to the organizer, ready to send.</span>
            </span>
        </a>
    );
}

// ─── Places counter ─────────────────────────────────────────

/** Places for one course date, or null when the course has no limit (or the lookup failed). */
async function loadCapacity(courseId: string, date: string): Promise<CapacityInfo | null> {
    try {
        const { data, error } = await supabase.rpc('get_course_capacity', { p_course_id: courseId, p_course_date: date });
        const row = !error && Array.isArray(data) ? data[0] : null;
        if (!row || row.max_capacity == null) return null;
        return {
            max: row.max_capacity,
            confirmed: row.confirmed_count ?? 0,
            isFull: Boolean(row.is_full),
        };
    } catch (err) {
        // Capacity is informational; the server still enforces the limit on confirm
        console.warn('get_course_capacity exception:', err);
        return null;
    }
}

function allDatesFull(dates: string[], byDate: Record<string, CapacityInfo | null>): boolean {
    return dates.length > 0 && dates.every(d => byDate[d]?.isFull);
}

function placesLeftText(info: CapacityInfo | null | undefined): string | null {
    if (!info) return null;
    if (info.isFull) return 'Full';
    const left = Math.max(info.max - info.confirmed, 0);
    return `${left} ${left === 1 ? 'place' : 'places'} left`;
}

function CapacityMeter({ capacity }: { capacity: CapacityInfo }) {
    const { max, confirmed, isFull } = capacity;
    const taken = Math.min(confirmed, max);
    const left = Math.max(max - confirmed, 0);
    const pct = Math.round((taken / max) * 100);
    // Nudge people to act fast once the course is mostly booked
    const almostFull = !isFull && (left <= 3 || pct >= 75);

    const barColor = isFull ? 'bg-danger' : almostFull ? 'bg-warning' : 'bg-success';
    const statusText = isFull
        ? 'No places left'
        : `${left} ${left === 1 ? 'place' : 'places'} left`;
    const statusColor = isFull ? 'text-status-rejected' : almostFull ? 'text-status-requested' : 'text-status-confirmed';

    return (
        <div className="mt-4" data-testid="capacity-meter">
            <div className="flex items-center justify-between gap-2 text-sm mb-1.5">
                <span className="flex items-center gap-1.5 text-muted">
                    <Users size={14} className="text-brand-600 dark:text-brand-400 shrink-0" aria-hidden="true" />
                    <span><strong className="text-primary">{taken}</strong> of <strong className="text-primary">{max}</strong> places confirmed</span>
                </span>
                <span className={`font-semibold ${statusColor}`}>{statusText}</span>
            </div>
            <div
                className="h-2 w-full rounded-full bg-surface-elevated overflow-hidden"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={max}
                aria-valuenow={taken}
                aria-label="Confirmed places"
            >
                <div className={`h-full rounded-full ${barColor} transition-all duration-700`} style={{ width: `${pct}%` }} />
            </div>
            {almostFull && (
                <p className="text-sm font-medium text-status-requested mt-1.5">
                    Places are filling up fast. Confirm now to secure yours.
                </p>
            )}
        </div>
    );
}

// ─── Schedule of a course date ──────────────────────────────

/** "Thu 1 October 2026", or "4 days · starts Thu 1 October 2026" for a multi-day course. */
function courseDateLine(date: string, session: CourseSession | undefined): string {
    const days = session ? sessionDays(session).length : 1;
    return days > 1 ? `${days} days · starts ${formatCourseDate(date)}` : formatCourseDate(date);
}

/** The course's place, with a link to find it (Google Maps, or the place's own link) */
function PlaceLine({ place }: { place: string }) {
    const href = placeHref(place);
    const isMap = href?.startsWith('https://www.google.com/maps/');
    return (
        <p className="flex items-start gap-1.5 text-primary">
            <MapPin size={14} className="text-brand-600 dark:text-brand-400 shrink-0 mt-0.5" aria-hidden="true" />
            <span className="min-w-0">
                <span className="wrap-break-word">{place}</span>
                {href && (
                    <>
                        {' '}
                        <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={isMap ? `Directions to ${place} (opens Google Maps)` : 'Open link (opens in a new tab)'}
                            className="hit-area inline-flex items-center gap-1 ml-0.5 whitespace-nowrap font-semibold text-brand-700 dark:text-brand-300 hover:text-brand-800 dark:hover:text-brand-200 underline underline-offset-2"
                        >
                            {isMap ? 'Directions' : 'Open link'}
                            <ExternalLink size={12} aria-hidden="true" />
                        </a>
                    </>
                )}
            </span>
        </p>
    );
}

/** Days, time and place of a course date (Day 1 highlighted; long weekly courses summed up). */
function SessionDetails({ session, showPlace = true }: { session: CourseSession; showPlace?: boolean }) {
    const days = sessionDays(session);
    const multiDay = days.length > 1;
    const weekly = weeklySummary(session);
    const ownTimes = multiDay && hasDayOverrides(session);
    const time = ownTimes ? '' : formatTimeRange(session.start_time, session.end_time);
    const shortDate = (d: string) => formatCourseDate(d).replace(/ \d{4}$/, '');

    return (
        <div className="mt-2 space-y-1.5 text-sm" data-testid="session-details">
            {multiDay && (weekly ? (
                <p className="text-primary">
                    <span className="font-semibold">Every {weekly.weekday} for {weekly.weeks} weeks</span>
                    {' '}· {shortDate(weekly.first)} – {formatCourseDate(weekly.last)}
                </p>
            ) : (
                <ol className="space-y-0.5">
                    {days.map((d, i) => (
                        <li key={d.date} className="flex items-baseline gap-2">
                            <span className="w-11 shrink-0 text-xs font-bold text-muted uppercase tracking-wider">Day {i + 1}</span>
                            <span className={i === 0 ? 'font-semibold text-primary' : 'text-primary'}>{formatCourseDate(d.date)}</span>
                            {ownTimes && <span className="text-xs text-muted tabular-nums">{formatTimeRange(dayTime(session, d).start, dayTime(session, d).end)}</span>}
                        </li>
                    ))}
                </ol>
            ))}
            {time && (
                <p className="flex items-center gap-1.5 text-primary">
                    <Clock size={14} className="text-brand-600 dark:text-brand-400 shrink-0" aria-hidden="true" />
                    <span className="tabular-nums">{time}</span>
                </p>
            )}
            {showPlace && session.location && <PlaceLine place={session.location} />}
            {multiDay && (
                <p className="text-sm font-semibold text-status-requested">Attendance on all {days.length} days is required.</p>
            )}
        </div>
    );
}
