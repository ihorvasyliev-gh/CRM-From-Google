import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Users, BookOpen, GraduationCap, Plus, UserPlus, Clock, TrendingUp, ArrowUpRight, Sparkles } from 'lucide-react';

interface DashboardProps {
    onNavigate?: (tab: string) => void;
}

interface RecentEnrollment {
    id: string;
    status: string;
    created_at: string;
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

export default function Dashboard({ onNavigate }: DashboardProps) {
    const [stats, setStats] = useState({ students: 0, courses: 0, enrollments: 0 });
    const [recent, setRecent] = useState<RecentEnrollment[]>([]);
    const [statusBreakdown, setStatusBreakdown] = useState<Record<string, number>>({});

    useEffect(() => {
        fetchData();
    }, []);

    async function fetchData() {
        const [studRes, courseRes, enrollRes] = await Promise.all([
            supabase.from('students').select('*', { count: 'exact', head: true }),
            supabase.from('courses').select('*', { count: 'exact', head: true }),
            supabase.from('enrollments').select('*', { count: 'exact', head: true }),
        ]);
        setStats({
            students: studRes.count || 0,
            courses: courseRes.count || 0,
            enrollments: enrollRes.count || 0,
        });

        const { data: recentData } = await supabase
            .from('enrollments')
            .select('id, status, created_at, course_variant, students(first_name, last_name), courses(name)')
            .order('created_at', { ascending: false })
            .limit(8);
        if (recentData) setRecent(recentData as unknown as RecentEnrollment[]);

        const { data: allEnrollments } = await supabase.from('enrollments').select('status');
        if (allEnrollments) {
            const breakdown: Record<string, number> = {};
            for (const e of allEnrollments) {
                breakdown[e.status] = (breakdown[e.status] || 0) + 1;
            }
            setStatusBreakdown(breakdown);
        }
    }

    const statCards = [
        {
            label: 'Total Students',
            value: stats.students,
            icon: <Users size={22} />,
            gradient: 'from-brand-500 to-brand-600',
            iconBg: 'bg-brand-500/10 text-brand-600',
            accentColor: 'brand',
        },
        {
            label: 'Active Courses',
            value: stats.courses,
            icon: <BookOpen size={22} />,
            gradient: 'from-violet-500 to-purple-600',
            iconBg: 'bg-violet-500/10 text-violet-600',
            accentColor: 'violet',
        },
        {
            label: 'Enrollments',
            value: stats.enrollments,
            icon: <GraduationCap size={22} />,
            gradient: 'from-emerald-500 to-teal-600',
            iconBg: 'bg-emerald-500/10 text-emerald-600',
            accentColor: 'emerald',
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
        <div className="space-y-6">
            {/* Stat Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {statCards.map((card, i) => (
                    <div
                        key={card.label}
                        className="relative bg-surface rounded-2xl shadow-card card-hover border border-border-subtle p-5 overflow-hidden group hover:border-border-strong transition-all duration-300"
                        style={{ animationDelay: `${i * 100}ms` }}
                    >
                        {/* Gradient accent top */}
                        <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${card.gradient}`} />

                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-sm font-medium text-muted mb-1 uppercase tracking-wider">{card.label}</p>
                                <p className="text-4xl font-mono font-bold text-primary animate-countUp tracking-tight">{card.value}</p>
                            </div>
                            <div className={`p-3 rounded-xl ${card.iconBg} transition-transform group-hover:scale-110 shadow-sm`}>
                                {card.icon}
                            </div>
                        </div>

                        {/* Decorative pattern */}
                        <div className={`absolute -bottom-4 -right-4 w-20 h-20 bg-gradient-to-br ${card.gradient} rounded-full opacity-[0.04] group-hover:opacity-[0.08] transition-opacity`} />
                    </div>
                ))}
            </div>

            {/* Quick Actions */}
            <div className="bg-surface rounded-2xl shadow-card border border-border-subtle p-5">
                <h3 className="text-xs font-bold text-muted uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Sparkles size={14} className="text-brand-500" /> Quick Actions
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <button
                        onClick={() => onNavigate?.('students')}
                        className="flex items-center gap-3 px-4 py-3.5 text-sm font-medium text-primary bg-surface-elevated hover:bg-background rounded-xl transition-all group border border-border-subtle hover:border-border-strong transform active:scale-[0.98]"
                    >
                        <div className="p-2 bg-brand-500/10 text-brand-500 dark:text-brand-400 rounded-lg shadow-sm group-hover:shadow-md transition-shadow">
                            <Plus size={16} />
                        </div>
                        <div className="text-left">
                            <span className="block font-semibold">Add Student</span>
                            <span className="text-xs text-muted">Create new record</span>
                        </div>
                        <ArrowUpRight size={14} className="ml-auto text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                    <button
                        onClick={() => onNavigate?.('courses')}
                        className="flex items-center gap-3 px-4 py-3.5 text-sm font-medium text-primary bg-surface-elevated hover:bg-background rounded-xl transition-all group border border-border-subtle hover:border-border-strong transform active:scale-[0.98]"
                    >
                        <div className="p-2 bg-brand-500/10 text-brand-500 dark:text-brand-400 rounded-lg shadow-sm group-hover:shadow-md transition-shadow">
                            <BookOpen size={16} />
                        </div>
                        <div className="text-left">
                            <span className="block font-semibold">Manage Courses</span>
                            <span className="text-xs text-muted">View catalog</span>
                        </div>
                        <ArrowUpRight size={14} className="ml-auto text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                    <button
                        onClick={() => onNavigate?.('enrollments')}
                        className="flex items-center gap-3 px-4 py-3.5 text-sm font-medium text-primary bg-surface-elevated hover:bg-background rounded-xl transition-all group border border-border-subtle hover:border-border-strong transform active:scale-[0.98]"
                    >
                        <div className="p-2 bg-brand-500/10 text-brand-500 dark:text-brand-400 rounded-lg shadow-sm group-hover:shadow-md transition-shadow">
                            <UserPlus size={16} />
                        </div>
                        <div className="text-left">
                            <span className="block font-semibold">New Enrollment</span>
                            <span className="text-xs text-muted">Enroll student</span>
                        </div>
                        <ArrowUpRight size={14} className="ml-auto text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Status Breakdown */}
                <div className="bg-surface rounded-2xl shadow-card border border-border-subtle p-5">
                    <h3 className="text-xs font-bold text-muted uppercase tracking-wider mb-5 flex items-center gap-2">
                        <TrendingUp size={14} className="text-brand-500" /> Enrollment Status
                    </h3>
                    {totalStatus === 0 ? (
                        <div className="text-center py-8">
                            <GraduationCap size={40} className="mx-auto mb-2 text-muted/50" />
                            <p className="text-sm text-muted">No enrollments yet</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {/* Visual bar */}
                            <div className="flex h-3 rounded-full overflow-hidden bg-surface-elevated border border-border-subtle/50">
                                {statusItems.map(s => {
                                    const count = statusBreakdown[s.key] || 0;
                                    if (count === 0) return null;
                                    return (
                                        <div
                                            key={s.key}
                                            className={`${s.color} transition-all duration-700 ease-out first:rounded-l-full last:rounded-r-full`}
                                            style={{ width: `${(count / totalStatus) * 100}%` }}
                                            title={`${s.label}: ${count}`}
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
                                        <div key={s.key} className="flex items-center gap-3 p-2.5 rounded-xl bg-surface-elevated/50 hover:bg-surface-elevated transition-colors">
                                            <span className={`w-3 h-3 rounded-full ${s.color} flex-shrink-0 shadow-sm`} />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs text-muted font-medium">{s.label}</p>
                                                <p className="text-sm font-mono font-bold text-primary">{count} <span className="text-xs font-sans font-normal text-muted">({pct}%)</span></p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* Recent Activity */}
                <div className="bg-surface rounded-2xl shadow-card border border-border-subtle p-5">
                    <h3 className="text-xs font-bold text-muted uppercase tracking-wider mb-5 flex items-center gap-2">
                        <Clock size={14} className="text-brand-500" /> Recent Activity
                    </h3>
                    {recent.length === 0 ? (
                        <div className="text-center py-8">
                            <Clock size={40} className="mx-auto mb-2 text-muted/50" />
                            <p className="text-sm text-muted">No recent activity</p>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {recent.map((en, i) => (
                                <div
                                    key={en.id}
                                    className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-surface-elevated transition-all group cursor-default"
                                    style={{ animationDelay: `${i * 50}ms` }}
                                >
                                    {/* Timeline dot */}
                                    <div className="flex flex-col items-center flex-shrink-0">
                                        <span className={`w-2.5 h-2.5 rounded-full ${STATUS_DOT[en.status] || 'bg-muted'} ring-[3px] ring-background`} />
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-primary truncate">
                                            <span className="font-semibold tracking-tight">
                                                {en.students?.first_name} {en.students?.last_name}
                                            </span>
                                            <span className="text-muted mx-1.5 opacity-50">→</span>
                                            <span className="text-primary/80 font-medium">{en.courses?.name}</span>
                                        </p>
                                        {en.course_variant && (
                                            <span className="text-[10px] text-muted tracking-wide">{en.course_variant}</span>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        <span className={`text-[10px] px-2.5 py-1 rounded-full font-semibold uppercase tracking-wider ${STATUS_BG[en.status] || 'bg-surface-elevated text-muted'}`}>
                                            {en.status}
                                        </span>
                                        <span className="text-[10px] text-muted font-mono whitespace-nowrap opacity-70">
                                            {new Date(en.created_at).toLocaleDateString('en-IE', { day: '2-digit', month: 'short' })}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
