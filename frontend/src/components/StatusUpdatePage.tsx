import { useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
    ArrowLeft,
    Briefcase,
    CheckCircle,
    ChevronDown,
    Loader2,
    ShieldCheck,
    User,
    XCircle,
} from 'lucide-react';
import { todayISO } from '../lib/dateUtils';
import { emailProblem } from '../lib/emailValidation';
import FieldError from './ui/FieldError';
import {
    ContactFooter,
    PublicAlert,
    PublicCardHeader,
    PublicEmailField,
    PublicLayout,
    primaryButtonCls,
    publicInputCls,
    publicLabelCls,
    secondaryButtonCls,
} from './PublicPage';

type PageState = 'form' | 'pick' | 'success';
type EmploymentType = 'full_time' | 'part_time';
type Field = 'email' | 'working' | 'started' | 'field' | 'hours';

interface StudentMatch {
    student_id: string;
    first_name: string;
    last_name: string;
}

const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

/** How many years back the "started" year list goes. */
const YEARS_BACK = 10;

function choiceClass(selected: boolean, tone: 'success' | 'warning' | 'brand') {
    const active = {
        success: 'bg-success/15 text-status-confirmed border-success/60',
        warning: 'bg-warning/15 text-status-requested border-warning/60',
        brand: 'bg-brand-500/10 text-brand-700 dark:text-brand-300 border-brand-500/60',
    }[tone];
    return `flex items-center justify-center gap-2 py-3 px-3 rounded-xl text-sm font-semibold border-2 transition-all active:scale-[0.98] touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed ${
        selected ? active : 'bg-surface text-primary border-border-strong hover:border-brand-500/50'
    }`;
}

function formatStartedMonth(value: string) {
    const [y, m] = value.split('-').map(Number);
    if (!y || !m) return value;
    return `${MONTHS[m - 1]} ${y}`;
}

