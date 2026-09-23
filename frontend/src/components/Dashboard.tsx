import { useMemo, useState, useEffect, useDeferredValue, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, UserPlus, BookOpen, KanbanSquare, Clock, RefreshCw, ArrowRight, type LucideIcon } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fetchAllEnrollments } from '../hooks/useEnrollments';
import DashboardKPIs, { type KpiHint, type KpiKey } from './Dashboard/DashboardKPIs';
import RegistrationLinkCard from './Dashboard/RegistrationLinkCard';
import ExpiredInvitesCard from './Dashboard/ExpiredInvitesCard';
import UpcomingCohortsCard from './Dashboard/UpcomingCohortsCard';
import DashboardActivityFeed, { type ActivityFilter } from './Dashboard/DashboardActivityFeed';
import StatusBreakdownCard from './Dashboard/StatusBreakdownCard';
import {
    buildActivityGroups,
    calculateExpiredInvites,
    countStaleRequests,
    daysBetween,
    groupUpcomingCohorts,
    localDateKey,
} from './Dashboard/dashboardUtils';
import { useIsMobile } from '../hooks/useScreenSize';

export interface DashboardProps {
    onNavigate?: (tab: string, filter?: any) => void;
    onOpenStudentDetail?: (studentId: string) => void;
    pendingApprovalsCount?: number;
    onOpenApprovals?: () => void;
    /** Opens the global "Add Student" modal (falls back to navigating to Students). */
    onAddStudent?: () => void;
    /** Opens the global "New Enrollment" modal (falls back to navigating to Enrollments). */
    onAddEnrollment?: () => void;
}

const VALID_FILTERS: ActivityFilter[] = ['all', 'requested', 'invited', 'confirmed', 'completed'];
const ACTIVITY_PAGE_SIZE = 20;

function greeting(hour: number): string {
    if (hour < 5) return 'Good evening';
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
}

function updatedLabel(updatedAt: number, now: number): string {
    if (!updatedAt) return '';
    const mins = Math.floor((now - updatedAt) / 60_000);
    if (mins < 1) return 'Updated just now';
    if (mins < 60) return `Updated ${mins}m ago`;
    return `Updated ${Math.floor(mins / 60)}h ago`;
}

interface QuickAction {
    key: string;
    label: string;
    icon: LucideIcon;
    onClick: () => void;
    primary?: boolean;
}

function QuickActionButton({ action, compact = false }: { action: QuickAction; compact?: boolean }) {
    const Icon = action.icon;
    return (
        <button
            type="button"
            onClick={action.onClick}
            className={`flex items-center gap-1.5 flex-shrink-0 rounded-xl text-xs font-semibold transition-all active:scale-95 cursor-pointer ${
                compact ? 'h-9 px-3' : 'h-9 px-3.5'
            } ${
                action.primary
                    ? 'bg-brand-500 hover:bg-brand-600 text-white shadow-glow-sm'
                    : 'bg-surface hover:bg-surface-elevated text-primary border border-border-subtle hover:border-border-strong shadow-card'
            }`}
        >
            <Icon size={14} className={action.primary ? '' : 'text-brand-500'} />
            <span>{action.label}</span>
        </button>
    );
}

