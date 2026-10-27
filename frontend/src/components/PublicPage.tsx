import { useEffect, type ComponentType, type ReactNode } from 'react';
import { AlertCircle, Mail, Sparkles } from 'lucide-react';
import { suggestEmailCorrection } from '../lib/emailValidation';
import FieldError from './ui/FieldError';

/**
 * Building blocks of the pages people open from our emails (course confirmation, participant
 * update): the logo they know, one card, and the page's name in the browser tab. These pages
 * follow the phone's light/dark setting like the rest of the app.
 */

export const ORGANIZER_EMAIL = 'ivasyliev@partnershipcork.ie';

export const publicInputCls =
    'w-full bg-surface text-primary text-[16px] sm:text-sm rounded-xl border border-border-strong px-4 py-3 ' +
    'placeholder:text-muted focus:outline-hidden focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 ' +
    'transition-colors disabled:opacity-60 disabled:cursor-not-allowed touch-manipulation';

/** A question on the form ("Are you working at the moment?") */
export const publicLabelCls = 'block text-sm font-semibold text-primary mb-2';

/** The main action (Confirm, Send) */
export const primaryButtonCls =
    'w-full flex items-center justify-center gap-2 bg-emerald-700 hover:bg-emerald-800 active:scale-[0.98] text-white ' +
    'font-bold text-base py-3.5 px-6 rounded-xl shadow-md shadow-emerald-700/20 transition-all touch-manipulation ' +
    'disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer';

/** A quieter full-width action (Back, I can't make it) */
export const secondaryButtonCls =
    'w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-border-strong bg-surface ' +
    'hover:bg-surface-elevated text-primary text-sm font-semibold transition-colors active:scale-[0.99] ' +
    'touch-manipulation cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';

export function PublicLayout({ title, footer, children }: { title: string; footer: string; children: ReactNode }) {
    useEffect(() => {
        document.title = `${title} · Cork City Partnership`;
    }, [title]);

    return (
        <div className="min-h-screen min-h-dvh bg-background text-primary flex flex-col items-center p-4 sm:p-6 relative overflow-x-hidden">
            <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden transform-gpu" aria-hidden="true">
                <div className="orb absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[460px] h-[460px] sm:w-[780px] sm:h-[780px] text-brand-500/9" />
            </div>
            <main className="w-full max-w-md relative z-10 my-auto py-2 sm:py-4">
                <div className="rounded-2xl bg-white px-5 py-3.5 shadow-card ring-1 ring-black/5 mb-4">
                    <img src="/logos-banner-sm.webp" alt="Cork City Partnership · SICAP" width={800} height={154} className="w-full h-auto" />
                </div>
                <div className="bg-surface rounded-2xl border border-border-subtle shadow-card overflow-hidden">
                    {children}
                </div>
                <p className="text-xs text-muted mt-4 text-center">{footer}</p>
            </main>
        </div>
    );
}

type Tone = 'brand' | 'danger' | 'warning' | 'success';

const TONES: Record<Tone, { icon: string; chip: string; band: string }> = {
    brand: {
        icon: 'bg-brand-500/10 border-brand-500/20 text-brand-600 dark:text-brand-400',
        chip: 'bg-brand-500/10 border-brand-500/20 text-brand-700 dark:text-brand-300',
        band: 'from-brand-500/6',
    },
    danger: {
        icon: 'bg-danger/10 border-danger/25 text-status-rejected',
        chip: 'bg-danger/10 border-danger/25 text-status-rejected',
        band: 'from-danger/6',
    },
    warning: {
        icon: 'bg-warning/15 border-warning/30 text-status-requested',
        chip: 'bg-warning/15 border-warning/30 text-status-requested',
        band: 'from-warning/8',
    },
    success: {
        icon: 'bg-success/15 border-success/30 text-status-confirmed',
        chip: 'bg-success/15 border-success/30 text-status-confirmed',
        band: 'from-success/8',
    },
};

/**
 * Top of the card: icon, a small label ("Course invitation"), the page's heading and what follows
 * it; `below` spans the whole width under them (the places meter).
 */
