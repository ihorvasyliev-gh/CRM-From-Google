import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { CheckCircle, AlertCircle, Loader2, Mail, GraduationCap, RefreshCw, Users } from 'lucide-react';

type PageState = 'loading' | 'form' | 'pick' | 'success' | 'invalid' | 'error';

interface MatchedStudent {
    student_id: string;
    first_name: string;
    last_name: string;
}

export default function ConfirmationPage() {
    const [state, setState] = useState<PageState>('loading');
    const [courseName, setCourseName] = useState('');
    const [courseId, setCourseId] = useState('');
    const [courseDate, setCourseDate] = useState('');
    const [email, setEmail] = useState('');
    const [resultMessage, setResultMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [inlineError, setInlineError] = useState('');
    const [matchedStudents, setMatchedStudents] = useState<MatchedStudent[]>([]);
    const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());

    // BUG-5 FIX: useRef guard against double-click race condition
    const submittingRef = useRef(false);

    // Store URL info for retry capability
    const urlInfoRef = useRef<{ type: 'token'; value: string } | { type: 'courseId'; value: string; date?: string } | null>(null);

    const resolveToken = useCallback(async (token: string) => {
        try {
            const { data, error } = await supabase.rpc('resolve_confirmation_token', { p_token: token });
            if (error) {
                // BUG-3 FIX: Network/server error — show error state with retry, not invalid
                console.error('Token resolve error:', error);
                setState('error');
                return;
            }
            if (!data || data.length === 0) {
                // Genuinely invalid/expired token
                setState('invalid');
                return;
            }
            const row = data[0];
            setCourseId(row.course_id);
            setCourseName(row.course_name);
            if (row.course_date) setCourseDate(row.course_date);
            setState('form');
        } catch (err) {
            // BUG-3 FIX: Network failure (no connection, DNS, etc.)
            console.error('Token resolve exception:', err);
            setState('error');
        }
    }, []);

    const fetchCourseInfo = useCallback(async (id: string) => {
        try {
            const { data, error } = await supabase.rpc('get_public_course_info', { p_course_id: id });
            if (error) {
                // BUG-3 FIX: Network/server error — show error state with retry
                console.error('Course info error:', error);
                setState('error');
                return;
            }
            if (!data || data.length === 0) {
                // Genuinely invalid course ID
                setState('invalid');
                return;
            }
            setCourseName(data[0].course_name);
            setState('form');
        } catch (err) {
            // BUG-3 FIX: Network failure
            console.error('Course info exception:', err);
            setState('error');
        }
    }, []);

    // Read course_id from URL on mount — supports both /c/:token and /confirm?course_id=...
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

    // BUG-3 FIX: Retry handler for network errors
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

    // BUG-7 FIX: Safe date formatting that works in Safari
    function formatCourseDate(dateStr: string): string {
        try {
            return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
        } catch {
            return dateStr; // Fallback to raw date string
        }
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();

        // BUG-6 FIX: Validate email format before sending RPC
        const trimmedEmail = email.trim();
        if (!trimmedEmail || !trimmedEmail.includes('@')) {
            setInlineError('Please enter a valid email address.');
            return;
        }

        // BUG-5 FIX: Immediate ref guard against double-click
        if (submittingRef.current) return;
        submittingRef.current = true;
        setIsSubmitting(true);
        setInlineError('');

        // BUG-4 FIX: try/catch/finally ensures isSubmitting is always reset
        try {
            // Step 1: Find all students matching this email for this course (invited status)
            let students: MatchedStudent[] | null = null;
            try {
                const { data, error: findError } = await supabase.rpc('find_students_by_email', {
                    p_email: trimmedEmail,
                    p_course_id: courseId,
                });
                if (!findError && data) {
                    students = data;
                } else if (findError) {
                    console.warn('find_students_by_email error, falling back:', findError);
                }
            } catch (findErr) {
                console.warn('find_students_by_email exception:', findErr);
            }

            if (!students || students.length === 0) {
                // No pending invitations found — call public_confirm_enrollment.
                // It will check if already confirmed, completed, expired, etc. and return the proper response.
                const { data, error } = await supabase.rpc('public_confirm_enrollment', {
                    p_email: trimmedEmail,
                    p_course_id: courseId,
                    p_student_id: null,
                });
                if (error) {
                    console.error('Confirmation error:', error);
                    setInlineError(error.message || 'Something went wrong. Please try again.');
                    return;
                }
                if (data && data.success) {
                    setResultMessage(data.message || 'Your attendance has already been confirmed! We look forward to seeing you at the course.');
                    setState('success');
                } else {
                    setInlineError(data?.message || 'Confirmation failed.');
                }
                return;
            }

            if (students.length === 1) {
                // Single match — confirm directly (no picker needed)
                const { data, error } = await supabase.rpc('public_confirm_enrollment', {
                    p_email: trimmedEmail,
                    p_course_id: courseId,
                    p_student_id: students[0].student_id,
                });
                if (error) {
                    console.error('Confirmation error:', error);
                    setInlineError(error.message || 'Something went wrong. Please try again.');
                    return;
                }
                if (data && data.success) {
                    setResultMessage(data.message || 'Your attendance has been confirmed! We look forward to seeing you at the course.');
                    setState('success');
                } else {
                    setInlineError(data?.message || 'Confirmation failed.');
                }
                return;
            }

            // Multiple matches — show name picker
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
            const trimmedEmail = email.trim();
            const ids = Array.from(selectedStudentIds);
            const results: { id: string; success: boolean; message: string }[] = [];

            for (const studentId of ids) {
                const { data, error } = await supabase.rpc('public_confirm_enrollment', {
                    p_email: trimmedEmail,
                    p_course_id: courseId,
                    p_student_id: studentId,
                });
                if (error) {
                    results.push({ id: studentId, success: false, message: error.message || 'Server error' });
                } else {
                    results.push({ id: studentId, success: data?.success ?? false, message: data?.message ?? '' });
                }
            }

            const allSuccess = results.every(r => r.success);
            const anySuccess = results.some(r => r.success);

            if (allSuccess) {
                const names = matchedStudents
                    .filter(s => selectedStudentIds.has(s.student_id))
                    .map(s => `${s.first_name} ${s.last_name}`.trim())
                    .join(', ');
                setResultMessage(`Attendance confirmed for: ${names}. We look forward to seeing you!`);
                setState('success');
            } else if (anySuccess) {
                const failedNames = results
                    .filter(r => !r.success)
                    .map(r => {
                        const s = matchedStudents.find(ms => ms.student_id === r.id);
                        return s ? `${s.first_name} ${s.last_name}`.trim() : 'Unknown';
                    });
                setResultMessage(`Some confirmations succeeded, but failed for: ${failedNames.join(', ')}. Please contact the organizer.`);
                setState('success');
            } else {
                setInlineError(results[0]?.message || 'Confirmation failed.');
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
        <div className="min-h-screen min-h-[100dvh] bg-[#09090B] text-[#FAFAFA] flex flex-col items-center justify-start sm:justify-center p-4 pt-10 sm:pt-4 relative overflow-hidden">
            {/* Background glow - optimized for mobile GPU */}
            <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden transform-gpu">
                <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] sm:w-[500px] h-[400px] sm:h-[500px] bg-indigo-500/10 rounded-full blur-[40px] sm:blur-[100px] opacity-40 sm:opacity-50" />
                <div className="absolute bottom-1/4 right-1/4 w-[280px] sm:w-[350px] h-[280px] sm:h-[350px] bg-purple-500/8 rounded-full blur-[30px] sm:blur-[80px] opacity-25 sm:opacity-30" />
            </div>

            <div className="w-full max-w-md relative z-10">
                {/* Logo */}
                <div className="flex items-center justify-center gap-3 mb-8">
                    <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 via-indigo-600 to-purple-500 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-indigo-500/25">
                        C
                    </div>
                    <div>
                        <h1 className="text-lg font-bold tracking-tight">Course CRM</h1>
                        <p className="text-[10px] text-zinc-500 font-medium -mt-0.5 tracking-wide uppercase">Confirmation Portal</p>
                    </div>
                </div>

                {/* Card */}
                <div className="bg-[#18181B] rounded-2xl border border-zinc-800 shadow-xl shadow-black/20 overflow-hidden min-h-[440px] flex flex-col justify-start">

                    {/* ─── Loading Skeleton (mirrors exact form height to prevent CLS) ─── */}
                    {state === 'loading' && (
                        <div className="flex flex-col min-h-[440px]">
                            <div className="p-6 pb-4 border-b border-zinc-800">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="p-2 bg-indigo-500/10 rounded-xl">
                                        <GraduationCap size={20} className="text-indigo-400/60 animate-pulse" />
                                    </div>
                                    <div className="space-y-2 flex-1">
                                        <div className="h-3 w-32 bg-zinc-800 rounded animate-pulse" />
                                        <div className="h-6 w-48 bg-zinc-700/60 rounded animate-pulse" />
                                    </div>
                                </div>
                            </div>
                            <div className="p-6 space-y-4 flex-1 flex flex-col justify-between">
                                <div className="space-y-2">
                                    <div className="h-3 w-32 bg-zinc-800 rounded animate-pulse" />
                                    <div className="h-12 w-full bg-zinc-800/50 rounded-xl border border-zinc-800/80 animate-pulse" />
                                    <div className="h-3 w-60 bg-zinc-800/60 rounded animate-pulse mt-2" />
                                </div>
                                <div className="h-14 w-full bg-emerald-600/30 rounded-xl animate-pulse flex items-center justify-center gap-2 mt-4">
                                    <Loader2 size={20} className="animate-spin text-emerald-400/60" />
                                    <span className="text-sm font-medium text-emerald-400/60">Loading course details...</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ─── Network Error (BUG-3 FIX) ─── */}
                    {state === 'error' && (
                        <div className="p-12 flex flex-col items-center gap-4 text-center">
                            <div className="w-14 h-14 bg-amber-500/10 rounded-2xl flex items-center justify-center">
                                <AlertCircle size={28} className="text-amber-400" />
                            </div>
                            <h2 className="text-xl font-bold">Connection Error</h2>
                            <p className="text-zinc-400 text-sm leading-relaxed">
                                Could not load course information. Please check your internet connection and try again.
                            </p>
                            <button
                                onClick={handleRetry}
                                className="mt-2 flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-all active:scale-[0.98] touch-manipulation"
                            >
                                <RefreshCw size={18} />
                                Try Again
                            </button>
                        </div>
                    )}

                    {/* ─── Invalid Link ─── */}
                    {state === 'invalid' && (
                        <div className="p-12 flex flex-col items-center gap-4 text-center">
                            <div className="w-14 h-14 bg-red-500/10 rounded-2xl flex items-center justify-center">
                                <AlertCircle size={28} className="text-red-400" />
                            </div>
                            <h2 className="text-xl font-bold">Invalid Link</h2>
                            <p className="text-zinc-400 text-sm leading-relaxed">
                                This confirmation link is invalid or the course no longer exists.
                                Please contact the organizer for a new link.
                            </p>
                        </div>
                    )}

                    {/* ─── Form ─── */}
                    {state === 'form' && (
                        <form onSubmit={handleSubmit}>
                            {/* Header */}
                            <div className="p-6 pb-4 border-b border-zinc-800">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="p-2 bg-indigo-500/10 rounded-xl">
                                        <GraduationCap size={20} className="text-indigo-400" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Confirm attendance for</p>
                                        <h2 className="text-lg font-bold text-white">{courseName}</h2>
                                        {courseDate && (
                                            <p className="text-sm text-indigo-400 font-medium mt-0.5">
                                                📅 {formatCourseDate(courseDate)}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Input */}
                            <div className="p-6 space-y-4">
                                <div>
                                    <label className="block text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">
                                        Your Email Address
                                    </label>
                                    <div className="relative">
                                        <Mail size={16} className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${isSubmitting ? 'text-zinc-600' : 'text-zinc-500'}`} />
                                        <input
                                            type="email"
                                            required
                                            value={email}
                                            disabled={isSubmitting}
                                            onChange={(e) => setEmail(e.target.value)}
                                            placeholder="Enter the email you registered with"
                                            className="w-full bg-[#09090B] text-white text-[16px] sm:text-sm rounded-xl border border-zinc-800 pl-10 pr-4 py-3 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
                                        />
                                    </div>
                                    <p className="text-xs text-zinc-600 mt-2">
                                        Use the same email address that was registered with us.
                                    </p>
                                </div>

                                {inlineError && (
                                    <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-xl flex items-center gap-3 animate-fadeIn">
                                        <AlertCircle size={16} className="shrink-0" />
                                        <p>{inlineError}</p>
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-600/50 text-white font-bold text-lg py-4 px-8 rounded-xl shadow-lg shadow-emerald-600/30 hover:shadow-emerald-600/40 disabled:hover:shadow-emerald-600/30 transition-all active:scale-[0.98] disabled:active:scale-100 disabled:cursor-not-allowed touch-manipulation"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <Loader2 size={24} className="animate-spin text-white/70" />
                                            <span>Confirming...</span>
                                        </>
                                    ) : (
                                        <>
                                            <span className="text-xl">✓</span>
                                            <span>Confirm My Participation</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    )}

                    {/* ─── Name Picker (shared email) ─── */}
                    {state === 'pick' && (
                        <div>
                            {/* Header */}
                            <div className="p-6 pb-4 border-b border-zinc-800">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="p-2 bg-amber-500/10 rounded-xl">
                                        <Users size={20} className="text-amber-400" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Multiple registrations found</p>
                                        <h2 className="text-lg font-bold text-white">{courseName}</h2>
                                        {courseDate && (
                                            <p className="text-sm text-indigo-400 font-medium mt-0.5">
                                                📅 {formatCourseDate(courseDate)}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <p className="text-sm text-zinc-400">
                                    We found multiple people registered with <span className="text-white font-medium">{email.trim()}</span>. Please select who you are:
                                </p>
                            </div>

                            {/* Student list */}
                            <div className="p-6 space-y-3">
                                {matchedStudents.map((student) => (
                                    <label
                                        key={student.student_id}
                                        className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all touch-manipulation ${
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
                                        <span className="text-white font-medium">
                                            {student.first_name} {student.last_name}
                                        </span>
                                    </label>
                                ))}

                                {inlineError && (
                                    <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-xl flex items-center gap-3 animate-fadeIn">
                                        <AlertCircle size={16} className="shrink-0" />
                                        <p>{inlineError}</p>
                                    </div>
                                )}

                                <button
                                    type="button"
                                    onClick={handleConfirmSelected}
                                    disabled={isSubmitting || selectedStudentIds.size === 0}
                                    className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-600/50 text-white font-bold text-lg py-4 px-8 rounded-xl shadow-lg shadow-emerald-600/30 hover:shadow-emerald-600/40 disabled:hover:shadow-emerald-600/30 transition-all active:scale-[0.98] disabled:active:scale-100 disabled:cursor-not-allowed mt-1 touch-manipulation"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <Loader2 size={24} className="animate-spin text-white/70" />
                                            <span>Confirming...</span>
                                        </>
                                    ) : (
                                        <>
                                            <span className="text-xl">✓</span>
                                            <span>Confirm Selected ({selectedStudentIds.size})</span>
                                        </>
                                    )}
                                </button>

                                <button
                                    type="button"
                                    onClick={() => { setState('form'); setInlineError(''); }}
                                    className="w-full text-sm text-zinc-500 hover:text-zinc-300 transition-colors py-2 touch-manipulation"
                                >
                                    ← Back to email
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ─── Success ─── */}
                    {state === 'success' && (
                        <div className="p-12 flex flex-col items-center gap-4 text-center animate-fadeIn">
                            <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center">
                                <CheckCircle size={32} className="text-emerald-400" />
                            </div>
                            <h2 className="text-xl font-bold">You're All Set!</h2>
                            <p className="text-zinc-400 text-sm leading-relaxed max-w-xs">
                                {resultMessage}
                            </p>
                            <div className="mt-2 px-4 py-2 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                                <p className="text-xs text-emerald-400 font-medium">{courseName}</p>
                                {courseDate && (
                                    <p className="text-xs text-emerald-300 mt-1">
                                        Confirmed for {formatCourseDate(courseDate)}
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                </div>

                {/* Footer */}
                <p className="text-center text-[11px] text-zinc-600 mt-6">
                    Powered by Course CRM • Cork City Partnership
                </p>
            </div>
        </div>
    );
}
