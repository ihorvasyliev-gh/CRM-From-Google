import React, { useId } from 'react';
import {
    CheckCircle,
    ChevronDown,
    Clock,
    GraduationCap,
    LogOut,
    Send,
    Star,
    XCircle,
} from 'lucide-react';

const STATUS_BADGE_META: Record<string, { label: string; icon: React.ReactElement; pill: string }> = {
    requested: { label: 'In queue', icon: <Clock size={12} />, pill: 'status-pill-requested' },
    invited: { label: 'Invited', icon: <Send size={12} />, pill: 'status-pill-invited' },
    confirmed: { label: 'Confirmed', icon: <CheckCircle size={12} />, pill: 'status-pill-confirmed' },
    completed: { label: 'Completed', icon: <GraduationCap size={12} />, pill: 'status-pill-completed' },
    rejected: { label: 'Rejected', icon: <XCircle size={12} />, pill: 'status-pill-rejected' },
    withdrawn: { label: 'Withdrawn', icon: <LogOut size={12} />, pill: 'status-pill-withdrawn' },
};

export function StatusBadge({
    status,
    queuePosition,
    pendingApproval = false,
    className = '',
}: {
    status: string | null | undefined;
    queuePosition?: number | null;
    pendingApproval?: boolean;
    className?: string;
}) {
    if (pendingApproval) {
        return (
            <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold whitespace-nowrap status-pill-requested ${className}`}
                title="Completion request is waiting for admin approval"
            >
                <Clock size={12} />
                Awaiting approval
            </span>
        );
    }
    if (!status) return null;
    const meta = STATUS_BADGE_META[status];
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold whitespace-nowrap ${meta?.pill ?? 'bg-surface-elevated border border-border-subtle text-muted'} ${className}`}>
            {meta?.icon}
            <span className={meta ? '' : 'capitalize'}>{meta?.label ?? status}</span>
            {status === 'requested' && queuePosition != null && (
                <span className="ml-0.5 tabular-nums opacity-90">#{queuePosition}</span>
            )}
        </span>
    );
}

export function PriorityStar({ withLabel = false }: { withLabel?: boolean }) {
    return (
        <span
            className={`inline-flex items-center gap-1 ${withLabel ? 'priority-badge px-1.5 py-0.5 rounded-full text-xs font-bold' : 'text-amber-500'}`}
            title="Priority student"
            aria-label="Priority"
        >
            <Star size={withLabel ? 10 : 13} className="fill-amber-400 text-amber-500" />
            {withLabel && 'Priority'}
        </span>
    );
}

export function SelectField({
    label,
    value,
    onChange,
    children,
    className = '',
    icon,
    defaultValue = 'all',
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    children: React.ReactNode;
    className?: string;
    icon?: React.ReactNode;
    /** The "nothing changed" value: any other value highlights the field */
    defaultValue?: string;
}) {
    const id = useId();
    const active = value !== defaultValue && value !== '';
    return (
        <div className={`relative ${className}`}>
            <label htmlFor={id} className="sr-only">{label}</label>
            {icon && <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none">{icon}</span>}
            <select
                id={id}
                aria-label={label}
                value={value}
                onChange={e => onChange(e.target.value)}
                className={`appearance-none w-full h-9 ${icon ? 'pl-8' : 'pl-3'} pr-8 bg-surface border rounded-xl text-xs font-semibold text-primary focus:outline-hidden focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all cursor-pointer truncate ${
                    active ? 'border-brand-500/50 bg-brand-500/5' : 'border-border-subtle'
                }`}
            >
                {children}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
        </div>
    );
}
