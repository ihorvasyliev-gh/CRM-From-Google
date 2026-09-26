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
    return (
        <div
            role="tablist"
            aria-label={ariaLabel}
            className={`flex items-center gap-0.5 p-1 bg-surface-elevated border border-border-subtle rounded-xl overflow-x-auto scrollbar-none max-w-full ${className}`}
        >
            {options.map(opt => {
                const active = opt.value === value;
                return (
                    <button
                        key={opt.value}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        title={opt.title}
                        onClick={() => onChange(opt.value)}
                        className={`shrink-0 flex items-center gap-1.5 px-2.5 ${size === 'sm' ? 'h-6 text-[11px]' : 'h-7 text-xs'} rounded-lg font-semibold whitespace-nowrap transition-all ${
                            active ? 'bg-surface text-primary shadow-xs ring-1 ring-border-subtle' : 'text-muted hover:text-primary'
                        }`}
                    >
                        {opt.dot && <span className={`w-1.5 h-1.5 rounded-full ${opt.dot}`} />}
                        {opt.icon}
                        <span>{opt.label}</span>
                        {opt.count !== undefined && (
                            <span
                                className={`tabular-nums text-[10px] font-bold px-1.5 rounded-full ${
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

export interface UnderlineTab<T extends string> {
    value: T;
    label: string;
    icon?: LucideIcon;
    count?: number;
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
    // Keep the active tab visible when the strip scrolls horizontally (small screens)
    useEffect(() => {
        const el = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
        const list = listRef.current;
        if (!el || !list || list.scrollWidth <= list.clientWidth) return;
        list.scrollTo({ left: el.offsetLeft - list.clientWidth / 2 + el.offsetWidth / 2, behavior: 'smooth' });
    }, [value]);

    return (
        <div ref={listRef} role="tablist" aria-label={ariaLabel} className={`flex items-center gap-1 border-b border-border-subtle overflow-x-auto scrollbar-none ${className}`}>
            {tabs.map(tab => {
                const active = tab.value === value;
                const Icon = tab.icon;
                return (
                    <button
                        key={tab.value}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => onChange(tab.value)}
                        onMouseEnter={onHover ? () => onHover(tab.value) : undefined}
                        className={`relative shrink-0 flex items-center gap-2 px-3 h-10 text-[13px] font-semibold whitespace-nowrap transition-colors ${
                            active ? 'text-primary' : 'text-muted hover:text-primary'
                        }`}
                    >
                        {Icon && <Icon size={15} className={active ? 'text-brand-500' : ''} />}
                        {tab.label}
                        {tab.count !== undefined && (
                            <span className={`tabular-nums text-[10px] font-bold px-1.5 rounded-full ${active ? 'bg-brand-500/15 text-brand-600 dark:text-brand-400' : 'bg-surface-elevated text-muted'}`}>
                                {tab.count}
                            </span>
                        )}
                        <span
                            aria-hidden
                            className={`absolute left-2 right-2 -bottom-px h-0.5 rounded-full transition-colors ${active ? 'bg-brand-500' : 'bg-transparent'}`}
                        />
                    </button>
                );
            })}
        </div>
    );
}
