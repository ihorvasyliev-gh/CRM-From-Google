import React, { useId } from 'react';
import {
    AlertCircle, Clock, Star, Search, X, Copy, Mail, Phone, MessageCircle, RotateCcw, ChevronDown,
} from 'lucide-react';
import { getAvatarGradient } from '../../lib/types';
import { formatPhoneForCall, formatPhoneForWhatsApp } from '../../lib/contactUtils';
import { copyText, initials } from './viewerUtils';
import { STATUS_META } from './viewerMeta';

// ─── Status ──────────────────────────────────────────────────

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
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap status-pill-requested ${className}`}
                title="Completion request is waiting for admin approval"
            >
                <Clock size={12} />
                Awaiting approval
            </span>
        );
    }
    if (!status) return null;
    const meta = STATUS_META[status];
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap ${meta?.pill ?? 'bg-surface-elevated border border-border-subtle text-muted'} ${className}`}>
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
            className={`inline-flex items-center gap-1 ${withLabel ? 'priority-badge px-1.5 py-0.5 rounded-full text-[10px] font-bold' : 'text-amber-500'}`}
            title="Priority student"
            aria-label="Priority"
        >
            <Star size={withLabel ? 10 : 13} className="fill-amber-400 text-amber-500" />
            {withLabel && 'Priority'}
        </span>
    );
}

/** Horizontal stacked bar showing how a course's students split across statuses. */
export function StatusDistributionBar({
    counts,
    className = 'h-1.5',
}: {
    counts: Partial<Record<'requested' | 'invited' | 'confirmed' | 'completed', number>>;
    className?: string;
}) {
    const order = ['confirmed', 'invited', 'requested', 'completed'] as const;
    const total = order.reduce((s, k) => s + (counts[k] || 0), 0);
    return (
        <div className={`w-full flex rounded-full overflow-hidden bg-surface-elevated ${className}`} aria-hidden="true">
            {total > 0 && order.map(k => {
                const v = counts[k] || 0;
                if (!v) return null;
                return <div key={k} className={`${STATUS_META[k].bar} h-full`} style={{ width: `${(v / total) * 100}%` }} />;
            })}
        </div>
    );
}

// ─── People ──────────────────────────────────────────────────

export function Avatar({
    id,
    person,
    size = 'md',
}: {
    id: string;
    person: { first_name?: string | null; last_name?: string | null };
    size?: 'sm' | 'md' | 'lg';
}) {
    const dims = size === 'sm' ? 'w-8 h-8 text-[11px]' : size === 'lg' ? 'w-12 h-12 text-sm' : 'w-9 h-9 text-xs';
    return (
        <div className={`${dims} rounded-full bg-gradient-to-br ${getAvatarGradient(id)} flex items-center justify-center text-white font-bold shrink-0 shadow-sm select-none`}>
            {initials(person)}
        </div>
    );
}

const iconBtn = 'inline-flex items-center justify-center w-7 h-7 rounded-lg text-muted hover:text-primary hover:bg-surface-elevated border border-transparent hover:border-border-subtle transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40';

/** Copy / mail / call / WhatsApp shortcuts for a contact. Never bubbles clicks to the row. */
export function ContactActions({
    email,
    phone,
    name,
    className = '',
}: {
    email?: string | null;
    phone?: string | null;
    name?: string;
    className?: string;
}) {
    const call = formatPhoneForCall(phone);
    const whatsapp = formatPhoneForWhatsApp(phone);
    const who = name ? ` ${name}` : '';
    const stop = (e: React.SyntheticEvent) => e.stopPropagation();
    return (
        <div className={`flex items-center gap-0.5 ${className}`} onClick={stop} onKeyDown={stop}>
            {email && (
                <button type="button" className={iconBtn} onClick={() => copyText(email, 'Email')} title={`Copy email${who}`} aria-label={`Copy email${who}`}>
                    <Copy size={13} />
                </button>
            )}
            {email && (
                <a className={iconBtn} href={`mailto:${email}`} title={`Email${who}`} aria-label={`Email${who}`}>
                    <Mail size={13} />
                </a>
            )}
            {call && (
                <a className={iconBtn} href={call} title={`Call${who}`} aria-label={`Call${who}`}>
                    <Phone size={13} />
                </a>
            )}
            {whatsapp && (
                <a className={`${iconBtn} hover:text-emerald-600 dark:hover:text-emerald-400`} href={whatsapp} target="_blank" rel="noopener noreferrer" title={`WhatsApp${who}`} aria-label={`WhatsApp${who}`}>
                    <MessageCircle size={13} />
                </a>
            )}
        </div>
    );
}

