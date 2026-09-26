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
    Sparkles,
    HelpCircle,
    Copy,
    Check,
    ShieldCheck,
    Star
} from 'lucide-react';
import { suggestEmailCorrection } from '../lib/emailValidation';
import { getGoogleCalendarUrl, downloadIcsFile } from '../lib/calendarUtils';

type PageState = 'loading' | 'form' | 'pick' | 'success' | 'invalid' | 'error' | 'decline_confirm' | 'full';

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

const ORGANIZER_EMAIL = 'ivasyliev@partnershipcork.ie';

export default function ConfirmationPage() {
    const [state, setState] = useState<PageState>('loading');
    const [courseName, setCourseName] = useState('');
    const [courseId, setCourseId] = useState('');
    const [courseDate, setCourseDate] = useState('');
    const [email, setEmail] = useState('');
    const [emailSuggestion, setEmailSuggestion] = useState<string | null>(null);
    const [resultMessage, setResultMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [inlineError, setInlineError] = useState('');
    const [matchedStudents, setMatchedStudents] = useState<MatchedStudent[]>([]);
    const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
    const [copiedCoordinatorEmail, setCopiedCoordinatorEmail] = useState(false);
    const [capacity, setCapacity] = useState<CapacityInfo | null>(null);
    // Multi-date invitation: the dates offered (2+) and places left on each.
    // In this mode `courseDate` holds the date the student picked ('' until chosen).
    const [courseDates, setCourseDates] = useState<string[]>([]);
    const [dateCapacity, setDateCapacity] = useState<Record<string, CapacityInfo | null>>({});
    const isMultiDate = courseDates.length > 1;

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

    const resolveToken = useCallback(async (token: string) => {
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
    }, [fetchCapacity, fetchDateCapacities]);

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
                setInlineError('Sorry, the date you selected has just filled up. Please choose another date.');
            }
        }, CAPACITY_REFRESH_MS);
        return () => clearInterval(timer);
    }, [state, courseId, courseDate, courseDates, isMultiDate, hasLimitedDates, fetchDateCapacities]);

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
                setInlineError('');
                setState('full');
                return;
            }
            setCourseDate('');
            setInlineError('Sorry, the date you selected has just filled up. Please choose another date.');
            setState('form');
            return;
        }
        setCapacity(prev => prev ? { ...prev, confirmed: Math.max(prev.confirmed, prev.max), isFull: true } : prev);
        setInlineError('');
        setState('full');
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

    function handleEmailInputChange(val: string) {
        const lower = val.toLowerCase();
        setEmail(lower);
        const suggestion = suggestEmailCorrection(lower);
        setEmailSuggestion(suggestion && suggestion !== lower ? suggestion : null);
    }

    function applyEmailSuggestion() {
        if (emailSuggestion) {
            setEmail(emailSuggestion);
            setEmailSuggestion(null);
            setInlineError('');
        }
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();

        const trimmedEmail = email.trim().toLowerCase();
        if (!trimmedEmail || !trimmedEmail.includes('@')) {
            setInlineError('Please enter a valid email address.');
            return;
        }

        if (isMultiDate && !courseDate) {
            setInlineError('Please choose the date you would like to attend.');
            return;
        }

        if (submittingRef.current) return;
        submittingRef.current = true;
        setIsSubmitting(true);
        setInlineError('');
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
                    setInlineError(error.message || 'Something went wrong. Please try again.');
                    return;
                }
                if (data && data.success) {
                    setResultMessage(data.message || 'Your attendance has been confirmed! We look forward to seeing you.');
                    setState('success');
                } else if (data?.code === 'course_full') {
                    await handleCourseFull();
                } else {
                    setInlineError(data?.message || 'Confirmation failed.');
                }
                return;
            }

            // Multiple matches -> show picker
            setMatchedStudents(students);
            setSelectedStudentIds(new Set());
            setState('pick');
        } catch (err) {
            console.error('Submit error:', err);
            setInlineError('Network error. Please check your connection and try again.');
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
    }

    async function handleConfirmSelected() {
        if (selectedStudentIds.size === 0) return;
        if (submittingRef.current) return;
        submittingRef.current = true;
        setIsSubmitting(true);
        setInlineError('');

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
                    message: error?.message || data?.message || '',
                    code: data?.code
                });
            }

            if (results.some(r => r.success)) {
                const confirmedNames = matchedStudents
                    .filter(s => results.some(r => r.success && r.id === s.student_id))
                    .map(s => `${s.first_name} ${s.last_name}`.trim())
                    .join(', ');
                const note = results.every(r => r.success)
                    ? ' We look forward to seeing you!'
                    : results.some(r => r.code === 'course_full')
                        ? ` Unfortunately the course filled up before everyone could be confirmed — please email ${ORGANIZER_EMAIL} about the next course.`
                        : '';
                setResultMessage(`Attendance confirmed for: ${confirmedNames}.${note}`);
                setState('success');
            } else if (results.some(r => r.code === 'course_full')) {
                await handleCourseFull();
            } else {
                setInlineError(results[0]?.message || 'Operation failed.');
            }
        } catch (err) {
            console.error('Confirm selected error:', err);
            setInlineError('Network error. Please check your connection and try again.');
        } finally {
            setIsSubmitting(false);
            submittingRef.current = false;
        }
    }

    function handleCopyCoordinatorEmail() {
        navigator.clipboard.writeText(ORGANIZER_EMAIL);
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

    // ─── Render ─────────────────────────────────────────────

    return (
        <div className="dark scheme-dark min-h-screen min-h-dvh bg-background text-primary flex flex-col items-center justify-between p-4 sm:p-6 relative overflow-x-hidden selection:bg-brand-500/30 selection:text-brand-200">
            {/* Ambient background glow optimized for mobile GPU */}
            <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden transform-gpu" aria-hidden="true">
                <div className="orb absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[460px] h-[460px] sm:w-[780px] sm:h-[780px] text-brand-500/9" />
                <div className="orb absolute bottom-1/4 right-1/4 w-[340px] h-[340px] sm:w-[560px] sm:h-[560px] text-purple-500/6.5" />
            </div>

            {/* Main Card */}
            <div className="w-full max-w-md relative z-10 my-auto py-4">
                <div className="bg-surface/95 rounded-2xl border border-border-subtle/90 shadow-2xl shadow-black/50 overflow-hidden flex flex-col transition-all duration-300">

                    {/* ─── Loading Skeleton ─── */}
                    {state === 'loading' && (
                        <div className="p-6 sm:p-8 space-y-6 animate-pulse">
                            <div className="flex items-center gap-3">
                                <div className="w-11 h-11 bg-surface-elevated/80 rounded-xl" />
                                <div className="space-y-2 flex-1">
                                    <div className="h-3 w-28 bg-surface-elevated/80 rounded-sm" />
                                    <div className="h-5 w-48 bg-border-strong/60 rounded-sm" />
                                </div>
                            </div>
                            <div className="space-y-3 pt-2">
                                <div className="h-3 w-32 bg-surface-elevated/70 rounded-sm" />
                                <div className="h-12 w-full bg-surface-elevated/50 rounded-xl border border-border-subtle" />
                            </div>
                            <div className="h-13 w-full bg-emerald-600/20 rounded-xl flex items-center justify-center gap-2">
                                <Loader2 size={20} className="animate-spin text-emerald-400/70" />
                                <span className="text-sm font-medium text-emerald-400/70">Loading course invitation...</span>
                            </div>
                        </div>
                    )}

                    {/* ─── Network Error ─── */}
                    {state === 'error' && (
                        <div className="p-8 sm:p-10 flex flex-col items-center gap-4 text-center">
                            <div className="w-14 h-14 bg-amber-500/10 rounded-2xl flex items-center justify-center border border-amber-500/20">
                                <AlertCircle size={30} className="text-amber-400" />
                            </div>
                            <h2 className="text-xl font-bold text-white">Connection Error</h2>
                            <p className="text-muted text-sm leading-relaxed max-w-xs">
                                Could not load course details. Please check your internet connection.
                            </p>
                            <div className="mt-2 flex flex-col sm:flex-row items-center gap-3 w-full">
                                <button
                                    onClick={handleRetry}
                                    className="w-full flex items-center justify-center gap-2 py-3 px-5 bg-brand-600 hover:bg-brand-500 active:scale-[0.98] text-white font-semibold rounded-xl transition-all shadow-md shadow-brand-600/25 touch-manipulation"
                                >
                                    <RefreshCw size={18} />
                                    Try Again
                                </button>
                                <button
                                    onClick={() => window.location.reload()}
                                    className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-surface-elevated hover:bg-border-strong active:scale-[0.98] text-primary/85 hover:text-white font-medium rounded-xl transition-all touch-manipulation"
                                >
                                    Reload Page
                                </button>
                            </div>
                            {/* Organizer contact */}
                            <div className="pt-4 border-t border-border-subtle/80 w-full text-center">
                                <p className="text-xs text-muted/80">Need immediate assistance?</p>
                                <a
                                    href={`mailto:${ORGANIZER_EMAIL}?subject=Course%20Portal%20Connection%20Issue`}
                                    className="inline-flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 font-medium mt-1 underline"
                                >
                                    <Mail size={12} /> {ORGANIZER_EMAIL}
                                </a>
                            </div>
                        </div>
                    )}

                    {/* ─── Invalid Link ─── */}
                    {state === 'invalid' && (
                        <div className="p-8 sm:p-10 flex flex-col items-center gap-4 text-center">
                            <div className="w-14 h-14 bg-red-500/10 rounded-2xl flex items-center justify-center border border-red-500/20">
                                <AlertCircle size={30} className="text-red-400" />
                            </div>
                            <h2 className="text-xl font-bold text-white">Invalid or Expired Link</h2>
                            <p className="text-muted text-sm leading-relaxed max-w-xs">
                                This confirmation link is no longer valid or has already expired.
                            </p>
                            <div className="p-4 bg-surface/90 rounded-xl border border-border-subtle w-full text-center mt-2">
                                <p className="text-xs text-muted mb-2">Please contact the organizer to receive an updated invitation:</p>
                                <a
                                    href={`mailto:${ORGANIZER_EMAIL}?subject=Expired%20Confirmation%20Link`}
                                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-surface-elevated hover:bg-border-strong text-brand-300 hover:text-white rounded-lg text-xs font-semibold transition-colors w-full"
                                >
                                    <Mail size={14} /> Contact {ORGANIZER_EMAIL}
                                </a>
                            </div>
                        </div>
                    )}

                    {/* ─── Form State (Main Confirmation) ─── */}
                    {state === 'form' && (
                        <form onSubmit={handleSubmit} className="flex flex-col">
                            {/* Course Header Banner */}
                            <div className="p-5 sm:p-6 pb-4 border-b border-border-subtle/80 bg-linear-to-b from-brand-950/20 to-transparent">
                                <div className="flex items-start gap-3.5">
                                    <div className="p-2.5 bg-brand-500/15 rounded-xl border border-brand-500/20 text-brand-400 shrink-0 mt-0.5">
                                        <GraduationCap size={22} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <span className="inline-block text-[11px] font-semibold text-brand-400 uppercase tracking-wider bg-brand-500/10 px-2 py-0.5 rounded-md mb-1 border border-brand-500/20">
                                            Course Invitation
                                        </span>
                                        <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight leading-snug wrap-break-word">
                                            {courseName}
                                        </h2>
                                        {isMultiDate ? (
                                            <div className="flex items-center gap-1.5 text-xs sm:text-sm text-primary/85 font-medium mt-1.5">
                                                <Calendar size={14} className="text-brand-400 shrink-0" />
                                                <span>{courseDates.length} dates available — choose one below</span>
                                            </div>
                                        ) : courseDate && (
                                            <div className="flex items-center gap-1.5 text-xs sm:text-sm text-primary/85 font-medium mt-1.5">
                                                <Calendar size={14} className="text-brand-400 shrink-0" />
                                                <span>{formatCourseDate(courseDate)}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                {!isMultiDate && capacity && <CapacityMeter capacity={capacity} />}
                            </div>

                            {/* Form Body */}
                            <div className="p-5 sm:p-6 space-y-4">
                                {isMultiDate && (
                                    <fieldset>
                                        <legend className="block text-xs font-bold text-muted mb-2 uppercase tracking-wider">
                                            Choose Your Date
                                        </legend>
                                        <div className="space-y-2" role="radiogroup" aria-label="Course date">
                                            {courseDates.map(d => {
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
                                                        className={`flex items-center gap-3 p-3.5 rounded-xl border transition-all touch-manipulation ${
                                                            isFull
                                                                ? 'border-border-subtle bg-surface/40 opacity-60 cursor-not-allowed'
                                                                : isSelected
                                                                    ? 'border-emerald-500 bg-emerald-500/10 ring-2 ring-emerald-500/20 cursor-pointer'
                                                                    : 'border-border-subtle bg-background hover:border-border-strong cursor-pointer'
                                                        }`}
                                                    >
                                                        <input
                                                            type="radio"
                                                            name="course-date"
                                                            value={d}
                                                            checked={isSelected}
                                                            disabled={isFull || isSubmitting}
                                                            onChange={() => { setCourseDate(d); setInlineError(''); }}
                                                            className="w-4 h-4 border-border-strong bg-surface text-emerald-500 focus:ring-emerald-500/30 focus:ring-offset-0"
                                                        />
                                                        <span className={`flex-1 min-w-0 text-sm font-semibold ${isFull ? 'text-muted/80 line-through' : 'text-white'}`}>
                                                            {formatCourseDate(d)}
                                                        </span>
                                                        {placesText && (
                                                            <span className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-md border ${
                                                                isFull
                                                                    ? 'text-red-400 bg-red-500/10 border-red-500/25'
                                                                    : almostFull
                                                                        ? 'text-amber-300 bg-amber-500/10 border-amber-500/25'
                                                                        : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25'
                                                            }`}>
                                                                {placesText}
                                                            </span>
                                                        )}
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </fieldset>
                                )}

                                <div>
                                    <label htmlFor="student-email" className="block text-xs font-bold text-muted mb-2 uppercase tracking-wider">
                                        Confirm Your Email
                                    </label>
                                    <div className="relative">
                                        <Mail size={17} className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${isSubmitting ? 'text-muted/60' : 'text-muted'}`} />
                                        <input
                                            id="student-email"
                                            type="email"
                                            inputMode="email"
                                            autoComplete="email"
                                            autoCapitalize="none"
                                            spellCheck={false}
                                            required
                                            value={email}
                                            disabled={isSubmitting}
                                            onChange={(e) => handleEmailInputChange(e.target.value)}
                                            onBlur={() => setEmail((prev) => prev.trim().toLowerCase())}
                                            placeholder="Enter registered email address"
                                            className="w-full bg-background text-white text-[16px] sm:text-sm rounded-xl border border-border-subtle pl-10 pr-4 py-3 placeholder:text-muted/60 focus:outline-hidden focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation shadow-inner"
                                        />
                                    </div>

                                    {/* Email Typo Helper Suggestion */}
                                    {emailSuggestion && (
                                        <div className="mt-2.5 flex items-center justify-between gap-2 p-2.5 bg-brand-950/40 border border-brand-500/30 rounded-xl text-xs text-brand-200 animate-fadeIn">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <Sparkles size={15} className="text-brand-400 shrink-0" />
                                                <p className="truncate">
                                                    Did you mean <strong className="text-white underline">{emailSuggestion}</strong>?
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={applyEmailSuggestion}
                                                className="shrink-0 px-2.5 py-1 bg-brand-600 hover:bg-brand-500 active:scale-95 text-white font-semibold rounded-lg text-xs transition-all touch-manipulation shadow-xs shadow-brand-600/40"
                                            >
                                                Fix
                                            </button>
                                        </div>
                                    )}

                                    <p className="text-[11px] text-muted/80 mt-2 leading-normal">
                                        Please use the same email address that received the invitation.
                                    </p>
                                </div>

                                {inlineError && (
                                    <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs sm:text-sm p-3 rounded-xl flex items-start justify-between gap-2 animate-fadeIn">
                                        <div className="flex items-start gap-2.5 min-w-0">
                                            <AlertCircle size={16} className="shrink-0 mt-0.5 text-red-400" />
                                            <p className="wrap-break-word leading-relaxed">{inlineError}</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleSubmit}
                                            className="text-xs font-semibold underline text-red-300 hover:text-white shrink-0 ml-1 touch-manipulation"
                                        >
                                            Retry
                                        </button>
                                    </div>
                                )}

                                {/* Main Confirm CTA */}
                                <button
                                    type="submit"
                                    disabled={isSubmitting || (isMultiDate && !courseDate)}
                                    className="w-full flex items-center justify-center gap-2 bg-linear-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 active:scale-[0.98] disabled:opacity-50 text-white font-bold text-base py-3.5 px-6 rounded-xl shadow-lg shadow-emerald-600/30 transition-all touch-manipulation disabled:cursor-not-allowed cursor-pointer mt-2"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <Loader2 size={20} className="animate-spin text-white/80" />
                                            <span>Confirming Attendance...</span>
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle size={19} className="text-white" />
                                            <span>Confirm My Participation</span>
                                        </>
                                    )}
                                </button>
                                {isMultiDate && !courseDate && (
                                    <p className="text-[11px] text-muted/80 text-center -mt-1">Choose a date above to continue.</p>
                                )}

                                {/* Decline / Reschedule Option */}
                                <div className="pt-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setInlineError('');
                                            setState('decline_confirm');
                                        }}
                                        className="w-full flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl border border-border-strong/80 bg-surface/60 hover:bg-surface-elevated/80 hover:border-border-strong text-primary/85 hover:text-white text-xs sm:text-sm font-semibold transition-all shadow-xs active:scale-[0.99] touch-manipulation cursor-pointer"
                                    >
                                        <CalendarX size={16} className="text-amber-400 shrink-0" />
                                        <span>{isMultiDate ? 'None of these dates work for me? Let us know' : "Can't make it to this date? Let us know"}</span>
                                    </button>
                                </div>

                                {/* Organizer Contact footer */}
                                <div className="pt-4 border-t border-border-subtle/70 text-center">
                                    <p className="text-[11px] text-muted/80">
                                        Questions or difficulties?
                                    </p>
                                    <a
                                        href={`mailto:${ORGANIZER_EMAIL}?subject=Question%20about%20${encodeURIComponent(courseName)}`}
                                        className="inline-flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 font-medium mt-1 underline transition-colors"
                                    >
                                        <Mail size={12} /> {ORGANIZER_EMAIL}
                                    </a>
                                </div>
                            </div>
                        </form>
                    )}

                    {/* ─── Course Fully Booked ─── */}
                    {state === 'full' && (
                        <div className="flex flex-col animate-fadeIn">
                            <div className="p-5 sm:p-6 pb-4 border-b border-border-subtle/80 bg-linear-to-b from-red-950/20 to-transparent">
                                <div className="flex items-start gap-3.5">
                                    <div className="p-2.5 bg-red-500/15 rounded-xl border border-red-500/25 text-red-400 shrink-0 mt-0.5">
                                        <Users size={22} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <span className="inline-block text-[11px] font-semibold text-red-400 uppercase tracking-wider bg-red-500/10 px-2 py-0.5 rounded-md mb-1 border border-red-500/25">
                                            Fully Booked
                                        </span>
                                        <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight leading-snug wrap-break-word">
                                            {courseName}
                                        </h2>
                                        {isMultiDate ? (
                                            <div className="space-y-1 mt-1.5">
                                                {courseDates.map(d => (
                                                    <div key={d} className="flex items-center gap-1.5 text-xs sm:text-sm text-primary/85 font-medium">
                                                        <Calendar size={14} className="text-brand-400 shrink-0" />
                                                        <span>{formatCourseDate(d)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : courseDate && (
                                            <div className="flex items-center gap-1.5 text-xs sm:text-sm text-primary/85 font-medium mt-1.5">
                                                <Calendar size={14} className="text-brand-400 shrink-0" />
                                                <span>{formatCourseDate(courseDate)}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                {!isMultiDate && capacity && <CapacityMeter capacity={capacity} />}
                            </div>

                            <div className="p-5 sm:p-6 space-y-4">
                                <div>
                                    <h3 className="text-base font-bold text-white">
                                        {isMultiDate ? 'All places for these dates have been taken' : 'All places for this date have been taken'}
                                    </h3>
                                    <p className="text-sm text-muted mt-1.5 leading-relaxed">
                                        {isMultiDate ? 'Sorry — all offered dates are now full' : 'Sorry — this course date is now full'}, so confirmations are closed. If you're still interested,
                                        email {ORGANIZER_EMAIL} and you'll be given <strong className="text-primary">priority for the next course</strong>.
                                    </p>
                                </div>

                                <a
                                    href={getPriorityMailtoUrl()}
                                    className="w-full flex items-center justify-center gap-2 bg-linear-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 active:scale-[0.98] text-white font-bold text-sm sm:text-base py-3.5 px-6 rounded-xl shadow-lg shadow-brand-600/30 transition-all touch-manipulation"
                                >
                                    <Star size={18} className="text-white shrink-0" />
                                    <span>Get priority for the next course</span>
                                </a>
                                <p className="text-[11px] text-muted/80 leading-normal text-center -mt-1">
                                    Opens a pre-filled email to {ORGANIZER_EMAIL}.
                                </p>

                                <div className="p-3 rounded-xl bg-surface/80 border border-border-subtle flex items-start gap-2.5 text-xs text-muted leading-relaxed">
                                    <CheckCircle size={15} className="text-emerald-400 shrink-0 mt-0.5" />
                                    <span>Already confirmed your place earlier? You're all set — no further action is needed.</span>
                                </div>

                                <div className="pt-4 border-t border-border-subtle/70 text-center">
                                    <p className="text-[11px] text-muted/80">
                                        Questions or difficulties?
                                    </p>
                                    <a
                                        href={`mailto:${ORGANIZER_EMAIL}?subject=Question%20about%20${encodeURIComponent(courseName)}`}
                                        className="inline-flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 font-medium mt-1 underline transition-colors"
                                    >
                                        <Mail size={12} /> {ORGANIZER_EMAIL}
                                    </a>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ─── Decline / Reschedule Screen ─── */}
                    {state === 'decline_confirm' && (
                        <div className="p-5 sm:p-6 flex flex-col animate-fadeIn">
                            {/* Header */}
                            <div className="flex items-center gap-3 mb-4 pb-3 border-b border-border-subtle">
                                <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400 shrink-0">
                                    <CalendarX size={22} />
                                </div>
                                <div>
                                    <h2 className="text-base sm:text-lg font-bold text-white leading-tight">Can't attend this session?</h2>
                                    <p className="text-xs text-muted mt-0.5">
                                        Let us know by email so we can update your enrollment and free up this seat.
                                    </p>
                                </div>
                            </div>

                            {/* Security Notice */}
                            <div className="mb-4 p-3 rounded-xl bg-brand-950/30 border border-brand-500/25 flex items-start gap-2.5 text-xs text-brand-200 leading-relaxed">
                                <ShieldCheck size={16} className="text-brand-400 shrink-0 mt-0.5" />
                                <div>
                                    <span className="font-semibold text-white">Security notice: </span>
                                    To protect registrations from unauthorized cancellation, requests to reschedule or cancel must be sent from your email address. Clicking an option below will open your email client with a pre-filled message.
                                </div>
                            </div>

                            {/* Registered Email helper */}
                            <div className="mb-4">
                                <label className="block text-xs font-bold text-muted mb-1.5 uppercase tracking-wider">
                                    Your Registered Email (included in draft)
                                </label>
                                <div className="relative">
                                    <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted/80" />
                                    <input
                                        type="email"
                                        inputMode="email"
                                        value={email}
                                        onChange={(e) => handleEmailInputChange(e.target.value)}
                                        onBlur={() => setEmail((prev) => prev.trim().toLowerCase())}
                                        placeholder="Enter registered email"
                                        className="w-full bg-background text-white text-[16px] sm:text-sm rounded-xl border border-border-subtle pl-10 pr-4 py-2.5 placeholder:text-muted/60 focus:outline-hidden focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20"
                                    />
                                </div>
                                {emailSuggestion && (
                                    <div className="mt-2 flex items-center justify-between gap-2 p-2 bg-brand-950/40 border border-brand-500/30 rounded-xl text-xs text-brand-200">
                                        <span className="truncate">Did you mean <strong className="text-white underline">{emailSuggestion}</strong>?</span>
                                        <button
                                            type="button"
                                            onClick={applyEmailSuggestion}
                                            className="px-2 py-0.5 bg-brand-600 text-white rounded-sm text-xs font-semibold"
                                        >
                                            Fix
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Choice Actions */}
                            <div className="space-y-3">
                                <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">
                                    Choose an option:
                                </p>

                                {/* Option 1: Keep on Waiting List (Reschedule) */}
                                <a
                                    href={getRescheduleMailtoUrl()}
                                    className="w-full text-left p-4 rounded-xl border border-brand-500/40 bg-brand-950/20 hover:bg-brand-900/30 active:scale-[0.98] transition-all touch-manipulation group flex items-start gap-3.5 block"
                                >
                                    <div className="p-2.5 bg-brand-500/20 text-brand-300 rounded-lg shrink-0 mt-0.5 group-hover:bg-brand-500/30 transition-colors">
                                        <Calendar size={18} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-2">
                                            <h3 className="text-sm font-bold text-white group-hover:text-brand-300 transition-colors">
                                                Keep me on the waiting list for future dates
                                            </h3>
                                            <Mail size={14} className="text-brand-400 shrink-0 opacity-80" />
                                        </div>
                                        <p className="text-xs text-muted mt-1 leading-relaxed">
                                            Opens a pre-filled email to remain on the waiting list for the next course session.
                                        </p>
                                    </div>
                                </a>

                                {/* Option 2: Withdraw completely */}
                                <a
                                    href={getWithdrawMailtoUrl()}
                                    className="w-full text-left p-4 rounded-xl border border-border-subtle bg-background hover:border-red-500/40 hover:bg-red-950/15 active:scale-[0.98] transition-all touch-manipulation group flex items-start gap-3.5 block"
                                >
                                    <div className="p-2.5 bg-surface-elevated text-muted group-hover:text-red-400 group-hover:bg-red-950/30 rounded-lg shrink-0 mt-0.5 transition-colors">
                                        <CalendarX size={18} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-2">
                                            <h3 className="text-sm font-bold text-primary/85 group-hover:text-red-300 transition-colors">
                                                I'm no longer interested in this course
                                            </h3>
                                            <Mail size={14} className="text-muted/80 group-hover:text-red-400 shrink-0 opacity-80" />
                                        </div>
                                        <p className="text-xs text-muted/80 mt-1 leading-relaxed">
                                            Opens a pre-filled email to cancel your registration completely.
                                        </p>
                                    </div>
                                </a>
                            </div>

                            {/* Manual copy fallback */}
                            <div className="mt-4 pt-3.5 border-t border-border-subtle/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                                <div className="text-[11px] text-muted">
                                    <span>Email: </span>
                                    <span className="text-white font-medium">{ORGANIZER_EMAIL}</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleCopyCoordinatorEmail}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-primary/85 hover:text-white bg-surface-elevated hover:bg-border-strong rounded-lg transition-colors active:scale-95 touch-manipulation cursor-pointer"
                                >
                                    {copiedCoordinatorEmail ? (
                                        <>
                                            <Check size={13} className="text-emerald-400" />
                                            <span className="text-emerald-400">Copied!</span>
                                        </>
                                    ) : (
                                        <>
                                            <Copy size={13} className="text-muted" />
                                            <span>Copy address</span>
                                        </>
                                    )}
                                </button>
                            </div>

                            <button
                                type="button"
                                onClick={() => {
                                    setInlineError('');
                                    setState('form');
                                }}
                                className="w-full flex items-center justify-center gap-1.5 text-xs text-muted hover:text-white py-3 mt-3 transition-colors touch-manipulation cursor-pointer"
                            >
                                <ArrowLeft size={14} /> Back to confirmation
                            </button>
                        </div>
                    )}

                    {/* ─── Name Picker (Multiple Registrations with same Email) ─── */}
                    {state === 'pick' && (
                        <div className="p-5 sm:p-6 animate-fadeIn">
                            <div className="flex items-center gap-3 mb-3 pb-3 border-b border-border-subtle">
                                <div className="p-2.5 bg-amber-500/10 rounded-xl border border-amber-500/20 text-amber-400 shrink-0">
                                    <Users size={22} />
                                </div>
                                <div>
                                    <h2 className="text-base sm:text-lg font-bold text-white leading-tight">Multiple Registrations Found</h2>
                                    <p className="text-xs text-muted mt-0.5">
                                        Multiple people are registered with <span className="text-white font-medium">{email}</span>.
                                    </p>
                                </div>
                            </div>

                            {isMultiDate && courseDate && (
                                <div className="flex items-center gap-1.5 text-xs text-primary/85 font-medium mb-3">
                                    <Calendar size={14} className="text-brand-400 shrink-0" />
                                    <span>Date: <span className="text-white">{formatCourseDate(courseDate)}</span></span>
                                </div>
                            )}

                            <p className="text-xs text-muted mb-3">
                                Select who is confirming attendance:
                            </p>

                            {/* Student List */}
                            <div className="space-y-2.5 mb-4">
                                {matchedStudents.map((student) => (
                                    <label
                                        key={student.student_id}
                                        className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all touch-manipulation ${
                                            selectedStudentIds.has(student.student_id)
                                                ? 'border-brand-500 bg-brand-500/10'
                                                : 'border-border-subtle bg-background hover:border-border-strong'
                                        }`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={selectedStudentIds.has(student.student_id)}
                                            onChange={() => toggleStudent(student.student_id)}
                                            className="w-5 h-5 rounded-sm border-border-strong bg-surface text-brand-500 focus:ring-brand-500/30 focus:ring-offset-0 cursor-pointer touch-manipulation"
                                        />
                                        <span className="text-white font-medium text-sm">
                                            {student.first_name} {student.last_name}
                                        </span>
                                    </label>
                                ))}
                            </div>

                            {inlineError && (
                                <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs p-3 rounded-xl flex items-center gap-2 mb-3">
                                    <AlertCircle size={15} className="shrink-0" />
                                    <p>{inlineError}</p>
                                </div>
                            )}

                            <button
                                type="button"
                                onClick={handleConfirmSelected}
                                disabled={isSubmitting || selectedStudentIds.size === 0}
                                className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-sm sm:text-base py-3.5 px-6 rounded-xl shadow-lg shadow-emerald-600/30 active:scale-[0.98] transition-all touch-manipulation disabled:cursor-not-allowed"
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 size={18} className="animate-spin text-white/80" />
                                        <span>Saving...</span>
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle size={18} />
                                        <span>Confirm Selected ({selectedStudentIds.size})</span>
                                    </>
                                )}
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    setState('form');
                                    setInlineError('');
                                }}
                                className="w-full text-xs text-muted/80 hover:text-primary py-3 mt-2 transition-colors touch-manipulation cursor-pointer"
                            >
                                ← Back to email
                            </button>
                        </div>
                    )}

                    {/* ─── Success Screen with Calendar Integration ─── */}
                    {state === 'success' && (
                        <div className="p-6 sm:p-8 flex flex-col items-center gap-4 text-center animate-fadeIn">
                            {/* Animated Success Badge */}
                            <div className="w-16 h-16 bg-linear-to-br from-emerald-500/20 to-emerald-600/10 rounded-2xl flex items-center justify-center border border-emerald-500/30 shadow-lg shadow-emerald-500/15">
                                <CheckCircle size={34} className="text-emerald-400" />
                            </div>

                            <div className="space-y-1">
                                <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">You're All Set!</h2>
                                <p className="text-primary/85 text-xs sm:text-sm leading-relaxed max-w-xs mx-auto">
                                    {resultMessage || "Your attendance has been confirmed! We look forward to seeing you at the course."}
                                </p>
                            </div>

                            {/* Ticket Details Card */}
                            <div className="w-full p-4 bg-surface/90 rounded-xl border border-border-subtle text-left space-y-2 mt-1">
                                <div className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">
                                    Confirmed Enrollment
                                </div>
                                <div className="text-sm sm:text-base font-bold text-white wrap-break-word">
                                    {courseName}
                                </div>
                                {courseDate && (
                                    <div className="flex items-center gap-2 text-xs sm:text-sm text-brand-300 font-medium pt-1 border-t border-border-subtle/80">
                                        <Calendar size={15} className="text-brand-400 shrink-0" />
                                        <span>{formatCourseDate(courseDate)}</span>
                                    </div>
                                )}
                            </div>

                            {/* ─── Add to Calendar Section ─── */}
                            {courseDate && (
                                <div className="w-full p-4 bg-surface/60 rounded-xl border border-border-subtle/80 text-left space-y-3 mt-1">
                                    <div className="flex items-center gap-2 text-xs font-bold text-primary/85 uppercase tracking-wider">
                                        <Calendar size={14} className="text-brand-400" />
                                        <span>Add to Calendar</span>
                                    </div>
                                    <p className="text-xs text-muted leading-normal">
                                        Save the course date to your phone so you don't miss it:
                                    </p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                                        <a
                                            href={getGoogleCalendarUrl({ courseName, courseDate })}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center justify-center gap-2 py-3 px-3.5 bg-brand-600/20 hover:bg-brand-600/30 border border-brand-500/30 text-brand-200 hover:text-white rounded-xl text-xs font-semibold transition-all active:scale-[0.98] touch-manipulation text-center shadow-xs"
                                        >
                                            <ExternalLink size={14} className="text-brand-400 shrink-0" />
                                            <span>Google Calendar</span>
                                        </a>
                                        <button
                                            type="button"
                                            onClick={() => downloadIcsFile({ courseName, courseDate })}
                                            className="flex items-center justify-center gap-2 py-3 px-3.5 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-200 hover:text-white rounded-xl text-xs font-semibold transition-all active:scale-[0.98] touch-manipulation text-center shadow-xs"
                                        >
                                            <Download size={14} className="text-emerald-400 shrink-0" />
                                            <span>Apple / Outlook (.ics)</span>
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Organizer Contact Info */}
                            <div className="w-full pt-3 text-center border-t border-border-subtle/70">
                                <p className="text-[11px] text-muted/80">
                                    Need to change plans or have any questions?
                                </p>
                                <a
                                    href={`mailto:${ORGANIZER_EMAIL}?subject=Confirmed%20Course%20Question%20-%20${encodeURIComponent(courseName)}`}
                                    className="inline-flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 font-medium mt-1 underline transition-colors"
                                >
                                    <Mail size={12} /> {ORGANIZER_EMAIL}
                                </a>
                            </div>
                        </div>
                    )}

                </div>

                {/* Footer */}
                <div className="flex items-center justify-center gap-1 text-[11px] text-muted/80 mt-4 text-center">
                    <HelpCircle size={13} className="text-muted/60" />
                    <span>Cork City Partnership • Course Confirmation Portal</span>
                </div>
            </div>

            {/* Bottom spacer on mobile */}
            <div className="w-full h-2 relative z-0" aria-hidden="true" />
        </div>
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

    const barColor = isFull ? 'bg-red-500' : almostFull ? 'bg-amber-400' : 'bg-emerald-500';
    const statusText = isFull
        ? 'No places left'
        : `${left} ${left === 1 ? 'place' : 'places'} left`;
    const statusColor = isFull ? 'text-red-400' : almostFull ? 'text-amber-300' : 'text-emerald-400';

    return (
        <div className="mt-4" data-testid="capacity-meter">
            <div className="flex items-center justify-between gap-2 text-xs mb-1.5">
                <span className="flex items-center gap-1.5 text-primary/85 font-medium">
                    <Users size={13} className="text-brand-400 shrink-0" />
                    <span><strong className="text-white">{taken}</strong> of <strong className="text-white">{max}</strong> places confirmed</span>
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
                <p className="text-[11px] text-amber-300/90 mt-1.5">
                    Places are filling up fast — confirm now to secure yours.
                </p>
            )}
        </div>
    );
}
