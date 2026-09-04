import type { JSX } from 'react';
import { Clock, Filter } from 'lucide-react';

export type ActivityFilter = 'all' | 'requested' | 'invited' | 'confirmed' | 'completed';

export interface GroupedActivity {
    key: string;
    studentName: string;
    studentId: string;
    date: string;
    dateLabel: string;
    isNew?: boolean;
    enrollments: {
        id: string;
        courseId?: string;
        courseName: string;
        courseVariant: string | null;
        status: string;
    }[];
    previousEnrollments: {
        id: string;
        courseId?: string;
        courseName: string;
        courseVariant: string | null;
        status: string;
        dateLabel: string;
    }[];
}

export interface DashboardActivityFeedProps {
    groupedActivity: GroupedActivity[];
    activityFilter: ActivityFilter;
    setActivityFilter: (f: ActivityFilter) => void;
    filterCounts: Record<ActivityFilter, number>;
    onNavigate?: (tab: string, filter?: any) => void;
    onOpenStudentDetail?: (studentId: string) => void;
    loading?: boolean;
    className?: string;
}

const ACTIVITY_FILTERS: { key: ActivityFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'requested', label: 'Requested' },
    { key: 'invited', label: 'Invited' },
    { key: 'confirmed', label: 'Confirmed' },
    { key: 'completed', label: 'Completed' },
];

const STATUS_DOT: Record<string, string> = {
    requested: 'bg-warning',
    invited: 'bg-info',
    confirmed: 'bg-success',
    completed: 'bg-[oklch(var(--status-completed))]',
    withdrawn: 'bg-muted',
    rejected: 'bg-danger',
};

const FILTER_ACTIVE_CLASSES: Record<ActivityFilter, string> = {
    all: 'bg-brand-500 text-white border-brand-500 shadow-glow-sm',
    requested: 'status-pill-requested border-warning/50 font-bold shadow-xs',
    invited: 'status-pill-invited border-info/50 font-bold shadow-xs',
    confirmed: 'status-pill-confirmed border-success/50 font-bold shadow-xs',
    completed: 'status-pill-completed border-[oklch(var(--status-completed)/0.50)] font-bold shadow-xs',
};

function SkeletonActivityItem() {
    return (
        <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-surface-elevated/30 border border-border-subtle shadow-xs animate-pulse">
            <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-2.5 h-2.5 rounded-full bg-surface-elevated flex-shrink-0" />
                <div className="flex-1 min-w-0 sm:grid sm:grid-cols-2 sm:gap-3 sm:items-center">
                    <div>
                        <div className="h-3.5 w-28 rounded bg-surface-elevated mb-1.5" />
                        <div className="h-2.5 w-16 rounded bg-surface-elevated" />
                    </div>
                    <div className="hidden sm:block">
                        <div className="h-3.5 w-36 rounded bg-surface-elevated" />
                    </div>
                </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
                <div className="h-5 w-16 rounded-full bg-surface-elevated" />
                <div className="h-3.5 w-10 rounded bg-surface-elevated" />
            </div>
        </div>
    );
}

