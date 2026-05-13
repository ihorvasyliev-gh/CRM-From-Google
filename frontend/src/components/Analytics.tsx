/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { 
    ResponsiveContainer, 
    BarChart, 
    Bar, 
    XAxis, 
    YAxis, 
    CartesianGrid, 
    Tooltip as RechartsTooltip, 
    Legend, 
    PieChart, 
    Pie, 
    Cell,
    LineChart,
    Line,
    LabelList
} from 'recharts';
import { PieChart as PieChartIcon, TrendingUp, Users, BookOpen, Clock, Activity } from 'lucide-react';
import type { EnrollmentWithRelations } from '../lib/documentUtils';

// Helper to fetch all enrollments with related data
async function fetchAllEnrollments() {
    let allData: EnrollmentWithRelations[] = [];
    let from = 0;
    const limit = 1000;
    while (true) {
        const { data, error } = await supabase
            .from('enrollments')
            .select('*, students(id, first_name, last_name), courses(id, name)')
            .order('created_at', { ascending: true })
            .range(from, from + limit - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allData = [...allData, ...data as EnrollmentWithRelations[]];
        if (data.length < limit) break;
        from += limit;
    }
    return allData;
}

// Custom tooltip styling for Recharts
const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-surface border border-border-subtle p-3 rounded-xl shadow-lg backdrop-blur-md">
                <p className="text-sm font-semibold text-primary mb-1">{label}</p>
                {payload.map((entry: any, index: number) => (
                    <p key={`item-${index}`} className="text-xs font-medium flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                        <span className="text-muted">{entry.name}:</span> 
                        <span className="text-primary font-bold">{entry.value}</span>
                    </p>
                ))}
            </div>
        );
    }
    return null;
};