export function PublicCardHeader({ icon: Icon, eyebrow, title, tone = 'brand', children, below }: {
    icon: ComponentType<{ size?: number }>;
    eyebrow?: string;
    title: ReactNode;
    tone?: Tone;
    children?: ReactNode;
    below?: ReactNode;
}) {
    const t = TONES[tone];
    return (
        <div className={`p-5 sm:p-6 pb-4 border-b border-border-subtle bg-linear-to-b ${t.band} to-transparent`}>
            <div className="flex items-start gap-3.5">
                <div className={`p-2.5 rounded-xl border shrink-0 mt-0.5 ${t.icon}`} aria-hidden="true">
                    <Icon size={22} />
                </div>
                <div className="min-w-0 flex-1">
                    {eyebrow && (
                        <span className={`inline-block text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md mb-1 border ${t.chip}`}>
                            {eyebrow}
                        </span>
                    )}
                    <h1 className="text-lg sm:text-xl font-bold text-primary tracking-tight leading-snug wrap-break-word">{title}</h1>
                    {children}
                </div>
            </div>
            {below}
        </div>
    );
}

/** A whole-card message: done, link expired, could not load */
export function PublicMessage({ icon: Icon, tone, title, children }: {
    icon: ComponentType<{ size?: number }>;
    tone: Tone;
    title: ReactNode;
    children?: ReactNode;
}) {
    return (
        <div className="p-6 sm:p-8 flex flex-col items-center gap-4 text-center animate-fadeIn">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center border ${TONES[tone].icon}`} aria-hidden="true">
                <Icon size={32} />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-primary tracking-tight wrap-break-word">{title}</h1>
            {children}
        </div>
    );
}

/** Email field with "Did you mean …?" for common typos (gmial.com) and its error underneath */
export function PublicEmailField({ id, label, value, onChange, error, hint, disabled, placeholder = 'name@example.com' }: {
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    error?: string;
    hint?: string;
    disabled?: boolean;
    placeholder?: string;
}) {
    const suggestion = suggestEmailCorrection(value);
    const showSuggestion = suggestion && suggestion !== value;
    const describedBy = [error && `${id}-error`, hint && `${id}-hint`].filter(Boolean).join(' ') || undefined;

    return (
        <div>
            <label htmlFor={id} className={publicLabelCls}>{label}</label>
            <div className="relative">
                <Mail size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" aria-hidden="true" />
                <input
                    id={id}
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={value}
                    disabled={disabled}
                    onChange={e => onChange(e.target.value.toLowerCase())}
                    onBlur={() => onChange(value.trim().toLowerCase())}
                    placeholder={placeholder}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={describedBy}
                    className={`${publicInputCls} pl-10`}
                />
            </div>
            <FieldError id={id} message={error} />

            {showSuggestion && (
                <div className="mt-2.5 flex items-center justify-between gap-2 p-2.5 bg-brand-500/8 border border-brand-500/25 rounded-xl text-sm text-primary animate-fadeIn">
                    <div className="flex items-center gap-2 min-w-0">
                        <Sparkles size={15} className="text-brand-600 dark:text-brand-400 shrink-0" aria-hidden="true" />
                        <p className="min-w-0 break-all">
                            Did you mean <strong className="font-semibold">{suggestion}</strong>?
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => onChange(suggestion)}
                        className="shrink-0 px-3 py-1.5 bg-brand-700 hover:bg-brand-800 active:scale-95 text-white font-semibold rounded-lg text-sm transition-all touch-manipulation hit-area"
                    >
                        Fix
                    </button>
                </div>
            )}

            {hint && <p id={`${id}-hint`} className="text-xs text-muted mt-2 leading-normal">{hint}</p>}
        </div>
    );
}

/** A problem with the whole form (server or network), shown next to the main button */
export function PublicAlert({ children, action }: { children: ReactNode; action?: ReactNode }) {
    return (
        <div role="alert" className="bg-danger/8 border border-danger/25 text-status-rejected text-sm p-3 rounded-xl flex items-start justify-between gap-2 animate-fadeIn">
            <div className="flex items-start gap-2.5 min-w-0">
                <AlertCircle size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
                <p className="wrap-break-word leading-relaxed">{children}</p>
            </div>
            {action}
        </div>
    );
}

/** "Questions or difficulties?" + the coordinator's address, at the bottom of the card */
export function ContactFooter({ prompt, subject }: { prompt: string; subject: string }) {
    return (
        <div className="pt-4 border-t border-border-subtle text-center w-full">
            <p className="text-xs text-muted">{prompt}</p>
            <a
                href={`mailto:${ORGANIZER_EMAIL}?subject=${encodeURIComponent(subject)}`}
                className="hit-area inline-flex items-center gap-1.5 text-sm text-brand-700 dark:text-brand-300 hover:text-brand-800 dark:hover:text-brand-200 font-medium mt-1 py-1 underline underline-offset-2 transition-colors"
            >
                <Mail size={13} aria-hidden="true" /> {ORGANIZER_EMAIL}
            </a>
        </div>
    );
}
