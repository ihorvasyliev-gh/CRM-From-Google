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
    /** Tighter padding and type scale below md (e.g. horizontal mobile KPI strip). */
    compactMobile?: boolean;
}

const HINT: Record<NonNullable<StatTileProps['hintTone']>, string> = {
    muted: 'text-muted',
    positive: 'text-emerald-700 dark:text-success font-semibold',
    alert: 'text-red-700 dark:text-danger font-semibold',
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
    compactMobile = false,
}: StatTileProps) {
    const interactive = !!onClick;
    const body = (
        <>
            {accent && <span aria-hidden className={`absolute inset-x-0 top-0 h-1 ${ACCENT[tone]} opacity-80`} />}
            <div className="flex items-center justify-between gap-2">
                <span className={`flex items-center min-w-0 ${compactMobile ? 'gap-1.5 md:gap-2' : 'gap-2'}`}>
                    {Icon && (
                        <span className={`flex items-center justify-center shrink-0 ${toneChipCls[tone]} ${
                            compactMobile ? 'w-5 h-5 md:w-7 md:h-7 rounded-md md:rounded-lg' : 'w-7 h-7 rounded-lg'
                        }`}>
                            <Icon size={14} className={compactMobile ? 'w-3 h-3 md:w-3.5 md:h-3.5' : undefined} />
                        </span>
                    )}
                    <span className={`${compactMobile ? 'text-[11px] md:text-xs' : 'text-xs'} font-semibold text-muted truncate`}>{label}</span>
                </span>
                {interactive && (
                    <ArrowUpRight
                        size={14}
                        aria-hidden
                        className="hidden sm:block text-muted opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    />
                )}
            </div>
            <span className={`${compactMobile ? 'mt-1.5 md:mt-2.5 text-lg md:text-2xl' : 'mt-2.5 text-2xl'} leading-none font-bold text-primary tracking-tight tabular-nums truncate`}>
                {loading ? '—' : value}
            </span>
            {hint !== undefined && hint !== null && hint !== '' && (
                <span className={`${compactMobile ? 'mt-0.5 md:mt-1.5 text-[11px] md:text-xs truncate md:whitespace-normal md:line-clamp-2' : 'mt-1.5 text-xs line-clamp-2'} ${loading ? 'text-muted' : HINT[hintTone]}`}>{hint}</span>
            )}
        </>
    );
    const padCls = compactMobile ? 'px-3 py-2.5 md:p-4' : 'p-3.5 sm:p-4';
    const cls = `group relative overflow-hidden flex flex-col text-left ${padCls} rounded-2xl bg-surface border border-border-subtle shadow-card min-w-0 ${className}`;
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
