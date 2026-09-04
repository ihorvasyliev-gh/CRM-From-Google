import type { JSX } from 'react';
import { TrendingUp, GraduationCap } from 'lucide-react';

export interface StatusBreakdownCardProps {
    statusBreakdown: Record<string, number>;
    loading?: boolean;
    onNavigate?: (tab: string, filter?: any) => void;
    className?: string;
}

const STATUS_ITEMS = [
    { key: 'requested', label: 'Requested', color: 'bg-warning' },
    { key: 'invited', label: 'Invited', color: 'bg-info' },
    { key: 'confirmed', label: 'Confirmed', color: 'bg-success' },
    { key: 'completed', label: 'Completed', color: 'bg-[oklch(var(--status-completed))]' },
    { key: 'withdrawn', label: 'Withdrawn', color: 'bg-muted' },
    { key: 'rejected', label: 'Rejected', color: 'bg-danger' },
];

function SkeletonStatusBreakdown() {
    return (
        <div className="space-y-4 animate-pulse">
            <div className="flex h-2.5 rounded-full overflow-hidden bg-surface-elevated" />
            <div className="flex flex-col gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg bg-surface-elevated/30">
                        <div className="w-2 h-2 rounded-full bg-surface-elevated flex-shrink-0" />
                        <div className="h-3 w-16 rounded bg-surface-elevated flex-shrink-0" />
                        <div className="flex-1 h-[5px] rounded-full bg-surface-elevated" />
                        <div className="h-3 w-8 rounded bg-surface-elevated flex-shrink-0" />
                    </div>
                ))}
            </div>
        </div>
    );
}

export default function StatusBreakdownCard({
    statusBreakdown = {},
    loading = false,
    onNavigate,
    className = '',
}: StatusBreakdownCardProps): JSX.Element {
    const totalStatus = Object.values(statusBreakdown || {}).reduce(
        (acc, val) => acc + (typeof val === 'number' && !Number.isNaN(val) ? val : 0),
        0
    );

    return (
        <div className={`p-3.5 sm:p-5 rounded-2xl bg-surface border border-border-subtle shadow-card flex flex-col ${className}`}>
            <h3 className="text-xs font-bold text-muted uppercase tracking-wider mb-3.5 flex items-center gap-2 flex-shrink-0">
                <TrendingUp size={14} className="text-brand-500" /> Enrollment Status
            </h3>

            {loading ? (
                <SkeletonStatusBreakdown />
            ) : totalStatus === 0 ? (
                <div className="text-center py-6 flex flex-col justify-center items-center flex-1 min-h-[140px]">
                    <GraduationCap size={36} className="mx-auto mb-2 text-muted/40" />
                    <p className="text-sm text-muted">No enrollments yet</p>
                </div>
            ) : (
                <div className="flex flex-col gap-2.5 sm:gap-3 flex-1 justify-center">
                    {/* Stacked bar with percentage proportions */}
                    <div
                        className="flex h-2.5 rounded-full overflow-hidden gap-px bg-border-subtle/20"
                        role="progressbar"
                        aria-valuenow={totalStatus}
                        aria-label="Enrollment status distribution"
                    >
                        {STATUS_ITEMS.map((s) => {
                            const count = statusBreakdown?.[s.key] || 0;
                            if (count === 0) return null;
                            const pct = Math.round((count / totalStatus) * 100);
                            return (
                                <div
                                    key={s.key}
                                    className={`${s.color} h-full transition-all duration-500 ease-spring cursor-default`}
                                    style={{ width: `${(count / totalStatus) * 100}%` }}
                                    title={`${s.label}: ${count} (${pct}%)`}
                                />
                            );
                        })}
                    </div>

                    {/* Status rows list */}
                    <div className="flex flex-col">
                        {STATUS_ITEMS.map((s) => {
                            const count = statusBreakdown?.[s.key] || 0;
                            const pct = totalStatus > 0 ? Math.round((count / totalStatus) * 100) : 0;
                            return (
                                <button
                                    type="button"
                                    key={s.key}
                                    onClick={() => onNavigate?.('enrollments', { status: s.key })}
                                    className="flex items-center gap-2.5 px-2 py-2 sm:py-1.5 rounded-lg hover:bg-surface-elevated/60 transition-colors duration-150 text-left w-full cursor-pointer group active:scale-[0.99] min-h-[44px] sm:min-h-[32px] touch-manipulation"
                                    title={`View ${s.label} enrollments`}
                                >
                                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.color}`} />
                                    <span className="text-[12px] text-muted font-medium w-[72px] flex-shrink-0 group-hover:text-primary transition-colors">
                                        {s.label}
                                    </span>
                                    <div className="flex-1 h-[5px] bg-border-subtle/25 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full ${s.color} rounded-full transition-all duration-500 ease-spring`}
                                            style={{ width: `${pct}%` }}
                                        />
                                    </div>
                                    <span className="text-[12px] font-mono font-bold text-primary w-10 text-right flex-shrink-0">
                                        {count}
                                    </span>
                                    <span className="text-[11px] text-muted/60 w-8 text-right flex-shrink-0">
                                        {pct}%
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
