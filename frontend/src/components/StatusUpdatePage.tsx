import { useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
    AlertCircle,
    Briefcase,
    Building2,
    CalendarDays,
    CheckCircle,
    Clock,
    HelpCircle,
    Loader2,
    Mail,
    ShieldCheck,
    Sparkles,
    User,
    XCircle,
} from 'lucide-react';
import { suggestEmailCorrection } from '../lib/emailValidation';

type PageState = 'form' | 'pick' | 'success';
type EmploymentType = 'full_time' | 'part_time';

interface StudentMatch {
    student_id: string;
    first_name: string;
    last_name: string;
}

const ORGANIZER_EMAIL = 'ivasyliev@partnershipcork.ie';

const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

/** How many years back the "started" year picker goes. */
const YEARS_BACK = 10;

const inputClass =
    'w-full bg-[#09090B] text-white text-[16px] sm:text-sm rounded-xl border border-zinc-800 px-4 py-3 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation shadow-inner';

function choiceClass(selected: boolean, tone: 'emerald' | 'amber' | 'indigo') {
    const active = {
        emerald: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/50 shadow-sm shadow-emerald-500/10',
        amber: 'bg-amber-500/15 text-amber-300 border-amber-500/50 shadow-sm shadow-amber-500/10',
        indigo: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/50 shadow-sm shadow-indigo-500/10',
    }[tone];
    return `flex items-center justify-center gap-2 py-3 px-3 rounded-xl text-sm font-semibold border transition-all active:scale-[0.98] touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed ${
        selected ? active : 'bg-[#09090B] text-zinc-400 border-zinc-800 hover:border-zinc-600 hover:text-zinc-200'
    }`;
}

function formatStartedMonth(value: string) {
    const [y, m] = value.split('-').map(Number);
    if (!y || !m) return value;
    return `${MONTHS[m - 1]} ${y}`;
}

