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
    HelpCircle
} from 'lucide-react';
import { suggestEmailCorrection } from '../lib/emailValidation';
import { getGoogleCalendarUrl, downloadIcsFile } from '../lib/calendarUtils';

type PageState = 'loading' | 'form' | 'pick' | 'success' | 'invalid' | 'error' | 'decline_confirm' | 'decline_success';
type DeclineActionType = 'reschedule' | 'withdraw';

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
    const [pendingDeclineAction, setPendingDeclineAction] = useState<DeclineActionType | null>(null);

    // Guard against double-click race conditions
    const submittingRef = useRef(false);

    // Store URL info for retry capability
    const urlInfoRef = useRef<{ type: 'token'; value: string } | { type: 'courseId'; value: string; date?: string } | null>(null);

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
            if (row.course_date) setCourseDate(row.course_date);
            setState('form');
        } catch (err) {
            console.error('Token resolve exception:', err);
            setState('error');
        }
    }, []);

    const fetchCourseInfo = useCallback(async (id: string) => {
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
            setState('form');
        } catch (err) {
            console.error('Course info exception:', err);
            setState('error');
        }
    }, []);

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
        fetchCourseInfo(id);
    }, [resolveToken, fetchCourseInfo]);

    function handleRetry() {
        setState('loading');
        const info = urlInfoRef.current;
        if (!info) { setState('invalid'); return; }
        if (info.type === 'token') {
            resolveToken(info.value);
        } else {
            fetchCourseInfo(info.value);
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

        if (submittingRef.current) return;
        submittingRef.current = true;
        setIsSubmitting(true);
        setInlineError('');
        setPendingDeclineAction(null);

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

            if (!students || students.length === 0) {
                const { data, error } = await supabase.rpc('public_confirm_enrollment', {
                    p_email: trimmedEmail,
                    p_course_id: courseId,
                    p_student_id: null,
                });
                if (error) {
                    setInlineError(error.message || 'Something went wrong. Please try again.');
                    return;
                }
                if (data && data.success) {
                    setResultMessage(data.message || 'Your attendance has been confirmed! We look forward to seeing you.');
                    setState('success');
                } else {
                    setInlineError(data?.message || 'Confirmation failed.');
                }
                return;
            }

            if (students.length === 1) {
                const { data, error } = await supabase.rpc('public_confirm_enrollment', {
                    p_email: trimmedEmail,
                    p_course_id: courseId,
                    p_student_id: students[0].student_id,
                });
                if (error) {
                    setInlineError(error.message || 'Something went wrong. Please try again.');
                    return;
                }
                if (data && data.success) {
                    setResultMessage(data.message || 'Your attendance has been confirmed! We look forward to seeing you.');
                    setState('success');
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

    async function handleDeclineAction(action: DeclineActionType) {
        const trimmedEmail = email.trim().toLowerCase();
        if (!trimmedEmail || !trimmedEmail.includes('@')) {
            setInlineError('Please enter the email address you registered with.');
            return;
        }

        if (submittingRef.current) return;
        submittingRef.current = true;
        setIsSubmitting(true);
        setInlineError('');

        try {
            let students: MatchedStudent[] | null = null;
            try {
                const { data } = await supabase.rpc('find_students_by_email', {
                    p_email: trimmedEmail,
                    p_course_id: courseId,
                });
                if (data) students = data;
            } catch (findErr) {
                console.warn('find_students_by_email exception:', findErr);
            }

            if (students && students.length > 1) {
                // Multiple students found with this email -> ask which one to decline
                setPendingDeclineAction(action);
                setMatchedStudents(students);
                setSelectedStudentIds(new Set());
                setState('pick');
                return;
            }

            const targetStudentId = (students && students.length === 1) ? students[0].student_id : null;

            const { data, error } = await supabase.rpc('public_decline_enrollment', {
                p_email: trimmedEmail,
                p_course_id: courseId,
                p_action: action,
                p_student_id: targetStudentId,
            });

            if (error) {
                setInlineError(error.message || 'Unable to process your request. Please try again.');
                return;
            }

            if (data && data.success) {
                setResultMessage(data.message);
                setState('decline_success');
            } else {
                setInlineError(data?.message || 'Unable to update your registration.');
            }
        } catch (err) {
            console.error('Decline error:', err);
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
            const results: { id: string; success: boolean; message: string }[] = [];

            for (const studentId of ids) {
                if (pendingDeclineAction) {
                    const { data, error } = await supabase.rpc('public_decline_enrollment', {
                        p_email: trimmedEmail,
                        p_course_id: courseId,
                        p_action: pendingDeclineAction,
                        p_student_id: studentId,
                    });
                    results.push({
                        id: studentId,
                        success: !error && (data?.success ?? false),
                        message: error?.message || data?.message || ''
                    });
                } else {
                    const { data, error } = await supabase.rpc('public_confirm_enrollment', {
                        p_email: trimmedEmail,
                        p_course_id: courseId,
                        p_student_id: studentId,
                    });
                    results.push({
                        id: studentId,
                        success: !error && (data?.success ?? false),
                        message: error?.message || data?.message || ''
                    });
                }
            }

            const allSuccess = results.every(r => r.success);
            const anySuccess = results.some(r => r.success);

            if (allSuccess) {
                const names = matchedStudents
                    .filter(s => selectedStudentIds.has(s.student_id))
                    .map(s => `${s.first_name} ${s.last_name}`.trim())
                    .join(', ');

                if (pendingDeclineAction === 'reschedule') {
                    setResultMessage(`We've noted that ${names} cannot attend on this date and will remain on the waiting list.`);
                    setState('decline_success');
                } else if (pendingDeclineAction === 'withdraw') {
                    setResultMessage(`Registration cancelled for: ${names}. Thank you for letting us know!`);
                    setState('decline_success');
                } else {
                    setResultMessage(`Attendance confirmed for: ${names}. We look forward to seeing you!`);
                    setState('success');
                }
            } else if (anySuccess) {
                setResultMessage(results[0]?.message || 'Operation updated with partial results.');
                setState(pendingDeclineAction ? 'decline_success' : 'success');
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

    // ─── Render ─────────────────────────────────────────────

    return (
        <div className="min-h-screen min-h-[100dvh] bg-[#09090B] text-[#FAFAFA] flex flex-col items-center justify-between p-4 sm:p-6 relative overflow-x-hidden selection:bg-indigo-500/30 selection:text-indigo-200">
            {/* Ambient background glow optimized for mobile GPU */}
            <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden transform-gpu" aria-hidden="true">
                <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[340px] sm:w-[540px] h-[340px] sm:h-[540px] bg-indigo-500/12 rounded-full blur-[60px] sm:blur-[120px] opacity-70" />
                <div className="absolute bottom-1/4 right-1/4 w-[240px] sm:w-[380px] h-[240px] sm:h-[380px] bg-purple-500/10 rounded-full blur-[50px] sm:blur-[90px] opacity-60" />
            </div>

            {/* Header / Logo */}
            <div className="w-full max-w-md relative z-10 pt-4 sm:pt-6 mb-4 flex items-center justify-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 via-indigo-600 to-purple-600 rounded-xl flex items-center justify-center text-white font-black text-base shadow-lg shadow-indigo-500/25 border border-indigo-400/20">
                    C
                </div>
                <div>
                    <h1 className="text-lg font-bold tracking-tight text-white leading-tight">Course CRM</h1>
                    <p className="text-[11px] text-zinc-400 font-semibold tracking-wider uppercase">Cork City Partnership</p>
                </div>
            </div>

            {/* Main Card */}
            <div className="w-full max-w-md relative z-10 my-auto">
                <div className="bg-[#141417]/95 backdrop-blur-md rounded-2xl border border-zinc-800/90 shadow-2xl shadow-black/50 overflow-hidden flex flex-col transition-all duration-300">

                    {/* ─── Loading Skeleton ─── */}
                    {state === 'loading' && (
                        <div className="p-6 sm:p-8 space-y-6 animate-pulse">
                            <div className="flex items-center gap-3">
                                <div className="w-11 h-11 bg-zinc-800/80 rounded-xl" />
                                <div className="space-y-2 flex-1">
                                    <div className="h-3 w-28 bg-zinc-800/80 rounded" />
                                    <div className="h-5 w-48 bg-zinc-700/60 rounded" />
                                </div>
                            </div>
                            <div className="space-y-3 pt-2">
                                <div className="h-3 w-32 bg-zinc-800/70 rounded" />
                                <div className="h-12 w-full bg-zinc-800/50 rounded-xl border border-zinc-800" />
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
                            <p className="text-zinc-400 text-sm leading-relaxed max-w-xs">
                                Could not load course details. Please check your internet connection.
                            </p>
                            <div className="mt-2 flex flex-col sm:flex-row items-center gap-3 w-full">
                                <button
                                    onClick={handleRetry}
                                    className="w-full flex items-center justify-center gap-2 py-3 px-5 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white font-semibold rounded-xl transition-all shadow-md shadow-indigo-600/25 touch-manipulation"
                                >
                                    <RefreshCw size={18} />
                                    Try Again
                                </button>
                                <button
                                    onClick={() => window.location.reload()}
                                    className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-zinc-800 hover:bg-zinc-700 active:scale-[0.98] text-zinc-300 hover:text-white font-medium rounded-xl transition-all touch-manipulation"
                                >
                                    Reload Page
                                </button>
                            </div>
                            {/* Organizer contact */}
                            <div className="pt-4 border-t border-zinc-800/80 w-full text-center">
                                <p className="text-xs text-zinc-500">Need immediate assistance?</p>
                                <a
                                    href={`mailto:${ORGANIZER_EMAIL}?subject=Course%20Portal%20Connection%20Issue`}
                                    className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-medium mt-1 underline"
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
                            <p className="text-zinc-400 text-sm leading-relaxed max-w-xs">
                                This confirmation link is no longer valid or has already expired.
                            </p>
                            <div className="p-4 bg-zinc-900/90 rounded-xl border border-zinc-800 w-full text-center mt-2">
                                <p className="text-xs text-zinc-400 mb-2">Please contact the organizer to receive an updated invitation:</p>
                                <a
                                    href={`mailto:${ORGANIZER_EMAIL}?subject=Expired%20Confirmation%20Link`}
                                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-indigo-300 hover:text-white rounded-lg text-xs font-semibold transition-colors w-full"
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
                            <div className="p-5 sm:p-6 pb-4 border-b border-zinc-800/80 bg-gradient-to-b from-indigo-950/20 to-transparent">
                                <div className="flex items-start gap-3.5">
                                    <div className="p-2.5 bg-indigo-500/15 rounded-xl border border-indigo-500/20 text-indigo-400 shrink-0 mt-0.5">
                                        <GraduationCap size={22} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <span className="inline-block text-[11px] font-semibold text-indigo-400 uppercase tracking-wider bg-indigo-500/10 px-2 py-0.5 rounded-md mb-1 border border-indigo-500/20">
                                            Course Invitation
                                        </span>
                                        <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight leading-snug break-words">
                                            {courseName}
                                        </h2>
                                        {courseDate && (
                                            <div className="flex items-center gap-1.5 text-xs sm:text-sm text-zinc-300 font-medium mt-1.5">
                                                <Calendar size={14} className="text-indigo-400 shrink-0" />
                                                <span>{formatCourseDate(courseDate)}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Form Body */}
                            <div className="p-5 sm:p-6 space-y-4">
                                <div>
                                    <label htmlFor="student-email" className="block text-xs font-bold text-zinc-400 mb-2 uppercase tracking-wider">
                                        Confirm Your Email
                                    </label>
                                    <div className="relative">
                                        <Mail size={17} className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${isSubmitting ? 'text-zinc-600' : 'text-zinc-400'}`} />
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
                                            className="w-full bg-[#09090B] text-white text-[16px] sm:text-sm rounded-xl border border-zinc-800 pl-10 pr-4 py-3 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation shadow-inner"
                                        />
                                    </div>

                                    {/* Email Typo Helper Suggestion */}
                                    {emailSuggestion && (
                                        <div className="mt-2.5 flex items-center justify-between gap-2 p-2.5 bg-indigo-950/40 border border-indigo-500/30 rounded-xl text-xs text-indigo-200 animate-fadeIn">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <Sparkles size={15} className="text-indigo-400 shrink-0" />
                                                <p className="truncate">
                                                    Did you mean <strong className="text-white underline">{emailSuggestion}</strong>?
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={applyEmailSuggestion}
                                                className="shrink-0 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-semibold rounded-lg text-xs transition-all touch-manipulation shadow-sm shadow-indigo-600/40"
                                            >
                                                Fix
                                            </button>
                                        </div>
                                    )}

                                    <p className="text-[11px] text-zinc-500 mt-2 leading-normal">
                                        Please use the same email address that received the invitation.
                                    </p>
                                </div>

                                {inlineError && (
                                    <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs sm:text-sm p-3 rounded-xl flex items-start justify-between gap-2 animate-fadeIn">
                                        <div className="flex items-start gap-2.5 min-w-0">
                                            <AlertCircle size={16} className="shrink-0 mt-0.5 text-red-400" />
                                            <p className="break-words leading-relaxed">{inlineError}</p>
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
                                    disabled={isSubmitting}
                                    className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 active:scale-[0.98] disabled:opacity-50 text-white font-bold text-base py-3.5 px-6 rounded-xl shadow-lg shadow-emerald-600/30 transition-all touch-manipulation disabled:cursor-not-allowed cursor-pointer mt-2"
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

                                {/* Decline / Reschedule Option */}
                                <div className="pt-2 flex flex-col items-center">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setInlineError('');
                                            setState('decline_confirm');
                                        }}
                                        className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors py-2 px-3 rounded-lg hover:bg-zinc-800/50 flex items-center gap-1.5 touch-manipulation"
                                    >
                                        <CalendarX size={14} className="text-zinc-500" />
                                        Can't make it to this date? Let us know
                                    </button>
                                </div>

                                {/* Organizer Contact footer */}
                                <div className="pt-4 border-t border-zinc-800/70 text-center">
                                    <p className="text-[11px] text-zinc-500">
                                        Questions or difficulties? Contact the coordinator:
                                    </p>
                                    <a
                                        href={`mailto:${ORGANIZER_EMAIL}?subject=Question%20about%20${encodeURIComponent(courseName)}`}
                                        className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-medium mt-1 underline transition-colors"
                                    >
                                        <Mail size={12} /> {ORGANIZER_EMAIL}
                                    </a>
                                </div>
                            </div>
                        </form>
                    )}

                    {/* ─── Decline / Reschedule Screen ─── */}
                    {state === 'decline_confirm' && (
                        <div className="p-5 sm:p-6 flex flex-col animate-fadeIn">
                            <div className="flex items-center gap-3 mb-4 pb-3 border-b border-zinc-800">
                                <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400 shrink-0">
                                    <CalendarX size={22} />
                                </div>
                                <div>
                                    <h2 className="text-base sm:text-lg font-bold text-white leading-tight">Can't attend this session?</h2>
                                    <p className="text-xs text-zinc-400 mt-0.5">
                                        Let us know so we can update your enrollment and free up this seat.
                                    </p>
                                </div>
                            </div>

                            {/* Email Check */}
                            <div className="mb-4">
                                <label className="block text-xs font-bold text-zinc-400 mb-1.5 uppercase tracking-wider">
                                    Your Registered Email
                                </label>
                                <div className="relative">
                                    <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                                    <input
                                        type="email"
                                        inputMode="email"
                                        required
                                        value={email}
                                        disabled={isSubmitting}
                                        onChange={(e) => handleEmailInputChange(e.target.value)}
                                        onBlur={() => setEmail((prev) => prev.trim().toLowerCase())}
                                        placeholder="Enter registered email"
                                        className="w-full bg-[#09090B] text-white text-[16px] sm:text-sm rounded-xl border border-zinc-800 pl-10 pr-4 py-2.5 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20"
                                    />
                                </div>
                                {emailSuggestion && (
                                    <div className="mt-2 flex items-center justify-between gap-2 p-2 bg-indigo-950/40 border border-indigo-500/30 rounded-xl text-xs text-indigo-200">
                                        <span className="truncate">Did you mean <strong className="text-white underline">{emailSuggestion}</strong>?</span>
                                        <button
                                            type="button"
                                            onClick={applyEmailSuggestion}
                                            className="px-2 py-0.5 bg-indigo-600 text-white rounded text-xs font-semibold"
                                        >
                                            Fix
                                        </button>
                                    </div>
                                )}
                            </div>

                            {inlineError && (
                                <div className="mb-4 bg-red-500/10 border border-red-500/20 text-red-400 text-xs p-3 rounded-xl flex items-start gap-2 animate-fadeIn">
                                    <AlertCircle size={15} className="shrink-0 mt-0.5" />
                                    <p className="break-words leading-relaxed">{inlineError}</p>
                                </div>
                            )}

                            {/* Choice Actions */}
                            <div className="space-y-3">
                                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                                    Please choose an option:
                                </p>

                                {/* Option 1: Keep on Waiting List (Reschedule) */}
                                <button
                                    type="button"
                                    disabled={isSubmitting || !email.trim()}
                                    onClick={() => handleDeclineAction('reschedule')}
                                    className="w-full text-left p-4 rounded-xl border border-indigo-500/40 bg-indigo-950/20 hover:bg-indigo-900/30 active:scale-[0.98] transition-all touch-manipulation group disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <div className="flex items-start gap-3">
                                        <div className="p-2 bg-indigo-500/20 text-indigo-300 rounded-lg shrink-0 mt-0.5">
                                            <Calendar size={18} />
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-bold text-white group-hover:text-indigo-300 transition-colors">
                                                Keep me on the waiting list for future dates
                                            </h3>
                                            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                                                We'll contact you when the next session of this course is scheduled.
                                            </p>
                                        </div>
                                    </div>
                                </button>

                                {/* Option 2: Withdraw completely */}
                                <button
                                    type="button"
                                    disabled={isSubmitting || !email.trim()}
                                    onClick={() => handleDeclineAction('withdraw')}
                                    className="w-full text-left p-4 rounded-xl border border-zinc-800 bg-[#09090B] hover:border-red-500/40 hover:bg-red-950/15 active:scale-[0.98] transition-all touch-manipulation group disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <div className="flex items-start gap-3">
                                        <div className="p-2 bg-zinc-800 text-zinc-400 group-hover:text-red-400 rounded-lg shrink-0 mt-0.5 transition-colors">
                                            <CalendarX size={18} />
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-bold text-zinc-300 group-hover:text-red-300 transition-colors">
                                                I'm no longer interested in this course
                                            </h3>
                                            <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                                                Cancel my registration completely and remove me from the waiting list.
                                            </p>
                                        </div>
                                    </div>
                                </button>
                            </div>

                            <button
                                type="button"
                                onClick={() => {
                                    setInlineError('');
                                    setState('form');
                                }}
                                className="w-full flex items-center justify-center gap-1.5 text-xs text-zinc-400 hover:text-white py-3 mt-4 transition-colors touch-manipulation"
                            >
                                <ArrowLeft size={14} /> Back to confirmation
                            </button>
                        </div>
                    )}

                    {/* ─── Decline Success Screen ─── */}
                    {state === 'decline_success' && (
                        <div className="p-8 sm:p-10 flex flex-col items-center gap-4 text-center animate-fadeIn">
                            <div className="w-16 h-16 bg-indigo-500/10 rounded-2xl flex items-center justify-center border border-indigo-500/20">
                                <CheckCircle size={32} className="text-indigo-400" />
                            </div>
                            <h2 className="text-xl font-bold text-white">Response Recorded</h2>
                            <p className="text-zinc-300 text-sm leading-relaxed max-w-xs">
                                {resultMessage || "Thank you for letting us know! We have updated your status."}
                            </p>

                            <div className="w-full p-4 bg-zinc-900/80 rounded-xl border border-zinc-800 mt-2 text-center">
                                <p className="text-xs text-zinc-500">
                                    If your availability changes or you have questions, please reach out to:
                                </p>
                                <a
                                    href={`mailto:${ORGANIZER_EMAIL}`}
                                    className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-medium mt-1.5 underline"
                                >
                                    <Mail size={12} /> {ORGANIZER_EMAIL}
                                </a>
                            </div>
                        </div>
                    )}

                    {/* ─── Name Picker (Multiple Registrations with same Email) ─── */}
                    {state === 'pick' && (
                        <div className="p-5 sm:p-6 animate-fadeIn">
                            <div className="flex items-center gap-3 mb-3 pb-3 border-b border-zinc-800">
                                <div className="p-2.5 bg-amber-500/10 rounded-xl border border-amber-500/20 text-amber-400 shrink-0">
                                    <Users size={22} />
                                </div>
                                <div>
                                    <h2 className="text-base sm:text-lg font-bold text-white leading-tight">Multiple Registrations Found</h2>
                                    <p className="text-xs text-zinc-400 mt-0.5">
                                        Multiple people are registered with <span className="text-white font-medium">{email}</span>.
                                    </p>
                                </div>
                            </div>

                            <p className="text-xs text-zinc-400 mb-3">
                                {pendingDeclineAction
                                    ? "Select who should have their registration updated:"
                                    : "Select who is confirming attendance:"}
                            </p>

                            {/* Student List */}
                            <div className="space-y-2.5 mb-4">
                                {matchedStudents.map((student) => (
                                    <label
                                        key={student.student_id}
                                        className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all touch-manipulation ${
                                            selectedStudentIds.has(student.student_id)
                                                ? 'border-indigo-500 bg-indigo-500/10'
                                                : 'border-zinc-800 bg-[#09090B] hover:border-zinc-700'
                                        }`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={selectedStudentIds.has(student.student_id)}
                                            onChange={() => toggleStudent(student.student_id)}
                                            className="w-5 h-5 rounded border-zinc-700 bg-zinc-900 text-indigo-500 focus:ring-indigo-500/30 focus:ring-offset-0 cursor-pointer touch-manipulation"
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
                                        <span>
                                            {pendingDeclineAction ? 'Update Selected' : 'Confirm Selected'} ({selectedStudentIds.size})
                                        </span>
                                    </>
                                )}
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    setPendingDeclineAction(null);
                                    setState('form');
                                    setInlineError('');
                                }}
                                className="w-full text-xs text-zinc-500 hover:text-zinc-300 py-3 mt-2 transition-colors touch-manipulation"
                            >
                                ← Back to email
                            </button>
                        </div>
                    )}

                    {/* ─── Success Screen with Calendar Integration ─── */}
                    {state === 'success' && (
                        <div className="p-6 sm:p-8 flex flex-col items-center gap-4 text-center animate-fadeIn">
                            {/* Animated Success Badge */}
                            <div className="w-16 h-16 bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 rounded-2xl flex items-center justify-center border border-emerald-500/30 shadow-lg shadow-emerald-500/15">
                                <CheckCircle size={34} className="text-emerald-400" />
                            </div>

                            <div className="space-y-1">
                                <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">You're All Set!</h2>
                                <p className="text-zinc-300 text-xs sm:text-sm leading-relaxed max-w-xs mx-auto">
                                    {resultMessage || "Your attendance has been confirmed! We look forward to seeing you at the course."}
                                </p>
                            </div>

                            {/* Ticket Details Card */}
                            <div className="w-full p-4 bg-zinc-900/90 rounded-xl border border-zinc-800 text-left space-y-2 mt-1">
                                <div className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">
                                    Confirmed Enrollment
                                </div>
                                <div className="text-sm sm:text-base font-bold text-white break-words">
                                    {courseName}
                                </div>
                                {courseDate && (
                                    <div className="flex items-center gap-2 text-xs sm:text-sm text-indigo-300 font-medium pt-1 border-t border-zinc-800/80">
                                        <Calendar size={15} className="text-indigo-400 shrink-0" />
                                        <span>{formatCourseDate(courseDate)}</span>
                                    </div>
                                )}
                            </div>

                            {/* ─── Add to Calendar Section ─── */}
                            {courseDate && (
                                <div className="w-full p-4 bg-zinc-900/60 rounded-xl border border-zinc-800/80 text-left space-y-3 mt-1">
                                    <div className="flex items-center gap-2 text-xs font-bold text-zinc-300 uppercase tracking-wider">
                                        <Calendar size={14} className="text-indigo-400" />
                                        <span>Add to Calendar</span>
                                    </div>
                                    <p className="text-xs text-zinc-400 leading-normal">
                                        Save the course date to your phone so you don't miss it:
                                    </p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                                        <a
                                            href={getGoogleCalendarUrl({ courseName, courseDate })}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center justify-center gap-2 py-3 px-3.5 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-200 hover:text-white rounded-xl text-xs font-semibold transition-all active:scale-[0.98] touch-manipulation text-center shadow-sm"
                                        >
                                            <ExternalLink size={14} className="text-indigo-400 shrink-0" />
                                            <span>Google Calendar</span>
                                        </a>
                                        <button
                                            type="button"
                                            onClick={() => downloadIcsFile({ courseName, courseDate })}
                                            className="flex items-center justify-center gap-2 py-3 px-3.5 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-200 hover:text-white rounded-xl text-xs font-semibold transition-all active:scale-[0.98] touch-manipulation text-center shadow-sm"
                                        >
                                            <Download size={14} className="text-emerald-400 shrink-0" />
                                            <span>Apple / Outlook (.ics)</span>
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Organizer Contact Info */}
                            <div className="w-full pt-3 text-center border-t border-zinc-800/70">
                                <p className="text-[11px] text-zinc-500">
                                    Need to change plans or have any questions?
                                </p>
                                <a
                                    href={`mailto:${ORGANIZER_EMAIL}?subject=Confirmed%20Course%20Question%20-%20${encodeURIComponent(courseName)}`}
                                    className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-medium mt-1 underline transition-colors"
                                >
                                    <Mail size={12} /> {ORGANIZER_EMAIL}
                                </a>
                            </div>
                        </div>
                    )}

                </div>

                {/* Footer */}
                <div className="flex items-center justify-center gap-1 text-[11px] text-zinc-500 mt-4 text-center">
                    <HelpCircle size={13} className="text-zinc-600" />
                    <span>Cork City Partnership • Course Confirmation Portal</span>
                </div>
            </div>

            {/* Bottom spacer on mobile */}
            <div className="w-full h-2 relative z-0" aria-hidden="true" />
        </div>
    );
}
