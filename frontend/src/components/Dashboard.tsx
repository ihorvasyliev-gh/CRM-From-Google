import { useMemo, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, UserPlus, BookOpen, GraduationCap, Sparkles, Clock } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fetchAllEnrollments } from '../hooks/useEnrollments';
import { cleanVariant } from '../lib/types';
import DashboardKPIs from './Dashboard/DashboardKPIs';
import RegistrationLinkCard from './Dashboard/RegistrationLinkCard';
import ExpiredInvitesCard from './Dashboard/ExpiredInvitesCard';
import UpcomingCohortsCard from './Dashboard/UpcomingCohortsCard';
import DashboardActivityFeed, { type ActivityFilter, type GroupedActivity } from './Dashboard/DashboardActivityFeed';
import StatusBreakdownCard from './Dashboard/StatusBreakdownCard';
import { calculateExpiredInvites, groupUpcomingCohorts } from './Dashboard/dashboardUtils';

export interface DashboardProps {
    onNavigate?: (tab: string, filter?: any) => void;
    onOpenStudentDetail?: (studentId: string) => void;
    pendingApprovalsCount?: number;
    onOpenApprovals?: () => void;
}

function parseSafeDate(dateStr: string | null | undefined): { dateKey: string; dateLabel: string; time: number } {
    const dateOpts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' };
    if (!dateStr) {
        const now = new Date();
        return { dateKey: now.toISOString().slice(0, 10), dateLabel: now.toLocaleDateString('en-IE', dateOpts), time: now.getTime() };
    }
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) {
        const now = new Date();
        return { dateKey: now.toISOString().slice(0, 10), dateLabel: now.toLocaleDateString('en-IE', dateOpts), time: now.getTime() };
    }
    return {
        dateKey: d.toISOString().slice(0, 10),
        dateLabel: d.toLocaleDateString('en-IE', dateOpts),
        time: d.getTime(),
    };
}

const VALID_FILTERS: ActivityFilter[] = ['all', 'requested', 'invited', 'confirmed', 'completed'];

