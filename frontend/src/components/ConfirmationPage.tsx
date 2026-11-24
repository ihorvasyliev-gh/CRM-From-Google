import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import {
    CheckCircle,
    Loader2,
    GraduationCap,
    Users,
    Calendar,
    CalendarX,
    ArrowLeft,
} from 'lucide-react';
import { isMultiDay, sessionFromRow, sessionHasSchedule, type CourseSession } from '../lib/courseSessions';
import { emailProblem } from '../lib/emailValidation';
import { fullName } from '../lib/types';
import {
    ContactFooter,
    ORGANIZER_EMAIL,
    PublicAlert,
    PublicCardHeader,
    PublicEmailField,
    PublicLayout,
    primaryButtonCls,
    publicLabelCls,
    secondaryButtonCls,
} from './PublicPage';
import {
    courseDateLine,
    formatCourseDate,
    type CapacityInfo,
} from './ConfirmationPage/confirmationDateUtils';
import {
    CapacityMeter,
    DeclineView,
    ErrorView,
    FullyBookedView,
    InvalidLinkView,
    LoadingView,
    PlaceLine,
    RetryButton,
    SessionDetails,
} from './ConfirmationPage/ConfirmationViews';
import { ConfirmedSuccessView } from './ConfirmationPage/ConfirmedSuccessView';

type PageState = 'loading' | 'form' | 'pick' | 'success' | 'invalid' | 'error' | 'decline' | 'full';
type Field = 'email';

/** How often the confirmed-places counter is refreshed while the page is open. */
const CAPACITY_REFRESH_MS = 30_000;

interface MatchedStudent {
    student_id: string;
    first_name: string;
    last_name: string;
}

const NETWORK_ERROR = 'Could not connect. Please check your internet connection and try again.';
const SERVER_ERROR = 'Something went wrong on our side. Please try again in a moment.';

/** Moves focus to a field once the error under it is on screen */
function focusField(selector: string) {
    setTimeout(() => document.querySelector<HTMLElement>(selector)?.focus(), 0);
}

/** A choice drawn as a card: a date, a person */
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

    const needsDate = isMultiDate && !courseDate;

    // ─── Render ─────────────────────────────────────────────

    return (
        <PublicLayout title="Confirm your place" footer="Cork City Partnership · Course confirmation">
            {/* ─── Loading ─── */}
            {state === 'loading' && <LoadingView />}

            {/* ─── Could not load ─── */}
            {state === 'error' && <ErrorView onRetry={handleRetry} />}

            {/* ─── Invalid Link ─── */}
            {state === 'invalid' && <InvalidLinkView />}

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

                        <button type="button" onClick={() => goTo('decline')} className={secondaryButtonCls}>
                            <CalendarX size={16} className="text-status-requested shrink-0" aria-hidden="true" />
                            <span>{isMultiDate ? 'None of these dates work for me? Let us know' : "Can't make it to this date? Let us know"}</span>
                        </button>

                        <ContactFooter prompt="Questions or difficulties?" subject={`Question about ${courseName}`} />
                    </div>
                </form>
            )}

            {/* ─── Course Fully Booked ─── */}
            {state === 'full' && (
                <FullyBookedView
                    courseName={courseName}
                    courseDate={courseDate}
                    courseDates={courseDates}
                    isMultiDate={isMultiDate}
                    capacity={capacity}
                    email={email}
                    emailError={errors.email}
                    inlineError={inlineError}
                    retryable={retryable}
                    isSubmitting={isSubmitting}
                    priorityMailtoUrl={getPriorityMailtoUrl()}
                    onEmailChange={handleEmailChange}
                    onCheckPlace={handleCheckPlace}
                />
            )}

            {/* ─── Can't make it: by email, from the person's own address ─── */}
            {state === 'decline' && (
                <DeclineView
                    courseName={courseName}
                    isMultiDate={isMultiDate}
                    invitationDatesLabel={invitationDatesLabel()}
                    rescheduleMailtoUrl={getRescheduleMailtoUrl()}
                    withdrawMailtoUrl={getWithdrawMailtoUrl()}
                    copiedCoordinatorEmail={copiedCoordinatorEmail}
                    onCopyCoordinatorEmail={handleCopyCoordinatorEmail}
                    onBack={() => goTo('form')}
                />
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
                <ConfirmedSuccessView
                    courseName={courseName}
                    courseDate={courseDate}
                    sessions={sessions}
                    resultMessage={resultMessage}
                />
            )}
        </PublicLayout>
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