/** Inline text that copies itself on click. */
export function CopyText({ value, label, children, className = '' }: { value: string | null | undefined; label: string; children?: React.ReactNode; className?: string }) {
    if (!value) return null;
    return (
        <button
            type="button"
            onClick={e => { e.stopPropagation(); copyText(value, label); }}
            onKeyDown={e => e.stopPropagation()}
            className={`text-left truncate hover:text-primary hover:underline decoration-dotted underline-offset-2 transition-colors cursor-copy ${className}`}
            title={`Copy ${label.toLowerCase()}`}
        >
            {children ?? value}
        </button>
    );
}

// ─── Inputs ──────────────────────────────────────────────────

export function Kbd({ children }: { children: React.ReactNode }) {
    return (
        <kbd className="hidden sm:inline-flex items-center px-1.5 h-5 text-[10px] font-mono font-semibold text-muted bg-surface border border-border-subtle rounded-md">
            {children}
        </kbd>
    );
}

export function SearchField({
    value,
    onChange,
    onClear,
    placeholder,
    onEnter,
    ariaLabel,
    className = '',
    showHint = true,
}: {
    value: string;
    onChange: (v: string) => void;
    onClear: () => void;
    placeholder: string;
    onEnter?: () => void;
    ariaLabel?: string;
    className?: string;
    showHint?: boolean;
}) {
    return (
        <div className={`relative ${className}`}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" size={16} />
            <input
                type="text"
                role="searchbox"
                aria-label={ariaLabel ?? placeholder}
                data-page-search=""
                autoComplete="off"
                spellCheck={false}
                value={value}
                placeholder={placeholder}
                onChange={e => onChange(e.target.value)}
                onKeyDown={e => {
                    if (e.key === 'Escape' && value) {
                        e.preventDefault();
                        onClear();
                    } else if (e.key === 'Enter' && onEnter) {
                        e.preventDefault();
                        onEnter();
                    }
                }}
                className="w-full h-10 pl-9 pr-16 bg-surface border border-border-subtle rounded-xl text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all shadow-card"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {value ? (
                    <button
                        type="button"
                        aria-label="Clear search"
                        onClick={onClear}
                        className="p-1 text-muted hover:text-primary rounded-md hover:bg-surface-elevated transition-colors"
                    >
                        <X size={15} />
                    </button>
                ) : showHint ? (
                    <Kbd>/</Kbd>
                ) : null}
            </div>
        </div>
    );
}

export interface SegmentOption<T extends string> {
    value: T;
    label: string;
    count?: number;
    icon?: React.ReactNode;
    dot?: string;
}

