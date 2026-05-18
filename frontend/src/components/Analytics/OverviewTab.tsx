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
import { Users, Clock, TrendingUp, Zap, Filter } from 'lucide-react';
import type { EnrollmentWithRelations } from '../../lib/documentUtils';

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

    // 1. Funnel / Pipeline Data
    const pipelineData = useMemo(() => {
        const counts = { requested: 0, invited: 0, confirmed: 0, completed: 0 };
        const items = { requested: [] as any[], invited: [] as any[], confirmed: [] as any[], completed: [] as any[] };
        
        enrollments.forEach(e => {
            if (e.status in counts) {
                counts[e.status as keyof typeof counts]++;
                items[e.status as keyof typeof items].push(e);
            }
        });

        // Calculate drop-off
        // A true funnel means everyone starts at Requested. 
        // For simplicity, we just show the current count in each status, but sorted logically.
        
        return [
            { name: 'Requested', value: counts.requested, color: '#F59E0B', items: items.requested },
            { name: 'Invited', value: counts.invited, color: '#8B5CF6', items: items.invited },
            { name: 'Confirmed', value: counts.confirmed, color: '#0EA5E9', items: items.confirmed },
            { name: 'Completed', value: counts.completed, color: '#10B981', items: items.completed },
        ];
    }, [enrollments]);

    // 2. Trends Over Time (Area Chart)
    const trendsData = useMemo(() => {
        const timeline: Record<string, { total: number, confirmed: number, timestamp: number, items: any[] }> = {};
        
        const getMonthYear = (dateString: string | null) => {
            if (!dateString) return null;
            const d = new Date(dateString);
            if (isNaN(d.getTime())) return null;
            return d.toLocaleDateString('en-IE', { month: 'short', year: '2-digit' });
        };

        enrollments.forEach(e => {
            const my = getMonthYear(e.created_at);
            if (!my) return;
            
            if (!timeline[my]) {
                const d = new Date(e.created_at);
                timeline[my] = { total: 0, confirmed: 0, timestamp: new Date(d.getFullYear(), d.getMonth(), 1).getTime(), items: [] };
            }
            
            timeline[my].total++;
            timeline[my].items.push(e);

            if (e.status === 'confirmed' || e.status === 'completed') {
                timeline[my].confirmed++;
            }
        });

        return Object.entries(timeline)
            .sort((a, b) => a[1].timestamp - b[1].timestamp)
            .map(([name, data]) => ({
                name,
                Total: data.total,
                Confirmed: data.confirmed,
                items: data.items
            }));
    }, [enrollments]);

    // 3. Top Metrics
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

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Header Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-5 relative overflow-hidden group card-hover cursor-pointer"
                     onClick={() => onDrillDown('All Enrollments', enrollments)}>
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-brand-500 to-indigo-600" />
                    <div className="flex items-start justify-between relative z-10">
                        <div>
                            <p className="text-[11px] font-bold text-muted uppercase tracking-wider mb-1">Total Pipeline</p>
                            <p className="text-3xl font-mono font-bold text-primary animate-countUp">{metrics.total}</p>
                        </div>
                        <div className="p-2.5 rounded-xl bg-brand-500/10 text-brand-600">
                            <Users size={20} />
                        </div>
                    </div>
                </div>

                <div className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-5 relative overflow-hidden group card-hover cursor-pointer"
                     onClick={() => onDrillDown('Active Queue', enrollments.filter(e => e.status === 'requested' || e.status === 'invited'))}>
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 to-orange-500" />
                    <div className="flex items-start justify-between relative z-10">
                        <div>
                            <p className="text-[11px] font-bold text-muted uppercase tracking-wider mb-1">Active Queue</p>
                            <p className="text-3xl font-mono font-bold text-primary animate-countUp" style={{animationDelay: '100ms'}}>{metrics.queue}</p>
                        </div>
                        <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600">
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
                            <p className="text-3xl font-mono font-bold text-primary animate-countUp" style={{animationDelay: '200ms'}}>{metrics.successRate}%</p>
                        </div>
                        <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600">
                            <TrendingUp size={20} />
                        </div>
                    </div>
                </div>
                
                <div className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-5 relative overflow-hidden group card-hover">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-400 to-blue-500" />
                    <div className="flex items-start justify-between relative z-10">
                        <div>
                            <p className="text-[11px] font-bold text-muted uppercase tracking-wider mb-1">Avg Response</p>
                            <p className="text-3xl font-mono font-bold text-primary animate-countUp" style={{animationDelay: '300ms'}}>{metrics.avgResponse} <span className="text-sm font-normal text-muted">days</span></p>
                        </div>
                        <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-600">
                            <Zap size={20} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Conversion Funnel */}
                <div className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-5 flex flex-col min-h-[350px] lg:col-span-1">
                    <h3 className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-2 mb-6">
                        <Filter size={16} className="text-brand-500" /> Pipeline Status
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
                                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="var(--border-subtle)" />
                                <XAxis type="number" hide />
                                <YAxis 
                                    dataKey="name" 
                                    type="category" 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{ fill: 'var(--text-muted)', fontSize: 11, fontWeight: 500 }}
                                    width={75}
                                />
                                <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: 'var(--border-subtle)', opacity: 0.2 }} />
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
                        <TrendingUp size={16} className="text-brand-500" /> Registration Trends
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
                                        <stop offset="5%" stopColor="#818cf8" stopOpacity={0.3}/>
                                        <stop offset="95%" stopColor="#818cf8" stopOpacity={0}/>
                                    </linearGradient>
                                    <linearGradient id="colorConfirmed" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-subtle)" />
                                <XAxis 
                                    dataKey="name" 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{ fill: 'var(--text-muted)', fontSize: 11 }} 
                                    dy={10}
                                />
                                <YAxis 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{ fill: 'var(--text-muted)', fontSize: 11 }} 
                                />
                                <RechartsTooltip content={<CustomTooltip />} />
                                <Area 
                                    type="monotone" 
                                    dataKey="Total" 
                                    stroke="#818cf8" 
                                    strokeWidth={3}
                                    fillOpacity={1} 
                                    fill="url(#colorTotal)" 
                                    activeDot={{ r: 6, strokeWidth: 0, className: "cursor-pointer" }}
                                />
                                <Area 
                                    type="monotone" 
                                    dataKey="Confirmed" 
                                    stroke="#10b981" 
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
        </div>
    );
}
