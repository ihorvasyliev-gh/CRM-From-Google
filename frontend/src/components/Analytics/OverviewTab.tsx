import { useState, useMemo } from 'react';
import { 
    ResponsiveContainer, 
    BarChart, 
    Bar, 
    XAxis, 
    YAxis, 
    CartesianGrid, 
    Tooltip as RechartsTooltip, 
    Cell,
    AreaChart,
    Area
} from 'recharts';
import { Users, Clock, TrendingUp, Zap, Filter, ArrowRight, CheckCircle2, GraduationCap, Search, ChevronLeft, ChevronRight, BookOpen } from 'lucide-react';
import type { EnrollmentWithRelations } from '../../lib/documentUtils';
import { cleanVariant } from '../../lib/types';

interface OverviewTabProps {
    enrollments: EnrollmentWithRelations[];
    onDrillDown: (title: string, data: EnrollmentWithRelations[]) => void;
}

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="glass dark:glass-dark p-3 rounded-xl shadow-lg border border-border-subtle backdrop-blur-xl">
                <p className="text-sm font-semibold text-primary mb-1">{label}</p>
                {payload.map((entry: any, index: number) => (
                    <p key={`item-${index}`} className="text-xs font-medium flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color || entry.fill }} />
                        <span className="text-muted">{entry.name}:</span> 
                        <span className="text-primary font-bold">{entry.value}</span>
                    </p>
                ))}
            </div>
        );
    }
    return null;
};

