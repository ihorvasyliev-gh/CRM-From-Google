import type { ReactNode } from 'react';

export type BadgeTone = 'neutral' | 'brand' | 'info' | 'success' | 'warning' | 'danger' | 'completed';

const TONES: Record<BadgeTone, string> = {
    neutral: 'bg-surface-elevated text-muted border-border-subtle',
    brand: 'bg-brand-500/10 text-brand-600 dark:text-brand-400 border-brand-500/20',
    info: 'bg-info/10 text-status-invited border-info/25',
    success: 'bg-success/10 text-status-confirmed border-success/25',
    warning: 'bg-warning/10 text-status-requested border-warning/30',
    danger: 'bg-danger/10 text-status-rejected border-danger/25',
    completed: 'bg-completed/10 text-status-completed border-completed/25',
};

/** Small label for counts, flags and attributes. Status pills keep using `status-pill-*`. */
export default function Badge({
    tone = 'neutral',
    children,
    icon,
    className = '',
    title,
    shape = 'rounded-sm',
}: {
    tone?: BadgeTone;
    children: ReactNode;
    icon?: ReactNode;
    className?: string;
    title?: string;
    shape?: 'rounded-sm' | 'pill';
}) {
    return (
        <span
            title={title}
            className={`inline-flex items-center gap-1 px-2 h-5 text-[11px] font-semibold border whitespace-nowrap ${
                shape === 'pill' ? 'rounded-full' : 'rounded-md'
            } ${TONES[tone]} ${className}`}
        >
            {icon}
            {children}
        </span>
    );
}