export default function DashboardActivityFeed({
    groupedActivity = [],
    activityFilter,
    setActivityFilter,
    filterCounts,
    onNavigate,
    onOpenStudentDetail,
    loading = false,
    className = '',
}: DashboardActivityFeedProps): JSX.Element {
    return (
        <div className={`p-3.5 sm:p-5 rounded-2xl bg-surface border border-border-subtle shadow-card flex flex-col h-full min-h-0 ${className}`}>
            <div className="flex items-center justify-between mb-3 flex-shrink-0">
                <h3 className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-2">
                    <Clock size={14} className="text-brand-500" /> Recent Activity
                </h3>
                <Filter size={12} className="text-muted" />
            </div>

            {/* Filter pills bar */}
            {!loading && (
                <div className="flex flex-wrap gap-1.5 mb-3.5 items-center flex-shrink-0" role="toolbar" aria-label="Filter activity by status">
                    {ACTIVITY_FILTERS.map((f) => {
                        const isActive = activityFilter === f.key;
                        const count = filterCounts?.[f.key] ?? 0;
                        return (
                            <button
                                key={f.key}
                                type="button"
                                onClick={() => setActivityFilter(f.key)}
                                aria-pressed={isActive}
                                className={`text-[11px] font-semibold px-3 py-1.5 min-h-[44px] sm:min-h-[32px] rounded-full border transition-all duration-200 flex items-center gap-1.5 cursor-pointer select-none active:scale-95 touch-manipulation ${
                                    isActive
                                        ? FILTER_ACTIVE_CLASSES[f.key]
                                        : 'bg-surface-elevated/50 text-muted hover:text-primary border-border-subtle hover:border-border-strong hover:scale-[1.02]'
                                }`}
                            >
                                {f.key !== 'all' && (
                                    <span
                                        className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[f.key] || 'bg-muted'} ${
                                            isActive ? '' : 'opacity-60'
                                        } flex-shrink-0`}
                                    />
                                )}
                                <span>{f.label} ({count})</span>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Main content: Skeleton, Empty state, or List */}
            {loading ? (
                <div className="space-y-2.5 overflow-y-auto pr-1 flex-1 min-h-0">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <SkeletonActivityItem key={i} />
                    ))}
                </div>
            ) : groupedActivity.length === 0 ? (
                <div className="text-center py-8 flex flex-col justify-center items-center flex-1 min-h-[160px]">
                    <Clock size={36} className="mb-2 text-muted/40" />
                    <p className="text-sm text-muted">
                        {activityFilter === 'all' ? 'No recent activity' : `No ${activityFilter} enrollments`}
                    </p>
                </div>
            ) : (
                <div className="space-y-2 md:space-y-2.5 overflow-y-auto pr-1 flex-1 min-h-0">
                    {groupedActivity.map((group, i) => {
                        // Group history by date
                        const historyByDate = new Map<string, typeof group.previousEnrollments>();
                        for (const pe of group.previousEnrollments || []) {
                            const existing = historyByDate.get(pe.dateLabel) || [];
                            existing.push(pe);
                            historyByDate.set(pe.dateLabel, existing);
                        }

                        // Build unified timeline events
                        const timelineEvents = [
                            {
                                date: group.dateLabel,
                                enrollments: group.enrollments || [],
                                isCurrent: true,
                                key: 'current',
                            },
                            ...Array.from(historyByDate.entries()).map(([date, enrollments]) => ({
                                date,
                                enrollments,
                                isCurrent: false,
                                key: date,
                            })),
                        ];

                        return (
                            <div
                                key={group.key || `${group.studentId}-${group.date}-${i}`}
                                className="p-2.5 sm:p-3 rounded-xl bg-surface-elevated/30 border border-border-subtle shadow-xs hover:bg-surface-elevated/60 hover:border-border-strong/40 transition-all duration-200 cursor-default flex flex-col lg:flex-row gap-2 lg:gap-3.5"
                                style={{ animationDelay: `${i * 40}ms` }}
                            >
                                {/* Left Column: Student Info */}
                                <div className="flex flex-row items-center gap-2 w-full lg:flex-col lg:items-start lg:gap-1 lg:w-1/4 lg:min-w-[150px] lg:max-w-[220px] flex-shrink-0 pt-0.5">
                                    <button
                                        type="button"
                                        onClick={() => onOpenStudentDetail?.(group.studentId)}
                                        className="text-[13px] font-semibold text-primary hover:text-brand-500 hover:underline truncate tracking-tight leading-tight text-left cursor-pointer transition-colors min-h-[44px] sm:min-h-[32px] flex items-center touch-manipulation"
                                        title={`View details for ${group.studentName}`}
                                    >
                                        {group.studentName}
                                    </button>
                                    {group.isNew && (
                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-brand-500/10 text-brand-500 border border-brand-500/20 tracking-wider flex-shrink-0 select-none">
                                            NEW
                                        </span>
                                    )}
                                </div>

                                {/* Right Column: Unified Timeline */}
                                <div className="flex-1 min-w-0 relative pl-5 flex flex-col gap-2.5">
                                    {/* Vertical line connecting the timeline nodes */}
                                    {timelineEvents.length > 1 && (
                                        <div className="absolute left-[8px] top-2.5 bottom-2.5 w-0.5 bg-border-subtle/50" />
                                    )}

                                    {timelineEvents.map((event) => (
                                        <div key={event.key} className="flex items-start gap-2.5 relative min-w-0">
                                            {/* Timeline node */}
                                            <div
                                                className={`absolute left-[-17px] top-[5px] w-2.5 h-2.5 rounded-full border-2 ${
                                                    event.isCurrent
                                                        ? 'bg-brand-500 border-brand-500 shadow-glow-sm'
                                                        : 'bg-surface border-border-strong'
                                                } z-10`}
                                            />

                                            {/* Event Date */}
                                            <span
                                                className={`font-mono text-[10px] w-12 pt-[3px] flex-shrink-0 select-none ${
                                                    event.isCurrent ? 'text-primary font-bold' : 'text-muted/60'
                                                }`}
                                            >
                                                {event.date}
                                            </span>

                                            {/* Event Badges */}
                                            <div className="flex flex-wrap gap-1.5 items-center flex-1 min-w-0">
                                                {event.enrollments.map((en) => (
                                                    <button
                                                        type="button"
                                                        key={en.id}
                                                        onClick={() => {
                                                            if (en.courseId) {
                                                                onNavigate?.('enrollments', { courseId: en.courseId });
                                                            } else {
                                                                onNavigate?.('enrollments');
                                                            }
                                                        }}
                                                        className={`status-pill-${en.status} inline-flex items-center gap-1.5 ${
                                                            event.isCurrent
                                                                ? 'text-[11px] px-2.5 py-1 sm:py-0.5 rounded-full font-semibold shadow-xs'
                                                                : 'text-[10px] px-2 py-0.5 rounded-md font-medium'
                                                        } whitespace-nowrap hover:ring-1 hover:ring-brand-500/50 hover:scale-[1.02] active:scale-95 transition-all cursor-pointer min-h-[44px] sm:min-h-[28px] touch-manipulation`}
                                                        title={`Filter board by ${en.courseName}`}
                                                    >
                                                        <span
                                                            className={`${
                                                                event.isCurrent ? 'w-1.5 h-1.5' : 'w-1 h-1'
                                                            } rounded-full ${STATUS_DOT[en.status] || 'bg-muted'} flex-shrink-0`}
                                                        />
                                                        <span>{en.courseName}</span>
                                                        {en.courseVariant && (
                                                            <span className="opacity-75 font-normal"> ({en.courseVariant})</span>
                                                        )}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