export default function Dashboard({
    onNavigate,
    onOpenStudentDetail,
    pendingApprovalsCount,
    onOpenApprovals,
}: DashboardProps) {
    const [activityFilter, setActivityFilter] = useState<ActivityFilter>(() => {
        const stored = localStorage.getItem('dashboardActivityFilter') as ActivityFilter;
        return stored && VALID_FILTERS.includes(stored) ? stored : 'all';
    });

    useEffect(() => {
        localStorage.setItem('dashboardActivityFilter', activityFilter);
    }, [activityFilter]);

    // Stats counts — staleTime 30s
    const { data: stats = { students: 0, courses: 0, enrollments: 0 }, isLoading: statsLoading } = useQuery({
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
    const { data: allEnrollments = [], isLoading: enrollmentsLoading } = useQuery({
        queryKey: ['enrollments'],
        queryFn: fetchAllEnrollments,
        staleTime: 30_000,
    });

    const loading = statsLoading || enrollmentsLoading;

    // Operational KPI counts & breakdown
    const statusCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const e of allEnrollments) {
            counts[e.status] = (counts[e.status] || 0) + 1;
        }
        return counts;
    }, [allEnrollments]);

    const statusBreakdown = statusCounts;

    // Expired invites & upcoming cohorts
    const expiredInvites = useMemo(() => calculateExpiredInvites(allEnrollments), [allEnrollments]);
    const upcomingCohorts = useMemo(() => groupUpcomingCohorts(allEnrollments), [allEnrollments]);

    // Filtered recent enrollments
    const filteredRecent = useMemo(() => {
        const mappedEnrollments = allEnrollments.map((en: any) => {
            const time = en.created_at ? new Date(en.created_at).getTime() : 0;
            return {
                id: en.id,
                student_id: en.student_id,
                course_id: en.course_id,
                status: en.status,
                created_at: en.created_at,
                timestamp: isNaN(time) ? 0 : time,
                updated_at: en.updated_at,
                course_variant: en.course_variant,
                students: en.students ? { first_name: en.students.first_name, last_name: en.students.last_name } : null,
                courses: en.courses ? { name: en.courses.name } : null,
            };
        });

        const targetList = activityFilter === 'all'
            ? mappedEnrollments
            : mappedEnrollments.filter((en: any) => en.status === activityFilter);

        return targetList.sort((a: any, b: any) => b.timestamp - a.timestamp);
    }, [allEnrollments, activityFilter]);

    // Index enrollments by student_id for fast history lookup
    const enrollmentsByStudent = useMemo(() => {
        const map = new Map<string, typeof allEnrollments>();
        for (const e of allEnrollments) {
            const sid = e.student_id;
            if (!sid) continue;
            let list = map.get(sid);
            if (!list) {
                list = [];
                map.set(sid, list);
            }
            list.push(e);
        }
        return map;
    }, [allEnrollments]);

    // Group enrollments by student + day
    const groupedActivity = useMemo((): GroupedActivity[] => {
        const groupMap = new Map<string, GroupedActivity>();

        for (const en of filteredRecent) {
            const studentName = [en.students?.first_name, en.students?.last_name].filter(Boolean).join(' ') || 'Unknown';
            const studentId = en.student_id || en.id;
            const { dateKey, dateLabel } = parseSafeDate(en.created_at);
            const groupKey = `${studentId}__${dateKey}`;

            if (!groupMap.has(groupKey)) {
                groupMap.set(groupKey, {
                    key: groupKey,
                    studentName,
                    studentId,
                    date: dateKey,
                    dateLabel,
                    enrollments: [],
                    previousEnrollments: [],
                });
            }

            const group = groupMap.get(groupKey)!;
            group.enrollments.push({
                id: en.id,
                courseId: en.course_id,
                courseName: en.courses?.name || 'Unknown Course',
                courseVariant: en.course_variant,
                status: en.status,
            });
        }

        let allGroupsList = Array.from(groupMap.values()).sort((a, b) => b.date.localeCompare(a.date));

        if (activityFilter !== 'all') {
            allGroupsList = allGroupsList.filter(g => g.enrollments.some(en => en.status === activityFilter));
        }

        const visibleGroups = allGroupsList.slice(0, 50);

        for (const group of visibleGroups) {
            const studentAllEn = enrollmentsByStudent.get(group.studentId) || [];

            const hasPriorEnrollments = studentAllEn.some(en => {
                const { dateKey } = parseSafeDate(en.created_at);
                return dateKey < group.date;
            });
            group.isNew = !hasPriorEnrollments;

            const otherDaysMap = new Map<string, {
                dateLabel: string;
                enrollments: {
                    id: string;
                    courseId?: string;
                    courseName: string;
                    courseVariant: string | null;
                    status: string;
                }[];
            }>();

            for (const en of studentAllEn) {
                const { dateKey, dateLabel } = parseSafeDate(en.created_at);
                if (dateKey === group.date) {
                    continue;
                }
                const courseName = en.courses?.name || 'Unknown Course';
                if (!otherDaysMap.has(dateKey)) {
                    otherDaysMap.set(dateKey, {
                        dateLabel,
                        enrollments: [],
                    });
                }
                const dayData = otherDaysMap.get(dateKey)!;
                dayData.enrollments.push({
                    id: en.id,
                    courseId: en.course_id,
                    courseName,
                    courseVariant: en.course_variant,
                    status: en.status,
                });
            }

            const sortedDates = Array.from(otherDaysMap.keys()).sort((a, b) => b.localeCompare(a));
            for (const dKey of sortedDates) {
                const dayData = otherDaysMap.get(dKey)!;

                const otherCourseGroups = new Map<string, typeof dayData.enrollments>();
                for (const en of dayData.enrollments) {
                    const grpKey = `${en.courseName}:::${en.status}`;
                    const existing = otherCourseGroups.get(grpKey) || [];
                    existing.push(en);
                    otherCourseGroups.set(grpKey, existing);
                }

                const groupedOtherEnrollments = Array.from(otherCourseGroups.entries()).map(([_, ens]) => {
                    const courseName = ens[0].courseName;
                    const status = ens[0].status;
                    const variants = ens
                        .map(en => cleanVariant(courseName, en.courseVariant))
                        .filter((v, idx, self) => v && self.indexOf(v) === idx);
                    const first = ens[0];
                    return {
                        id: first.id,
                        courseId: first.courseId,
                        courseName,
                        courseVariant: variants.length > 0 ? variants.join(', ') : null,
                        status,
                    };
                }).sort((a, b) => {
                    const STATUS_PRIORITY: Record<string, number> = {
                        confirmed: 1,
                        invited: 2,
                        completed: 3,
                        requested: 4,
                        withdrawn: 5,
                        rejected: 6,
                    };
                    const pA = STATUS_PRIORITY[a.status] || 99;
                    const pB = STATUS_PRIORITY[b.status] || 99;
                    if (pA !== pB) return pA - pB;
                    return a.courseName.localeCompare(b.courseName);
                });

                for (const en of groupedOtherEnrollments) {
                    group.previousEnrollments.push({
                        id: en.id,
                        courseId: en.courseId,
                        courseName: en.courseName,
                        courseVariant: en.courseVariant,
                        status: en.status,
                        dateLabel: dayData.dateLabel,
                    });
                }
            }

            const courseGroups = new Map<string, typeof group.enrollments>();
            for (const en of group.enrollments) {
                const grpKey = `${en.courseName}:::${en.status}`;
                const existing = courseGroups.get(grpKey) || [];
                existing.push(en);
                courseGroups.set(grpKey, existing);
            }

            group.enrollments = Array.from(courseGroups.entries()).map(([_, ens]) => {
                const courseName = ens[0].courseName;
                const status = ens[0].status;
                const variants = ens
                    .map(en => cleanVariant(courseName, en.courseVariant))
                    .filter((v, idx, self) => v && self.indexOf(v) === idx);

                const first = ens[0];
                return {
                    id: first.id,
                    courseId: first.courseId,
                    courseName,
                    courseVariant: variants.length > 0 ? variants.join(', ') : null,
                    status,
                };
            }).sort((a, b) => {
                const STATUS_PRIORITY: Record<string, number> = {
                    confirmed: 1,
                    invited: 2,
                    completed: 3,
                    requested: 4,
                    withdrawn: 5,
                    rejected: 6,
                };
                const pA = STATUS_PRIORITY[a.status] || 99;
                const pB = STATUS_PRIORITY[b.status] || 99;
                if (pA !== pB) return pA - pB;
                return a.courseName.localeCompare(b.courseName);
            });
        }

        return visibleGroups;
    }, [filteredRecent, activityFilter, enrollmentsByStudent]);

    // Badge counts per activity filter
    const filterCounts = useMemo(() => {
        const counts: Record<ActivityFilter, number> = {
            all: 0,
            requested: 0,
            invited: 0,
            confirmed: 0,
            completed: 0,
        };

        for (const en of allEnrollments) {
            if (en.status === 'requested') counts.requested++;
            else if (en.status === 'invited') counts.invited++;
            else if (en.status === 'confirmed') counts.confirmed++;
            else if (en.status === 'completed') counts.completed++;
        }

        counts.all = allEnrollments.length;
        counts.all = Math.min(counts.all, 50);
        counts.requested = Math.min(counts.requested, 50);

        return counts;
    }, [allEnrollments]);

    return (
        <div className="w-full space-y-4 sm:space-y-6">
            {/* Pending Approvals Notice if any */}
            {pendingApprovalsCount && pendingApprovalsCount > 0 ? (
                <div className="flex items-center justify-between p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300">
                    <div className="flex items-center gap-2 text-xs font-bold">
                        <Clock size={15} />
                        <span>{pendingApprovalsCount} course completion request{pendingApprovalsCount > 1 ? 's' : ''} awaiting approval</span>
                    </div>
                    <button
                        type="button"
                        onClick={onOpenApprovals}
                        className="px-2.5 py-1 text-xs font-bold bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors cursor-pointer"
                    >
                        Review
                    </button>
                </div>
            ) : null}

            {/* Mobile View (1023px and below) */}
            <div className="block lg:hidden space-y-4">
                {/* 1. Top banner: Registration Link */}
                <RegistrationLinkCard variant="compact" />

                {/* 2. Operational KPIs */}
                <DashboardKPIs
                    stats={stats}
                    statusCounts={statusCounts}
                    onNavigate={onNavigate}
                    loading={loading}
                />

                {/* 3. Quick Action Chips */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                    <button
                        type="button"
                        onClick={() => onNavigate?.('students')}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface hover:bg-surface-elevated border border-border-subtle hover:border-brand-500/30 text-xs font-semibold text-primary transition-all shadow-xs flex-shrink-0 cursor-pointer"
                    >
                        <UserPlus size={14} className="text-brand-500" />
                        <span>+ Student</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => onNavigate?.('enrollments')}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface hover:bg-surface-elevated border border-border-subtle hover:border-brand-500/30 text-xs font-semibold text-primary transition-all shadow-xs flex-shrink-0 cursor-pointer"
                    >
                        <Plus size={14} className="text-brand-500" />
                        <span>+ Enroll</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => onNavigate?.('enrollments')}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface hover:bg-surface-elevated border border-border-subtle hover:border-brand-500/30 text-xs font-semibold text-primary transition-all shadow-xs flex-shrink-0 cursor-pointer"
                    >
                        <GraduationCap size={14} className="text-brand-500" />
                        <span>Board</span>
                    </button>
                </div>

                {/* 4. Needs Attention: Expired Invites */}
                <ExpiredInvitesCard
                    items={expiredInvites}
                    onNavigate={onNavigate}
                    onOpenStudentDetail={onOpenStudentDetail}
                />

                {/* 5. Upcoming Cohorts */}
                <UpcomingCohortsCard
                    cohorts={upcomingCohorts}
                    onNavigate={onNavigate}
                />

                {/* 6. Activity Stream */}
                <DashboardActivityFeed
                    groupedActivity={groupedActivity}
                    activityFilter={activityFilter}
                    setActivityFilter={setActivityFilter}
                    filterCounts={filterCounts}
                    onNavigate={onNavigate}
                    onOpenStudentDetail={onOpenStudentDetail}
                    loading={loading}
                />
            </div>

            {/* Desktop View (1024px+) */}
            <div className="hidden lg:grid lg:grid-cols-12 gap-6">
                {/* Top Row: Operational KPIs */}
                <div className="lg:col-span-12">
                    <DashboardKPIs
                        stats={stats}
                        statusCounts={statusCounts}
                        onNavigate={onNavigate}
                        loading={loading}
                    />
                </div>

                {/* Left Column (8 cols): Upcoming Cohorts & Activity Feed */}
                <div className="lg:col-span-8 space-y-6">
                    <UpcomingCohortsCard
                        cohorts={upcomingCohorts}
                        onNavigate={onNavigate}
                    />
                    <DashboardActivityFeed
                        groupedActivity={groupedActivity}
                        activityFilter={activityFilter}
                        setActivityFilter={setActivityFilter}
                        filterCounts={filterCounts}
                        onNavigate={onNavigate}
                        onOpenStudentDetail={onOpenStudentDetail}
                        loading={loading}
                    />
                </div>

                {/* Right Column (4 cols): Registration Card, Expired Invites, Quick Actions, Status Breakdown */}
                <div className="lg:col-span-4 space-y-6">
                    <RegistrationLinkCard variant="card" />

                    <ExpiredInvitesCard
                        items={expiredInvites}
                        onNavigate={onNavigate}
                        onOpenStudentDetail={onOpenStudentDetail}
                    />

                    {/* Quick Actions Card */}
                    <div className="p-4 rounded-2xl bg-surface border border-border-subtle shadow-card">
                        <h3 className="text-xs font-bold text-muted uppercase tracking-wider mb-3 flex items-center gap-2">
                            <Sparkles size={14} className="text-brand-500" /> Quick Actions
                        </h3>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => onNavigate?.('students')}
                                className="flex items-center gap-2.5 p-2.5 rounded-xl bg-surface-elevated/60 hover:bg-surface-elevated border border-border-subtle hover:border-brand-500/30 text-left transition-all group cursor-pointer"
                            >
                                <div className="p-1.5 rounded-lg bg-brand-500/10 text-brand-500 group-hover:bg-brand-500 group-hover:text-white transition-colors">
                                    <UserPlus size={14} />
                                </div>
                                <div className="min-w-0">
                                    <span className="block text-xs font-semibold text-primary group-hover:text-brand-500 transition-colors">+ Student</span>
                                    <span className="block text-[10px] text-muted truncate">New record</span>
                                </div>
                            </button>
                            <button
                                type="button"
                                onClick={() => onNavigate?.('courses')}
                                className="flex items-center gap-2.5 p-2.5 rounded-xl bg-surface-elevated/60 hover:bg-surface-elevated border border-border-subtle hover:border-brand-500/30 text-left transition-all group cursor-pointer"
                            >
                                <div className="p-1.5 rounded-lg bg-violet-500/10 text-violet-600 group-hover:bg-violet-500 group-hover:text-white transition-colors">
                                    <BookOpen size={14} />
                                </div>
                                <div className="min-w-0">
                                    <span className="block text-xs font-semibold text-primary group-hover:text-violet-600 transition-colors">+ Course</span>
                                    <span className="block text-[10px] text-muted truncate">Manage catalog</span>
                                </div>
                            </button>
                            <button
                                type="button"
                                onClick={() => onNavigate?.('enrollments')}
                                className="flex items-center gap-2.5 p-2.5 rounded-xl bg-surface-elevated/60 hover:bg-surface-elevated border border-border-subtle hover:border-brand-500/30 text-left transition-all group cursor-pointer"
                            >
                                <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                                    <Plus size={14} />
                                </div>
                                <div className="min-w-0">
                                    <span className="block text-xs font-semibold text-primary group-hover:text-emerald-600 transition-colors">+ Enroll</span>
                                    <span className="block text-[10px] text-muted truncate">New registration</span>
                                </div>
                            </button>
                            <button
                                type="button"
                                onClick={() => onNavigate?.('enrollments')}
                                className="flex items-center gap-2.5 p-2.5 rounded-xl bg-surface-elevated/60 hover:bg-surface-elevated border border-border-subtle hover:border-brand-500/30 text-left transition-all group cursor-pointer"
                            >
                                <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 group-hover:bg-amber-500 group-hover:text-white transition-colors">
                                    <GraduationCap size={14} />
                                </div>
                                <div className="min-w-0">
                                    <span className="block text-xs font-semibold text-primary group-hover:text-amber-600 transition-colors">Open Kanban</span>
                                    <span className="block text-[10px] text-muted truncate">Board view</span>
                                </div>
                            </button>
                        </div>
                    </div>

                    {/* Status Breakdown */}
                    <StatusBreakdownCard
                        statusBreakdown={statusBreakdown}
                        loading={loading}
                        onNavigate={onNavigate}
                    />
                </div>
            </div>
        </div>
    );
}
