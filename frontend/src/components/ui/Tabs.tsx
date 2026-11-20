import { useEffect, useRef } from 'react';
import type React from 'react';
import type { LucideIcon } from 'lucide-react';

export interface SegmentOption<T extends string> {
    value: T;
    label: string;
    count?: number;
    icon?: React.ReactNode;
    dot?: string;
    title?: string;
}

function moveTabFocus<T extends string>(
    e: React.KeyboardEvent<HTMLButtonElement>,
    items: readonly { value: T }[],
    index: number,
    onChange: (v: T) => void,
    listEl: HTMLDivElement | null,
) {
    if (items.length < 2) return;
    let nextIndex: number | null = null;
    if (e.key === 'ArrowRight') nextIndex = (index + 1) % items.length;
    else if (e.key === 'ArrowLeft') nextIndex = (index - 1 + items.length) % items.length;
    else if (e.key === 'Home') nextIndex = 0;
    else if (e.key === 'End') nextIndex = items.length - 1;
    if (nextIndex === null) return;
    e.preventDefault();
    onChange(items[nextIndex].value);
    const tabs = listEl?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    tabs?.[nextIndex]?.focus();
}

/** Compact in-page switch (filters, views, template variants). */
export function Segmented<T extends string>({
    options,
    value,
    onChange,
    ariaLabel,
    className = '',
    size = 'md',
}: {
    options: SegmentOption<T>[];
    value: T;
    onChange: (v: T) => void;
    ariaLabel: string;
    className?: string;
    size?: 'sm' | 'md';
}) {
    const listRef = useRef<HTMLDivElement>(null);
    const activeIndex = options.findIndex(o => o.value === value);

    return (
        <div
            ref={listRef}
            role="tablist"
            aria-label={ariaLabel}
            className={`flex items-center gap-0.5 p-1 bg-surface-elevated border border-border-subtle rounded-xl overflow-x-auto scrollbar-none max-w-full ${className}`}
        >
            {options.map((opt, index) => {
                const active = opt.value === value;
                return (
                    <button
                        key={opt.value}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        tabIndex={active || (activeIndex === -1 && index === 0) ? 0 : -1}
                        title={opt.title}
                        onClick={() => onChange(opt.value)}
                        onKeyDown={e => moveTabFocus(e, options, index, onChange, listRef.current)}
                        className={`shrink-0 flex items-center gap-1.5 px-2.5 ${size === 'sm' ? 'h-6 text-xs' : 'h-7 text-xs'} rounded-lg font-semibold whitespace-nowrap transition-all focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-500/40 ${
                            active ? 'bg-surface text-primary shadow-xs ring-1 ring-border-subtle' : 'text-muted hover:text-primary'
                        }`}
                    >
                        {opt.dot && <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full ${opt.dot}`} />}
                        {opt.icon}
                        <span>{opt.label}</span>
                        {opt.count !== undefined && (
                            <span
                                className={`tabular-nums text-xs font-bold px-1.5 rounded-full ${
                                    active ? 'bg-brand-500/15 text-brand-600 dark:text-brand-400' : 'bg-surface/80 text-muted'
                                }`}
                            >
                                {opt.count}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}

export type TabCountTone = 'default' | 'brand' | 'warning' | 'danger';

export interface UnderlineTab<T extends string> {
    value: T;
    label: string;
    icon?: LucideIcon;
    count?: number;
    /** Optional styling tone for the count badge when attention is needed. */
    countTone?: TabCountTone;
    /** Tailwind background color class (e.g. `'bg-warning'`, `'bg-danger'`) rendered as a 6px indicator dot. */
    dot?: string;
    /** Accessible screen-reader text describing the indicator dot (e.g. `'Unsaved changes'`). */
    dotLabel?: string;
}

function countToneCls(tone: TabCountTone | undefined, active: boolean): string {
    switch (tone) {
        case 'brand':
            return 'bg-brand-500/15 text-brand-600 dark:text-brand-400';
        case 'warning':
            return 'bg-warning/15 text-status-requested';
        case 'danger':
            return 'bg-danger/15 text-status-rejected';
        case 'default':
        default:
            return active ? 'bg-brand-500/15 text-brand-600 dark:text-brand-400' : 'bg-surface-elevated text-muted';
    }
}

/** Page-level navigation between sibling views (analytics reports…). */
export function UnderlineTabs<T extends string>({
    tabs,
    value,
    onChange,
    ariaLabel,
    className = '',
    onHover,
}: {
    tabs: UnderlineTab<T>[];
    value: T;
    onChange: (v: T) => void;
    ariaLabel: string;
    className?: string;
    onHover?: (v: T) => void;
}) {
    const listRef = useRef<HTMLDivElement>(null);
    const activeIndex = tabs.findIndex(t => t.value === value);

    // Keep the active tab visible when the strip scrolls horizontally (small screens)
    useEffect(() => {
        const el = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
        const list = listRef.current;
        if (!el || !list || list.scrollWidth <= list.clientWidth) return;
        list.scrollTo({ left: el.offsetLeft - list.clientWidth / 2 + el.offsetWidth / 2, behavior: 'smooth' });
    }, [value]);

    return (
        <div ref={listRef} role="tablist" aria-label={ariaLabel} className={`flex items-center gap-1 border-b border-border-subtle overflow-x-auto scrollbar-none ${className}`}>
            {tabs.map((tab, index) => {
                const active = tab.value === value;
                const Icon = tab.icon;
                return (
                    <button
                        key={tab.value}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        tabIndex={active || (activeIndex === -1 && index === 0) ? 0 : -1}
                        onClick={() => onChange(tab.value)}
                        onKeyDown={e => moveTabFocus(e, tabs, index, onChange, listRef.current)}
                        onMouseEnter={onHover ? () => onHover(tab.value) : undefined}
                        className={`relative shrink-0 flex items-center gap-2 px-3 h-10 text-[13px] font-semibold whitespace-nowrap rounded-lg transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-inset ${
                            active ? 'text-primary' : 'text-muted hover:text-primary'
                        }`}
                    >
                        {Icon && <Icon size={15} className={active ? 'text-brand-500' : ''} />}
                        <span>{tab.label}</span>
                        {tab.dot && (
                            <>
                                <span
                                    aria-hidden="true"
                                    title={tab.dotLabel}
                                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${tab.dot}`}
                                />
                                {tab.dotLabel && <span className="sr-only"> ({tab.dotLabel})</span>}
                            </>
                        )}
                        {tab.count !== undefined && (
                            <span className={`tabular-nums text-xs font-bold px-1.5 rounded-full ${countToneCls(tab.countTone, active)}`}>
                                {tab.count}
                            </span>
                        )}
                        <span
                            aria-hidden="true"
                            className={`absolute left-2 right-2 -bottom-px h-0.5 rounded-full transition-colors ${active ? 'bg-brand-500' : 'bg-transparent'}`}
                        />
                    </button>
                );
            })}
        </div>
    );
}
