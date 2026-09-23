import { Users, Clock, Send, CheckCircle2, ArrowUpRight, type LucideIcon } from 'lucide-react';

export type KpiKey = 'students' | 'requested' | 'invited' | 'confirmed';

export interface KpiHint {
    text: string;
    /** 'alert' highlights the hint (e.g. overdue items), 'neutral' keeps it muted. */
    tone?: 'alert' | 'neutral' | 'positive';
}

export interface DashboardKPIsProps {
    stats: { students: number; courses: number; enrollments: number };
    statusCounts: Record<string, number>;
    onNavigate?: (tab: string, filter?: any) => void;
    loading?: boolean;
    /** Optional contextual line under each number (overrides the default sub-label). */
    hints?: Partial<Record<KpiKey, KpiHint>>;
}

interface KpiDef {
    key: KpiKey;
    label: string;
    subLabel: string;
    value: number;
    icon: LucideIcon;
    iconClass: string;
    accentClass: string;
    onClick: () => void;
}

const HINT_TONE: Record<NonNullable<KpiHint['tone']>, string> = {
    alert: 'text-danger font-semibold',
    positive: 'text-success font-semibold',
    neutral: 'text-muted',
};

export default function DashboardKPIs({ stats, statusCounts, onNavigate, loading = false, hints = {} }: DashboardKPIsProps) {
    const kpis: KpiDef[] = [
        {
            key: 'students',
            label: 'Total Students',
            subLabel: 'Active in CRM',
            value: stats?.students ?? 0,
            icon: Users,
            iconClass: 'text-brand-500 bg-brand-500/10',
            accentClass: 'bg-brand-500',
            onClick: () => onNavigate?.('students'),
        },
        {
            key: 'requested',
            label: 'New Requests',
            subLabel: 'Awaiting review',
            value: statusCounts?.['requested'] || 0,
            icon: Clock,
            iconClass: 'text-warning bg-warning/15',
            accentClass: 'bg-warning',
            onClick: () => onNavigate?.('enrollments', { status: 'requested' }),
        },
        {
            key: 'invited',
            label: 'Pending Invites',
            subLabel: 'Sent to students',
            value: statusCounts?.['invited'] || 0,
            icon: Send,
            iconClass: 'text-info bg-info/15',
            accentClass: 'bg-info',
            onClick: () => onNavigate?.('enrollments', { status: 'invited' }),
        },
        {
            key: 'confirmed',
            label: 'Confirmed',
            subLabel: 'Ready for training',
            value: statusCounts?.['confirmed'] || 0,
            icon: CheckCircle2,
            iconClass: 'text-success bg-success/15',
            accentClass: 'bg-success',
            onClick: () => onNavigate?.('enrollments', { status: 'confirmed' }),
        },
    ];

    return (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
            {kpis.map(card => {
                const Icon = card.icon;
                const hint = hints[card.key];
                return (
                    <button
                        type="button"
                        key={card.key}
                        onClick={card.onClick}
                        disabled={loading}
                        className="group relative overflow-hidden flex flex-col text-left p-3.5 sm:p-5 rounded-2xl bg-surface border border-border-subtle shadow-card hover:shadow-card-hover hover:-translate-y-0.5 hover:border-border-strong transition-all duration-200 active:scale-[0.98] cursor-pointer disabled:cursor-default disabled:hover:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
                    >
                        {/* Coloured accent strip */}
                        <span aria-hidden className={`absolute inset-x-0 top-0 h-1 ${card.accentClass} opacity-80`} />

                        <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-2 min-w-0">
                                <span className={`flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex-shrink-0 ${card.iconClass}`}>
                                    <Icon size={15} />
                                </span>
                                <span className="text-[11px] sm:text-xs font-semibold text-muted truncate">{card.label}</span>
                            </span>
                            <ArrowUpRight
                                size={15}
                                aria-hidden
                                className="hidden sm:block text-muted opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all flex-shrink-0"
                            />
                        </div>

                        <span className="mt-3 text-2xl sm:text-[32px] leading-none font-bold text-primary tracking-tight tabular-nums">
                            {loading ? '—' : card.value}
                        </span>

                        <span className={`mt-2 text-[11px] sm:text-xs truncate ${hint && !loading ? HINT_TONE[hint.tone ?? 'neutral'] : 'text-muted'}`}>
                            {hint && !loading ? hint.text : card.subLabel}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