export default function StatusUpdatePage() {
    // /status?list=<id> is the link sent to an external outreach list (e.g. Action 11);
    // answers then go to that list only, never to CRM graduates.
    const [listId] = useState(() => new URLSearchParams(window.location.search).get('list'));
    const [state, setState] = useState<PageState>('form');
    const [email, setEmail] = useState('');
    const [isWorking, setIsWorking] = useState<boolean | null>(null);
    const [startedMonth, setStartedMonth] = useState('');
    const [startedYear, setStartedYear] = useState('');
    const [fieldOfWork, setFieldOfWork] = useState('');
    const [employmentType, setEmploymentType] = useState<EmploymentType | ''>('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
    const [inlineError, setInlineError] = useState('');
    const [matchingStudents, setMatchingStudents] = useState<StudentMatch[]>([]);
    const [submittedName, setSubmittedName] = useState('');

    // Guard against double-submit
    const submittingRef = useRef(false);
    // Where to move focus when a field needs fixing
    const fieldRefs = useRef<Partial<Record<Field, HTMLElement | null>>>({});

    // Don't allow a start month in the future
    const thisMonth = todayISO().slice(0, 7);
    const thisYear = Number(thisMonth.slice(0, 4));
    const years = Array.from({ length: YEARS_BACK + 1 }, (_, i) => String(thisYear - i));
    const startedMonthValue = startedYear && startedMonth ? `${startedYear}-${startedMonth.padStart(2, '0')}` : '';

    function clearError(field: Field) {
        setInlineError('');
        setErrors(prev => {
            if (!prev[field]) return prev;
            const rest = { ...prev };
            delete rest[field];
            return rest;
        });
    }

    function validate(): Partial<Record<Field, string>> {
        const found: Partial<Record<Field, string>> = {};
        const badEmail = emailProblem(email);
        if (badEmail) found.email = badEmail;
        if (isWorking === null) found.working = 'Choose Yes or Not yet';
        if (isWorking) {
            if (!startedMonthValue) found.started = 'Choose the month and year you started working';
            else if (startedMonthValue > thisMonth) found.started = "That month hasn't started yet";
            if (!fieldOfWork.trim()) found.field = 'Tell us where you work (company or sector)';
            if (!employmentType) found.hours = 'Choose Full-time or Part-time';
        }
        return found;
    }

    async function executeSubmission(targetStudentId: string | null) {
        const answers = {
            p_email: email.trim().toLowerCase(),
            p_is_working: isWorking,
            p_started_month: isWorking ? startedMonthValue || null : null,
            p_field: isWorking ? fieldOfWork.trim() || null : null,
            p_employment_type: isWorking ? employmentType || null : null,
        };
        const { data, error } = listId
            ? await supabase.rpc('submit_outreach_status', { p_list_id: listId, ...answers })
            : await supabase.rpc('submit_employment_status', { ...answers, p_student_id: targetStudentId });

        if (error) {
            console.error('submit_employment_status error:', error);
            setInlineError('Something went wrong on our side. Please try again in a moment.');
            return false;
        }
        if (!data?.success) {
            setInlineError(data?.message || 'We could not save your answer. Please try again.');
            return false;
        }
        if (listId) setSubmittedName(data.first_name || '');
        return true;
    }

    async function handleSubmit(e?: React.FormEvent) {
        e?.preventDefault();
        if (submittingRef.current) return;

        const found = validate();
        setErrors(found);
        const first = (['email', 'working', 'started', 'field', 'hours'] as Field[]).find(f => found[f]);
        if (first) {
            fieldRefs.current[first]?.focus();
            return;
        }

        submittingRef.current = true;
        setIsSubmitting(true);
        setInlineError('');

        try {
            if (listId) {
                if (await executeSubmission(null)) setState('success');
                return;
            }

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

    const errorProps = (field: Field, id: string) => errors[field]
        ? { 'aria-invalid': true as const, 'aria-describedby': `${id}-error` }
        : {};

    return (
        <PublicLayout title="Participant update" footer="Cork City Partnership · Participant update">
            {/* ─── Form ─── */}
            {state === 'form' && (
                <form onSubmit={handleSubmit} noValidate className="flex flex-col">
                    <PublicCardHeader
                        icon={Briefcase}
                        eyebrow="Participant update"
                        title={listId ? 'How are things going?' : 'How are things going since your course?'}
                    >
                        <p className="text-sm text-muted mt-1.5 leading-relaxed">
                            A few quick questions. It takes less than a minute.
                        </p>
                    </PublicCardHeader>

                    <div className="p-5 sm:p-6 space-y-6">
                        <div ref={el => { fieldRefs.current.email = el?.querySelector('input') ?? null; }}>
                            <PublicEmailField
                                id="status-email"
                                label="Your email"
                                value={email}
                                disabled={isSubmitting}
                                onChange={v => { setEmail(v); clearError('email'); }}
                                error={errors.email}
                                hint="Please use the same email address that received our email."
                            />
                        </div>

                        <fieldset>
                            <legend className={publicLabelCls}>Are you working at the moment?</legend>
                            <div className="grid grid-cols-2 gap-2.5">
                                <button
                                    type="button"
                                    ref={el => { fieldRefs.current.working = el; }}
                                    aria-pressed={isWorking === true}
                                    disabled={isSubmitting}
                                    onClick={() => { setIsWorking(true); clearError('working'); }}
                                    className={choiceClass(isWorking === true, 'success')}
                                    {...errorProps('working', 'status-working')}
                                >
                                    <CheckCircle size={16} aria-hidden="true" /> Yes, I am
                                </button>
                                <button
                                    type="button"
                                    aria-pressed={isWorking === false}
                                    disabled={isSubmitting}
                                    onClick={() => { setIsWorking(false); clearError('working'); }}
                                    className={choiceClass(isWorking === false, 'warning')}
                                >
                                    <XCircle size={16} aria-hidden="true" /> Not yet
                                </button>
                            </div>
                            <FieldError id="status-working" message={errors.working} />
                        </fieldset>

                        {isWorking === true && (
                            <div className="space-y-6 animate-fadeIn">
                                <fieldset>
                                    <legend className={publicLabelCls}>When did you start?</legend>
                                    <div className="grid grid-cols-[3fr_2fr] gap-2.5">
                                        <SelectBox
                                            selectRef={el => { fieldRefs.current.started = el; }}
                                            label="Start month"
                                            value={startedMonth}
                                            disabled={isSubmitting}
                                            onChange={v => { setStartedMonth(v); clearError('started'); }}
                                            placeholder="Month"
                                            options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
                                            {...errorProps('started', 'status-started')}
                                        />
                                        <SelectBox
                                            label="Start year"
                                            value={startedYear}
                                            disabled={isSubmitting}
                                            onChange={v => { setStartedYear(v); clearError('started'); }}
                                            placeholder="Year"
                                            options={years.map(y => ({ value: y, label: y }))}
                                            {...errorProps('started', 'status-started')}
                                        />
                                    </div>
                                    <FieldError id="status-started" message={errors.started} />
                                </fieldset>

                                <div>
                                    <label htmlFor="status-field" className={publicLabelCls}>Where do you work?</label>
                                    <input
                                        id="status-field"
                                        ref={el => { fieldRefs.current.field = el; }}
                                        type="text"
                                        autoComplete="organization"
                                        maxLength={120}
                                        value={fieldOfWork}
                                        disabled={isSubmitting}
                                        onChange={e => { setFieldOfWork(e.target.value); clearError('field'); }}
                                        placeholder="Company or sector, e.g. Retail, IT"
                                        className={publicInputCls}
                                        {...errorProps('field', 'status-field')}
                                    />
                                    <FieldError id="status-field" message={errors.field} />
                                </div>

                                <fieldset>
                                    <legend className={publicLabelCls}>Full-time or part-time?</legend>
                                    <div className="grid grid-cols-2 gap-2.5">
                                        <button
                                            type="button"
                                            ref={el => { fieldRefs.current.hours = el; }}
                                            aria-pressed={employmentType === 'full_time'}
                                            disabled={isSubmitting}
                                            onClick={() => { setEmploymentType('full_time'); clearError('hours'); }}
                                            className={choiceClass(employmentType === 'full_time', 'brand')}
                                            {...errorProps('hours', 'status-hours')}
                                        >
                                            Full-time
                                        </button>
                                        <button
                                            type="button"
                                            aria-pressed={employmentType === 'part_time'}
                                            disabled={isSubmitting}
                                            onClick={() => { setEmploymentType('part_time'); clearError('hours'); }}
                                            className={choiceClass(employmentType === 'part_time', 'brand')}
                                        >
                                            Part-time
                                        </button>
                                    </div>
                                    <FieldError id="status-hours" message={errors.hours} />
                                </fieldset>
                            </div>
                        )}

                        <div className="space-y-3">
                            {inlineError && <PublicAlert>{inlineError}</PublicAlert>}

                            <button type="submit" disabled={isSubmitting} className={primaryButtonCls}>
                                {isSubmitting ? (
                                    <>
                                        <Loader2 size={20} className="animate-spin" aria-hidden="true" />
                                        <span>Sending...</span>
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle size={19} aria-hidden="true" />
                                        <span>Send My Update</span>
                                    </>
                                )}
                            </button>
                        </div>

                        <p className="flex items-start gap-2.5 text-xs text-muted leading-relaxed">
                            <ShieldCheck size={15} className="text-brand-600 dark:text-brand-400 shrink-0 mt-0.5" aria-hidden="true" />
                            <span>Your answers are confidential. We only use them to report on our programmes, without names.</span>
                        </p>

                        <ContactFooter prompt="Questions or difficulties?" subject="Question about my status update" />
                    </div>
                </form>
            )}

            {/* ─── Shared email: pick your name ─── */}
            {state === 'pick' && (
                <div className="flex flex-col animate-fadeIn">
                    <PublicCardHeader icon={User} title="Who is this update for?">
                        <p className="text-sm text-muted mt-1 leading-relaxed">
                            More than one person is registered with <strong className="text-primary break-all">{email}</strong>. Please choose your name.
                        </p>
                    </PublicCardHeader>

                    <div className="p-5 sm:p-6 space-y-3">
                        {matchingStudents.map((student) => (
                            <button
                                key={student.student_id}
                                type="button"
                                disabled={isSubmitting}
                                onClick={() => handlePickStudent(student)}
                                className="w-full text-left p-4 rounded-xl bg-surface hover:bg-brand-500/8 border border-border-strong hover:border-brand-500/50 transition-colors flex items-center justify-between gap-3 touch-manipulation disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                <span className="font-semibold text-base text-primary">
                                    {student.first_name} {student.last_name}
                                </span>
                                {isSubmitting
                                    ? <Loader2 size={16} className="animate-spin text-brand-600 dark:text-brand-400" aria-hidden="true" />
                                    : <span className="text-sm text-brand-700 dark:text-brand-300 font-semibold" aria-hidden="true">Select</span>}
                            </button>
                        ))}

                        {inlineError && <PublicAlert>{inlineError}</PublicAlert>}

                        <button type="button" onClick={resetForm} disabled={isSubmitting} className={secondaryButtonCls}>
                            <ArrowLeft size={15} aria-hidden="true" /> Back to the form
                        </button>
                    </div>
                </div>
            )}

            {/* ─── Success ─── */}
            {state === 'success' && (
                <div className="p-6 sm:p-8 flex flex-col items-center gap-4 text-center animate-fadeIn">
                    <div className="w-16 h-16 bg-success/15 rounded-2xl flex items-center justify-center border border-success/30" aria-hidden="true">
                        <CheckCircle size={34} className="text-status-confirmed" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-primary">
                            Thank you{submittedName ? `, ${submittedName}` : ''}!
                        </h1>
                        <p className="text-muted text-sm leading-relaxed mt-1.5 max-w-xs mx-auto">
                            Your update has been received. It really helps us improve our {listId ? 'services' : 'courses'} for future participants.
                        </p>
                    </div>

                    <dl className="w-full p-4 rounded-xl bg-surface-elevated/60 border border-border-subtle text-left space-y-2.5 text-sm">
                        <SummaryRow label="Status" value={isWorking ? 'Working' : 'Not working yet'} />
                        {isWorking && (
                            <>
                                <SummaryRow label="Started" value={formatStartedMonth(startedMonthValue)} />
                                <SummaryRow label="Where" value={fieldOfWork.trim()} />
                                <SummaryRow label="Hours" value={employmentType === 'full_time' ? 'Full-time' : 'Part-time'} />
                            </>
                        )}
                    </dl>

                    {!isWorking && (
                        <p className="text-sm text-muted leading-relaxed">
                            Looking for work or another course? We're happy to help. Just drop us an email.
                        </p>
                    )}

                    <button
                        type="button"
                        onClick={resetForm}
                        className="hit-area text-sm text-muted hover:text-primary underline underline-offset-2 transition-colors touch-manipulation py-1"
                    >
                        Made a mistake? Submit again
                    </button>

                    <ContactFooter prompt="Anything else you would like to tell us?" subject="Status update follow-up" />
                </div>
            )}
        </PublicLayout>
    );
}

/** A native list (the phone's own picker) styled like the other fields */
function SelectBox({ label, value, onChange, options, placeholder, disabled, selectRef, ...aria }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    options: { value: string; label: string }[];
    placeholder: string;
    disabled?: boolean;
    selectRef?: (el: HTMLSelectElement | null) => void;
    'aria-invalid'?: true;
    'aria-describedby'?: string;
}) {
    return (
        <div className="relative">
            <select
                ref={selectRef}
                aria-label={label}
                value={value}
                disabled={disabled}
                onChange={e => onChange(e.target.value)}
                className={`${publicInputCls} appearance-none pr-10 cursor-pointer ${value ? '' : 'text-muted'}`}
                {...aria}
            >
                <option value="" disabled>{placeholder}</option>
                {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <ChevronDown size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" aria-hidden="true" />
        </div>
    );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-start justify-between gap-3">
            <dt className="text-muted text-xs uppercase tracking-wider font-semibold pt-0.5">{label}</dt>
            <dd className="text-primary font-medium text-right wrap-break-word min-w-0">{value}</dd>
        </div>
    );
}
