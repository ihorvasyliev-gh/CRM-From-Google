// Shared by the Outcomes graduates table and the External lists (OutreachLists).
import { Briefcase, CheckCircle, Loader2, Mail, Phone, PhoneMissed, Send } from 'lucide-react';
import { formatDisplayDate } from '../lib/dateUtils';
import type { MouseEvent } from 'react';

type TrackingStatus = 'not_contacted' | 'pending' | 'responded';

const pillCls = 'inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full';

export function TrackingBadge({ status }: { status: TrackingStatus }) {
    if (status === 'responded') return <span className={`${pillCls} bg-success/15 text-status-confirmed`}><CheckCircle size={10} /> Responded</span>;
    if (status === 'pending') return <span className={`${pillCls} bg-info/15 text-status-invited`}><Send size={10} /> Pending</span>;
    return <span className={`${pillCls} bg-muted/15 text-muted`}><Mail size={10} /> Not Contacted</span>;
}

export function EmploymentBadge({ status, row }: {
    status: TrackingStatus;
    row: { is_working: boolean | null; employment_type: string | null; field_of_work: string | null };
}) {
    if (status !== 'responded') return <span className="text-xs text-muted italic">No data</span>;
    if (!row.is_working) return <span className={`${pillCls} bg-orange-500/15 text-orange-800 dark:text-orange-300`}>Not working</span>;
    const type = row.employment_type === 'full_time' ? 'Full-time' : row.employment_type === 'part_time' ? 'Part-time' : '';
    return (
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <span className={`${pillCls} bg-success/15 text-status-confirmed`}>
                <Briefcase size={10} /> Working {type && `· ${type}`}
            </span>
            {row.field_of_work && <span className="text-xs text-muted">in {row.field_of_work}</span>}
        </div>
    );
}

/**
 * "Called, no answer" mark for a row that hasn't answered the survey. It never changes
 * the tracking status: it only shows who was already phoned, and when. Click to set or clear.
 */
export function CallMarkButton({ status, calledAt, busy, onToggle, name }: {
    status: TrackingStatus;
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

/** Shows a phone number as a link that starts a call. */
export function PhoneLink({ phone }: { phone: string | null | undefined }) {
    if (!phone) return null;
    return (
        <a
            href={`tel:${phone.replace(/[^\d+]/g, '')}`}
            onClick={e => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-xs text-muted hover:text-brand-500 truncate"
        >
            <Phone size={10} className="shrink-0" /> {phone}
        </a>
    );
}