export function Segmented<T extends string>({
    options,
    value,
    onChange,
    ariaLabel,
    className = '',
}: {
    options: SegmentOption<T>[];
    value: T;
    onChange: (v: T) => void;
    ariaLabel: string;
    className?: string;
}) {
    return (
        <div role="tablist" aria-label={ariaLabel} className={`flex items-center gap-0.5 p-1 bg-surface-elevated border border-border-subtle rounded-xl overflow-x-auto scrollbar-none max-w-full ${className}`}>
            {options.map(opt => {
                const active = opt.value === value;
                return (
                    <button
                        key={opt.value}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => onChange(opt.value)}
                        className={`shrink-0 flex items-center gap-1.5 px-2.5 h-7 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                            active ? 'bg-surface text-primary shadow-sm ring-1 ring-border-subtle' : 'text-muted hover:text-primary'
                        }`}
                    >
                        {opt.dot && <span className={`w-1.5 h-1.5 rounded-full ${opt.dot}`} />}
                        {opt.icon}
                        <span>{opt.label}</span>
                        {opt.count !== undefined && (
                            <span className={`tabular-nums text-[10px] font-bold px-1.5 rounded-full ${active ? 'bg-brand-500/15 text-brand-600 dark:text-brand-400' : 'bg-surface/80 text-muted'}`}>
                                {opt.count}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}

export function SelectField({
    label,
    value,
    onChange,
    children,
    className = '',
    icon,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    children: React.ReactNode;
    className?: string;
    icon?: React.ReactNode;
}) {
    const id = useId();
    const active = value !== 'all' && value !== '';
    return (
        <div className={`relative ${className}`}>
            <label htmlFor={id} className="sr-only">{label}</label>
            {icon && <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none">{icon}</span>}
            <select
                id={id}
                aria-label={label}
                value={value}
                onChange={e => onChange(e.target.value)}
                className={`appearance-none w-full h-9 ${icon ? 'pl-8' : 'pl-3'} pr-8 bg-surface border rounded-xl text-xs font-semibold text-primary focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all cursor-pointer truncate ${
                    active ? 'border-brand-500/50 bg-brand-500/5' : 'border-border-subtle'
                }`}
            >
                {children}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
        </div>
    );
}

/** Removable chip describing an active filter. */
export function FilterChip({ label, onRemove }: { label: React.ReactNode; onRemove: () => void }) {
    return (
        <span className="inline-flex items-center gap-1 pl-2.5 pr-1 h-6 rounded-full bg-brand-500/10 text-brand-700 dark:text-brand-300 border border-brand-500/20 text-[11px] font-semibold">
            {label}
            <button type="button" onClick={onRemove} aria-label="Remove filter" className="p-0.5 rounded-full hover:bg-brand-500/20">
                <X size={11} />
            </button>
        </span>
    );
}

// ─── Page chrome ─────────────────────────────────────────────

export function PageHeader({
    title,
    subtitle,
    actions,
    eyebrow,
}: {
    title: React.ReactNode;
    subtitle?: React.ReactNode;
    actions?: React.ReactNode;
    eyebrow?: React.ReactNode;
}) {
    return (
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
            <div className="min-w-0">
                {eyebrow && <div className="mb-1.5">{eyebrow}</div>}
                <h1 className="text-2xl sm:text-[28px] font-bold tracking-tight text-primary leading-tight truncate">{title}</h1>
                {subtitle && <p className="text-sm text-muted mt-1">{subtitle}</p>}
            </div>
            {actions && <div className="flex items-center gap-2 flex-wrap shrink-0">{actions}</div>}
        </div>
    );
}

export function Button({
    variant = 'secondary',
    size = 'md',
    className = '',
    children,
    ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'success'; size?: 'sm' | 'md' }) {
    const base = 'inline-flex items-center justify-center gap-1.5 font-semibold rounded-xl transition-all active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 whitespace-nowrap';
    const sizes = size === 'sm' ? 'h-8 px-2.5 text-xs' : 'h-9 px-3.5 text-xs';
    const variants = {
        primary: 'bg-brand-500 hover:bg-brand-600 text-white shadow-sm shadow-brand-500/20',
        success: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm',
        secondary: 'bg-surface hover:bg-surface-elevated text-primary border border-border-subtle hover:border-border-strong shadow-card',
        ghost: 'text-muted hover:text-primary hover:bg-surface-elevated',
    }[variant];
    return (
        <button type="button" className={`${base} ${sizes} ${variants} ${className}`} {...rest}>
            {children}
        </button>
    );
}

export function EmptyState({
    icon,
    title,
    description,
    action,
}: {
    icon: React.ReactNode;
    title: string;
    description?: React.ReactNode;
    action?: React.ReactNode;
}) {
    return (
        <div className="bg-surface rounded-2xl border border-dashed border-border-strong/60 px-6 py-12 text-center">
            <div className="w-12 h-12 rounded-2xl bg-surface-elevated text-muted mx-auto flex items-center justify-center mb-3">{icon}</div>
            <h3 className="text-base font-bold text-primary">{title}</h3>
            {description && <p className="text-sm text-muted mt-1 max-w-sm mx-auto">{description}</p>}
            {action && <div className="mt-4 flex justify-center">{action}</div>}
        </div>
    );
}

export function ErrorState({ title, error, onRetry }: { title: string; error: unknown; onRetry: () => void }) {
    return (
        <div role="alert" className="bg-surface rounded-2xl border border-red-500/25 px-6 py-10 text-center">
            <div className="w-12 h-12 rounded-2xl bg-red-500/10 text-red-500 mx-auto flex items-center justify-center mb-3">
                <AlertCircle size={24} />
            </div>
            <h3 className="text-base font-bold text-primary">{title}</h3>
            <p className="text-sm text-muted mt-1">
                {error instanceof Error ? error.message : (error as { message?: string } | null)?.message || 'Check your connection and try again.'}
            </p>
            <div className="mt-4 flex justify-center">
                <Button variant="primary" onClick={onRetry}>
                    <RotateCcw size={14} />
                    Retry
                </Button>
            </div>
        </div>
    );
}

export function SkeletonRows({ rows = 6 }: { rows?: number }) {
    return (
        <div className="bg-surface rounded-2xl border border-border-subtle divide-y divide-border-subtle overflow-hidden" aria-busy="true" aria-label="Loading">
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3.5 animate-pulse">
                    <div className="w-9 h-9 rounded-full bg-muted/15 shrink-0" />
                    <div className="flex-1 space-y-2">
                        <div className="h-3.5 bg-muted/15 rounded w-1/3" />
                        <div className="h-3 bg-muted/10 rounded w-1/2" />
                    </div>
                    <div className="hidden sm:block w-24 h-5 bg-muted/15 rounded-full" />
                </div>
            ))}
        </div>
    );
}
