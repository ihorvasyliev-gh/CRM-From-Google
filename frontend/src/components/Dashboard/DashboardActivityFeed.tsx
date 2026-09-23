import { useState, type JSX } from 'react';
import { Activity, Search, X, ChevronDown, Inbox } from 'lucide-react';
import DashboardCard from './DashboardCard';
import StudentAvatar from './StudentAvatar';
import { relativeDayLabel, type ActivityGroup, type ActivityStatusFilter } from './dashboardUtils';

export type ActivityFilter = ActivityStatusFilter;
export type GroupedActivity = ActivityGroup;

export interface DashboardActivityFeedProps {
    groupedActivity: GroupedActivity[];
    activityFilter: ActivityFilter;
    setActivityFilter: (f: ActivityFilter) => void;
    filterCounts: Record<ActivityFilter, number>;
    onNavigate?: (tab: string, filter?: any) => void;
    onOpenStudentDetail?: (studentId: string) => void;
    loading?: boolean;
    className?: string;
    /** Search box value; the box is only shown when `onSearchChange` is provided. */
    search?: string;
    onSearchChange?: (value: string) => void;
    /** Total number of matching groups (to show "x of y" and the "Show more" button). */
    totalGroups?: number;
    onShowMore?: () => void;
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
    requested: 'status-pill-requested border-warning/50',
    invited: 'status-pill-invited border-info/50',
    confirmed: 'status-pill-confirmed border-success/50',
    completed: 'status-pill-completed border-[oklch(var(--status-completed)/0.50)]',
};

type Enrollment = GroupedActivity['enrollments'][number];

function CoursePill({ en, small = false, onNavigate }: { en: Enrollment; small?: boolean; onNavigate?: DashboardActivityFeedProps['onNavigate'] }) {
    return (
        <button
            type="button"
            onClick={() => (en.courseId ? onNavigate?.('enrollments', { courseId: en.courseId }) : onNavigate?.('enrollments'))}
            className={`status-pill-${en.status} inline-flex items-center gap-1.5 max-w-full rounded-full whitespace-nowrap hover:ring-2 hover:ring-brand-500/30 active:scale-95 transition-all cursor-pointer touch-manipulation ${
                small ? 'text-[10.5px] px-2 py-0.5 font-medium' : 'text-[11.5px] px-2.5 py-1 font-semibold'
            }`}
            title={`Filter board by ${en.courseName} (${en.status})`}
        >
            <span className={`${small ? 'w-1 h-1' : 'w-1.5 h-1.5'} rounded-full ${STATUS_DOT[en.status] || 'bg-muted'} flex-shrink-0`} />
            <span className="truncate">{en.courseName}</span>
            {en.courseVariant && <span className="opacity-70 font-normal truncate"> ({en.courseVariant})</span>}
        </button>
    );
}

function SkeletonActivityItem() {
    return (
        <div className="flex items-start gap-3 p-3 animate-pulse">
            <div className="w-9 h-9 rounded-full bg-surface-elevated flex-shrink-0" />
            <div className="flex-1 space-y-2">
                <div className="h-3.5 w-32 rounded bg-surface-elevated" />
                <div className="flex gap-2">
                    <div className="h-5 w-24 rounded-full bg-surface-elevated" />
                    <div className="h-5 w-20 rounded-full bg-surface-elevated" />
                </div>
            </div>
        </div>
    );
}

