import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { CheckCircle, AlertCircle, Loader2, Mail, Briefcase, Clock, Building2 } from 'lucide-react';

type PageState = 'form' | 'success';

export default function StatusUpdatePage() {
    const [state, setState] = useState<PageState>('form');
    const [email, setEmail] = useState('');
    const [isWorking, setIsWorking] = useState<boolean | null>(null);
    const [startedMonth, setStartedMonth] = useState('');
    const [fieldOfWork, setFieldOfWork] = useState('');
    const [employmentType, setEmploymentType] = useState<'full_time' | 'part_time' | ''>('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [inlineError, setInlineError] = useState('');
    const [resultMessage, setResultMessage] = useState('');

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!email.trim() || isWorking === null || isSubmitting) return;
        if (isWorking && !employmentType) {
            setInlineError('Please select Full-time or Part-time.');
            return;
        }
        setIsSubmitting(true);
        setInlineError('');

        const { data, error } = await supabase.rpc('submit_employment_status', {
            p_email: email.trim(),
            p_is_working: isWorking,
            p_started_month: isWorking ? startedMonth || null : null,
            p_field: isWorking ? fieldOfWork || null : null,
            p_employment_type: isWorking ? employmentType || null : null,
        });

        setIsSubmitting(false);
        if (error) {
            setInlineError('Something went wrong. Please try again later.');
            return;
        }

        if (data.success) {
            setResultMessage(data.message);
            setState('success');
        } else {
            setInlineError(data.message || 'Submission failed.');
        }
    }

    // Generate month options for the picker
    const monthOptions = (() => {
        const options: { value: string; label: string }[] = [];
        const now = new Date();
        for (let i = 0; i < 24; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const label = d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
            options.push({ value: val, label });
        }
        return options;
    })();

    return (
        <div className="min-h-screen bg-[#09090B] text-[#FAFAFA] flex items-center justify-center p-4 relative overflow-hidden">
            {/* Background glow */}
            <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
                <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-violet-500/10 rounded-full blur-[120px] opacity-60" />
                <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-purple-500/8 rounded-full blur-[100px] opacity-40" />
            </div>

            <div className="w-full max-w-md relative z-10">
                {/* Logo */}
                <div className="flex items-center justify-center gap-3 mb-8">
                    <div className="w-10 h-10 bg-gradient-to-br from-violet-500 via-violet-600 to-purple-500 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-violet-500/25">
                        C
                    </div>
                    <div>
                        <h1 className="text-lg font-bold tracking-tight">Course CRM</h1>
                        <p className="text-[10px] text-zinc-500 font-medium -mt-0.5 tracking-wide uppercase">Status Update</p>
                    </div>
                </div>

                {/* Card */}
                <div className="bg-[#18181B] rounded-2xl border border-zinc-800 shadow-xl shadow-black/20 overflow-hidden">

                    {/* ─── Form ─── */}
                    {state === 'form' && (
                        <form onSubmit={handleSubmit}>
                            {/* Header */}
                            <div className="p-6 pb-4 border-b border-zinc-800">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="p-2 bg-violet-500/10 rounded-xl">
                                        <Briefcase size={20} className="text-violet-400" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Employment status update</p>
                                        <h2 className="text-lg font-bold text-white">How are things going?</h2>
                                    </div>
                                </div>
                                <p className="text-sm text-zinc-400 leading-relaxed">
                                    Please take a moment to let us know your current employment status.
                                    This information is confidential and used only for internal statistics.
                                </p>
                            </div>

                            {/* Form Fields */}
                            <div className="p-6 space-y-5">
                                {/* Email */}
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
                                            className="w-full bg-[#09090B] text-white text-sm rounded-xl border border-zinc-800 pl-10 pr-4 py-3 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                        />
                                    </div>
                                </div>

                                {/* Are you working? */}
                                <div>
                                    <label className="block text-xs font-semibold text-zinc-400 mb-3 uppercase tracking-wider">
                                        Are you currently working?
                                    </label>
                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            type="button"
                                            disabled={isSubmitting}
                                            onClick={() => setIsWorking(true)}
                                            className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold border transition-all ${
                                                isWorking === true
                                                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-sm'
                                                    : 'bg-[#09090B] text-zinc-400 border-zinc-800 hover:border-zinc-600'
                                            }`}
                                        >
                                            <CheckCircle size={16} />
                                            Yes
                                        </button>
                                        <button
                                            type="button"
                                            disabled={isSubmitting}
                                            onClick={() => setIsWorking(false)}
                                            className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold border transition-all ${
                                                isWorking === false
                                                    ? 'bg-orange-500/20 text-orange-400 border-orange-500/40 shadow-sm'
                                                    : 'bg-[#09090B] text-zinc-400 border-zinc-800 hover:border-zinc-600'
                                            }`}
                                        >
                                            <AlertCircle size={16} />
                                            Not yet
                                        </button>
                                    </div>
                                </div>

                                {/* Conditional fields when working */}
                                {isWorking === true && (
                                    <div className="space-y-4 animate-fadeIn">
                                        {/* Since when */}
                                        <div>
                                            <label className="block text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">
                                                <Clock size={12} className="inline mr-1" />
                                                Since when?
                                            </label>
                                            <select
                                                value={startedMonth}
                                                onChange={(e) => setStartedMonth(e.target.value)}
                                                disabled={isSubmitting}
                                                className="w-full bg-[#09090B] text-white text-sm rounded-xl border border-zinc-800 px-4 py-3 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all appearance-none cursor-pointer disabled:opacity-50"
                                            >
                                                <option value="">Select month...</option>
                                                {monthOptions.map(opt => (
                                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* Field of work */}
                                        <div>
                                            <label className="block text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">
                                                <Building2 size={12} className="inline mr-1" />
                                                In what field / sector?
                                            </label>
                                            <input
                                                type="text"
                                                value={fieldOfWork}
                                                onChange={(e) => setFieldOfWork(e.target.value)}
                                                disabled={isSubmitting}
                                                placeholder="e.g. IT, Hospitality, Retail..."
                                                className="w-full bg-[#09090B] text-white text-sm rounded-xl border border-zinc-800 px-4 py-3 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all disabled:opacity-50"
                                            />
                                        </div>

                                        {/* Full-time / Part-time */}
                                        <div>
                                            <label className="block text-xs font-semibold text-zinc-400 mb-3 uppercase tracking-wider">
                                                Employment type
                                            </label>
                                            <div className="grid grid-cols-2 gap-3">
                                                <button
                                                    type="button"
                                                    disabled={isSubmitting}
                                                    onClick={() => setEmploymentType('full_time')}
                                                    className={`py-3 px-4 rounded-xl text-sm font-semibold border transition-all ${
                                                        employmentType === 'full_time'
                                                            ? 'bg-violet-500/20 text-violet-400 border-violet-500/40 shadow-sm'
                                                            : 'bg-[#09090B] text-zinc-400 border-zinc-800 hover:border-zinc-600'
                                                    }`}
                                                >
                                                    Full-time
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={isSubmitting}
                                                    onClick={() => setEmploymentType('part_time')}
                                                    className={`py-3 px-4 rounded-xl text-sm font-semibold border transition-all ${
                                                        employmentType === 'part_time'
                                                            ? 'bg-violet-500/20 text-violet-400 border-violet-500/40 shadow-sm'
                                                            : 'bg-[#09090B] text-zinc-400 border-zinc-800 hover:border-zinc-600'
                                                    }`}
                                                >
                                                    Part-time
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {inlineError && (
                                    <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-xl flex items-center gap-3 animate-fadeIn">
                                        <AlertCircle size={16} className="shrink-0" />
                                        <p>{inlineError}</p>
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={isSubmitting || isWorking === null}
                                    className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-600/50 text-white font-bold text-lg py-4 px-8 rounded-xl shadow-lg shadow-violet-600/30 hover:shadow-violet-600/40 disabled:hover:shadow-violet-600/30 transition-all active:scale-[0.98] disabled:active:scale-100 disabled:cursor-not-allowed"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <Loader2 size={24} className="animate-spin text-white/70" />
                                            <span>Submitting...</span>
                                        </>
                                    ) : (
                                        <>
                                            <span className="text-xl">📝</span>
                                            <span>Submit My Status</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    )}

                    {/* ─── Success ─── */}
                    {state === 'success' && (
                        <div className="p-12 flex flex-col items-center gap-4 text-center animate-fadeIn">
                            <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center">
                                <CheckCircle size={32} className="text-emerald-400" />
                            </div>
                            <h2 className="text-xl font-bold">Thank You!</h2>
                            <p className="text-zinc-400 text-sm leading-relaxed max-w-xs">
                                {resultMessage}
                            </p>
                            <div className="mt-2 px-4 py-2 bg-violet-500/10 rounded-xl border border-violet-500/20">
                                <p className="text-xs text-violet-400 font-medium">Your response has been recorded</p>
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
