// Shared by the Outcomes graduates table and the External lists (OutreachLists).
import { useState, useEffect, type MouseEvent } from 'react';
import { AlertCircle, Briefcase, CheckCircle, Loader2, Mail, MailX, Phone, PhoneMissed, Send } from 'lucide-react';
import { formatDisplayDate } from '../lib/dateUtils';
import { employmentTypeLabel, type OutcomeTrackingStatus } from '../lib/employmentTypes';
import { formatPhoneDisplay, formatPhoneForCall } from '../lib/contactUtils';
import { useIsMobile } from '../hooks/useScreenSize';

const pillCls = 'inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full';

/** A computer with a mouse (not a phone or a tablet): a click on a phone number copies it there. */
function hasMouse(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

export function TrackingBadge({ status }: { status: OutcomeTrackingStatus }) {
    if (status === 'responded') return <span className={`${pillCls} bg-success/15 text-status-confirmed`}><CheckCircle size={10} /> Responded</span>;
    if (status === 'pending') return <span className={`${pillCls} bg-info/15 text-status-invited`}><Send size={10} /> Pending</span>;
    return <span className={`${pillCls} bg-muted/15 text-muted`}><Mail size={10} /> Not Contacted</span>;
}

export function EmploymentBadge({ status, row }: {
    status: OutcomeTrackingStatus;
    row: { is_working: boolean | null; employment_type: string | null; field_of_work: string | null };
}) {
    const typeLabel = employmentTypeLabel(row.employment_type);

    if (status === 'responded' && row.is_working === true) {
        return (
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                <span className={`${pillCls} bg-success/15 text-status-confirmed`}>
                    <Briefcase size={10} /> Working{typeLabel ? ` · ${typeLabel}` : ''}
                </span>
                {row.field_of_work && <span className="text-xs text-muted">in {row.field_of_work}</span>}
            </div>
        );
    }

    if (status === 'responded' && row.is_working === false) {
        return <span className={`${pillCls} bg-orange-500/15 text-orange-800 dark:text-orange-300`}>Not working</span>;
    }

    if (status === 'pending' && row.is_working === false) {
        return (
            <span
                className={`${pillCls} font-semibold border border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-300`}
                title="Previously answered Not working — awaiting follow-up reply"
            >
                Previously: Not working
            </span>
        );
    }

    if (status === 'pending' && row.is_working === true) {
        return (
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                <span
                    className={`${pillCls} font-semibold border border-success/30 bg-success/10 text-status-confirmed`}
                    title="Previously answered Working — awaiting follow-up reply"
                >
                    <Briefcase size={10} /> Previously: Working{typeLabel ? ` · ${typeLabel}` : ''}
                </span>
                {row.field_of_work && <span className="text-xs text-muted">in {row.field_of_work}</span>}
            </div>
        );
    }

    return <span className="text-xs text-muted italic">No data</span>;
}

/**
 * "Called, no answer" mark for a row that hasn't answered the survey. It never changes
 * the tracking status: it only shows who was already phoned, and when. Click to set or clear.
 */
export function CallMarkButton({ status, calledAt, busy, onToggle, name }: {
    status: OutcomeTrackingStatus;
    calledAt: string | null | undefined;
    busy?: boolean;
    onToggle: () => void;
    name: string;
}) {
    if (status === 'responded') return null;
    const click = (e: MouseEvent) => { e.stopPropagation(); if (!busy) onToggle(); };
    if (calledAt) {
        return (
            <button
                type="button"
                onClick={click}
                disabled={busy}
                aria-pressed="true"
                aria-label={`${name}: called, no answer on ${formatDisplayDate(calledAt)}. Click to clear`}
                title="Called, didn't pick up. Click to clear"
                className={`${pillCls} bg-warning/15 text-status-requested hover:bg-warning/25 transition-colors disabled:opacity-60`}
            >
                {busy ? <Loader2 size={10} className="animate-spin" /> : <PhoneMissed size={10} />} No answer · {formatDisplayDate(calledAt)}
            </button>
        );
    }
    return (
        <button
            type="button"
            onClick={click}
            disabled={busy}
            aria-pressed="false"
            aria-label={`Mark ${name} as called, no answer`}
            title="Phoned and they didn't pick up? Mark it here (the status stays as it is)"
            className={`${pillCls} font-semibold border border-dashed border-border-strong text-muted hover:text-primary hover:border-brand-500/50 transition-colors disabled:opacity-60`}
        >
            {busy ? <Loader2 size={10} className="animate-spin" /> : <Phone size={10} />} Called, no answer
        </button>
    );
}

/**
 * Shows a formatted phone number. On desktop (with a mouse) clicking copies it to the
 * clipboard and briefly displays "Copied"; on mobile/touch it dials via tel:.
 */
export function PhoneLink({ phone }: { phone: string | null | undefined }) {
    const isMobile = useIsMobile();
    const [phoneCopied, setPhoneCopied] = useState(false);

    useEffect(() => {
        if (!phoneCopied) return;
        const timer = setTimeout(() => setPhoneCopied(false), 1500);
        return () => clearTimeout(timer);
    }, [phoneCopied]);

    if (!phone?.trim()) return null;

    const display = formatPhoneDisplay(phone);
    const telUrl = formatPhoneForCall(phone);
    const copiesPhone = !isMobile && hasMouse();

    const copyPhone = (number: string) => {
        navigator.clipboard?.writeText(number)
            .then(() => setPhoneCopied(true))
            .catch(() => { /* the number stays visible to copy by hand */ });
    };

    if (telUrl) {
        return (
            <a
                href={telUrl}
                onClick={e => {
                    e.stopPropagation();
                    if (copiesPhone) {
                        e.preventDefault();
                        copyPhone(display);
                    }
                }}
                className={`inline-flex items-center gap-1 text-xs tabular-nums transition-colors truncate ${
                    phoneCopied ? 'text-status-confirmed font-semibold' : 'text-muted hover:text-brand-500'
                }`}
                title={copiesPhone ? 'Click to copy the number' : 'Click to call'}
            >
                <Phone size={10} className="shrink-0" />
                <span className="truncate" aria-live="polite">{phoneCopied ? 'Copied' : display}</span>
            </a>
        );
    }

    return (
        <span className="inline-flex items-center gap-1 text-xs tabular-nums text-muted truncate" title={phone}>
            <Phone size={10} className="shrink-0" />
            <span className="truncate">{display}</span>
        </span>
    );
}

/** Subtle status badge when a person cannot be emailed (missing email or unsubscribed). */
export function EmailStatusBadges({ email, optedOut }: { email?: string | null; optedOut?: boolean }) {
    if (!email?.trim()) {
        return (
            <span
                className={`${pillCls} bg-warning/15 text-status-requested font-semibold`}
                title="No email address on file — skipped automatically"
            >
                <AlertCircle size={10} /> No email
            </span>
        );
    }
    if (optedOut) {
        return (
            <span
                className={`${pillCls} bg-danger/10 text-status-rejected font-semibold`}
                title="Unsubscribed from emails — skipped automatically"
            >
                <MailX size={10} /> Unsubscribed
            </span>
        );
    }
    return null;
}
