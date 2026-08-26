import { useMemo } from 'react';
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
import { Users, Clock, TrendingUp, Zap, Filter, ArrowRight, CheckCircle2, GraduationCap, UserCheck } from 'lucide-react';
import type { EnrollmentWithRelations } from '../../lib/documentUtils';
import { calculateSpeedMetrics, calculateFunnelAnalysis } from './analyticsUtils';

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
    // 1. Snapshot Pipeline Data
    const pipelineData = useMemo(() => {
        const counts = { requested: 0, invited: 0, confirmed: 0, completed: 0, withdrawn: 0, rejected: 0 };
        const items = { requested: [] as any[], invited: [] as any[], confirmed: [] as any[], completed: [] as any[], withdrawn: [] as any[], rejected: [] as any[] };
        
        enrollments.forEach(e => {
            const st = e.status as keyof typeof counts;
            if (st in counts) {
                counts[st]++;
                items[st].push(e);
            }
        });
        
        return [
            { name: 'Requested', value: counts.requested, color: 'var(--color-requested, #f59e0b)', items: items.requested },
            { name: 'Invited', value: counts.invited, color: 'var(--color-invited, #0284c7)', items: items.invited },
            { name: 'Confirmed', value: counts.confirmed, color: 'var(--color-confirmed, #10b981)', items: items.confirmed },
            { name: 'Completed', value: counts.completed, color: 'var(--color-completed, #8b5cf6)', items: items.completed },
            { name: 'Withdrawn', value: counts.withdrawn, color: '#64748b', items: items.withdrawn },
            { name: 'Rejected', value: counts.rejected, color: '#ef4444', items: items.rejected },
        ].filter(d => d.value > 0 || ['Requested', 'Invited', 'Confirmed', 'Completed'].includes(d.name));
    }, [enrollments]);

    // 2. Conversion Cohort Analysis (Historical)
    const funnel = useMemo(() => calculateFunnelAnalysis(enrollments), [enrollments]);

    // 3. Efficiency and Speed Metrics
    const speedMetrics = useMemo(() => calculateSpeedMetrics(enrollments), [enrollments]);

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
        const requested = enrollments.filter(e => e.status === 'requested').length;
        const invited = enrollments.filter(e => e.status === 'invited').length;
        const confirmed = enrollments.filter(e => e.status === 'confirmed').length;
        const completed = enrollments.filter(e => e.status === 'completed').length;
        const queue = requested + invited;
        const successRate = total > 0 ? Math.round((completed / total) * 100) : 0;
            
        const withResponseTime = enrollments.filter(e => e.response_days !== null);
        const avgResponse = withResponseTime.length > 0 
            ? Math.round(withResponseTime.reduce((acc, e) => acc + (e.response_days || 0), 0) / withResponseTime.length)
            : 7;

        return { total, queue, confirmed, completed, successRate, avgResponse };
    }, [enrollments]);

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Header Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {/* Total Pipeline */}
                <div 
                    className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-4 relative overflow-hidden group card-hover cursor-pointer"
                    onClick={() => onDrillDown('All Pipeline Applications', enrollments)}
                >
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-brand-500 to-indigo-600" />
                    <div className="flex items-start justify-between relative z-10">
                        <div>
                            <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1">Total Pipeline</p>
                            <p className="text-2xl font-mono font-bold text-primary">{metrics.total}</p>
                        </div>
                        <div className="p-2 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400">
                            <Users size={18} />
                        </div>
                    </div>
                </div>

                {/* Active Queue */}
                <div 
                    className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-4 relative overflow-hidden group card-hover cursor-pointer"
                    onClick={() => onDrillDown('Active Waiting Queue (Requested & Invited)', enrollments.filter(e => e.status === 'requested' || e.status === 'invited'))}
                >
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 to-orange-500" />
                    <div className="flex items-start justify-between relative z-10">
                        <div>
                            <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1">Active Queue</p>
                            <p className="text-2xl font-mono font-bold text-primary">{metrics.queue}</p>
                        </div>
                        <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                            <Clock size={18} />
                        </div>
                    </div>
                </div>

                {/* Confirmed Students */}
                <div 
                    className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-4 relative overflow-hidden group card-hover cursor-pointer"
                    onClick={() => onDrillDown('Confirmed Students', enrollments.filter(e => e.status === 'confirmed'))}
                >
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-sky-400 to-blue-500" />
                    <div className="flex items-start justify-between relative z-10">
                        <div>
                            <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1">Confirmed</p>
                            <p className="text-2xl font-mono font-bold text-primary">{metrics.confirmed}</p>
                        </div>
                        <div className="p-2 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
                            <UserCheck size={18} />
                        </div>
                    </div>
                </div>

                {/* Completed Graduates */}
                <div 
                    className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-4 relative overflow-hidden group card-hover cursor-pointer"
                    onClick={() => onDrillDown('Completed Graduates', enrollments.filter(e => e.status === 'completed'))}
                >
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-violet-500 to-purple-600" />
                    <div className="flex items-start justify-between relative z-10">
                        <div>
                            <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1">Graduates</p>
                            <p className="text-2xl font-mono font-bold text-primary">{metrics.completed}</p>
                        </div>
                        <div className="p-2 rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400">
                            <GraduationCap size={18} />
                        </div>
                    </div>
                </div>

                {/* Success Rate */}
                <div 
                    className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-4 relative overflow-hidden group card-hover cursor-pointer"
                    onClick={() => onDrillDown('Completed Graduates vs Applications', enrollments.filter(e => e.status === 'completed'))}
                >
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400 to-teal-500" />
                    <div className="flex items-start justify-between relative z-10">
                        <div>
                            <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1">Success Rate</p>
                            <p className="text-2xl font-mono font-bold text-primary">{metrics.successRate}%</p>
                        </div>
                        <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                            <TrendingUp size={18} />
                        </div>
                    </div>
                </div>
                
                {/* Avg Response Window */}
                <div className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-4 relative overflow-hidden group card-hover">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-400 to-blue-500" />
                    <div className="flex items-start justify-between relative z-10">
                        <div>
                            <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1">Response Window</p>
                            <p className="text-2xl font-mono font-bold text-primary">{metrics.avgResponse} <span className="text-xs font-normal text-muted">days</span></p>
                        </div>
                        <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
                            <Zap size={18} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Pipeline Status Distribution */}
                <div className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-5 flex flex-col min-h-[360px] lg:col-span-1">
                    <h3 className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-2 mb-4">
                        <Filter size={16} className="text-brand-500" /> Status Distribution
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
                                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="var(--color-chart-border, #e2e8f0)" opacity={0.5} />
                                <XAxis type="number" hide />
                                <YAxis 
                                    dataKey="name" 
                                    type="category" 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{ fill: 'var(--color-chart-text, #64748b)', fontSize: 11, fontWeight: 600 }}
                                    width={80}
                                />
                                <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: 'var(--color-chart-border, #e2e8f0)', opacity: 0.2 }} />
                                <Bar 
                                    dataKey="value" 
                                    radius={[0, 6, 6, 0]} 
                                    barSize={28}
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

                {/* Registration & Completion Trends */}
                <div className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-5 flex flex-col min-h-[360px] lg:col-span-2">
                    <h3 className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-2 mb-4">
                        <TrendingUp size={16} className="text-brand-500" /> Registration & Completion Velocity
                    </h3>
                    <div className="flex-1 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart 
                                data={trendsData} 
                                margin={{ top: 5, right: 10, left: -20, bottom: 0 }}
                                onClick={(data: any) => {
                                    if (data && data.activePayload && data.activePayload[0]) {
                                        const payload = data.activePayload[0].payload;
                                        onDrillDown(`Enrollments in ${payload.name}`, payload.items);
                                    }
                                }}
                            >
                                <defs>
                                    <linearGradient id="colorReg" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.35}/>
                                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                                    </linearGradient>
                                    <linearGradient id="colorComp" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.35}/>
                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-chart-border, #e2e8f0)" opacity={0.5} />
                                <XAxis 
                                    dataKey="name" 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{ fill: 'var(--color-chart-text, #64748b)', fontSize: 11 }} 
                                    dy={10}
                                />
                                <YAxis 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{ fill: 'var(--color-chart-text, #64748b)', fontSize: 11 }} 
                                />
                                <RechartsTooltip content={<CustomTooltip />} />
                                <Area 
                                    type="monotone" 
                                    dataKey="Registrations" 
                                    stroke="#6366f1" 
                                    strokeWidth={3}
                                    fillOpacity={1} 
                                    fill="url(#colorReg)" 
                                    activeDot={{ r: 6, strokeWidth: 0, className: "cursor-pointer" }}
                                />
                                <Area 
                                    type="monotone" 
                                    dataKey="Completions" 
                                    stroke="#10b981" 
                                    strokeWidth={3}
                                    fillOpacity={1} 
                                    fill="url(#colorComp)" 
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
                    <div 
                        className="md:col-span-1 bg-surface-elevated border border-border-subtle p-4 rounded-xl text-center cursor-pointer hover:border-brand-500/40 transition-colors"
                        onClick={() => onDrillDown('Stage 1: Requested Applications', enrollments)}
                    >
                        <span className="text-[10px] font-bold text-muted uppercase tracking-wider">Stage 1</span>
                        <p className="text-sm font-bold text-primary mt-1">Requested</p>
                        <p className="text-2xl font-mono font-bold mt-2 text-amber-500 dark:text-amber-400">{funnel.everRequested}</p>
                        <span className="text-[10px] text-muted font-medium">applications</span>
                    </div>

                    {/* Transition 1 */}
                    <div className="md:col-span-1 flex flex-col items-center justify-center p-2 text-center">
                        <div className="flex items-center gap-1 text-xs font-bold text-brand-600 dark:text-brand-400 bg-brand-500/10 dark:bg-brand-500/20 px-2.5 py-1 rounded-full">
                            <TrendingUp size={12} /> {funnel.requestedToInvited}%
                        </div>
                        <ArrowRight size={16} className="text-muted my-1 hidden md:block" />
                        <div className="text-[10px] text-muted font-medium mt-1">
                            Avg: <span className="font-bold text-primary">{speedMetrics.avgDaysToInvite} days</span> to invite
                        </div>
                    </div>

                    {/* Step 2: Invited */}
                    <div 
                        className="md:col-span-1 bg-surface-elevated border border-border-subtle p-4 rounded-xl text-center cursor-pointer hover:border-brand-500/40 transition-colors"
                        onClick={() => onDrillDown('Stage 2: Invited Students', enrollments.filter(e => e.invited_date || ['invited', 'confirmed', 'completed'].includes(e.status)))}
                    >
                        <span className="text-[10px] font-bold text-muted uppercase tracking-wider">Stage 2</span>
                        <p className="text-sm font-bold text-primary mt-1">Invited</p>
                        <p className="text-2xl font-mono font-bold mt-2 text-sky-500 dark:text-sky-400">{funnel.everInvited}</p>
                        <span className="text-[10px] text-muted font-medium">students</span>
                    </div>

                    {/* Transition 2 */}
                    <div className="md:col-span-1 flex flex-col items-center justify-center p-2 text-center">
                        <div className="flex items-center gap-1 text-xs font-bold text-brand-600 dark:text-brand-400 bg-brand-500/10 dark:bg-brand-500/20 px-2.5 py-1 rounded-full">
                            <TrendingUp size={12} /> {funnel.invitedToConfirmed}%
                        </div>
                        <ArrowRight size={16} className="text-muted my-1 hidden md:block" />
                        <div className="text-[10px] text-muted font-medium mt-1">
                            Avg: <span className="font-bold text-primary">{speedMetrics.avgDaysToConfirm} days</span> to confirm
                        </div>
                    </div>

                    {/* Step 3: Confirmed */}
                    <div 
                        className="md:col-span-1 bg-surface-elevated border border-border-subtle p-4 rounded-xl text-center cursor-pointer hover:border-brand-500/40 transition-colors"
                        onClick={() => onDrillDown('Stage 3: Confirmed Students', enrollments.filter(e => e.confirmed_date || ['confirmed', 'completed'].includes(e.status)))}
                    >
                        <span className="text-[10px] font-bold text-muted uppercase tracking-wider">Stage 3</span>
                        <p className="text-sm font-bold text-primary mt-1">Confirmed</p>
                        <p className="text-2xl font-mono font-bold mt-2 text-emerald-500 dark:text-emerald-400">{funnel.everConfirmed}</p>
                        <span className="text-[10px] text-muted font-medium">confirmed</span>
                    </div>

                    {/* Transition 3 */}
                    <div className="md:col-span-1 flex flex-col items-center justify-center p-2 text-center">
                        <div className="flex items-center gap-1 text-xs font-bold text-brand-600 dark:text-brand-400 bg-brand-500/10 dark:bg-brand-500/20 px-2.5 py-1 rounded-full">
                            <TrendingUp size={12} /> {funnel.confirmedToCompleted}%
                        </div>
                        <ArrowRight size={16} className="text-muted my-1 hidden md:block" />
                        <div className="text-[10px] text-muted font-medium mt-1">
                            Avg: <span className="font-bold text-primary">{speedMetrics.avgDaysToComplete} days</span> duration
                        </div>
                    </div>

                    {/* Step 4: Completed */}
                    <div 
                        className="md:col-span-1 bg-surface-elevated border border-brand-500/30 p-4 rounded-xl text-center shadow-sm cursor-pointer hover:border-brand-500 transition-colors"
                        onClick={() => onDrillDown('Stage 4: Completed Graduates', enrollments.filter(e => e.completed_date || e.status === 'completed'))}
                    >
                        <div className="flex items-center justify-center gap-1 text-[10px] font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wider">
                            <CheckCircle2 size={11} /> Finished
                        </div>
                        <p className="text-sm font-bold text-primary mt-1">Completed</p>
                        <p className="text-2xl font-mono font-bold mt-2 text-violet-500 dark:text-violet-400">{funnel.everCompleted}</p>
                        <span className="text-[10px] text-muted font-medium">graduates</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
