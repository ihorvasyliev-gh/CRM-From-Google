import type { ReactNode } from 'react';
import { ArrowUpRight, type LucideIcon } from 'lucide-react';
import { toneChipCls, type Tone } from './styles';

const ACCENT: Record<Tone, string> = {
    brand: 'bg-brand-500',
    info: 'bg-info',
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
    completed: 'bg-completed',
    neutral: 'bg-border-strong',
};

export interface StatTileProps {
    label: string;
    value: ReactNode;
    icon?: LucideIcon;
    tone?: Tone;
    /** Small line under the value (context, delta, hint). */
    hint?: ReactNode;
    hintTone?: 'muted' | 'positive' | 'alert';
    onClick?: () => void;
    loading?: boolean;
    /** Draw the coloured strip along the top edge (dashboard style). */
    accent?: boolean;
    title?: string;
    className?: string;
}

const HINT: Record<NonNullable<StatTileProps['hintTone']>, string> = {
    muted: 'text-muted',
    positive: 'text-success font-semibold',
    alert: 'text-danger font-semibold',
};

/** KPI tile — same anatomy as the dashboard KPIs (icon chip · label · big number · hint). */
export default function StatTile({
    label,
    value,
    icon: Icon,
    tone = 'brand',
    hint,
    hintTone = 'muted',
    onClick,
    loading = false,
    accent = true,
    title,
    className = '',
}: StatTileProps) {
    const interactive = !!onClick;
    const body = (
        <>
            {accent && <span aria-hidden className={`absolute inset-x-0 top-0 h-1 ${ACCENT[tone]} opacity-80`} />}
            <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 min-w-0">
                    {Icon && (
                        <span className={`flex items-center justify-center w-7 h-7 rounded-lg flex-shrink-0 ${toneChipCls[tone]}`}>
                            <Icon size={14} />
                        </span>
                    )}
                    <span className="text-[11px] sm:text-xs font-semibold text-muted truncate">{label}</span>
                </span>
                {interactive && (
                    <ArrowUpRight
                        size={14}
                        aria-hidden
                        className="hidden sm:block text-muted opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                    />
                )}
            </div>
            <span className="mt-2.5 text-2xl leading-none font-bold text-primary tracking-tight tabular-nums truncate">
                {loading ? '—' : value}
            </span>
            {hint !== undefined && hint !== null && hint !== '' && (
                <span className={`mt-1.5 text-[11px] truncate ${loading ? 'text-muted' : HINT[hintTone]}`}>{hint}</span>
            )}
        </>
    );
    const cls = `group relative overflow-hidden flex flex-col text-left p-3.5 sm:p-4 rounded-2xl bg-surface border border-border-subtle shadow-card min-w-0 ${className}`;
    if (interactive) {
        return (
            <button
                type="button"
                onClick={onClick}
                title={title}
                disabled={loading}
                className={`${cls} hover:shadow-card-hover hover:-translate-y-0.5 hover:border-border-strong transition-all duration-200 active:scale-[0.98] cursor-pointer disabled:cursor-default disabled:hover:translate-y-0`}
            >
                {body}
            </button>
        );
    }
    return (
        <div className={cls} title={title}>
            {body}
        </div>
    );
}