function ActivityRow({
    group,
    onNavigate,
    onOpenStudentDetail,
}: {
    group: GroupedActivity;
    onNavigate?: DashboardActivityFeedProps['onNavigate'];
    onOpenStudentDetail?: DashboardActivityFeedProps['onOpenStudentDetail'];
}) {
    const [expanded, setExpanded] = useState(false);
    const history = group.previousEnrollments || [];

    // Group history by date label, preserving (newest-first) order
    const historyByDate = new Map<string, typeof history>();
    for (const pe of history) {
        const list = historyByDate.get(pe.dateLabel);
        if (list) list.push(pe);
        else historyByDate.set(pe.dateLabel, [pe]);
    }

    return (
        <li className="flex items-start gap-3 px-2 py-2.5 rounded-xl hover:bg-surface-elevated/70 transition-colors">
            <StudentAvatar name={group.studentName} seed={group.studentId} />
            <div className="flex-1 min-w-0 sm:grid sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)] sm:gap-x-4 sm:items-start">
                <div className="flex items-center gap-2 min-w-0 sm:min-h-[36px]">
                    <button
                        type="button"
                        onClick={() => onOpenStudentDetail?.(group.studentId)}
                        className="text-[13.5px] font-semibold text-primary hover:text-brand-500 hover:underline truncate text-left cursor-pointer transition-colors touch-manipulation"
                        title={`View details for ${group.studentName}`}
                    >
                        {group.studentName}
                    </button>
                    {group.isNew && (
                        <span className="inline-flex items-center px-1.5 py-px rounded text-[9px] font-bold bg-brand-500/10 text-brand-500 border border-brand-500/20 tracking-wider flex-shrink-0 select-none">
                            NEW
                        </span>
                    )}
                </div>

                <div className="min-w-0">
                    <div className="mt-1.5 sm:mt-0 sm:min-h-[36px] flex flex-wrap items-center gap-1.5">
                        {(group.enrollments || []).map(en => (
                            <CoursePill key={en.id} en={en} onNavigate={onNavigate} />
                        ))}
                    </div>

                    {history.length > 0 && (
                        <>
                            <button
                                type="button"
                                onClick={() => setExpanded(v => !v)}
                                aria-expanded={expanded}
                                className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-muted hover:text-primary cursor-pointer transition-colors"
                            >
                                <ChevronDown size={13} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
                                {expanded ? 'Hide history' : `History · ${history.length} earlier`}
                            </button>

                            {expanded && (
                                <ol className="mt-2 ml-1.5 pl-4 border-l-2 border-border-subtle space-y-2 animate-fadeIn">
                                    {Array.from(historyByDate.entries()).map(([date, ens]) => (
                                        <li key={date} className="relative flex items-start gap-2.5">
                                            <span aria-hidden className="absolute -left-[21px] top-[5px] w-2 h-2 rounded-full bg-surface border-2 border-border-strong" />
                                            <span className="text-[10.5px] font-medium text-muted w-12 pt-0.5 flex-shrink-0 tabular-nums">{date}</span>
                                            <div className="flex flex-wrap gap-1 min-w-0">
                                                {ens.map(en => (
                                                    <CoursePill key={en.id} en={en} small onNavigate={onNavigate} />
                                                ))}
                                            </div>
                                        </li>
                                    ))}
                                </ol>
                            )}
                        </>
                    )}
                </div>
            </div>
        </li>
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
    search = '',
    onSearchChange,
    totalGroups,
    onShowMore,
}: DashboardActivityFeedProps): JSX.Element {
    const total = totalGroups ?? groupedActivity.length;
    const hasMore = !!onShowMore && total > groupedActivity.length;

    // Split into day sections (groups are already sorted newest first)
    const sections: { date: string; label: string; groups: GroupedActivity[] }[] = [];
    for (const g of groupedActivity) {
        const last = sections[sections.length - 1];
        if (last && last.date === g.date) last.groups.push(g);
        else sections.push({ date: g.date, label: relativeDayLabel(g.date, g.dateLabel), groups: [g] });
    }

    return (
        <DashboardCard
            title="Recent Activity"
            subtitle={loading ? 'Loading…' : `Showing ${groupedActivity.length} of ${total} student updates`}
            icon={Activity}
            className={className}
            bodyClassName="flex flex-col"
        >
            {/* Toolbar: search + status filters */}
            {!loading && (
                <div className="flex flex-col gap-2.5 mb-2 flex-shrink-0">
                    {onSearchChange && (
                        <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
                            <input
                                type="search"
                                value={search}
                                onChange={e => onSearchChange(e.target.value)}
                                placeholder="Search student or course…"
                                aria-label="Search activity"
                                className="w-full h-9 pl-8 pr-8 rounded-xl bg-surface-elevated border border-border-subtle focus:border-brand-500/50 focus:ring-2 focus:ring-brand-500/20 outline-none text-[13px] text-primary placeholder:text-muted transition-all [&::-webkit-search-cancel-button]:hidden"
                            />
                            {search && (
                                <button
                                    type="button"
                                    onClick={() => onSearchChange('')}
                                    aria-label="Clear search"
                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-muted hover:text-primary hover:bg-surface cursor-pointer"
                                >
                                    <X size={13} />
                                </button>
                            )}
                        </div>
                    )}

                    <div className="flex gap-1.5 overflow-x-auto scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap" role="toolbar" aria-label="Filter activity by status">
                        {ACTIVITY_FILTERS.map(f => {
                            const isActive = activityFilter === f.key;
                            const count = filterCounts?.[f.key] ?? 0;
                            return (
                                <button
                                    key={f.key}
                                    type="button"
                                    onClick={() => setActivityFilter(f.key)}
                                    aria-pressed={isActive}
                                    className={`flex-shrink-0 text-xs font-semibold pl-2.5 pr-1.5 h-8 rounded-full border transition-all flex items-center gap-1.5 cursor-pointer select-none active:scale-95 touch-manipulation ${
                                        isActive
                                            ? FILTER_ACTIVE_CLASSES[f.key]
                                            : 'bg-surface-elevated text-muted hover:text-primary border-border-subtle hover:border-border-strong'
                                    }`}
                                >
                                    {f.key !== 'all' && (
                                        <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[f.key]} flex-shrink-0`} />
                                    )}
                                    <span>{f.label}</span>
                                    <span
                                        className={`min-w-[20px] px-1.5 py-px rounded-full text-[10px] font-bold tabular-nums text-center ${
                                            isActive ? 'bg-black/10 dark:bg-white/15' : 'bg-border-subtle/70'
                                        }`}
                                    >
                                        {count}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {loading ? (
                <div className="divide-y divide-border-subtle">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <SkeletonActivityItem key={i} />
                    ))}
                </div>
            ) : groupedActivity.length === 0 ? (
                <div className="text-center py-10 flex flex-col justify-center items-center flex-1 min-h-[180px]">
                    <span className="flex items-center justify-center w-12 h-12 rounded-2xl bg-surface-elevated border border-border-subtle mb-3">
                        <Inbox size={22} className="text-muted" />
                    </span>
                    <p className="text-sm font-medium text-primary">
                        {search.trim()
                            ? `Nothing matches “${search.trim()}”`
                            : activityFilter === 'all'
                              ? 'No recent activity'
                              : `No ${activityFilter} enrollments`}
                    </p>
                    {(search.trim() || activityFilter !== 'all') && (
                        <button
                            type="button"
                            onClick={() => {
                                onSearchChange?.('');
                                setActivityFilter('all');
                            }}
                            className="mt-2 text-xs font-semibold text-brand-500 hover:underline cursor-pointer"
                        >
                            Clear filters
                        </button>
                    )}
                </div>
            ) : (
                <div className="flex-1 min-h-0 overflow-y-auto -mx-2 px-0 lg:max-h-[720px]">
                    {sections.map(section => (
                        <div key={section.date}>
                            <div className="sticky top-0 z-10 flex items-center gap-2 px-2 py-1.5 bg-surface/95 backdrop-blur-sm">
                                <span className="text-[11px] font-semibold text-primary" title={section.date}>
                                    {section.label}
                                </span>
                                <span className="flex-1 h-px bg-border-subtle" />
                                <span className="text-[10px] text-muted tabular-nums">
                                    {section.groups.length} {section.groups.length === 1 ? 'student' : 'students'}
                                </span>
                            </div>
                            <ul>
                                {section.groups.map((group, i) => (
                                    <ActivityRow
                                        key={group.key || `${group.studentId}-${group.date}-${i}`}
                                        group={group}
                                        onNavigate={onNavigate}
                                        onOpenStudentDetail={onOpenStudentDetail}
                                    />
                                ))}
                            </ul>
                        </div>
                    ))}

                    {hasMore && (
                        <div className="px-2 pt-2">
                            <button
                                type="button"
                                onClick={onShowMore}
                                className="w-full h-9 rounded-xl border border-dashed border-border-strong text-xs font-semibold text-muted hover:text-brand-500 hover:border-brand-500/40 hover:bg-brand-500/5 transition-colors cursor-pointer"
                            >
                                Show more ({total - groupedActivity.length} remaining)
                            </button>
                        </div>
                    )}
                </div>
            )}
        </DashboardCard>
    );
}
