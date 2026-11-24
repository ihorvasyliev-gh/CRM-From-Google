import React from 'react';
// Generic primitives live in ../ui and are re-exported here for the viewer screens.
export { Button } from '../ui/Button';
export { Segmented, type SegmentOption } from '../ui/Tabs';
export { EmptyState, ErrorState, SkeletonRows } from '../ui/States';
export { SelectField, PriorityStar, StatusBadge } from '../ui/FieldPrimitives';
import {
    Search, X, Copy, Mail, Phone, MessageCircle,
} from 'lucide-react';
import { getAvatarGradient } from '../../lib/types';
import { formatPhoneForCall, formatPhoneForWhatsApp, normalizePhone } from '../../lib/contactUtils';
import { copyText, initials } from './viewerUtils';
import { STATUS_META } from './viewerMeta';

// ─── Status ──────────────────────────────────────────────────

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
    const dims = size === 'sm' ? 'w-8 h-8 text-xs' : size === 'lg' ? 'w-12 h-12 text-sm' : 'w-9 h-9 text-xs';
    return (
        <div className={`${dims} rounded-full bg-linear-to-br ${getAvatarGradient(id)} flex items-center justify-center text-white font-bold shrink-0 shadow-xs select-none`}>
            {initials(person)}
        </div>
    );
}

const iconBtnBase = 'inline-flex items-center justify-center rounded-lg text-muted hover:text-primary hover:bg-surface-elevated border border-transparent hover:border-border-subtle transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-500/40';

/**
 * Copy / mail / call / WhatsApp shortcuts for a contact. Never bubbles clicks to the row.
 * `touch`: finger-sized buttons on phones and tablets (smaller from the laptop breakpoint up).
 */
export function ContactActions({
    email,
    phone,
    name,
    copy = true,
    touch = false,
    className = '',
}: {
    email?: string | null;
    phone?: string | null;
    name?: string;
    /** Show the "copy email" button */
    copy?: boolean;
    touch?: boolean;
    className?: string;
}) {
    // Stored numbers can be local ("087 …"): dial and message them in +353 form
    const intl = normalizePhone(phone);
    const call = formatPhoneForCall(intl);
    const whatsapp = formatPhoneForWhatsApp(intl);
    const who = name ? ` ${name}` : '';
    const stop = (e: React.SyntheticEvent) => e.stopPropagation();
    const iconBtn = `${iconBtnBase} ${touch ? 'w-9 h-9 lg:w-7 lg:h-7' : 'w-7 h-7'}`;
    const size = touch ? 15 : 13;
    return (
        <div className={`flex items-center gap-0.5 ${className}`} onClick={stop} onKeyDown={stop}>
            {email && copy && (
                <button type="button" className={iconBtn} onClick={() => copyText(email, 'Email')} title={`Copy email${who}`} aria-label={`Copy email${who}`}>
                    <Copy size={size} />
                </button>
            )}
            {email && (
                <a className={iconBtn} href={`mailto:${email}`} title={`Email${who}`} aria-label={`Email${who}`}>
                    <Mail size={size} />
                </a>
            )}
            {call && (
                <a className={iconBtn} href={call} title={`Call${who}`} aria-label={`Call${who}`}>
                    <Phone size={size} />
                </a>
            )}
            {whatsapp && (
                <a className={`${iconBtn} hover:text-emerald-600 dark:hover:text-emerald-400`} href={whatsapp} target="_blank" rel="noopener noreferrer" title={`WhatsApp${who}`} aria-label={`WhatsApp${who}`}>
                    <MessageCircle size={size} />
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
                className="w-full h-10 pl-9 pr-16 bg-surface border border-border-subtle rounded-xl text-sm text-primary placeholder:text-muted focus:outline-hidden focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all shadow-card"
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

/** Removable chip describing an active filter. */
export function FilterChip({ label, onRemove }: { label: React.ReactNode; onRemove: () => void }) {
    return (
        <span className="inline-flex items-center gap-1 pl-2.5 pr-1 h-6 rounded-full bg-brand-500/10 text-brand-700 dark:text-brand-300 border border-brand-500/20 text-xs font-semibold">
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
        <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
                {eyebrow && <div className="mb-1.5">{eyebrow}</div>}
                <h1 className="text-2xl sm:text-[28px] font-bold tracking-tight text-primary leading-tight truncate">{title}</h1>
                {subtitle && <p className="text-sm text-muted mt-1">{subtitle}</p>}
            </div>
            {actions && <div className="flex items-center gap-2 flex-wrap shrink-0">{actions}</div>}
        </div>
    );
}