export default function Dashboard({
    onNavigate,
    onOpenStudentDetail,
    pendingApprovalsCount,
    onOpenApprovals,
    onAddStudent,
    onAddEnrollment,
}: DashboardProps) {
    const isMobile = useIsMobile();
    const queryClient = useQueryClient();

    const [activityFilter, setActivityFilter] = useState<ActivityFilter>(() => {
        try {
            const stored = localStorage.getItem('dashboardActivityFilter') as ActivityFilter;
            return stored && VALID_FILTERS.includes(stored) ? stored : 'all';
        } catch {
            return 'all';
        }
    });
    const [activitySearch, setActivitySearch] = useState('');
    const deferredSearch = useDeferredValue(activitySearch);
    const [activityLimit, setActivityLimit] = useState(ACTIVITY_PAGE_SIZE);

    useEffect(() => {
        try {
            localStorage.setItem('dashboardActivityFilter', activityFilter);
        } catch {
            // ignore storage errors
        }
    }, [activityFilter]);

    // Reset paging whenever the feed query changes
    useEffect(() => {
        setActivityLimit(ACTIVITY_PAGE_SIZE);
    }, [activityFilter, deferredSearch]);

    // Re-render every 30s so the "Updated x ago" label stays fresh
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 30_000);
        return () => clearInterval(id);
    }, []);

    const handleAddStudent = () => (onAddStudent ? onAddStudent() : onNavigate?.('students'));
    const handleAddEnrollment = () => (onAddEnrollment ? onAddEnrollment() : onNavigate?.('enrollments'));

    // Stats counts — staleTime 30s
    const {
        data: stats = { students: 0, courses: 0, enrollments: 0 },
        isLoading: statsLoading,
        isFetching: statsFetching,
    } = useQuery({
        queryKey: ['dashboard_stats'],
        queryFn: async () => {
            const [studRes, courseRes, enrollRes] = await Promise.all([
                supabase.from('students').select('*', { count: 'exact', head: true }),
                supabase.from('courses').select('*', { count: 'exact', head: true }),
                supabase.from('enrollments').select('*', { count: 'exact', head: true }),
            ]);
            return {
                students: studRes.count || 0,
                courses: courseRes.count || 0,
                enrollments: enrollRes.count || 0,
            };
        },
        staleTime: 30_000,
    });

    // Reuse the global ['enrollments'] cache (staleTime 30_000)
    const {
        data: allEnrollments = [],
        isLoading: enrollmentsLoading,
        isFetching: enrollmentsFetching,
        dataUpdatedAt,
    } = useQuery({
        queryKey: ['enrollments'],
        queryFn: fetchAllEnrollments,
        staleTime: 30_000,
    });

    const loading = statsLoading || enrollmentsLoading;
    const refreshing = !loading && (statsFetching || enrollmentsFetching);

    const handleRefresh = () => {
        queryClient.invalidateQueries({ queryKey: ['dashboard_stats'] });
        queryClient.invalidateQueries({ queryKey: ['enrollments'] });
    };

    const statusCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const e of allEnrollments) {
            counts[e.status] = (counts[e.status] || 0) + 1;
        }
        return counts;
    }, [allEnrollments]);

    const expiredInvites = useMemo(() => calculateExpiredInvites(allEnrollments), [allEnrollments]);
    const upcomingCohorts = useMemo(() => groupUpcomingCohorts(allEnrollments), [allEnrollments]);
    const staleRequests = useMemo(() => countStaleRequests(allEnrollments), [allEnrollments]);

    const { groups: groupedActivity, total: totalActivityGroups } = useMemo(
        () => buildActivityGroups(allEnrollments, { filter: activityFilter, search: deferredSearch, limit: activityLimit }),
        [allEnrollments, activityFilter, deferredSearch, activityLimit],
    );

    const filterCounts = useMemo((): Record<ActivityFilter, number> => ({
        all: allEnrollments.length,
        requested: statusCounts.requested || 0,
        invited: statusCounts.invited || 0,
        confirmed: statusCounts.confirmed || 0,
        completed: statusCounts.completed || 0,
    }), [allEnrollments.length, statusCounts]);

    // Contextual one-liners under each KPI number
    const kpiHints = useMemo(() => {
        const hints: Partial<Record<KpiKey, KpiHint>> = {
            students: { text: `${stats.enrollments} enrollments · ${stats.courses} courses` },
        };
        if (staleRequests > 0) hints.requested = { text: `${staleRequests} waiting over 7 days`, tone: 'alert' };
        const overdue = expiredInvites.filter(i => i.isExpired).length;
        if (overdue > 0) hints.invited = { text: `${overdue} past response deadline`, tone: 'alert' };
        const todayKey = localDateKey(new Date());
        const startingSoon = upcomingCohorts
            .filter(c => daysBetween(todayKey, c.date) <= 7)
            .reduce((acc, c) => acc + c.confirmedCount, 0);
        if (startingSoon > 0) hints.confirmed = { text: `${startingSoon} starting within 7 days`, tone: 'positive' };
        return hints;
    }, [stats, staleRequests, expiredInvites, upcomingCohorts]);

    const quickActions: QuickAction[] = [
        { key: 'student', label: 'Student', icon: UserPlus, onClick: handleAddStudent, primary: true },
        { key: 'enroll', label: 'Enroll', icon: Plus, onClick: handleAddEnrollment },
        { key: 'course', label: 'Course', icon: BookOpen, onClick: () => onNavigate?.('courses', { openCreate: true }) },
        { key: 'board', label: 'Board', icon: KanbanSquare, onClick: () => onNavigate?.('enrollments') },
    ];

    const today = new Date(now);
    const header = (
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
            <div className="min-w-0">
                <h2 className="text-xl sm:text-2xl font-bold text-primary tracking-tight">{greeting(today.getHours())}</h2>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                    <span>{today.toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
                    {dataUpdatedAt > 0 && (
                        <>
                            <span className="w-1 h-1 rounded-full bg-border-strong" aria-hidden />
                            <span>{refreshing ? 'Refreshing…' : updatedLabel(dataUpdatedAt, now)}</span>
                        </>
                    )}
                    <button
                        type="button"
                        onClick={handleRefresh}
                        disabled={loading || refreshing}
                        aria-label="Refresh dashboard"
                        title="Refresh"
                        className="p-1 rounded-md text-muted hover:text-brand-500 hover:bg-brand-500/10 disabled:opacity-50 transition-colors cursor-pointer"
                    >
                        <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-none -mx-4 px-4 lg:mx-0 lg:px-0 pb-0.5">
                {quickActions.map(a => (
                    <QuickActionButton key={a.key} action={a} compact={isMobile} />
                ))}
            </div>
        </div>
    );

    const approvalsBanner: ReactNode = pendingApprovalsCount && pendingApprovalsCount > 0 ? (
        <div className="flex items-center justify-between gap-3 p-3 pl-4 rounded-2xl bg-amber-500/10 border border-amber-500/30">
            <div className="flex items-center gap-3 min-w-0">
                <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex-shrink-0">
                    <Clock size={16} />
                </span>
                <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-primary">
                        {pendingApprovalsCount} course completion request{pendingApprovalsCount > 1 ? 's' : ''} awaiting approval
                    </p>
                    <p className="text-[11px] text-muted hidden sm:block">Review them to update student outcomes</p>
                </div>
            </div>
            <button
                type="button"
                onClick={onOpenApprovals}
                className="flex items-center gap-1 h-8 px-3 text-xs font-semibold bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors cursor-pointer flex-shrink-0"
            >
                Review <ArrowRight size={13} />
            </button>
        </div>
    ) : null;

    const kpis = (
        <DashboardKPIs stats={stats} statusCounts={statusCounts} onNavigate={onNavigate} loading={loading} hints={kpiHints} />
    );
    const cohorts = <UpcomingCohortsCard cohorts={upcomingCohorts} onNavigate={onNavigate} />;
    const expired = (
        <ExpiredInvitesCard items={expiredInvites} onNavigate={onNavigate} onOpenStudentDetail={onOpenStudentDetail} />
    );
    const statusBreakdown = <StatusBreakdownCard statusBreakdown={statusCounts} loading={loading} onNavigate={onNavigate} />;
    const activity = (
        <DashboardActivityFeed
            groupedActivity={groupedActivity}
            activityFilter={activityFilter}
            setActivityFilter={setActivityFilter}
            filterCounts={filterCounts}
            onNavigate={onNavigate}
            onOpenStudentDetail={onOpenStudentDetail}
            loading={loading}
            search={activitySearch}
            onSearchChange={setActivitySearch}
            totalGroups={totalActivityGroups}
            onShowMore={() => setActivityLimit(l => l + ACTIVITY_PAGE_SIZE)}
        />
    );

    return (
        <div className="w-full space-y-4 sm:space-y-6">
            {header}
            {approvalsBanner}
            {kpis}

            {/* Only one layout is mounted to avoid rendering everything twice */}
            {isMobile ? (
                <div className="space-y-4">
                    {expired}
                    {cohorts}
                    {activity}
                    {statusBreakdown}
                    <RegistrationLinkCard variant="compact" />
                </div>
            ) : (
                <div className="grid grid-cols-12 gap-6 items-start">
                    <div className="col-span-8 space-y-6 min-w-0">
                        {cohorts}
                        {activity}
                    </div>
                    <div className="col-span-4 space-y-6 min-w-0">
                        {expired}
                        {statusBreakdown}
                        <RegistrationLinkCard variant="card" />
                    </div>
                </div>
            )}
        </div>
    );
}
