import { useMemo } from 'react';
import { 
    ResponsiveContainer, 
    AreaChart, 
    Area, 
    XAxis, 
    YAxis, 
    CartesianGrid, 
    Tooltip as RechartsTooltip 
} from 'recharts';
import { Clock, TrendingUp, ArrowRight, CheckCircle2, Zap } from 'lucide-react';
import type { EnrollmentWithRelations } from '../../lib/documentUtils';
import { calculateSpeedMetrics, calculateFunnelAnalysis } from './analyticsUtils';

interface PipelineFlowCardProps {
    enrollments: EnrollmentWithRelations[];
    onDrillDown: (title: string, data: EnrollmentWithRelations[]) => void;
}

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="glass dark:glass-dark p-3 rounded-xl shadow-lg border border-border-subtle backdrop-blur-xl z-50">
                <p className="text-xs font-semibold text-primary mb-1.5">{label}</p>
                {payload.map((entry: any, index: number) => (
                    <p key={`item-${index}`} className="text-xs font-medium flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color || entry.fill }} />
                        <span className="text-muted">{entry.name}:</span> 
                        <span className="text-primary font-bold font-mono">{entry.value}</span>
                    </p>
                ))}
            </div>
        );
    }
    return null;
};

export default function PipelineFlowCard({ enrollments, onDrillDown }: PipelineFlowCardProps) {
    const funnel = useMemo(() => calculateFunnelAnalysis(enrollments), [enrollments]);
    const speed = useMemo(() => calculateSpeedMetrics(enrollments), [enrollments]);

    // Monthly trends timeline
    const trendsData = useMemo(() => {
        const timeline: Record<string, { registrations: number, completions: number, timestamp: number, items: EnrollmentWithRelations[] }> = {};
        
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

    return (
        <div className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-5 flex flex-col space-y-6">
            {/* Title & Speed Summary */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                        <Clock size={20} />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-primary uppercase tracking-wider">
                                Pipeline Conversion & Velocity Flow
                            </h3>
                            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full font-mono">
                                {funnel.overallSuccessRate}% End-to-End
                            </span>
                        </div>
                        <p className="text-xs text-muted mt-0.5">
                            Stage transition conversions and turnaround processing times
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-muted bg-surface-elevated/60 px-3 py-1.5 rounded-xl border border-border-subtle self-start sm:self-auto">
                    <Zap size={14} className="text-amber-500" />
                    <span>Avg Full Cycle: <strong className="text-primary font-mono">{speed.avgTotalCycleDays} days</strong></span>
                </div>
            </div>

            {/* Stepper Pipeline Flow */}
            <div className="grid grid-cols-1 md:grid-cols-7 gap-3 items-center">
                {/* Step 1: Requested */}
                <div 
                    className="md:col-span-1 bg-surface-elevated border border-border-subtle p-3.5 rounded-xl text-center cursor-pointer hover:border-brand-500/40 transition-all card-hover"
                    onClick={() => onDrillDown('Stage 1: Requested Applications', enrollments)}
                >
                    <span className="text-[10px] font-bold text-muted uppercase tracking-wider">Stage 1</span>
                    <p className="text-xs font-bold text-primary mt-0.5">Requested</p>
                    <p className="text-2xl font-mono font-bold mt-1.5 text-amber-500">{funnel.everRequested}</p>
                    <span className="text-[10px] text-muted">applications</span>
                </div>

                {/* Transition 1 */}
                <div className="md:col-span-1 flex flex-col items-center justify-center p-1 text-center">
                    <div className="flex items-center gap-1 text-[11px] font-bold text-brand-600 dark:text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded-full">
                        <TrendingUp size={11} /> {funnel.requestedToInvited}%
                    </div>
                    <ArrowRight size={14} className="text-muted my-1 hidden md:block" />
                    <div className="text-[10px] text-muted">
                        Avg: <strong className="text-primary">{speed.avgDaysToInvite}d</strong> to invite
                    </div>
                </div>

                {/* Step 2: Invited */}
                <div 
                    className="md:col-span-1 bg-surface-elevated border border-border-subtle p-3.5 rounded-xl text-center cursor-pointer hover:border-brand-500/40 transition-all card-hover"
                    onClick={() => onDrillDown('Stage 2: Invited Students', enrollments.filter(e => e.invited_date || ['invited', 'confirmed', 'completed'].includes(e.status)))}
                >
                    <span className="text-[10px] font-bold text-muted uppercase tracking-wider">Stage 2</span>
                    <p className="text-xs font-bold text-primary mt-0.5">Invited</p>
                    <p className="text-2xl font-mono font-bold mt-1.5 text-sky-500">{funnel.everInvited}</p>
                    <span className="text-[10px] text-muted">students</span>
                </div>

                {/* Transition 2 */}
                <div className="md:col-span-1 flex flex-col items-center justify-center p-1 text-center">
                    <div className="flex items-center gap-1 text-[11px] font-bold text-brand-600 dark:text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded-full">
                        <TrendingUp size={11} /> {funnel.invitedToConfirmed}%
                    </div>
                    <ArrowRight size={14} className="text-muted my-1 hidden md:block" />
                    <div className="text-[10px] text-muted">
                        Avg: <strong className="text-primary">{speed.avgDaysToConfirm}d</strong> to confirm
                    </div>
                </div>

                {/* Step 3: Confirmed */}
                <div 
                    className="md:col-span-1 bg-surface-elevated border border-border-subtle p-3.5 rounded-xl text-center cursor-pointer hover:border-brand-500/40 transition-all card-hover"
                    onClick={() => onDrillDown('Stage 3: Confirmed Students', enrollments.filter(e => e.confirmed_date || ['confirmed', 'completed'].includes(e.status)))}
                >
                    <span className="text-[10px] font-bold text-muted uppercase tracking-wider">Stage 3</span>
                    <p className="text-xs font-bold text-primary mt-0.5">Confirmed</p>
                    <p className="text-2xl font-mono font-bold mt-1.5 text-emerald-500">{funnel.everConfirmed}</p>
                    <span className="text-[10px] text-muted">confirmed</span>
                </div>

                {/* Transition 3 */}
                <div className="md:col-span-1 flex flex-col items-center justify-center p-1 text-center">
                    <div className="flex items-center gap-1 text-[11px] font-bold text-brand-600 dark:text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded-full">
                        <TrendingUp size={11} /> {funnel.confirmedToCompleted}%
                    </div>
                    <ArrowRight size={14} className="text-muted my-1 hidden md:block" />
                    <div className="text-[10px] text-muted">
                        Avg: <strong className="text-primary">{speed.avgDaysToComplete}d</strong> duration
                    </div>
                </div>

                {/* Step 4: Completed */}
                <div 
                    className="md:col-span-1 bg-surface-elevated border border-violet-500/30 p-3.5 rounded-xl text-center shadow-sm cursor-pointer hover:border-violet-500 transition-all card-hover"
                    onClick={() => onDrillDown('Stage 4: Completed Graduates', enrollments.filter(e => e.completed_date || e.status === 'completed'))}
                >
                    <div className="flex items-center justify-center gap-1 text-[10px] font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wider">
                        <CheckCircle2 size={10} /> Completed
                    </div>
                    <p className="text-xs font-bold text-primary mt-0.5">Graduates</p>
                    <p className="text-2xl font-mono font-bold mt-1.5 text-violet-500">{funnel.everCompleted}</p>
                    <span className="text-[10px] text-muted">graduates</span>
                </div>
            </div>

            {/* Trends Timeline Chart */}
            <div className="pt-2">
                <div className="flex items-center justify-between mb-3">
                    <span className="text-[11px] font-bold text-muted uppercase tracking-wider flex items-center gap-1.5">
                        <TrendingUp size={14} className="text-brand-500" /> Monthly Registration & Completion Velocity
                    </span>
                    <div className="flex items-center gap-4 text-xs font-medium">
                        <span className="flex items-center gap-1.5 text-primary">
                            <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" /> Registrations
                        </span>
                        <span className="flex items-center gap-1.5 text-primary">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Completions
                        </span>
                    </div>
                </div>

                <div className="h-[200px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart 
                            data={trendsData} 
                            margin={{ top: 5, right: 10, left: -25, bottom: 0 }}
                            onClick={(data: any) => {
                                if (data && data.activePayload && data.activePayload[0]) {
                                    const payload = data.activePayload[0].payload;
                                    onDrillDown(`Enrollments in ${payload.name}`, payload.items);
                                }
                            }}
                        >
                            <defs>
                                <linearGradient id="flowColorReg" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.35}/>
                                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                                </linearGradient>
                                <linearGradient id="flowColorComp" x1="0" y1="0" x2="0" y2="1">
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
                                dy={8}
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
                                strokeWidth={2.5}
                                fillOpacity={1} 
                                fill="url(#flowColorReg)" 
                                activeDot={{ r: 5, strokeWidth: 0, className: "cursor-pointer" }}
                            />
                            <Area 
                                type="monotone" 
                                dataKey="Completions" 
                                stroke="#10b981" 
                                strokeWidth={2.5}
                                fillOpacity={1} 
                                fill="url(#flowColorComp)" 
                                activeDot={{ r: 5, strokeWidth: 0, className: "cursor-pointer" }}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
}
