import { useMemo, useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Users, BookOpen, GraduationCap, Plus, UserPlus, Clock, TrendingUp, ArrowUpRight, Sparkles, Filter } from 'lucide-react';
import { fetchAllEnrollments } from '../hooks/useEnrollments';
import { cleanVariant } from '../lib/types';

interface DashboardProps {
    onNavigate?: (tab: string) => void;
}

interface GroupedActivity {
    key: string;                // studentName + date for unique key
    studentName: string;
    studentId: string;
    date: string;               // ISO date string (YYYY-MM-DD)
    dateLabel: string;          // formatted "24 May"
    isNew?: boolean;            // true if this is the student's first ever registration day
    enrollments: {
        id: string;
        courseName: string;
        courseVariant: string | null;
        status: string;
    }[];
    previousEnrollments: {
        id: string;
        courseName: string;
        courseVariant: string | null;
        status: string;
        dateLabel: string;
    }[];
}

const STATUS_DOT: Record<string, string> = {
    requested: 'bg-warning',
    invited:   'bg-info',
    confirmed: 'bg-success',
    completed: 'bg-[oklch(var(--status-completed))]',
    withdrawn: 'bg-muted',
    rejected:  'bg-danger',
};

const FILTER_ACTIVE_CLASSES: Record<ActivityFilter, string> = {
    all:       'bg-brand-500 text-white border-brand-500 shadow-glow-sm scale-105',
    requested: 'status-pill-requested border-warning/50 font-bold scale-105 shadow-sm',
    invited:   'status-pill-invited   border-info/50    font-bold scale-105 shadow-sm',
    confirmed: 'status-pill-confirmed border-success/50 font-bold scale-105 shadow-sm',
    completed: 'status-pill-completed border-[oklch(var(--status-completed)/0.50)] font-bold scale-105 shadow-sm',
};


// ─── Skeleton Components ─────────────────────────────────────
function SkeletonStatCard() {
    return (
        <div className="relative bg-surface rounded-2xl shadow-card border border-border-subtle p-5 overflow-hidden animate-pulse">
            <div className="absolute top-0 left-0 right-0 h-1 bg-surface-elevated" />
            <div className="flex items-start justify-between">
                <div>
                    <div className="h-3 w-24 rounded bg-surface-elevated mb-3" />
                    <div className="h-10 w-16 rounded-lg bg-surface-elevated" />
                </div>
                <div className="w-12 h-12 rounded-xl bg-surface-elevated" />
            </div>
        </div>
    );
}

function SkeletonActivityItem() {
    return (
        <div className="flex items-center justify-between gap-4 p-3.5 rounded-xl bg-surface-elevated/30 border border-border-subtle shadow-sm animate-pulse">
            <div className="flex items-center gap-3.5 min-w-0 flex-1">
                <div className="w-2.5 h-2.5 rounded-full bg-surface-elevated flex-shrink-0" />
                <div className="flex-1 min-w-0 sm:grid sm:grid-cols-2 sm:gap-4 sm:items-center">
                    <div>
                        <div className="h-4 w-32 rounded bg-surface-elevated mb-1.5" />
                        <div className="h-3 w-20 rounded bg-surface-elevated" />
                    </div>
                    <div className="hidden sm:block">
                        <div className="h-4 w-40 rounded bg-surface-elevated" />
                    </div>
                </div>
            </div>
            <div className="flex items-center gap-4 flex-shrink-0">
                <div className="h-5 w-16 rounded-full bg-surface-elevated" />
                <div className="h-4 w-12 rounded bg-surface-elevated" />
            </div>
        </div>
    );
}

