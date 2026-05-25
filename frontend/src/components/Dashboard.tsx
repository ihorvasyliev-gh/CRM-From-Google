import { useMemo, useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Users, BookOpen, GraduationCap, Plus, UserPlus, Clock, TrendingUp, ArrowUpRight, Sparkles, Filter } from 'lucide-react';
import type { EnrollmentWithRelations } from '../lib/documentUtils';

interface DashboardProps {
    onNavigate?: (tab: string) => void;
}

interface RecentEnrollment {
    id: string;
    status: string;
    created_at: string;
    updated_at: string;
    course_variant: string | null;
    students: { first_name: string; last_name: string } | null;
    courses: { name: string } | null;
}

const STATUS_DOT: Record<string, string> = {
    requested: 'bg-warning',
    invited: 'bg-info',
    confirmed: 'bg-success',
    completed: 'bg-brand-500',
    withdrawn: 'bg-muted',
    rejected: 'bg-danger',
};

const STATUS_BG: Record<string, string> = {
    requested: 'bg-warning/10 text-warning',
    invited: 'bg-info/10 text-info',
    confirmed: 'bg-success/10 text-success',
    completed: 'bg-brand-500/10 text-brand-500',
    withdrawn: 'bg-muted/10 text-muted',
    rejected: 'bg-danger/10 text-danger',
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
        <div className="flex items-center justify-between gap-4 p-3.5 rounded-xl animate-pulse">
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

// ─── Shared fetch function for enrollments (same as useEnrollments) ───
async function fetchAllEnrollments() {
    let allData: EnrollmentWithRelations[] = [];
    let from = 0;
    const limit = 1000;
    while (true) {
        const { data, error } = await supabase
            .from('enrollments')
            .select('*, students(id, first_name, last_name, email, phone, address, eircode, dob), courses(id, name)')
            .order('created_at', { ascending: false })
            .range(from, from + limit - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allData = [...allData, ...data as EnrollmentWithRelations[]];
        if (data.length < limit) break;
        from += limit;
    }
    return allData;
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

    // Recent activity — 30s staleTime
    const { data: recent = [], isLoading: recentLoading } = useQuery({
        queryKey: ['dashboard_recent'],
        queryFn: async () => {
            const { data } = await supabase
                .from('enrollments')
                .select('id, status, created_at, updated_at, course_variant, students(first_name, last_name), courses(name)')
                .order('updated_at', { ascending: false })
                .limit(50);
            return (data || []) as unknown as RecentEnrollment[];
        },
        staleTime: 30_000,
    });

    // Reuse the global ['enrollments'] cache for status breakdown (same key as useEnrollments)
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

    const loading = statsLoading || recentLoading || enrollmentsLoading;

    // Filter recent activity by selected status
    const filteredRecent = useMemo(() => {
        if (activityFilter === 'invited' || activityFilter === 'confirmed') {
            return allEnrollments
                .filter(en => en.status === activityFilter)
                .map(en => ({
                    id: en.id,
                    status: en.status,
                    created_at: en.created_at,
                    updated_at: en.updated_at,
                    course_variant: en.course_variant,
                    students: en.students ? { first_name: en.students.first_name, last_name: en.students.last_name } : null,
                    courses: en.courses ? { name: en.courses.name } : null,
                }))
                .sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime());
        }

        const filtered = activityFilter === 'all'
            ? recent
            : recent.filter(en => en.status === activityFilter);
        return filtered.slice(0, 10);
    }, [recent, allEnrollments, activityFilter]);

    // Counts per filter for pill badges
    const filterCounts = useMemo(() => {
        const counts: Record<ActivityFilter, number> = {
            all: recent.length,
            requested: 0,
            invited: 0,
            confirmed: 0,
            completed: 0
        };

        for (const en of recent) {
            if (en.status === 'requested') counts.requested++;
            if (en.status === 'completed') counts.completed++;
        }

        for (const en of allEnrollments) {
            if (en.status === 'invited') counts.invited++;
            if (en.status === 'confirmed') counts.confirmed++;
        }

        return counts;
    }, [recent, allEnrollments]);

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
        { key: 'requested', label: 'Requested', color: 'bg-warning', lightBg: 'bg-warning/10 text-warning' },
        { key: 'invited', label: 'Invited', color: 'bg-info', lightBg: 'bg-info/10 text-info' },
        { key: 'confirmed', label: 'Confirmed', color: 'bg-success', lightBg: 'bg-success/10 text-success' },
        { key: 'completed', label: 'Completed', color: 'bg-brand-500', lightBg: 'bg-brand-500/10 text-brand-500' },
        { key: 'withdrawn', label: 'Withdrawn', color: 'bg-muted', lightBg: 'bg-muted/10 text-muted' },
        { key: 'rejected', label: 'Rejected', color: 'bg-danger', lightBg: 'bg-danger/10 text-danger' },
    ];

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Top Row: Stats Cards (Full Width) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 lg:col-span-3">
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
            <div className="lg:col-span-2">
                <BentoCard
                    glowColor="oklch(var(--accent-primary) / 0.1)"
                    className="p-5 h-full"
                >
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-2">
                            <Clock size={14} className="text-brand-500" /> Recent Activity
                        </h3>
                        <Filter size={12} className="text-muted" />
                    </div>
                    {/* Filter pills */}
                    {!loading && recent.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-4">
                            {ACTIVITY_FILTERS.map(f => (
                                <button
                                    key={f.key}
                                    onClick={() => setActivityFilter(f.key)}
                                    className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-all duration-300 ease-spring ${
                                        activityFilter === f.key
                                            ? 'bg-brand-500 text-white border-brand-500 shadow-glow-sm scale-105'
                                            : 'bg-surface-elevated/50 text-muted hover:text-primary border-border-subtle hover:border-border-strong hover:scale-105'
                                    }`}
                                >
                                    {f.label} ({filterCounts[f.key]})
                                </button>
                            ))}
                        </div>
                    )}
                    {loading ? (
                        <div className="space-y-1">
                            {Array.from({ length: 6 }).map((_, i) => <SkeletonActivityItem key={i} />)}
                        </div>
                    ) : filteredRecent.length === 0 ? (
                        <div className="text-center py-8">
                            <Clock size={40} className="mx-auto mb-2 text-muted/50" />
                            <p className="text-sm text-muted">{activityFilter === 'all' ? 'No recent activity' : `No ${activityFilter} enrollments`}</p>
                        </div>
                    ) : (
                        <div className="space-y-1 max-h-[500px] overflow-y-auto pr-1">
                            {filteredRecent.map((en, i) => (
                                <div
                                    key={en.id}
                                    className="flex items-center justify-between gap-4 p-3.5 rounded-xl hover:bg-surface-elevated/80 border border-transparent hover:border-border-subtle hover:scale-[1.005] hover:shadow-sm transition-all duration-500 ease-spring group cursor-default"
                                    style={{ animationDelay: `${i * 50}ms` }}
                                >
                                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                                        {/* Timeline dot */}
                                        <div className="flex-shrink-0 relative">
                                            <span className={`w-2.5 h-2.5 rounded-full ${STATUS_DOT[en.status] || 'bg-muted'} block ring-[3px] ring-background`} />
                                        </div>

                                        {/* Student details */}
                                        <div className="min-w-0 flex-1 sm:grid sm:grid-cols-2 sm:gap-4 sm:items-center">
                                            <div>
                                                <p className="text-sm font-semibold text-primary truncate tracking-tight">
                                                    {en.students?.first_name} {en.students?.last_name}
                                                </p>
                                                {en.course_variant && (
                                                    <p className="text-[10px] text-muted tracking-wide truncate mt-0.5">{en.course_variant}</p>
                                                )}
                                            </div>
                                            <div className="hidden sm:block">
                                                <p className="text-sm text-muted/95 font-medium truncate">
                                                    {en.courses?.name}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Status badge and Date */}
                                    <div className="flex items-center gap-4 flex-shrink-0">
                                        <span className={`text-[10px] px-2.5 py-0.75 rounded-full font-bold uppercase tracking-wider ${STATUS_BG[en.status] || 'bg-surface-elevated text-muted'}`}>
                                            {en.status}
                                        </span>
                                        <span className="text-[11px] text-muted font-mono whitespace-nowrap opacity-75 min-w-[50px] text-right">
                                            {new Date(en.updated_at || en.created_at).toLocaleDateString('en-IE', { day: '2-digit', month: 'short' })}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </BentoCard>
            </div>

            {/* Right Column: Quick Actions + Enrollment Status (Col-span 1) */}
            <div className="lg:col-span-1 flex flex-col gap-6">
                {/* Quick Actions */}
                <BentoCard
                    glowColor="oklch(var(--accent-primary) / 0.12)"
                    className="p-5"
                >
                    <div className="flex flex-col justify-between h-full">
                        <h3 className="text-xs font-bold text-muted uppercase tracking-wider mb-4 flex items-center gap-2">
                            <Sparkles size={14} className="text-brand-500" /> Quick Actions
                        </h3>
                        <div className="flex flex-col gap-3">
                            <button
                                onClick={() => onNavigate?.('students')}
                                className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-primary bg-surface-elevated hover:bg-background/80 rounded-xl border border-border-subtle hover:border-brand-500/30 transition-all duration-500 ease-spring group hover:scale-[1.02] active:scale-[0.98] hover:shadow-glow-sm"
                            >
                                <div className="p-2 bg-brand-500/10 text-brand-500 dark:text-brand-400 rounded-lg shadow-sm group-hover:bg-brand-500 group-hover:text-white transition-all duration-500 ease-spring">
                                    <Plus size={16} />
                                </div>
                                <div className="text-left">
                                    <span className="block font-semibold group-hover:text-brand-500 transition-colors duration-500 ease-spring">Add Student</span>
                                    <span className="text-xs text-muted">Create new record</span>
                                </div>
                                <ArrowUpRight size={14} className="ml-auto text-muted opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-500 ease-spring" />
                            </button>
                            <button
                                onClick={() => onNavigate?.('courses')}
                                className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-primary bg-surface-elevated hover:bg-background/80 rounded-xl border border-border-subtle hover:border-brand-500/30 transition-all duration-500 ease-spring group hover:scale-[1.02] active:scale-[0.98] hover:shadow-glow-sm"
                            >
                                <div className="p-2 bg-brand-500/10 text-brand-500 dark:text-brand-400 rounded-lg shadow-sm group-hover:bg-brand-500 group-hover:text-white transition-all duration-500 ease-spring">
                                    <BookOpen size={16} />
                                </div>
                                <div className="text-left">
                                    <span className="block font-semibold group-hover:text-brand-500 transition-colors duration-500 ease-spring">Manage Courses</span>
                                    <span className="text-xs text-muted">View catalog</span>
                                </div>
                                <ArrowUpRight size={14} className="ml-auto text-muted opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-500 ease-spring" />
                            </button>
                            <button
                                onClick={() => onNavigate?.('enrollments')}
                                className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-primary bg-surface-elevated hover:bg-background/80 rounded-xl border border-border-subtle hover:border-brand-500/30 transition-all duration-500 ease-spring group hover:scale-[1.02] active:scale-[0.98] hover:shadow-glow-sm"
                            >
                                <div className="p-2 bg-brand-500/10 text-brand-500 dark:text-brand-400 rounded-lg shadow-sm group-hover:bg-brand-500 group-hover:text-white transition-all duration-500 ease-spring">
                                    <UserPlus size={16} />
                                </div>
                                <div className="text-left">
                                    <span className="block font-semibold group-hover:text-brand-500 transition-colors duration-500 ease-spring">New Enrollment</span>
                                    <span className="text-xs text-muted">Enroll student</span>
                                </div>
                                <ArrowUpRight size={14} className="ml-auto text-muted opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-500 ease-spring" />
                            </button>
                        </div>
                    </div>
                </BentoCard>

                {/* Enrollment Status */}
                <BentoCard
                    glowColor="oklch(var(--accent-primary) / 0.1)"
                    className="p-5 flex-1 flex flex-col justify-between"
                >
                    <div>
                        <h3 className="text-xs font-bold text-muted uppercase tracking-wider mb-5 flex items-center gap-2">
                            <TrendingUp size={14} className="text-brand-500" /> Enrollment Status
                        </h3>
                        {loading ? (
                            <SkeletonStatusBreakdown />
                        ) : totalStatus === 0 ? (
                            <div className="text-center py-8">
                                <GraduationCap size={40} className="mx-auto mb-2 text-muted/50" />
                                <p className="text-sm text-muted">No enrollments yet</p>
                            </div>
                        ) : (
                            <div className="space-y-5">
                                {/* Visual bar */}
                                <div className="flex h-3.5 items-center bg-surface-elevated/50 rounded-full p-[2px] border border-border-subtle/30 backdrop-blur-sm">
                                    {statusItems.map(s => {
                                        const count = statusBreakdown[s.key] || 0;
                                        if (count === 0) return null;
                                        return (
                                            <div
                                                key={s.key}
                                                className={`${s.color} h-full rounded-full mx-[1px] transition-all duration-700 ease-spring hover:scale-y-125 hover:shadow-md cursor-pointer`}
                                                style={{ width: `${(count / totalStatus) * 100}%` }}
                                                title={`${s.label}: ${count} (${Math.round(count / totalStatus * 100)}%)`}
                                            />
                                        );
                                    })}
                                </div>
                                {/* Legend */}
                                <div className="grid grid-cols-2 gap-3">
                                    {statusItems.map(s => {
                                        const count = statusBreakdown[s.key] || 0;
                                        const pct = totalStatus > 0 ? Math.round((count / totalStatus) * 100) : 0;
                                        return (
                                            <div key={s.key} className="flex flex-col gap-1.5 p-3 rounded-xl bg-surface-elevated/30 hover:bg-surface-elevated hover:scale-[1.02] hover:border-border-subtle/50 border border-border-subtle/10 transition-all duration-300 ease-spring shadow-sm">
                                                <div className="flex items-center gap-2">
                                                    <span className={`w-2 h-2 rounded-full ${s.color} flex-shrink-0 shadow-sm`} />
                                                    <p className="text-[10px] text-muted font-bold uppercase tracking-wider truncate">{s.label}</p>
                                                </div>
                                                <div className="mt-0.5">
                                                    <p className="text-sm font-mono font-bold text-primary">
                                                        {count} <span className="text-[10px] font-sans font-normal text-muted">({pct}%)</span>
                                                    </p>
                                                </div>
                                                {/* Micro progress bar for each status */}
                                                <div className="h-1 w-full bg-border-subtle/30 rounded-full overflow-hidden mt-1">
                                                    <div className={`h-full ${s.color} rounded-full`} style={{ width: `${pct}%` }} />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                </BentoCard>
            </div>
        </div>
    );
}