export default function OverviewTab({ enrollments, onDrillDown }: OverviewTabProps) {
    // ─── Data Processing ──────────────────────────────────────────

    // 1. Snapshot Pipeline Data (for vertical bar chart)
    const pipelineData = useMemo(() => {
        const counts = { requested: 0, invited: 0, confirmed: 0, completed: 0 };
        const items = { requested: [] as any[], invited: [] as any[], confirmed: [] as any[], completed: [] as any[] };
        
        enrollments.forEach(e => {
            if (e.status in counts) {
                counts[e.status as keyof typeof counts]++;
                items[e.status as keyof typeof items].push(e);
            }
        });
        
        return [
            { name: 'Requested', value: counts.requested, color: 'var(--color-requested)', items: items.requested },
            { name: 'Invited', value: counts.invited, color: 'var(--color-invited)', items: items.invited },
            { name: 'Confirmed', value: counts.confirmed, color: 'var(--color-confirmed)', items: items.confirmed },
            { name: 'Completed', value: counts.completed, color: 'var(--color-completed)', items: items.completed },
        ];
    }, [enrollments]);

    // 2. Conversion Cohort Analysis (Historical)
    const funnelAnalysis = useMemo(() => {
        const total = enrollments.length;
        
        // Count how many have ever reached each stage:
        // Ever Requested: all enrollments
        const everRequested = total;
        // Ever Invited: had invited_date OR is in invited/confirmed/completed status
        const everInvited = enrollments.filter(e => e.invited_date || ['invited', 'confirmed', 'completed'].includes(e.status)).length;
        // Ever Confirmed: had confirmed_date OR is in confirmed/completed status
        const everConfirmed = enrollments.filter(e => e.confirmed_date || ['confirmed', 'completed'].includes(e.status)).length;
        // Ever Completed: had completed_date OR is in completed status
        const everCompleted = enrollments.filter(e => e.completed_date || e.status === 'completed').length;

        // Calculate conversion ratios
        const requestedToInvited = everRequested > 0 ? Math.round((everInvited / everRequested) * 100) : 0;
        const invitedToConfirmed = everInvited > 0 ? Math.round((everConfirmed / everInvited) * 100) : 0;
        const confirmedToCompleted = everConfirmed > 0 ? Math.round((everCompleted / everConfirmed) * 100) : 0;

        return {
            everRequested,
            everInvited,
            everConfirmed,
            everCompleted,
            requestedToInvited,
            invitedToConfirmed,
            confirmedToCompleted
        };
    }, [enrollments]);

    // 3. Efficiency and Speed Metrics (Average processing times in days)
    const speedMetrics = useMemo(() => {
        // Time from request (created_at) to invitation (invited_at)
        const toInviteList = enrollments.filter(e => e.invited_at && e.created_at);
        const avgDaysToInvite = toInviteList.length > 0
            ? Math.round(toInviteList.reduce((acc, e) => {
                const created = new Date(e.created_at).getTime();
                const invited = new Date(e.invited_at!).getTime();
                return acc + Math.max(0, (invited - created) / (1000 * 60 * 60 * 24));
            }, 0) / toInviteList.length)
            : 0;

        // Time from invitation (invited_at) to confirmation (confirmed_at)
        const toConfirmList = enrollments.filter(e => e.confirmed_at && e.invited_at);
        const avgDaysToConfirm = toConfirmList.length > 0
            ? Math.round(toConfirmList.reduce((acc, e) => {
                const invited = new Date(e.invited_at!).getTime();
                const confirmed = new Date(e.confirmed_at!).getTime();
                return acc + Math.max(0, (confirmed - invited) / (1000 * 60 * 60 * 24));
            }, 0) / toConfirmList.length)
            : 0;

        // Time from confirmation (confirmed_at) to completion (completed_at)
        const toCompleteList = enrollments.filter(e => e.completed_at && e.confirmed_at);
        const avgDaysToComplete = toCompleteList.length > 0
            ? Math.round(toCompleteList.reduce((acc, e) => {
                const confirmed = new Date(e.confirmed_at!).getTime();
                const completed = new Date(e.completed_at!).getTime();
                return acc + Math.max(0, (completed - confirmed) / (1000 * 60 * 60 * 24));
            }, 0) / toCompleteList.length)
            : 0;

        return {
            avgDaysToInvite,
            avgDaysToConfirm,
            avgDaysToComplete
        };
    }, [enrollments]);

    // 4. Trends Over Time (Area Chart)
    const trendsData = useMemo(() => {
        const timeline: Record<string, { registrations: number, completions: number, timestamp: number, items: any[] }> = {};
        
        const getMonthYear = (dateString: string | null) => {
            if (!dateString) return null;
            const d = new Date(dateString);
            if (isNaN(d.getTime())) return null;
            return d.toLocaleDateString('en-IE', { month: 'short', year: '2-digit' });
        };

        const addOrCreateMonth = (dateString: string | null) => {
            const my = getMonthYear(dateString);
            if (!my) return null;
            if (!timeline[my]) {
                const d = new Date(dateString!);
                timeline[my] = { registrations: 0, completions: 0, timestamp: new Date(d.getFullYear(), d.getMonth(), 1).getTime(), items: [] };
            }
            return my;
        };

        enrollments.forEach(e => {
            const regMonth = addOrCreateMonth(e.created_at);
            if (regMonth) {
                timeline[regMonth].registrations++;
                if (!timeline[regMonth].items.some(item => item.id === e.id)) {
                    timeline[regMonth].items.push(e);
                }
            }

            if (e.status === 'completed') {
                const dateToUse = e.completed_date || e.confirmed_date || e.created_at;
                const compMonth = addOrCreateMonth(dateToUse);
                if (compMonth) {
                    timeline[compMonth].completions++;
                    if (!timeline[compMonth].items.some(item => item.id === e.id)) {
                        timeline[compMonth].items.push(e);
                    }
                }
            }
        });

        return Object.entries(timeline)
            .sort((a, b) => a[1].timestamp - b[1].timestamp)
            .map(([name, data]) => ({
                name,
                Registrations: data.registrations,
                Completions: data.completions,
                items: data.items
            }));
    }, [enrollments]);

    // 5. Top Metrics
    const metrics = useMemo(() => {
        const total = enrollments.length;
        const queue = enrollments.filter(e => e.status === 'requested' || e.status === 'invited').length;
        const successRate = total > 0 
            ? Math.round((enrollments.filter(e => e.status === 'completed' || e.status === 'confirmed').length / total) * 100) 
            : 0;
            
        const withResponseTime = enrollments.filter(e => e.response_days !== null);
        const avgResponse = withResponseTime.length > 0 
            ? Math.round(withResponseTime.reduce((acc, e) => acc + (e.response_days || 0), 0) / withResponseTime.length)
            : 0;

        return { total, queue, successRate, avgResponse };
    }, [enrollments]);

    // 6. Conducted Courses calculation (runs with at least one completed enrollment)
    const conductedCourses = useMemo(() => {
        const groups: Record<string, {
            courseId: string;
            courseName: string;
            variant: string;
            date: string | null;
            completedEnrollments: EnrollmentWithRelations[];
        }> = {};

        enrollments.forEach(e => {
            const courseId = e.course_id || 'unknown';
            const courseName = e.courses?.name || 'Unknown Course';
            const variant = cleanVariant(courseName, e.course_variant);
            const dateKey = e.invited_date || 'No Date';
            const key = `${courseId}-${variant}-${dateKey}`;

            if (!groups[key]) {
                groups[key] = {
                    courseId,
                    courseName,
                    variant,
                    date: e.invited_date,
                    completedEnrollments: []
                };
            }

            if (e.status === 'completed') {
                groups[key].completedEnrollments.push(e);
            }
        });

        // Filter groups that have completed enrollments and format the records
        return Object.values(groups)
            .filter(g => g.completedEnrollments.length > 0)
            .map(g => ({
                ...g,
                completedCount: g.completedEnrollments.length
            }))
            // Sort by date descending (nulls last) then by course name
            .sort((a, b) => {
                if (!a.date && !b.date) return a.courseName.localeCompare(b.courseName);
                if (!a.date) return 1;
                if (!b.date) return -1;
                const dateCompare = b.date.localeCompare(a.date);
                if (dateCompare !== 0) return dateCompare;
                return a.courseName.localeCompare(b.courseName);
            });
    }, [enrollments]);

    // Search and pagination state
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 5;

    const filteredConductedCourses = useMemo(() => {
        if (!searchQuery.trim()) return conductedCourses;
        const query = searchQuery.toLowerCase().trim();
        return conductedCourses.filter(c => 
            c.courseName.toLowerCase().includes(query) || 
            c.variant.toLowerCase().includes(query) || 
            (c.date && c.date.includes(query))
        );
    }, [conductedCourses, searchQuery]);

    // Reset current page when query changes
    useMemo(() => {
        setCurrentPage(1);
    }, [searchQuery]);

    const paginatedCourses = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return filteredConductedCourses.slice(startIndex, startIndex + itemsPerPage);
    }, [filteredConductedCourses, currentPage]);

    const totalPages = Math.ceil(filteredConductedCourses.length / itemsPerPage) || 1;

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return 'N/A';
        try {
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return dateStr;
            return d.toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' });
        } catch {
            return dateStr;
        }
    };

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Header Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                <div className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-5 relative overflow-hidden group card-hover cursor-pointer"
                     onClick={() => onDrillDown('All Enrollments', enrollments)}>
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-brand-500 to-indigo-600" />
                    <div className="flex items-start justify-between relative z-10">
                        <div>
                            <p className="text-[11px] font-bold text-muted uppercase tracking-wider mb-1">Total Pipeline</p>
                            <p className="text-3xl font-mono font-bold text-primary">{metrics.total}</p>
                        </div>
                        <div className="p-2.5 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400">
                            <Users size={20} />
                        </div>
                    </div>
                </div>

                <div className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-5 relative overflow-hidden group card-hover cursor-pointer"
                     onClick={() => {
                         const el = document.getElementById('conducted-courses-section');
                         if (el) el.scrollIntoView({ behavior: 'smooth' });
                     }}>
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-violet-500 to-purple-600" />
                    <div className="flex items-start justify-between relative z-10">
                        <div>
                            <p className="text-[11px] font-bold text-muted uppercase tracking-wider mb-1">Conducted Courses</p>
                            <p className="text-3xl font-mono font-bold text-primary">{conductedCourses.length}</p>
                        </div>
                        <div className="p-2.5 rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400">
                            <GraduationCap size={20} />
                        </div>
                    </div>
                </div>

                <div className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-5 relative overflow-hidden group card-hover cursor-pointer"
                     onClick={() => onDrillDown('Active Queue', enrollments.filter(e => e.status === 'requested' || e.status === 'invited'))}>
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 to-orange-500" />
                    <div className="flex items-start justify-between relative z-10">
                        <div>
                            <p className="text-[11px] font-bold text-muted uppercase tracking-wider mb-1">Active Queue</p>
                            <p className="text-3xl font-mono font-bold text-primary">{metrics.queue}</p>
                        </div>
                        <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                            <Clock size={20} />
                        </div>
                    </div>
                </div>

                <div className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-5 relative overflow-hidden group card-hover cursor-pointer"
                     onClick={() => onDrillDown('Successful Enrollments', enrollments.filter(e => e.status === 'confirmed' || e.status === 'completed'))}>
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400 to-teal-500" />
                    <div className="flex items-start justify-between relative z-10">
                        <div>
                            <p className="text-[11px] font-bold text-muted uppercase tracking-wider mb-1">Success Rate</p>
                            <p className="text-3xl font-mono font-bold text-primary">{metrics.successRate}%</p>
                        </div>
                        <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                            <TrendingUp size={20} />
                        </div>
                    </div>
                </div>
                
                <div className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-5 relative overflow-hidden group card-hover">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-400 to-blue-500" />
                    <div className="flex items-start justify-between relative z-10">
                        <div>
                            <p className="text-[11px] font-bold text-muted uppercase tracking-wider mb-1">Avg Response Deadline</p>
                            <p className="text-3xl font-mono font-bold text-primary">{metrics.avgResponse} <span className="text-sm font-normal text-muted">days</span></p>
                        </div>
                        <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
                            <Zap size={20} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Snapshot Pipeline Status */}
                <div className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-5 flex flex-col min-h-[350px] lg:col-span-1">
                    <h3 className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-2 mb-6">
                        <Filter size={16} className="text-brand-500" /> Current Status Distribution
                    </h3>
                    <div className="flex-1 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart 
                                data={pipelineData} 
                                layout="vertical" 
                                margin={{ top: 0, right: 30, left: 0, bottom: 0 }}
                                onClick={(data: any) => {
                                    if (data && data.activePayload && data.activePayload[0]) {
                                        const payload = data.activePayload[0].payload;
                                        onDrillDown(`Status: ${payload.name}`, payload.items);
                                    }
                                }}
                            >
                                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="var(--color-chart-border)" />
                                <XAxis type="number" hide />
                                <YAxis 
                                    dataKey="name" 
                                    type="category" 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{ fill: 'var(--color-chart-text)', fontSize: 11, fontWeight: 500 }}
                                    width={75}
                                />
                                <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: 'var(--color-chart-border)', opacity: 0.2 }} />
                                <Bar 
                                    dataKey="value" 
                                    radius={[0, 6, 6, 0]} 
                                    barSize={32}
                                    className="cursor-pointer"
                                >
                                    {pipelineData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} className="hover:opacity-80 transition-opacity" />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Enrollment Trends */}
                <div className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-5 flex flex-col min-h-[350px] lg:col-span-2">
                    <h3 className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-2 mb-6">
                        <TrendingUp size={16} className="text-brand-500" /> Registration & Completion Trends
                    </h3>
                    <div className="flex-1 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart 
                                data={trendsData} 
                                margin={{ top: 5, right: 0, left: -20, bottom: 0 }}
                                onClick={(data: any) => {
                                    if (data && data.activePayload && data.activePayload[0]) {
                                        const payload = data.activePayload[0].payload;
                                        onDrillDown(`Enrollments in ${payload.name}`, payload.items);
                                    }
                                }}
                            >
                                <defs>
                                    <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="var(--color-trend-reg)" stopOpacity={0.3}/>
                                        <stop offset="95%" stopColor="var(--color-trend-reg)" stopOpacity={0}/>
                                    </linearGradient>
                                    <linearGradient id="colorConfirmed" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="var(--color-trend-comp)" stopOpacity={0.3}/>
                                        <stop offset="95%" stopColor="var(--color-trend-comp)" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-chart-border)" />
                                <XAxis 
                                    dataKey="name" 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{ fill: 'var(--color-chart-text)', fontSize: 11 }} 
                                    dy={10}
                                />
                                <YAxis 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{ fill: 'var(--color-chart-text)', fontSize: 11 }} 
                                />
                                <RechartsTooltip content={<CustomTooltip />} />
                                <Area 
                                    type="monotone" 
                                    dataKey="Registrations" 
                                    stroke="var(--color-trend-reg)" 
                                    strokeWidth={3}
                                    fillOpacity={1} 
                                    fill="url(#colorTotal)" 
                                    activeDot={{ r: 6, strokeWidth: 0, className: "cursor-pointer" }}
                                />
                                <Area 
                                    type="monotone" 
                                    dataKey="Completions" 
                                    stroke="var(--color-trend-comp)" 
                                    strokeWidth={3}
                                    fillOpacity={1} 
                                    fill="url(#colorConfirmed)" 
                                    activeDot={{ r: 6, strokeWidth: 0, className: "cursor-pointer" }}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Stepper Pipeline Flow & Speed Metrics */}
            <div className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-5">
                <h3 className="text-xs font-bold text-muted uppercase tracking-wider mb-6 flex items-center gap-2">
                    <Clock size={16} className="text-brand-500" /> Pipeline Conversions & Processing Speeds
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-7 gap-4 items-center">
                    {/* Step 1: Requested */}
                    <div className="md:col-span-1 bg-surface-elevated border border-border-subtle p-4 rounded-xl text-center">
                        <span className="text-[10px] font-bold text-muted uppercase tracking-wider">Stage 1</span>
                        <p className="text-base font-bold text-primary mt-1">Requested</p>
                        <p className="text-2xl font-mono font-bold mt-2 text-amber-500 dark:text-amber-400">{funnelAnalysis.everRequested}</p>
                        <span className="text-[10px] text-muted font-medium">applications</span>
                    </div>

                    {/* Transition 1 */}
                    <div className="md:col-span-1 flex flex-col items-center justify-center p-2 text-center">
                        <div className="flex items-center gap-1 text-xs font-bold text-brand-600 dark:text-brand-400 bg-brand-500/10 dark:bg-brand-500/20 px-2 py-1 rounded-full">
                            <TrendingUp size={12} /> {funnelAnalysis.requestedToInvited}%
                        </div>
                        <ArrowRight size={16} className="text-muted my-1 hidden md:block" />
                        <div className="text-[10px] text-muted font-medium mt-1">
                            Avg: <span className="font-bold text-primary">{speedMetrics.avgDaysToInvite} days</span> to invite
                        </div>
                    </div>

                    {/* Step 2: Invited */}
                    <div className="md:col-span-1 bg-surface-elevated border border-border-subtle p-4 rounded-xl text-center">
                        <span className="text-[10px] font-bold text-muted uppercase tracking-wider">Stage 2</span>
                        <p className="text-base font-bold text-primary mt-1">Invited</p>
                        <p className="text-2xl font-mono font-bold mt-2 text-purple-500 dark:text-purple-400">{funnelAnalysis.everInvited}</p>
                        <span className="text-[10px] text-muted font-medium">students</span>
                    </div>

                    {/* Transition 2 */}
                    <div className="md:col-span-1 flex flex-col items-center justify-center p-2 text-center">
                        <div className="flex items-center gap-1 text-xs font-bold text-brand-600 dark:text-brand-400 bg-brand-500/10 dark:bg-brand-500/20 px-2 py-1 rounded-full">
                            <TrendingUp size={12} /> {funnelAnalysis.invitedToConfirmed}%
                        </div>
                        <ArrowRight size={16} className="text-muted my-1 hidden md:block" />
                        <div className="text-[10px] text-muted font-medium mt-1">
                            Avg: <span className="font-bold text-primary">{speedMetrics.avgDaysToConfirm} days</span> to confirm
                        </div>
                    </div>

                    {/* Step 3: Confirmed */}
                    <div className="md:col-span-1 bg-surface-elevated border border-border-subtle p-4 rounded-xl text-center">
                        <span className="text-[10px] font-bold text-muted uppercase tracking-wider">Stage 3</span>
                        <p className="text-base font-bold text-primary mt-1">Confirmed</p>
                        <p className="text-2xl font-mono font-bold mt-2 text-sky-500 dark:text-sky-400">{funnelAnalysis.everConfirmed}</p>
                        <span className="text-[10px] text-muted font-medium">confirmed</span>
                    </div>

                    {/* Transition 3 */}
                    <div className="md:col-span-1 flex flex-col items-center justify-center p-2 text-center">
                        <div className="flex items-center gap-1 text-xs font-bold text-brand-600 dark:text-brand-400 bg-brand-500/10 dark:bg-brand-500/20 px-2 py-1 rounded-full">
                            <TrendingUp size={12} /> {funnelAnalysis.confirmedToCompleted}%
                        </div>
                        <ArrowRight size={16} className="text-muted my-1 hidden md:block" />
                        <div className="text-[10px] text-muted font-medium mt-1">
                            Avg: <span className="font-bold text-primary">{speedMetrics.avgDaysToComplete} days</span> duration
                        </div>
                    </div>

                    {/* Step 4: Completed */}
                    <div className="md:col-span-1 bg-surface-elevated border border-brand-500/20 p-4 rounded-xl text-center shadow-sm">
                        <div className="flex items-center justify-center gap-1 text-[10px] font-bold text-emerald-600 uppercase tracking-wider">
                            <CheckCircle2 size={10} /> Finished
                        </div>
                        <p className="text-base font-bold text-primary mt-1">Completed</p>
                        <p className="text-2xl font-mono font-bold mt-2 text-emerald-500 dark:text-emerald-400">{funnelAnalysis.everCompleted}</p>
                        <span className="text-[10px] text-muted font-medium">graduates</span>
                    </div>
                </div>
            </div>

            {/* Conducted Courses Details */}
            <div id="conducted-courses-section" className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-5">
                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-violet-500/10 text-violet-600 dark:text-violet-400 rounded-xl">
                            <GraduationCap size={20} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-sm font-bold text-primary uppercase tracking-wider">
                                    Conducted Course Runs
                                </h3>
                                <span className="text-xs font-semibold text-brand-600 dark:text-brand-400 bg-brand-500/10 px-2.5 py-0.5 rounded-full">
                                    {filteredConductedCourses.length}
                                </span>
                            </div>
                            <p className="text-xs text-muted mt-0.5">List of course runs that have at least one completed student</p>
                        </div>
                    </div>
                    
                    {/* Search Bar */}
                    <div className="relative w-full sm:w-72">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
                        <input
                            type="text"
                            placeholder="Search by course or variant..."
                            className="w-full pl-9 pr-4 py-2 bg-surface-elevated border border-border-strong rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 focus:bg-background transition-all placeholder:text-muted/60 text-primary"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>

                {/* Table */}
                <div className="border border-border-subtle rounded-xl overflow-hidden bg-surface-elevated/20">
                    {paginatedCourses.length === 0 ? (
                        <div className="text-center py-12 text-muted text-sm">
                            <BookOpen size={32} className="mx-auto text-muted/40 mb-3" />
                            {searchQuery ? 'No course runs match your search query' : 'No conducted course runs found with completed students.'}
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm border-collapse">
                                <thead className="bg-surface-elevated/70 text-xs uppercase font-bold tracking-wider text-muted border-b border-border-subtle">
                                    <tr>
                                        <th className="py-3 px-4">Course Name</th>
                                        <th className="py-3 px-4">Level / Variant</th>
                                        <th className="py-3 px-4">Start Date</th>
                                        <th className="py-3 px-4 text-center">Graduates</th>
                                        <th className="py-3 px-4 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border-subtle bg-surface">
                                    {paginatedCourses.map((course, idx) => (
                                        <tr 
                                            key={`${course.courseId}-${course.variant}-${course.date || idx}`}
                                            className="hover:bg-brand-500/5 cursor-pointer transition-colors group"
                                            onClick={() => onDrillDown(
                                                `${course.courseName} - ${course.variant} (${formatDate(course.date)}) Graduates`,
                                                course.completedEnrollments
                                            )}
                                        >
                                            <td className="py-3.5 px-4 font-semibold text-primary">
                                                {course.courseName}
                                            </td>
                                            <td className="py-3.5 px-4">
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400 border border-brand-100 dark:border-brand-500/20">
                                                    {course.variant}
                                                </span>
                                            </td>
                                            <td className="py-3.5 px-4 text-muted font-mono text-xs">
                                                {formatDate(course.date)}
                                            </td>
                                            <td className="py-3.5 px-4 text-center">
                                                <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-full text-xs font-bold font-mono bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-500/20">
                                                    {course.completedCount}
                                                </span>
                                            </td>
                                            <td className="py-3.5 px-4 text-right">
                                                <button 
                                                    className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 transition-colors"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onDrillDown(
                                                            `${course.courseName} - ${course.variant} (${formatDate(course.date)}) Graduates`,
                                                            course.completedEnrollments
                                                        );
                                                    }}
                                                >
                                                    View Graduates
                                                    <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4 px-1">
                        <div className="text-xs text-muted font-medium">
                            Showing <span className="font-semibold text-primary">{(currentPage - 1) * itemsPerPage + 1}</span> to{' '}
                            <span className="font-semibold text-primary">
                                {Math.min(currentPage * itemsPerPage, filteredConductedCourses.length)}
                            </span> of{' '}
                            <span className="font-semibold text-primary">{filteredConductedCourses.length}</span> runs
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                disabled={currentPage === 1}
                                className="p-2 rounded-lg border border-border-subtle bg-surface hover:bg-surface-elevated disabled:opacity-50 disabled:hover:bg-surface transition-colors cursor-pointer disabled:cursor-not-allowed"
                            >
                                <ChevronLeft size={16} className="text-primary" />
                            </button>
                            <span className="text-xs font-semibold text-primary px-2">
                                Page {currentPage} of {totalPages}
                            </span>
                            <button
                                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                disabled={currentPage === totalPages}
                                className="p-2 rounded-lg border border-border-subtle bg-surface hover:bg-surface-elevated disabled:opacity-50 disabled:hover:bg-surface transition-colors cursor-pointer disabled:cursor-not-allowed"
                            >
                                <ChevronRight size={16} className="text-primary" />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