export default function StatusUpdatePage() {
    const [state, setState] = useState<PageState>('form');
    const [email, setEmail] = useState('');
    const [emailSuggestion, setEmailSuggestion] = useState<string | null>(null);
    const [isWorking, setIsWorking] = useState<boolean | null>(null);
    const [startMonth, setStartMonth] = useState('');
    const [startYear, setStartYear] = useState('');
    const [fieldOfWork, setFieldOfWork] = useState('');
    const [employmentType, setEmploymentType] = useState<EmploymentType | ''>('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [inlineError, setInlineError] = useState('');
    const [matchingStudents, setMatchingStudents] = useState<StudentMatch[]>([]);
    const [submittedName, setSubmittedName] = useState('');

    // Guard against double-submit
    const submittingRef = useRef(false);

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const years = useMemo(
        () => Array.from({ length: YEARS_BACK + 1 }, (_, i) => String(currentYear - i)),
        [currentYear],
    );
    // Don't allow a start month in the future
    const maxMonth = startYear === String(currentYear) ? currentMonth : 12;
    const startedMonthValue = startYear && startMonth ? `${startYear}-${startMonth.padStart(2, '0')}` : '';

    function handleEmailInputChange(val: string) {
        const lower = val.toLowerCase();
        setEmail(lower);
        setInlineError('');
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

    function handleYearChange(year: string) {
        setStartYear(year);
        setInlineError('');
        // Reset a month that became "in the future" for the chosen year
        if (year === String(currentYear) && Number(startMonth) > currentMonth) setStartMonth('');
    }

    function validate(): string | null {
        const trimmed = email.trim();
        if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return 'Please enter a valid email address.';
        if (isWorking === null) return 'Please tell us whether you are currently working.';
        if (isWorking) {
            if (!startedMonthValue) return 'Please select the month and year you started working.';
            if (!fieldOfWork.trim()) return 'Please tell us where you work (company or sector).';
            if (!employmentType) return 'Please select Full-time or Part-time.';
        }
        return null;
    }

    async function executeSubmission(targetStudentId: string | null) {
        const { data, error } = await supabase.rpc('submit_employment_status', {
            p_email: email.trim().toLowerCase(),
            p_is_working: isWorking,
            p_started_month: isWorking ? startedMonthValue || null : null,
            p_field: isWorking ? fieldOfWork.trim() || null : null,
            p_employment_type: isWorking ? employmentType || null : null,
            p_student_id: targetStudentId,
        });

        if (error) {
            console.error('submit_employment_status error:', error);
            setInlineError('Something went wrong on our side. Please try again in a moment.');
            return false;
        }
        if (!data?.success) {
            setInlineError(data?.message || 'We could not save your answer. Please try again.');
            return false;
        }
        return true;
    }

    async function handleSubmit(e?: React.FormEvent) {
        e?.preventDefault();
        if (submittingRef.current) return;

        const problem = validate();
        if (problem) {
            setInlineError(problem);
            return;
        }

        submittingRef.current = true;
        setIsSubmitting(true);
        setInlineError('');

        try {
            // Several people (e.g. family members) can share one email address
            const { data: matches, error: findError } = await supabase.rpc('find_employment_students_by_email', {
                p_email: email.trim().toLowerCase(),
            });

            if (!findError && Array.isArray(matches) && matches.length > 1) {
                setMatchingStudents(matches);
                setState('pick');
                return;
            }

            const single: StudentMatch | null = !findError && Array.isArray(matches) && matches.length === 1 ? matches[0] : null;
            const ok = await executeSubmission(single?.student_id ?? null);
            if (ok) {
                setSubmittedName(single?.first_name || '');
                setState('success');
            }
        } catch (err) {
            console.error('Status submission exception:', err);
            setInlineError('Could not connect. Please check your internet connection and try again.');
        } finally {
            submittingRef.current = false;
            setIsSubmitting(false);
        }
    }

    async function handlePickStudent(student: StudentMatch) {
        if (submittingRef.current) return;
        submittingRef.current = true;
        setIsSubmitting(true);
        setInlineError('');
        try {
            const ok = await executeSubmission(student.student_id);
            if (ok) {
                setSubmittedName(student.first_name);
                setState('success');
            }
        } catch (err) {
            console.error('Status submission exception:', err);
            setInlineError('Could not connect. Please check your internet connection and try again.');
        } finally {
            submittingRef.current = false;
            setIsSubmitting(false);
        }
    }

    function resetForm() {
        setState('form');
        setMatchingStudents([]);
        setInlineError('');
    }

    const contactFooter = (subject: string, prompt: string) => (
        <div className="pt-4 border-t border-zinc-800/70 text-center w-full">
            <p className="text-[11px] text-zinc-500">{prompt}</p>
            <a
                href={`mailto:${ORGANIZER_EMAIL}?subject=${encodeURIComponent(subject)}`}
                className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-medium mt-1 underline transition-colors"
            >
                <Mail size={12} /> {ORGANIZER_EMAIL}
            </a>
        </div>
    );

    return (
        <div className="min-h-screen min-h-[100dvh] bg-[#09090B] text-[#FAFAFA] flex flex-col items-center justify-between p-4 sm:p-6 relative overflow-x-hidden selection:bg-indigo-500/30 selection:text-indigo-200">
            {/* Ambient background glow optimized for mobile GPU */}
            <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden transform-gpu" aria-hidden="true">
                <div className="orb absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[460px] h-[460px] sm:w-[780px] sm:h-[780px] text-indigo-500/[0.09]" />
                <div className="orb absolute bottom-1/4 right-1/4 w-[340px] h-[340px] sm:w-[560px] sm:h-[560px] text-purple-500/[0.065]" />
            </div>

            <div className="w-full max-w-md relative z-10 my-auto py-4">
                <div className="bg-[#141417]/95 rounded-2xl border border-zinc-800/90 shadow-2xl shadow-black/50 overflow-hidden flex flex-col transition-all duration-300">

                    {/* ─── Form ─── */}
                    {state === 'form' && (
                        <form onSubmit={handleSubmit} noValidate className="flex flex-col">
                            {/* Header Banner */}
                            <div className="p-5 sm:p-6 pb-4 border-b border-zinc-800/80 bg-gradient-to-b from-indigo-950/20 to-transparent">
                                <div className="flex items-start gap-3.5">
                                    <div className="p-2.5 bg-indigo-500/15 rounded-xl border border-indigo-500/20 text-indigo-400 shrink-0 mt-0.5">
                                        <Briefcase size={22} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <span className="inline-block text-[11px] font-semibold text-indigo-400 uppercase tracking-wider bg-indigo-500/10 px-2 py-0.5 rounded-md mb-1 border border-indigo-500/20">
                                            Participant Update
                                        </span>
                                        <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight leading-snug">
                                            How are things going since your course?
                                        </h2>
                                        <p className="text-xs sm:text-sm text-zinc-400 mt-1.5 leading-relaxed">
                                            Four quick questions — it takes less than a minute.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Form Body */}
                            <div className="p-5 sm:p-6 space-y-5">
                                {/* 1. Email */}
                                <div>
                                    <label htmlFor="status-email" className="block text-xs font-bold text-zinc-400 mb-2 uppercase tracking-wider">
                                        Your Email
                                    </label>
                                    <div className="relative">
                                        <Mail size={17} className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${isSubmitting ? 'text-zinc-600' : 'text-zinc-400'}`} />
                                        <input
                                            id="status-email"
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
                                            className={`${inputClass} pl-10`}
                                        />
                                    </div>

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
                                        Please use the same email address that received our email.
                                    </p>
                                </div>

                                {/* 2. Working? */}
                                <fieldset>
                                    <legend className="block text-xs font-bold text-zinc-400 mb-2 uppercase tracking-wider">
                                        Are you working at the moment?
                                    </legend>
                                    <div className="grid grid-cols-2 gap-2.5">
                                        <button
                                            type="button"
                                            aria-pressed={isWorking === true}
                                            disabled={isSubmitting}
                                            onClick={() => { setIsWorking(true); setInlineError(''); }}
                                            className={choiceClass(isWorking === true, 'emerald')}
                                        >
                                            <CheckCircle size={16} /> Yes, I am
                                        </button>
                                        <button
                                            type="button"
                                            aria-pressed={isWorking === false}
                                            disabled={isSubmitting}
                                            onClick={() => { setIsWorking(false); setInlineError(''); }}
                                            className={choiceClass(isWorking === false, 'amber')}
                                        >
                                            <XCircle size={16} /> Not yet
                                        </button>
                                    </div>
                                </fieldset>

                                {isWorking === true && (
                                    <div className="space-y-5 animate-fadeIn">
                                        {/* 3. Started */}
                                        <fieldset>
                                            <legend className="flex items-center gap-1.5 text-xs font-bold text-zinc-400 mb-2 uppercase tracking-wider">
                                                <CalendarDays size={13} className="text-indigo-400" /> When did you start?
                                            </legend>
                                            <div className="grid grid-cols-[1fr_auto] gap-2.5">
                                                <select
                                                    aria-label="Start month"
                                                    value={startMonth}
                                                    disabled={isSubmitting}
                                                    onChange={(e) => { setStartMonth(e.target.value); setInlineError(''); }}
                                                    className={`${inputClass} cursor-pointer [color-scheme:dark]`}
                                                >
                                                    <option value="">Month</option>
                                                    {MONTHS.map((name, i) => (
                                                        <option key={name} value={String(i + 1)} disabled={i + 1 > maxMonth}>
                                                            {name}
                                                        </option>
                                                    ))}
                                                </select>
                                                <select
                                                    aria-label="Start year"
                                                    value={startYear}
                                                    disabled={isSubmitting}
                                                    onChange={(e) => handleYearChange(e.target.value)}
                                                    className={`${inputClass} cursor-pointer [color-scheme:dark] min-w-[104px]`}
                                                >
                                                    <option value="">Year</option>
                                                    {years.map((y) => (
                                                        <option key={y} value={y}>{y}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </fieldset>

                                        {/* 4. Where */}
                                        <div>
                                            <label htmlFor="status-field" className="flex items-center gap-1.5 text-xs font-bold text-zinc-400 mb-2 uppercase tracking-wider">
                                                <Building2 size={13} className="text-indigo-400" /> Where do you work?
                                            </label>
                                            <input
                                                id="status-field"
                                                type="text"
                                                autoComplete="organization"
                                                maxLength={120}
                                                value={fieldOfWork}
                                                disabled={isSubmitting}
                                                onChange={(e) => { setFieldOfWork(e.target.value); setInlineError(''); }}
                                                placeholder="Company or sector, e.g. Retail, IT"
                                                className={inputClass}
                                            />
                                        </div>

                                        {/* 5. Full / part time */}
                                        <fieldset>
                                            <legend className="flex items-center gap-1.5 text-xs font-bold text-zinc-400 mb-2 uppercase tracking-wider">
                                                <Clock size={13} className="text-indigo-400" /> Full-time or part-time?
                                            </legend>
                                            <div className="grid grid-cols-2 gap-2.5">
                                                <button
                                                    type="button"
                                                    aria-pressed={employmentType === 'full_time'}
                                                    disabled={isSubmitting}
                                                    onClick={() => { setEmploymentType('full_time'); setInlineError(''); }}
                                                    className={choiceClass(employmentType === 'full_time', 'indigo')}
                                                >
                                                    Full-time
                                                </button>
                                                <button
                                                    type="button"
                                                    aria-pressed={employmentType === 'part_time'}
                                                    disabled={isSubmitting}
                                                    onClick={() => { setEmploymentType('part_time'); setInlineError(''); }}
                                                    className={choiceClass(employmentType === 'part_time', 'indigo')}
                                                >
                                                    Part-time
                                                </button>
                                            </div>
                                        </fieldset>
                                    </div>
                                )}

                                {inlineError && (
                                    <div role="alert" className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs sm:text-sm p-3 rounded-xl flex items-start gap-2.5 animate-fadeIn">
                                        <AlertCircle size={16} className="shrink-0 mt-0.5 text-red-400" />
                                        <p className="break-words leading-relaxed">{inlineError}</p>
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 active:scale-[0.98] disabled:opacity-50 text-white font-bold text-base py-3.5 px-6 rounded-xl shadow-lg shadow-emerald-600/30 transition-all touch-manipulation disabled:cursor-not-allowed cursor-pointer"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <Loader2 size={20} className="animate-spin text-white/80" />
                                            <span>Sending...</span>
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle size={19} className="text-white" />
                                            <span>Send My Update</span>
                                        </>
                                    )}
                                </button>

                                <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800 flex items-start gap-2.5 text-[11px] sm:text-xs text-zinc-400 leading-relaxed">
                                    <ShieldCheck size={15} className="text-indigo-400 shrink-0 mt-0.5" />
                                    <span>Your answers are confidential and only used, anonymously, to report on the results of our programmes.</span>
                                </div>

                                {contactFooter('Question about my status update', 'Questions or difficulties? Contact the coordinator:')}
                            </div>
                        </form>
                    )}

                    {/* ─── Shared email: pick your name ─── */}
                    {state === 'pick' && (
                        <div className="flex flex-col animate-fadeIn">
                            <div className="p-5 sm:p-6 pb-4 border-b border-zinc-800/80 bg-gradient-to-b from-indigo-950/20 to-transparent">
                                <div className="flex items-start gap-3.5">
                                    <div className="p-2.5 bg-indigo-500/15 rounded-xl border border-indigo-500/20 text-indigo-400 shrink-0 mt-0.5">
                                        <User size={22} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <h2 className="text-lg font-bold text-white tracking-tight">Who is this update for?</h2>
                                        <p className="text-xs sm:text-sm text-zinc-400 mt-1 leading-relaxed">
                                            More than one person is registered with <strong className="text-zinc-200 break-all">{email}</strong>. Please choose your name.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="p-5 sm:p-6 space-y-3">
                                {matchingStudents.map((student) => (
                                    <button
                                        key={student.student_id}
                                        type="button"
                                        disabled={isSubmitting}
                                        onClick={() => handlePickStudent(student)}
                                        className="w-full text-left p-4 rounded-xl bg-[#09090B] hover:bg-indigo-500/10 border border-zinc-800 hover:border-indigo-500/40 transition-all flex items-center justify-between group touch-manipulation disabled:opacity-60 disabled:cursor-not-allowed"
                                    >
                                        <span className="font-semibold text-sm text-white group-hover:text-indigo-200">
                                            {student.first_name} {student.last_name}
                                        </span>
                                        {isSubmitting ? (
                                            <Loader2 size={16} className="animate-spin text-indigo-400" />
                                        ) : (
                                            <span className="text-xs text-zinc-500 group-hover:text-indigo-300 font-medium">Select →</span>
                                        )}
                                    </button>
                                ))}

                                {inlineError && (
                                    <div role="alert" className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs sm:text-sm p-3 rounded-xl flex items-start gap-2.5">
                                        <AlertCircle size={16} className="shrink-0 mt-0.5" />
                                        <p className="break-words leading-relaxed">{inlineError}</p>
                                    </div>
                                )}

                                <button
                                    type="button"
                                    onClick={resetForm}
                                    disabled={isSubmitting}
                                    className="w-full text-center text-xs text-zinc-500 hover:text-zinc-300 transition-colors py-2 touch-manipulation"
                                >
                                    ← Back to the form
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ─── Success ─── */}
                    {state === 'success' && (
                        <div className="p-6 sm:p-8 flex flex-col items-center gap-4 text-center animate-fadeIn">
                            <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center border border-emerald-500/20">
                                <CheckCircle size={34} className="text-emerald-400" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-white">
                                    Thank you{submittedName ? `, ${submittedName}` : ''}!
                                </h2>
                                <p className="text-zinc-400 text-sm leading-relaxed mt-1.5 max-w-xs mx-auto">
                                    Your update has been received. It really helps us improve our courses for future participants.
                                </p>
                            </div>

                            <div className="w-full p-4 rounded-xl bg-zinc-900/80 border border-zinc-800 text-left space-y-2.5 text-sm">
                                <SummaryRow label="Status" value={isWorking ? 'Working' : 'Not working yet'} />
                                {isWorking && (
                                    <>
                                        <SummaryRow label="Started" value={formatStartedMonth(startedMonthValue)} />
                                        <SummaryRow label="Where" value={fieldOfWork.trim()} />
                                        <SummaryRow label="Hours" value={employmentType === 'full_time' ? 'Full-time' : 'Part-time'} />
                                    </>
                                )}
                            </div>

                            {!isWorking && (
                                <p className="text-xs text-zinc-400 leading-relaxed">
                                    Looking for work or another course? We're happy to help — just drop us an email.
                                </p>
                            )}

                            <button
                                type="button"
                                onClick={resetForm}
                                className="text-xs text-zinc-500 hover:text-zinc-300 underline transition-colors touch-manipulation"
                            >
                                Made a mistake? Submit again
                            </button>

                            {contactFooter('Status update follow-up', 'Anything else you would like to tell us?')}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-center gap-1 text-[11px] text-zinc-500 mt-4 text-center">
                    <HelpCircle size={13} className="text-zinc-600" />
                    <span>Cork City Partnership • Participant Update</span>
                </div>
            </div>

            {/* Bottom spacer on mobile */}
            <div className="w-full h-2 relative z-0" aria-hidden="true" />
        </div>
    );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-start justify-between gap-3">
            <span className="text-zinc-500 text-xs uppercase tracking-wider font-semibold pt-0.5">{label}</span>
            <span className="text-zinc-100 font-medium text-right break-words min-w-0">{value}</span>
        </div>
    );
}
