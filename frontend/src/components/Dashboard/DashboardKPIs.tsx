import { Users, Clock, Send, CheckCircle2 } from 'lucide-react';

export interface DashboardKPIsProps {
    stats: { students: number; courses: number; enrollments: number };
    statusCounts: Record<string, number>;
    onNavigate?: (tab: string, filter?: any) => void;
    loading?: boolean;
}

export default function DashboardKPIs({ stats, statusCounts, onNavigate, loading = false }: DashboardKPIsProps) {
    const kpis = [
        {
            key: 'students',
            label: 'Total Students',
            subLabel: 'Active in CRM',
            value: stats?.students ?? 0,
            icon: Users,
            colorClass: 'text-brand-500 bg-brand-500/10 border-brand-500/20',
            accentGradient: 'from-brand-500 to-brand-600',
            onClick: () => onNavigate?.('students'),
        },
        {
            key: 'requested',
            label: 'New Requests',
            subLabel: 'Awaiting review',
            value: statusCounts?.['requested'] || 0,
            icon: Clock,
            colorClass: 'text-warning bg-warning/10 border-warning/20',
            accentGradient: 'from-amber-500 to-amber-600',
            onClick: () => onNavigate?.('enrollments', { status: 'requested' }),
        },
        {
            key: 'invited',
            label: 'Pending Invites',
            subLabel: 'Sent to students',
            value: statusCounts?.['invited'] || 0,
            icon: Send,
            colorClass: 'text-info bg-info/10 border-info/20',
            accentGradient: 'from-sky-500 to-blue-600',
            onClick: () => onNavigate?.('enrollments', { status: 'invited' }),
        },
        {
            key: 'confirmed',
            label: 'Confirmed',
            subLabel: 'Ready for training',
            value: statusCounts?.['confirmed'] || 0,
            icon: CheckCircle2,
            colorClass: 'text-success bg-success/10 border-success/20',
            accentGradient: 'from-emerald-500 to-teal-600',
            onClick: () => onNavigate?.('enrollments', { status: 'confirmed' }),
        },
    ];

    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
            {kpis.map(card => {
                const Icon = card.icon;
                return (
                    <button
                        type="button"
                        key={card.key}
                        onClick={card.onClick}
                        disabled={loading}
                        className="relative overflow-hidden p-3 sm:p-4 rounded-2xl bg-surface border border-border-subtle hover:border-border-strong/60 transition-all duration-300 shadow-xs hover:shadow-md text-left group active:scale-[0.98] cursor-pointer"
                    >
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] sm:text-[11px] font-bold text-muted uppercase tracking-wider truncate">
                                {card.label}
                            </span>
                            <div className={`p-1.5 sm:p-2 rounded-xl border ${card.colorClass} group-hover:scale-110 transition-transform`}>
                                <Icon size={16} />
                            </div>
                        </div>
                        <div className="flex items-baseline gap-2">
                            <span className="text-xl sm:text-2xl lg:text-3xl font-mono font-bold text-primary tracking-tight">
                                {loading ? '—' : card.value}
                            </span>
                        </div>
                        <span className="text-[10px] sm:text-xs text-muted block truncate mt-0.5">
                            {card.subLabel}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
