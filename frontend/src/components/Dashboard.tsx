import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Users, BookOpen, GraduationCap, Plus, UserPlus, Clock, TrendingUp } from 'lucide-react';

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
    requested: 'bg-yellow-500',
    invited: 'bg-blue-500',
    confirmed: 'bg-green-500',
    rejected: 'bg-red-500',
};

export default function Dashboard({ onNavigate }: DashboardProps) {
    const [stats, setStats] = useState({ students: 0, courses: 0, enrollments: 0 });
    const [recent, setRecent] = useState<RecentEnrollment[]>([]);
    const [statusBreakdown, setStatusBreakdown] = useState<Record<string, number>>({});

    useEffect(() => {
        fetchData();
    }, []);

    async function fetchData() {
        // Stats
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

        // Recent enrollments
        const { data: recentData } = await supabase
            .from('enrollments')
            .select('id, status, created_at, course_variant, students(first_name, last_name), courses(name)')
            .order('created_at', { ascending: false })
            .limit(8);
        if (recentData) setRecent(recentData as RecentEnrollment[]);

        // Status breakdown
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
        { label: 'Total Students', value: stats.students, icon: <Users size={24} />, color: 'from-blue-500 to-blue-600', lightBg: 'bg-blue-100 text-blue-600' },
        { label: 'Active Courses', value: stats.courses, icon: <BookOpen size={24} />, color: 'from-purple-500 to-purple-600', lightBg: 'bg-purple-100 text-purple-600' },
        { label: 'Total Enrollments', value: stats.enrollments, icon: <GraduationCap size={24} />, color: 'from-green-500 to-green-600', lightBg: 'bg-green-100 text-green-600' },
    ];

    const totalStatus = Object.values(statusBreakdown).reduce((a, b) => a + b, 0);
    const statusItems = [
        { key: 'requested', label: 'Requested', color: 'bg-yellow-500' },
        { key: 'invited', label: 'Invited', color: 'bg-blue-500' },
        { key: 'confirmed', label: 'Confirmed', color: 'bg-green-500' },
        { key: 'rejected', label: 'Rejected', color: 'bg-red-500' },
    ];

    return (
        <div className="space-y-6">
            {/* Stat Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {statCards.map(card => (
                    <div key={card.label} className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex items-center gap-4 hover:shadow-md transition">
                        <div className={`p-3 rounded-xl ${card.lightBg}`}>
                            {card.icon}
                        </div>
                        <div>
                            <p className="text-sm font-medium text-slate-500">{card.label}</p>
                            <p className="text-2xl font-bold text-slate-800">{card.value}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-2">
                    <TrendingUp size={16} /> Quick Actions
                </h3>
                <div className="flex flex-wrap gap-3">
                    <button
                        onClick={() => onNavigate?.('students')}
                        className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition"
                    >
                        <Plus size={16} /> Add Student
                    </button>
                    <button
                        onClick={() => onNavigate?.('courses')}
                        className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg transition"
                    >
                        <BookOpen size={16} /> Manage Courses
                    </button>
                    <button
                        onClick={() => onNavigate?.('enrollments')}
                        className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-lg transition"
                    >
                        <UserPlus size={16} /> Add Enrollment
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Status Breakdown */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                    <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4 flex items-center gap-2">
                        <GraduationCap size={16} /> Enrollment Status
                    </h3>
                    {totalStatus === 0 ? (
                        <p className="text-sm text-slate-400 py-4 text-center">No enrollments yet</p>
                    ) : (
                        <div className="space-y-3">
                            {/* Visual bar */}
                            <div className="flex h-3 rounded-full overflow-hidden bg-slate-100">
                                {statusItems.map(s => {
                                    const count = statusBreakdown[s.key] || 0;
                                    if (count === 0) return null;
                                    return (
                                        <div
                                            key={s.key}
                                            className={`${s.color} transition-all`}
                                            style={{ width: `${(count / totalStatus) * 100}%` }}
                                            title={`${s.label}: ${count}`}
                                        />
                                    );
                                })}
                            </div>
                            {/* Legend */}
                            <div className="grid grid-cols-2 gap-2">
                                {statusItems.map(s => {
                                    const count = statusBreakdown[s.key] || 0;
                                    return (
                                        <div key={s.key} className="flex items-center gap-2 text-sm">
                                            <span className={`w-2.5 h-2.5 rounded-full ${s.color}`} />
                                            <span className="text-slate-600">{s.label}</span>
                                            <span className="font-semibold text-slate-800 ml-auto">{count}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* Recent Activity */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                    <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4 flex items-center gap-2">
                        <Clock size={16} /> Recent Activity
                    </h3>
                    {recent.length === 0 ? (
                        <p className="text-sm text-slate-400 py-4 text-center">No recent activity</p>
                    ) : (
                        <div className="space-y-2">
                            {recent.map(en => (
                                <div key={en.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition">
                                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[en.status] || 'bg-slate-400'}`} />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-slate-800 truncate">
                                            <span className="font-medium">
                                                {en.students?.first_name} {en.students?.last_name}
                                            </span>
                                            {' → '}
                                            <span className="text-slate-600">{en.courses?.name}</span>
                                            {en.course_variant && <span className="text-slate-400"> ({en.course_variant})</span>}
                                        </p>
                                    </div>
                                    <span className="text-[11px] text-slate-400 whitespace-nowrap">
                                        {new Date(en.created_at).toLocaleDateString('en-IE', { day: '2-digit', month: 'short' })}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