export default function Analytics() {
    const { data: enrollments = [], isLoading } = useQuery({
        queryKey: ['analytics_enrollments'],
        queryFn: fetchAllEnrollments,
        staleTime: 60_000,
    });

    // ─── Data Processing ──────────────────────────────────────────

    // 1. Status Pipeline Data
    const statusData = useMemo(() => {
        const counts: Record<string, number> = { requested: 0, invited: 0, confirmed: 0, completed: 0, withdrawn: 0, rejected: 0 };
        enrollments.forEach(e => {
            if (counts[e.status] !== undefined) {
                counts[e.status]++;
            } else {
                counts[e.status] = 1;
            }
        });
        
        return [
            { name: 'Requested', value: counts.requested, color: '#F59E0B' }, // Amber
            { name: 'Invited', value: counts.invited, color: '#8B5CF6' },   // Violet
            { name: 'Confirmed', value: counts.confirmed, color: '#0EA5E9' }, // Sky
            { name: 'Completed', value: counts.completed, color: '#10B981' }, // Emerald
            { name: 'Withdrawn/Rejected', value: counts.withdrawn + counts.rejected, color: '#64748B' }, // Slate
        ].filter(d => d.value > 0);
    }, [enrollments]);

    // 2. Course Popularity
    const coursePopularity = useMemo(() => {
        const counts: Record<string, number> = {};
        enrollments.forEach(e => {
            const name = e.courses?.name || 'Unknown Course';
            counts[name] = (counts[name] || 0) + 1;
        });
        return Object.entries(counts)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 7); // Top 7 courses
    }, [enrollments]);

    // 3. Enrollments Over Time (By Month)
    const enrollmentsOverTime = useMemo(() => {
        const timelineData: Record<string, { total: number, confirmed: number, timestamp: number }> = {};
        
        const getMonthYear = (dateString: string | null) => {
            if (!dateString) return null;
            const d = new Date(dateString);
            if (isNaN(d.getTime())) return null;
            return d.toLocaleDateString('en-IE', { month: 'short', year: '2-digit' });
        };

        const addMetric = (dateString: string, type: 'total' | 'confirmed') => {
            const my = getMonthYear(dateString);
            if (!my) return;
            if (!timelineData[my]) {
                const d = new Date(dateString);
                timelineData[my] = { total: 0, confirmed: 0, timestamp: new Date(d.getFullYear(), d.getMonth(), 1).getTime() };
            }
            timelineData[my][type]++;
        };

        enrollments.forEach(e => {
            if (e.created_at) {
                addMetric(e.created_at, 'total');
            }
            
            if (e.status === 'confirmed' && e.confirmed_date) {
                addMetric(e.confirmed_date, 'confirmed');
            } else if (e.status === 'completed' && e.completed_date) {
                addMetric(e.completed_date, 'confirmed');
            } else if ((e.status === 'confirmed' || e.status === 'completed')) {
                const fallbackDate = e.confirmed_date || e.completed_date || e.created_at;
                if (fallbackDate) {
                    addMetric(fallbackDate, 'confirmed');
                }
            }
        });

        return Object.entries(timelineData)
            .sort((a, b) => a[1].timestamp - b[1].timestamp)
            .map(([name, data]) => ({
                name,
                total: data.total,
                confirmed: data.confirmed
            }));
    }, [enrollments]);

    // 4. Quick Metrics
    const metrics = useMemo(() => {
        const total = enrollments.length;
        const queue = enrollments.filter(e => e.status === 'requested' || e.status === 'invited').length;
        const successRate = total > 0 
            ? Math.round((enrollments.filter(e => e.status === 'completed' || e.status === 'confirmed').length / total) * 100) 
            : 0;

        return { total, queue, successRate };
    }, [enrollments]);

    if (isLoading) {
        return (
            <div className="flex-1 flex items-center justify-center min-h-[50vh]">
                <div className="flex flex-col items-center gap-3 animate-pulse">
                    <Activity size={32} className="text-brand-500" />
                    <p className="text-sm font-medium text-muted">Crunching numbers...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-8 animate-fadeIn">
            {/* Header Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="bg-surface rounded-2xl shadow-card border border-border-subtle p-5 relative overflow-hidden group">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-brand-500 to-indigo-600" />
                    <div className="flex items-start justify-between relative z-10">
                        <div>
                            <p className="text-xs font-bold text-muted uppercase tracking-wider mb-1">Total Enrollments</p>
                            <p className="text-4xl font-mono font-bold text-primary">{metrics.total}</p>
                        </div>
                        <div className="p-3 rounded-xl bg-brand-500/10 text-brand-600">
                            <Users size={22} />
                        </div>
                    </div>
                </div>

                <div className="bg-surface rounded-2xl shadow-card border border-border-subtle p-5 relative overflow-hidden group">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 to-orange-500" />
                    <div className="flex items-start justify-between relative z-10">
                        <div>
                            <p className="text-xs font-bold text-muted uppercase tracking-wider mb-1">Active Queue</p>
                            <p className="text-4xl font-mono font-bold text-primary">{metrics.queue}</p>
                            <p className="text-[10px] text-muted mt-1">Requested + Invited</p>
                        </div>
                        <div className="p-3 rounded-xl bg-amber-500/10 text-amber-600">
                            <Clock size={22} />
                        </div>
                    </div>
                </div>

                <div className="bg-surface rounded-2xl shadow-card border border-border-subtle p-5 relative overflow-hidden group">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400 to-teal-500" />
                    <div className="flex items-start justify-between relative z-10">
                        <div>
                            <p className="text-xs font-bold text-muted uppercase tracking-wider mb-1">Success Rate</p>
                            <p className="text-4xl font-mono font-bold text-primary">{metrics.successRate}%</p>
                            <p className="text-[10px] text-muted mt-1">Confirmed + Completed</p>
                        </div>
                        <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-600">
                            <TrendingUp size={22} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Status Pipeline Chart */}
                <div className="bg-surface rounded-2xl shadow-card border border-border-subtle p-5 flex flex-col min-h-[350px]">
                    <h3 className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-2 mb-6">
                        <PieChartIcon size={16} className="text-brand-500" /> Status Breakdown
                    </h3>
                    <div className="flex-1 w-full relative">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={statusData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={70}
                                    outerRadius={100}
                                    paddingAngle={3}
                                    dataKey="value"
                                    animationBegin={200}
                                    animationDuration={1000}
                                >
                                    {statusData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} stroke="rgba(255,255,255,0.1)" />
                                    ))}
                                </Pie>
                                <RechartsTooltip content={<CustomTooltip />} />
                                <Legend 
                                    verticalAlign="bottom" 
                                    height={36} 
                                    iconType="circle"
                                    formatter={(value: string) => <span className="text-xs text-primary font-medium mr-2">{value}</span>}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                        {/* Center text for Donut */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none -mt-8">
                            <span className="text-2xl font-bold text-primary">{metrics.total}</span>
                            <span className="text-[10px] text-muted uppercase tracking-wider">Total</span>
                        </div>
                    </div>
                </div>

                {/* Course Popularity Chart */}
                <div className="bg-surface rounded-2xl shadow-card border border-border-subtle p-5 flex flex-col min-h-[350px]">
                    <h3 className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-2 mb-6">
                        <BookOpen size={16} className="text-brand-500" /> Top Courses
                    </h3>
                    <div className="flex-1 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={coursePopularity} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="var(--border-subtle)" />
                                <XAxis type="number" hide />
                                <YAxis 
                                    dataKey="name" 
                                    type="category" 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{ fill: '#a1a1aa', fontSize: 11 }}
                                    width={110}
                                />
                                <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: 'var(--border-subtle)', opacity: 0.4 }} />
                                <Bar 
                                    dataKey="count" 
                                    name="Enrollments" 
                                    fill="var(--accent-primary)" 
                                    radius={[0, 4, 4, 0]} 
                                    barSize={24}
                                    animationBegin={400}
                                    animationDuration={1000}
                                >
                                    {coursePopularity.map((_, index) => (
                                        <Cell key={`cell-${index}`} fill={`url(#colorGradient${index % 2})`} />
                                    ))}
                                    <LabelList dataKey="count" position="insideRight" fill="#ffffff" fontSize={11} fontWeight="bold" />
                                </Bar>
                                <defs>
                                    <linearGradient id="colorGradient0" x1="0" y1="0" x2="1" y2="0">
                                        <stop offset="0%" stopColor="#818cf8" />
                                        <stop offset="100%" stopColor="#4f46e5" />
                                    </linearGradient>
                                    <linearGradient id="colorGradient1" x1="0" y1="0" x2="1" y2="0">
                                        <stop offset="0%" stopColor="#34d399" />
                                        <stop offset="100%" stopColor="#059669" />
                                    </linearGradient>
                                </defs>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Enrollments Over Time Chart */}
                <div className="bg-surface rounded-2xl shadow-card border border-border-subtle p-5 flex flex-col min-h-[350px] lg:col-span-2">
                    <h3 className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-2 mb-6">
                        <Activity size={16} className="text-brand-500" /> Enrollment Trends
                    </h3>
                    <div className="flex-1 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={enrollmentsOverTime} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-subtle)" />
                                <XAxis 
                                    dataKey="name" 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{ fill: '#a1a1aa', fontSize: 12 }} 
                                    dy={10}
                                />
                                <YAxis 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{ fill: '#a1a1aa', fontSize: 12 }} 
                                />
                                <RechartsTooltip content={<CustomTooltip />} cursor={{ stroke: 'var(--border-subtle)', strokeWidth: 1, strokeDasharray: '3 3' }} />
                                <Legend 
                                    verticalAlign="top" 
                                    height={36} 
                                    iconType="circle"
                                    wrapperStyle={{ top: -10, left: 0 }}
                                />
                                <Line 
                                    type="monotone" 
                                    dataKey="total" 
                                    name="Total Processing" 
                                    stroke="#818cf8" 
                                    strokeWidth={3} 
                                    dot={{ r: 4, fill: '#818cf8', strokeWidth: 0 }} 
                                    activeDot={{ r: 6, strokeWidth: 0 }}
                                    animationBegin={600}
                                    animationDuration={1200}
                                />
                                <Line 
                                    type="monotone" 
                                    dataKey="confirmed" 
                                    name="Confirmed/Completed" 
                                    stroke="#10b981" 
                                    strokeWidth={3} 
                                    dot={{ r: 4, fill: '#10b981', strokeWidth: 0 }} 
                                    activeDot={{ r: 6, strokeWidth: 0 }}
                                    animationBegin={800}
                                    animationDuration={1200}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

            </div>
        </div>
    );
}