function SkeletonStatusBreakdown() {
    return (
        <div className="space-y-5 animate-pulse">
            <div className="flex h-3.5 rounded-full overflow-hidden bg-surface-elevated" />
            <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex flex-col gap-2 p-3 rounded-xl bg-surface-elevated/50">
                        <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full bg-surface-elevated flex-shrink-0" />
                            <div className="h-3 w-16 rounded bg-surface-elevated" />
                        </div>
                        <div className="h-4 w-10 rounded bg-surface-elevated mt-1" />
                        <div className="h-1 w-full rounded-full bg-surface-elevated mt-1" />
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── Bento Card Component with Spotlight Effect ───────────────────
interface BentoCardProps extends React.HTMLAttributes<HTMLDivElement> {
    children: React.ReactNode;
    className?: string;
    glowColor?: string;
    accentGradient?: string;
}

function BentoCard({
    children,
    className = '',
    glowColor = 'rgba(99, 102, 241, 0.12)',
    accentGradient,
    ...props
}: BentoCardProps) {
    const cardRef = useRef<HTMLDivElement>(null);
    const [mouseCoords, setMouseCoords] = useState({ x: 0, y: 0 });

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!cardRef.current) return;
        const rect = cardRef.current.getBoundingClientRect();
        setMouseCoords({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        });
    };

    return (
        <div
            ref={cardRef}
            onMouseMove={handleMouseMove}
            className={`relative overflow-hidden rounded-2xl bg-surface border border-border-subtle hover:border-border-strong/50 transition-colors duration-300 group ${className}`}
            {...props}
        >
            {/* Spotlight Glow Overlay */}
            <div
                className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                style={{
                    background: `radial-gradient(350px circle at ${mouseCoords.x}px ${mouseCoords.y}px, ${glowColor}, transparent 80%)`,
                }}
            />

            {/* Top Accent Gradient */}
            {accentGradient && (
                <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${accentGradient}`} />
            )}

            {/* Content Container */}
            <div className="relative z-10 h-full">
                {children}
            </div>
        </div>
    );
}



type ActivityFilter = 'all' | 'requested' | 'invited' | 'confirmed' | 'completed';

const ACTIVITY_FILTERS: { key: ActivityFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'requested', label: 'Requested' },
    { key: 'invited', label: 'Invited' },
    { key: 'confirmed', label: 'Confirmed' },
    { key: 'completed', label: 'Completed' },
];

export default function Dashboard({ onNavigate }: DashboardProps) {
    const [activityFilter, setActivityFilter] = useState<ActivityFilter>(() => {
        return (localStorage.getItem('dashboardActivityFilter') as ActivityFilter) || 'all';
    });

    useEffect(() => {
        localStorage.setItem('dashboardActivityFilter', activityFilter);
    }, [activityFilter]);
    // Stats counts — 30s staleTime so they refresh in background on revisit after 30s
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
        staleTime: 30_000, // 30 seconds — shows cached instantly, refetches in background if stale
    });

    // Reuse the global ['enrollments'] cache for status breakdown and activity lists (same key as useEnrollments)
    const { data: allEnrollments = [], isLoading: enrollmentsLoading } = useQuery({
        queryKey: ['enrollments'],
        queryFn: fetchAllEnrollments,
    });

    // Derive status breakdown from cached enrollments
    const statusBreakdown = useMemo(() => {
        const breakdown: Record<string, number> = {};
        for (const e of allEnrollments) {
            breakdown[e.status] = (breakdown[e.status] || 0) + 1;
        }
        return breakdown;
    }, [allEnrollments]);

    const loading = statsLoading || enrollmentsLoading;

    // Build flat list of enrollments based on filter
    const filteredRecent = useMemo(() => {
        const mappedEnrollments = allEnrollments.map(en => ({
            id: en.id,
            student_id: en.student_id,
            status: en.status,
            created_at: en.created_at,
            updated_at: en.updated_at,
            course_variant: en.course_variant,
            students: en.students ? { first_name: en.students.first_name, last_name: en.students.last_name } : null,
            courses: en.courses ? { name: en.courses.name } : null,
        }));

        if (activityFilter === 'all') {
            return mappedEnrollments
                .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        }

        return mappedEnrollments
            .filter(en => en.status === activityFilter)
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }, [allEnrollments, activityFilter]);

    // Group enrollments by student + day
    const groupedActivity = useMemo((): GroupedActivity[] => {
        const source = filteredRecent;
        const dateOpts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' };

        // Build groups keyed by studentId + date
        const groupMap = new Map<string, GroupedActivity>();

        for (const en of source) {
            const studentName = [en.students?.first_name, en.students?.last_name].filter(Boolean).join(' ') || 'Unknown';
            const studentId = en.student_id || en.id;
            const dateObj = new Date(en.created_at);
            const dateKey = dateObj.toISOString().slice(0, 10); // YYYY-MM-DD
            const dateLabel = dateObj.toLocaleDateString('en-IE', dateOpts);
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
                courseName: en.courses?.name || 'Unknown Course',
                courseVariant: en.course_variant,
                status: en.status,
            });
        }

        // For each group, find this student's enrollments on OTHER days as "previous" using allEnrollments
        const allGroupsList = Array.from(groupMap.values());
        for (const group of allGroupsList) {
            const studentAllEn = allEnrollments.filter(e => e.student_id === group.studentId);
            
            // Check if this is the student's first ever registration day in the system
            const hasPriorEnrollments = studentAllEn.some(en => {
                const dateKey = new Date(en.created_at).toISOString().slice(0, 10);
                return dateKey < group.date;
            });
            group.isNew = !hasPriorEnrollments;

            const otherDaysMap = new Map<string, { 
                dateLabel: string; 
                enrollments: {
                    id: string;
                    courseName: string;
                    courseVariant: string | null;
                    status: string;
                }[];
            }>();

            for (const en of studentAllEn) {
                const dateObj = new Date(en.created_at);
                const dateKey = dateObj.toISOString().slice(0, 10);
                if (dateKey === group.date) {
                    continue;
                }
                const courseName = en.courses?.name || 'Unknown Course';
                if (!otherDaysMap.has(dateKey)) {
                    otherDaysMap.set(dateKey, {
                        dateLabel: dateObj.toLocaleDateString('en-IE', dateOpts),
                        enrollments: []
                    });
                }
                const dayData = otherDaysMap.get(dateKey)!;
                dayData.enrollments.push({
                    id: en.id,
                    courseName,
                    courseVariant: en.course_variant,
                    status: en.status
                });
            }

            const sortedDates = Array.from(otherDaysMap.keys()).sort((a, b) => b.localeCompare(a));
            for (const dKey of sortedDates) {
                const dayData = otherDaysMap.get(dKey)!;
                
                // Group by courseName on this other day
                const otherCourseGroups = new Map<string, typeof dayData.enrollments>();
                for (const en of dayData.enrollments) {
                    const existing = otherCourseGroups.get(en.courseName) || [];
                    existing.push(en);
                    otherCourseGroups.set(en.courseName, existing);
                }

                const groupedOtherEnrollments = Array.from(otherCourseGroups.entries()).map(([courseName, ens]) => {
                    const variants = ens
                        .map(en => cleanVariant(courseName, en.courseVariant))
                        .filter((v, idx, self) => v && self.indexOf(v) === idx);
                    const first = ens[0];
                    return {
                        id: first.id,
                        courseName,
                        courseVariant: variants.length > 0 ? variants.join(', ') : null,
                        status: first.status,
                    };
                });

                for (const en of groupedOtherEnrollments) {
                    group.previousEnrollments.push({
                        id: en.id,
                        courseName: en.courseName,
                        courseVariant: en.courseVariant,
                        status: en.status,
                        dateLabel: dayData.dateLabel
                    });
                }
            }

            // Combine enrollments of the same course name on this day
            const courseGroups = new Map<string, typeof group.enrollments>();
            for (const en of group.enrollments) {
                const existing = courseGroups.get(en.courseName) || [];
                existing.push(en);
                courseGroups.set(en.courseName, existing);
            }

            group.enrollments = Array.from(courseGroups.entries()).map(([courseName, ens]) => {
                // Clean and extract all unique variants
                const variants = ens
                    .map(en => cleanVariant(courseName, en.courseVariant))
                    .filter((v, idx, self) => v && self.indexOf(v) === idx);

                const first = ens[0];
                return {
                    id: first.id,
                    courseName,
                    courseVariant: variants.length > 0 ? variants.join(', ') : null,
                    status: first.status,
                };
            });
        }

        // Sort by date descending
        let sorted = allGroupsList.sort((a, b) => b.date.localeCompare(a.date));

        // Apply status filter at group level (for non-invited/confirmed filters)
        if (activityFilter !== 'all' && activityFilter !== 'invited' && activityFilter !== 'confirmed') {
            sorted = sorted.filter(g => g.enrollments.some(en => en.status === activityFilter));
        }

        // Limit the groups to 50 for 'all' and 'requested'
        if (activityFilter === 'all' || activityFilter === 'requested') {
            sorted = sorted.slice(0, 50);
        }

        return sorted;
    }, [filteredRecent, activityFilter, allEnrollments]);

    // Counts per filter for pill badges
    const filterCounts = useMemo(() => {
        const counts: Record<ActivityFilter, number> = {
            all: 0,
            requested: 0,
            invited: 0,
            confirmed: 0,
            completed: 0
        };

        for (const en of allEnrollments) {
            if (en.status === 'requested') counts.requested++;
            else if (en.status === 'invited') counts.invited++;
            else if (en.status === 'confirmed') counts.confirmed++;
            else if (en.status === 'completed') counts.completed++;
        }

        counts.all = allEnrollments.length;

        // Limit the badge count to 50 for 'all' and 'requested'
        counts.all = Math.min(counts.all, 50);
        counts.requested = Math.min(counts.requested, 50);

        return counts;
    }, [allEnrollments]);

    const statCards = [
        {
            label: 'Total Students',
            value: stats.students,
            icon: <Users size={22} />,
            gradient: 'from-brand-500 to-brand-600',
            iconBg: 'bg-brand-500/10 text-brand-600',
            accentColor: 'brand',
            tab: 'students'
        },
        {
            label: 'Active Courses',
            value: stats.courses,
            icon: <BookOpen size={22} />,
            gradient: 'from-violet-500 to-purple-600',
            iconBg: 'bg-violet-500/10 text-violet-600',
            accentColor: 'violet',
            tab: 'courses'
        },
        {
            label: 'Enrollments',
            value: stats.enrollments,
            icon: <GraduationCap size={22} />,
            gradient: 'from-emerald-500 to-teal-600',
            iconBg: 'bg-emerald-500/10 text-emerald-600',
            accentColor: 'emerald',
            tab: 'enrollments'
        },
    ];

    const totalStatus = Object.values(statusBreakdown).reduce((a, b) => a + b, 0);
    const statusItems = [
        { key: 'requested', label: 'Requested', color: 'bg-warning',                              lightBg: 'bg-warning/10 text-warning' },
        { key: 'invited',   label: 'Invited',   color: 'bg-info',                                 lightBg: 'bg-info/10 text-info' },
        { key: 'confirmed', label: 'Confirmed', color: 'bg-success',                              lightBg: 'bg-success/10 text-success' },
        { key: 'completed', label: 'Completed', color: 'bg-[oklch(var(--status-completed))]',     lightBg: 'bg-[oklch(var(--status-completed)/0.12)] text-status-completed' },
        { key: 'withdrawn', label: 'Withdrawn', color: 'bg-muted',                               lightBg: 'bg-muted/10 text-muted' },
        { key: 'rejected',  label: 'Rejected',  color: 'bg-danger',                              lightBg: 'bg-danger/10 text-danger' },
    ];

    return (
        <div className="grid grid-cols-1 grid-rows-auto lg:grid-cols-3 lg:grid-rows-[auto_1fr] gap-6 flex-1 min-h-0">
            {/* Top Row: Stats Cards (Full Width) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 lg:col-span-3 flex-shrink-0">
                {loading ? (
                    <>{Array.from({ length: 3 }).map((_, i) => <SkeletonStatCard key={i} />)}</>
                ) : (
                    statCards.map((card, i) => (
                        <BentoCard
                            key={card.label}
                            onClick={() => onNavigate?.(card.tab)}
                            accentGradient={card.gradient}
                            glowColor={card.accentColor === 'brand' ? 'oklch(var(--accent-primary) / 0.12)' : card.accentColor === 'violet' ? 'rgba(139, 92, 246, 0.12)' : 'rgba(16, 185, 129, 0.12)'}
                            className="p-5 cursor-pointer h-full"
                            style={{ animationDelay: `${i * 100}ms` }}
                        >
                            <div className="flex flex-col justify-between h-full min-h-[110px]">
                                <div className="flex items-start justify-between">
                                    <p className="text-[11px] font-bold text-muted uppercase tracking-wider">{card.label}</p>
                                    <div className={`p-2.5 rounded-xl ${card.iconBg} transition-transform duration-500 ease-spring group-hover:scale-110 shadow-sm`}>
                                        {card.icon}
                                    </div>
                                </div>
                                <div className="mt-4">
                                    <p className="text-4xl font-mono font-bold text-primary tracking-tight animate-countUp">{card.value}</p>
                                </div>
                            </div>
                        </BentoCard>
                    ))
                )}
            </div>

            {/* Left Column: Recent Activity (Col-span 2) */}
            <div className="lg:col-span-2 flex flex-col lg:min-h-0">
                <BentoCard
                    glowColor="oklch(var(--accent-primary) / 0.1)"
                    className="p-5 lg:flex-1 lg:min-h-0"
                >
                    <div className="flex flex-col h-auto lg:h-full">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-2">
                                <Clock size={14} className="text-brand-500" /> Recent Activity
                            </h3>
                            <Filter size={12} className="text-muted" />
                        </div>
                        {/* Filter pills */}
                        {/* Filter pills & Legend */}
                        {!loading && allEnrollments.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-4 items-center">
                                {ACTIVITY_FILTERS.map(f => {
                                    const isActive = activityFilter === f.key;
                                    return (
                                        <button
                                            key={f.key}
                                            onClick={() => setActivityFilter(f.key)}
                                            className={`text-[11px] font-semibold px-3 py-1 rounded-full border transition-all duration-300 ease-spring flex items-center gap-1.5 ${
                                                isActive
                                                    ? FILTER_ACTIVE_CLASSES[f.key]
                                                    : 'bg-surface-elevated/50 text-muted hover:text-primary border-border-subtle hover:border-border-strong hover:scale-105'
                                            }`}
                                        >
                                            {f.key !== 'all' && (
                                                <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[f.key]} ${isActive ? '' : 'opacity-60'} flex-shrink-0`} />
                                            )}
                                            {f.label} ({filterCounts[f.key]})
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                        {loading ? (
                            <div className="space-y-3 lg:flex-1 lg:overflow-y-auto pr-1">
                                {Array.from({ length: 6 }).map((_, i) => <SkeletonActivityItem key={i} />)}
                            </div>
                        ) : groupedActivity.length === 0 ? (
                            <div className="text-center py-8 lg:flex-1 flex flex-col justify-center items-center">
                                <Clock size={40} className="mb-2 text-muted/50" />
                                <p className="text-sm text-muted">{activityFilter === 'all' ? 'No recent activity' : `No ${activityFilter} enrollments`}</p>
                            </div>
                        ) : (
                            <div className="space-y-3 lg:overflow-y-auto pr-1 lg:flex-1 lg:min-h-0">
                                {groupedActivity.map((group, i) => {
                                    // Group history by date
                                    const historyByDate = new Map<string, typeof group.previousEnrollments>();
                                    for (const pe of group.previousEnrollments) {
                                        const existing = historyByDate.get(pe.dateLabel) || [];
                                        existing.push(pe);
                                        historyByDate.set(pe.dateLabel, existing);
                                    }

                                    // Build unified timeline events
                                    const timelineEvents = [
                                        {
                                            date: group.dateLabel,
                                            enrollments: group.enrollments,
                                            isCurrent: true,
                                            key: 'current'
                                        },
                                        ...Array.from(historyByDate.entries()).map(([date, enrollments]) => ({
                                            date,
                                            enrollments,
                                            isCurrent: false,
                                            key: date
                                        }))
                                    ];

                                    return (
                                        <div
                                            key={group.key}
                                            className="p-3.5 rounded-xl bg-surface-elevated/30 border border-border-subtle shadow-sm hover:bg-surface-elevated/60 hover:border-border-strong/30 hover:shadow-md transition-all duration-300 ease-spring cursor-default flex flex-col lg:flex-row gap-3 lg:gap-4"
                                            style={{ animationDelay: `${i * 50}ms` }}
                                        >
                                            {/* Left Column: Student Info */}
                                            <div className="flex flex-row items-center gap-2 w-full lg:flex-col lg:items-start lg:gap-1.5 lg:w-1/4 lg:min-w-[160px] lg:max-w-[240px] flex-shrink-0 pt-0.5">
                                                <span className="text-[13px] font-semibold text-primary truncate tracking-tight leading-tight">
                                                    {group.studentName}
                                                </span>
                                                {group.isNew && (
                                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-brand-500/10 text-brand-500 border border-brand-500/20 tracking-wider flex-shrink-0 select-none">
                                                        NEW
                                                    </span>
                                                )}
                                            </div>

                                            {/* Right Column: Unified Timeline */}
                                            <div className="flex-1 min-w-0 relative pl-5 flex flex-col gap-3">
                                                {/* Vertical line connecting the timeline nodes */}
                                                {timelineEvents.length > 1 && (
                                                    <div className="absolute left-[8px] top-2.5 bottom-2.5 w-0.5 bg-border-subtle/50" />
                                                )}

                                                {timelineEvents.map((event) => (
                                                    <div key={event.key} className="flex items-start gap-3 relative min-w-0">
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
                                                                <span
                                                                    key={en.id}
                                                                    className={`status-pill-${en.status} inline-flex items-center gap-1.5 ${
                                                                        event.isCurrent
                                                                            ? 'text-[11px] px-2.5 py-0.5 rounded-full font-semibold shadow-sm'
                                                                            : 'text-[10px] px-1.5 py-0.25 rounded-md font-medium'
                                                                    } whitespace-nowrap`}
                                                                >
                                                                    <span
                                                                        className={`${
                                                                            event.isCurrent ? 'w-1.5 h-1.5' : 'w-1 h-1'
                                                                        } rounded-full ${STATUS_DOT[en.status] || 'bg-muted'} flex-shrink-0`}
                                                                    />
                                                                    {en.courseName}
                                                                    {en.courseVariant && (
                                                                        <span className="opacity-75 font-normal"> ({en.courseVariant})</span>
                                                                    )}
                                                                </span>
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
                </BentoCard>
            </div>

            {/* Right Column: Quick Actions + Enrollment Status (Col-span 1) */}
            <div className="lg:col-span-1 flex flex-col gap-6 min-h-0">
                {/* Quick Actions */}
                <BentoCard
                    glowColor="oklch(var(--accent-primary) / 0.12)"
                    className="p-5 flex-shrink-0"
                >
                    <div className="flex flex-col justify-between h-full">
                        <h3 className="text-xs font-bold text-muted uppercase tracking-wider mb-4 flex items-center gap-2">
                            <Sparkles size={14} className="text-brand-500" /> Quick Actions
                        </h3>
                        <div className="flex flex-col gap-3">
                            <button
                                onClick={() => onNavigate?.('students')}
                                className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-primary bg-surface-elevated hover:bg-background/80 rounded-xl border border-border-subtle hover:border-brand-500/30 transition-all duration-500 ease-spring group/action hover:scale-[1.02] active:scale-[0.98] hover:shadow-glow-sm"
                            >
                                <div className="p-2 bg-brand-500/10 text-brand-500 dark:text-brand-400 rounded-lg shadow-sm group-hover/action:bg-brand-500 group-hover/action:text-white transition-all duration-500 ease-spring">
                                    <Plus size={16} />
                                </div>
                                <div className="text-left">
                                    <span className="block font-semibold group-hover/action:text-brand-500 transition-colors duration-500 ease-spring">Add Student</span>
                                    <span className="text-xs text-muted">Create new record</span>
                                </div>
                                <ArrowUpRight size={14} className="ml-auto text-muted opacity-0 group-hover/action:opacity-100 group-hover/action:translate-x-0.5 group-hover/action:-translate-y-0.5 transition-all duration-500 ease-spring" />
                            </button>
                            <button
                                onClick={() => onNavigate?.('courses')}
                                className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-primary bg-surface-elevated hover:bg-background/80 rounded-xl border border-border-subtle hover:border-brand-500/30 transition-all duration-500 ease-spring group/action hover:scale-[1.02] active:scale-[0.98] hover:shadow-glow-sm"
                            >
                                <div className="p-2 bg-brand-500/10 text-brand-500 dark:text-brand-400 rounded-lg shadow-sm group-hover/action:bg-brand-500 group-hover/action:text-white transition-all duration-500 ease-spring">
                                    <BookOpen size={16} />
                                </div>
                                <div className="text-left">
                                    <span className="block font-semibold group-hover/action:text-brand-500 transition-colors duration-500 ease-spring">Manage Courses</span>
                                    <span className="text-xs text-muted">View catalog</span>
                                </div>
                                <ArrowUpRight size={14} className="ml-auto text-muted opacity-0 group-hover/action:opacity-100 group-hover/action:translate-x-0.5 group-hover/action:-translate-y-0.5 transition-all duration-500 ease-spring" />
                            </button>
                            <button
                                onClick={() => onNavigate?.('enrollments')}
                                className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-primary bg-surface-elevated hover:bg-background/80 rounded-xl border border-border-subtle hover:border-brand-500/30 transition-all duration-500 ease-spring group/action hover:scale-[1.02] active:scale-[0.98] hover:shadow-glow-sm"
                            >
                                <div className="p-2 bg-brand-500/10 text-brand-500 dark:text-brand-400 rounded-lg shadow-sm group-hover/action:bg-brand-500 group-hover/action:text-white transition-all duration-500 ease-spring">
                                    <UserPlus size={16} />
                                </div>
                                <div className="text-left">
                                    <span className="block font-semibold group-hover/action:text-brand-500 transition-colors duration-500 ease-spring">New Enrollment</span>
                                    <span className="text-xs text-muted">Enroll student</span>
                                </div>
                                <ArrowUpRight size={14} className="ml-auto text-muted opacity-0 group-hover/action:opacity-100 group-hover/action:translate-x-0.5 group-hover/action:-translate-y-0.5 transition-all duration-500 ease-spring" />
                            </button>
                        </div>
                    </div>
                </BentoCard>

                {/* Enrollment Status */}
                <BentoCard
                    glowColor="oklch(var(--accent-primary) / 0.1)"
                    className="p-5 flex-shrink-0"
                >
                    <h3 className="text-xs font-bold text-muted uppercase tracking-wider mb-4 flex items-center gap-2">
                        <TrendingUp size={14} className="text-brand-500" /> Enrollment Status
                    </h3>
                    {loading ? (
                        <SkeletonStatusBreakdown />
                    ) : totalStatus === 0 ? (
                        <div className="text-center py-6 flex flex-col justify-center items-center">
                            <GraduationCap size={36} className="mx-auto mb-2 text-muted/50" />
                            <p className="text-sm text-muted">No enrollments yet</p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-3">
                            {/* Stacked bar — no padding/wrapper, just overflow:hidden on the container */}
                            <div className="flex h-2.5 rounded-full overflow-hidden gap-px">
                                {statusItems.map(s => {
                                    const count = statusBreakdown[s.key] || 0;
                                    if (count === 0) return null;
                                    return (
                                        <div
                                            key={s.key}
                                            className={`${s.color} h-full transition-all duration-700 ease-spring cursor-default`}
                                            style={{ width: `${(count / totalStatus) * 100}%` }}
                                            title={`${s.label}: ${count} (${Math.round(count / totalStatus * 100)}%)`}
                                        />
                                    );
                                })}
                            </div>
                            {/* Rows */}
                            <div className="flex flex-col">
                                {statusItems.map(s => {
                                    const count = statusBreakdown[s.key] || 0;
                                    const pct = totalStatus > 0 ? Math.round((count / totalStatus) * 100) : 0;
                                    return (
                                        <div key={s.key} className="flex items-center gap-2.5 px-2 py-[7px] rounded-lg hover:bg-surface-elevated/60 transition-colors duration-200">
                                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.color}`} />
                                            <span className="text-[12px] text-muted font-medium w-[68px] flex-shrink-0">{s.label}</span>
                                            <div className="flex-1 h-[5px] bg-border-subtle/25 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full ${s.color} rounded-full transition-all duration-700 ease-spring`}
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>
                                            <span className="text-[12px] font-mono font-bold text-primary w-10 text-right flex-shrink-0">{count}</span>
                                            <span className="text-[11px] text-muted/55 w-8 text-right flex-shrink-0">{pct}%</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </BentoCard>
            </div>
        </div>
    );
}
