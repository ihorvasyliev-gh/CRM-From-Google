import { useState, type JSX } from 'react';
import { PieChart, GraduationCap, ChevronRight } from 'lucide-react';
import DashboardCard from '../ui/Card';

export interface StatusBreakdownCardProps {
    statusBreakdown: Record<string, number>;
    loading?: boolean;
    onNavigate?: (tab: string, filter?: any) => void;
    className?: string;
}

const STATUS_ITEMS = [
    { key: 'requested', label: 'Requested', color: 'bg-warning', stroke: 'oklch(var(--status-warning))' },
    { key: 'invited', label: 'Invited', color: 'bg-info', stroke: 'oklch(var(--status-info))' },
    { key: 'confirmed', label: 'Confirmed', color: 'bg-success', stroke: 'oklch(var(--status-success))' },
    { key: 'completed', label: 'Completed', color: 'bg-[oklch(var(--status-completed))]', stroke: 'oklch(var(--status-completed))' },
    { key: 'withdrawn', label: 'Withdrawn', color: 'bg-muted', stroke: 'oklch(var(--text-muted))' },
    { key: 'rejected', label: 'Rejected', color: 'bg-danger', stroke: 'oklch(var(--status-danger))' },
];

const RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** Visual gap between donut segments, in SVG units along the circumference. */
const SEGMENT_GAP = 1.5;

function SkeletonStatusBreakdown() {
    return (
        <div className="flex flex-col sm:flex-row lg:flex-col xl:flex-row items-center gap-5 animate-pulse">
            <div className="w-32 h-32 rounded-full border-[14px] border-surface-elevated flex-shrink-0" />
            <div className="flex flex-col gap-2 w-full">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-2.5 px-2 py-1.5">
                        <div className="w-2 h-2 rounded-full bg-surface-elevated" />
                        <div className="h-3 flex-1 rounded bg-surface-elevated" />
                        <div className="h-3 w-8 rounded bg-surface-elevated" />
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
    const [hovered, setHovered] = useState<string | null>(null);
    const counts = statusBreakdown || {};
    const totalStatus = STATUS_ITEMS.reduce((acc, s) => {
        const v = counts[s.key];
        return acc + (typeof v === 'number' && !Number.isNaN(v) ? v : 0);
    }, 0);

    const hoveredItem = STATUS_ITEMS.find(s => s.key === hovered);
    const centerValue = hoveredItem ? counts[hoveredItem.key] || 0 : totalStatus;
    const centerLabel = hoveredItem ? hoveredItem.label : 'Total';

    const segments: ((typeof STATUS_ITEMS)[number] & { count: number; length: number; offset: number })[] = [];
    for (let i = 0, offset = 0; i < STATUS_ITEMS.length; i++) {
        const s = STATUS_ITEMS[i];
        const count = counts[s.key] || 0;
        const length = totalStatus > 0 ? (count / totalStatus) * CIRCUMFERENCE : 0;
        if (count > 0) segments.push({ ...s, count, length, offset });
        offset += length;
    }
    const gap = segments.length > 1 ? SEGMENT_GAP : 0;

    return (
        <DashboardCard title="Enrollment Status" subtitle="Distribution across the pipeline" icon={PieChart} className={className}>
            {loading ? (
                <SkeletonStatusBreakdown />
            ) : totalStatus === 0 ? (
                <div className="text-center py-6 flex flex-col justify-center items-center min-h-[140px]">
                    <GraduationCap size={36} className="mx-auto mb-2 text-muted/40" />
                    <p className="text-sm text-muted">No enrollments yet</p>
                </div>
            ) : (
                <div className="flex flex-col sm:flex-row lg:flex-col xl:flex-row items-center gap-4 xl:gap-5">
                    {/* Donut */}
                    <div className="relative w-32 h-32 flex-shrink-0" role="img" aria-label="Enrollment status distribution">
                        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                            <circle cx="50" cy="50" r={RADIUS} fill="none" strokeWidth="12" className="stroke-border-subtle/60" />
                            {segments.map(s => (
                                <circle
                                    key={s.key}
                                    cx="50"
                                    cy="50"
                                    r={RADIUS}
                                    fill="none"
                                    stroke={s.stroke}
                                    strokeWidth={hovered === s.key ? 15 : 12}
                                    strokeDasharray={`${Math.max(s.length - gap, 0.01)} ${CIRCUMFERENCE}`}
                                    strokeDashoffset={-s.offset}
                                    opacity={hovered && hovered !== s.key ? 0.35 : 1}
                                    className="transition-all duration-200"
                                    onMouseEnter={() => setHovered(s.key)}
                                    onMouseLeave={() => setHovered(null)}
                                >
                                    <title>{`${s.label}: ${s.count}`}</title>
                                </circle>
                            ))}
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            <span className="text-2xl font-bold text-primary tabular-nums leading-none">{centerValue}</span>
                            <span className="text-[10px] font-semibold text-muted uppercase tracking-wide mt-1">{centerLabel}</span>
                        </div>
                    </div>

                    {/* Legend */}
                    <div className="flex flex-col w-full min-w-0">
                        {STATUS_ITEMS.map(s => {
                            const count = counts[s.key] || 0;
                            const pct = Math.round((count / totalStatus) * 100);
                            return (
                                <button
                                    type="button"
                                    key={s.key}
                                    onClick={() => onNavigate?.('enrollments', { status: s.key })}
                                    onMouseEnter={() => setHovered(s.key)}
                                    onMouseLeave={() => setHovered(null)}
                                    onFocus={() => setHovered(s.key)}
                                    onBlur={() => setHovered(null)}
                                    className={`group flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition-colors text-left w-full cursor-pointer min-h-[40px] sm:min-h-[30px] touch-manipulation ${
                                        hovered === s.key ? 'bg-surface-elevated' : 'hover:bg-surface-elevated'
                                    } ${count === 0 ? 'opacity-50' : ''}`}
                                    title={`View ${s.label} enrollments`}
                                >
                                    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${s.color}`} />
                                    <span className="text-[13px] text-primary font-medium flex-1 truncate">{s.label}</span>
                                    <span className="text-[13px] font-semibold text-primary tabular-nums">{count}</span>
                                    <span className="text-[11px] text-muted w-9 text-right tabular-nums">{pct}%</span>
                                    <ChevronRight size={13} className="text-muted opacity-0 group-hover:opacity-100 transition-opacity -mr-1" />
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </DashboardCard>
    );
}
