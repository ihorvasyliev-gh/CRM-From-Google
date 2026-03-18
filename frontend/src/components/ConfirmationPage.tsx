import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { CheckCircle, AlertCircle, Loader2, Mail, GraduationCap } from 'lucide-react';

type PageState = 'loading' | 'form' | 'submitting' | 'success' | 'error' | 'invalid';

export default function ConfirmationPage() {
    const [state, setState] = useState<PageState>('loading');
    const [courseName, setCourseName] = useState('');
    const [courseId, setCourseId] = useState('');
    const [courseDate, setCourseDate] = useState('');
    const [email, setEmail] = useState('');
    const [resultMessage, setResultMessage] = useState('');
    const [isSuccess, setIsSuccess] = useState(false);

    const resolveToken = useCallback(async (token: string) => {
        const { data, error } = await supabase.rpc('resolve_confirmation_token', { p_token: token });
        if (error || !data || data.length === 0) {
            setState('invalid');
            return;
        }
        const row = data[0];
        setCourseId(row.course_id);
        setCourseName(row.course_name);
        if (row.course_date) setCourseDate(row.course_date);
        setState('form');
    }, []);

    const fetchCourseInfo = useCallback(async (id: string) => {
        const { data, error } = await supabase.rpc('get_public_course_info', { p_course_id: id });
        if (error || !data || data.length === 0) {
            setState('invalid');
            return;
        }
        setCourseName(data[0].course_name);
        setState('form');
    }, []);

    // Read course_id from URL on mount — supports both /c/:token and /confirm?course_id=...
    useEffect(() => {
        const path = window.location.pathname;

        // Short token URL: /c/Xk9mQ2
        if (path.startsWith('/c/')) {
            const token = path.split('/c/')[1];
            if (!token) { setState('invalid'); return; }
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
        fetchCourseInfo(id);
    }, [resolveToken, fetchCourseInfo]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!email.trim()) return;
        setState('submitting');

        const { data, error } = await supabase.rpc('public_confirm_enrollment', {
            p_email: email.trim(),
            p_course_id: courseId,
        });

        if (error) {
            setResultMessage('Something went wrong. Please try again later.');
            setIsSuccess(false);
            setState('error');
            return;
        }

        setResultMessage(data.message);
        setIsSuccess(data.success);
        setState(data.success ? 'success' : 'error');
    }

    // ─── Render ─────────────────────────────────────────────

    return (
        <div className="min-h-screen bg-[#09090B] text-[#FAFAFA] flex items-center justify-center p-4 relative overflow-hidden">
            {/* Background glow */}
            <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
                <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-500/10 rounded-full blur-[120px] opacity-60" />
                <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-purple-500/8 rounded-full blur-[100px] opacity-40" />
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
                <div className="bg-[#18181B] rounded-2xl border border-zinc-800 shadow-xl shadow-black/20 overflow-hidden">

                    {/* ─── Loading ─── */}
                    {state === 'loading' && (
                        <div className="p-12 flex flex-col items-center gap-4">
                            <Loader2 size={32} className="animate-spin text-indigo-500" />
                            <p className="text-zinc-400 text-sm">Loading course information...</p>
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
                                                📅 {new Date(courseDate + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
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
                                        <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                                        <input
                                            type="email"
                                            required
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            placeholder="Enter the email you registered with"
                                            className="w-full bg-[#09090B] text-white text-sm rounded-xl border border-zinc-800 pl-10 pr-4 py-3 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                                        />
                                    </div>
                                    <p className="text-xs text-zinc-600 mt-2">
                                        Use the same email address that was registered with us.
                                    </p>
                                </div>

                                <button
                                    type="submit"
                                    className="w-full flex items-center justify-center gap-3 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white font-black text-lg py-5 px-8 rounded-2xl shadow-xl shadow-emerald-500/30 hover:shadow-emerald-500/40 transition-all active:scale-[0.98] ring-4 ring-emerald-500/20 animate-pulse"
                                >
                                    <span className="text-2xl">✅</span>
                                    <span className="tracking-wide">PRESS HERE TO CONFIRM</span>
                                </button>
                            </div>
                        </form>
                    )}

                    {/* ─── Submitting ─── */}
                    {state === 'submitting' && (
                        <div className="p-12 flex flex-col items-center gap-4">
                            <Loader2 size={32} className="animate-spin text-indigo-500" />
                            <p className="text-zinc-400 text-sm">Confirming your attendance...</p>
                        </div>
                    )}

                    {/* ─── Success ─── */}
                    {state === 'success' && (
                        <div className="p-12 flex flex-col items-center gap-4 text-center">
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
                                        Confirmed for {new Date(courseDate + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ─── Error ─── */}
                    {state === 'error' && (
                        <div className="p-12 flex flex-col items-center gap-4 text-center">
                            <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center">
                                <AlertCircle size={32} className="text-red-400" />
                            </div>
                            <h2 className="text-xl font-bold">{isSuccess ? 'Notice' : 'Confirmation Failed'}</h2>
                            <p className="text-zinc-400 text-sm leading-relaxed max-w-xs">
                                {resultMessage}
                            </p>
                            <button
                                onClick={() => { setState('form'); setEmail(''); }}
                                className="mt-2 text-sm text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
                            >
                                ← Try again
                            </button>
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
