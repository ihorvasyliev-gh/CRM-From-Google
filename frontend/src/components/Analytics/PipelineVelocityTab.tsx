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
import { Clock, TrendingUp, ArrowRight, CheckCircle2, Zap, AlertCircle } from 'lucide-react';
import type { EnrollmentWithRelations } from '../../lib/documentUtils';
import { calculateSpeedMetrics, calculateFunnelAnalysis } from './analyticsUtils';

interface PipelineVelocityTabProps {
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

export default function PipelineVelocityTab({ enrollments, onDrillDown }: PipelineVelocityTabProps) {
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

    // Drop-off calculations
    const requestedDropOff = funnel.everRequested > 0 ? funnel.everRequested - funnel.everInvited : 0;
    const invitedDropOff = funnel.everInvited > 0 ? funnel.everInvited - funnel.everConfirmed : 0;
    const confirmedDropOff = funnel.everConfirmed > 0 ? funnel.everConfirmed - funnel.everCompleted : 0;

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* 1. Header Overview & Speed Banner */}
            <div className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                    <div className="p-3 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex-shrink-0">
                        <Clock size={24} />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="text-base font-bold text-primary">
                                End-to-End Pipeline Conversion & Cycle Velocity
                            </h3>
                            <span className="text-xs font-bold font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                                {funnel.overallSuccessRate}% Success Rate
                            </span>
                        </div>
                        <p className="text-xs text-muted mt-0.5">
                            Stage transition conversions, dropout drop-offs, and processing turnaround durations
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3 bg-surface-elevated px-4 py-2 rounded-xl border border-border-subtle self-start sm:self-auto shadow-sm">
                    <Zap size={16} className="text-amber-500" />
                    <div className="text-xs">
                        <span className="text-muted block text-[10px] font-bold uppercase tracking-wider">Average Full Cycle</span>
                        <span className="text-sm font-bold text-primary font-mono">{speed.avgTotalCycleDays} days <span className="font-normal text-muted text-xs">(Application → Graduation)</span></span>
                    </div>
                </div>
            </div>

            {/* 2. Stepper Pipeline Flow */}
            <div className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-5">
                <h4 className="text-xs font-bold text-muted uppercase tracking-wider mb-4 flex items-center gap-2">
                    <TrendingUp size={14} className="text-brand-500" /> 4-Stage Candidate Progression Funnel
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-7 gap-3 items-center">
                    {/* Step 1: Requested */}
                    <div 
                        className="md:col-span-1 bg-surface-elevated border border-border-subtle p-4 rounded-2xl text-center cursor-pointer hover:border-amber-500/50 transition-all card-hover group"
                        onClick={() => onDrillDown('Stage 1: Candidate Applications (Requested)', enrollments)}
                    >
                        <span className="text-[10px] font-bold text-muted uppercase tracking-wider block">Stage 1</span>
                        <p className="text-xs font-bold text-primary mt-0.5 group-hover:text-amber-500 transition-colors">Requested</p>
                        <p className="text-2xl font-mono font-bold mt-1.5 text-amber-500">{funnel.everRequested}</p>
                        <span className="text-[10px] text-muted">100% Inflow</span>
                    </div>

                    {/* Transition 1 */}
                    <div className="md:col-span-1 flex flex-col items-center justify-center p-1 text-center">
                        <div className="flex items-center gap-1 text-[11px] font-bold text-brand-600 dark:text-brand-400 bg-brand-500/10 px-2.5 py-0.5 rounded-full border border-brand-500/20 font-mono">
                            <TrendingUp size={11} /> {funnel.requestedToInvited}%
                        </div>
                        <ArrowRight size={14} className="text-muted my-1 hidden md:block" />
                        <div className="text-[10px] text-muted">
                            Avg: <strong className="text-primary font-mono">{speed.avgDaysToInvite}d</strong> to invite
                        </div>
                    </div>

                    {/* Step 2: Invited */}
                    <div 
                        className="md:col-span-1 bg-surface-elevated border border-border-subtle p-4 rounded-2xl text-center cursor-pointer hover:border-sky-500/50 transition-all card-hover group"
                        onClick={() => onDrillDown('Stage 2: Invited Students', enrollments.filter(e => e.invited_date || ['invited', 'confirmed', 'completed'].includes(e.status)))}
                    >
                        <span className="text-[10px] font-bold text-muted uppercase tracking-wider block">Stage 2</span>
                        <p className="text-xs font-bold text-primary mt-0.5 group-hover:text-sky-500 transition-colors">Invited</p>
                        <p className="text-2xl font-mono font-bold mt-1.5 text-sky-500">{funnel.everInvited}</p>
                        <span className="text-[10px] text-muted">Invited to cohort</span>
                    </div>

                    {/* Transition 2 */}
                    <div className="md:col-span-1 flex flex-col items-center justify-center p-1 text-center">
                        <div className="flex items-center gap-1 text-[11px] font-bold text-brand-600 dark:text-brand-400 bg-brand-500/10 px-2.5 py-0.5 rounded-full border border-brand-500/20 font-mono">
                            <TrendingUp size={11} /> {funnel.invitedToConfirmed}%
                        </div>
                        <ArrowRight size={14} className="text-muted my-1 hidden md:block" />
                        <div className="text-[10px] text-muted">
                            Avg: <strong className="text-primary font-mono">{speed.avgDaysToConfirm}d</strong> to respond
                        </div>
                    </div>

                    {/* Step 3: Confirmed */}
                    <div 
                        className="md:col-span-1 bg-surface-elevated border border-border-subtle p-4 rounded-2xl text-center cursor-pointer hover:border-emerald-500/50 transition-all card-hover group"
                        onClick={() => onDrillDown('Stage 3: Confirmed Students', enrollments.filter(e => e.confirmed_date || ['confirmed', 'completed'].includes(e.status)))}
                    >
                        <span className="text-[10px] font-bold text-muted uppercase tracking-wider block">Stage 3</span>
                        <p className="text-xs font-bold text-primary mt-0.5 group-hover:text-emerald-500 transition-colors">Confirmed</p>
                        <p className="text-2xl font-mono font-bold mt-1.5 text-emerald-500">{funnel.everConfirmed}</p>
                        <span className="text-[10px] text-muted">Confirmed attendance</span>
                    </div>

                    {/* Transition 3 */}
                    <div className="md:col-span-1 flex flex-col items-center justify-center p-1 text-center">
                        <div className="flex items-center gap-1 text-[11px] font-bold text-brand-600 dark:text-brand-400 bg-brand-500/10 px-2.5 py-0.5 rounded-full border border-brand-500/20 font-mono">
                            <TrendingUp size={11} /> {funnel.confirmedToCompleted}%
                        </div>
                        <ArrowRight size={14} className="text-muted my-1 hidden md:block" />
                        <div className="text-[10px] text-muted">
                            Avg: <strong className="text-primary font-mono">{speed.avgDaysToComplete}d</strong> duration
                        </div>
                    </div>

                    {/* Step 4: Completed */}
                    <div 
                        className="md:col-span-1 bg-surface-elevated border border-violet-500/40 p-4 rounded-2xl text-center shadow-sm cursor-pointer hover:border-violet-500 transition-all card-hover group"
                        onClick={() => onDrillDown('Stage 4: Completed Graduates', enrollments.filter(e => e.completed_date || e.status === 'completed'))}
                    >
                        <div className="flex items-center justify-center gap-1 text-[10px] font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wider">
                            <CheckCircle2 size={11} /> Finished
                        </div>
                        <p className="text-xs font-bold text-primary mt-0.5 group-hover:text-violet-500 transition-colors">Graduates</p>
                        <p className="text-2xl font-mono font-bold mt-1.5 text-violet-500">{funnel.everCompleted}</p>
                        <span className="text-[10px] text-muted">Graduated students</span>
                    </div>
                </div>
            </div>

            {/* 3. Bottleneck Diagnostics & Monthly Velocity Chart */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Stage Loss / Bottleneck Diagnostic */}
                <div className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-5 flex flex-col justify-between lg:col-span-1">
                    <div>
                        <h4 className="text-xs font-bold text-muted uppercase tracking-wider mb-2 flex items-center gap-2">
                            <AlertCircle size={14} className="text-amber-500" /> Pipeline Drop-off Diagnostics
                        </h4>
                        <p className="text-xs text-muted mb-4">
                            Quantifying applicant dropouts across stages to identify operational bottlenecks
                        </p>

                        <div className="space-y-3.5">
                            <div 
                                className="p-3 rounded-xl bg-surface-elevated border border-border-subtle cursor-pointer hover:border-amber-500/40 transition-colors"
                                onClick={() => onDrillDown('Applicants Not Yet Invited', enrollments.filter(e => e.status === 'requested'))}
                            >
                                <div className="flex justify-between text-xs font-semibold mb-1">
                                    <span className="text-primary">Stage 1 Waiting Queue</span>
                                    <span className="text-amber-600 dark:text-amber-400 font-mono">{requestedDropOff} pending</span>
                                </div>
                                <div className="text-[11px] text-muted">Applicants registered but not yet assigned to an active invite cohort</div>
                            </div>

                            <div 
                                className="p-3 rounded-xl bg-surface-elevated border border-border-subtle cursor-pointer hover:border-sky-500/40 transition-colors"
                                onClick={() => onDrillDown('Invited Students Awaiting Confirmation', enrollments.filter(e => e.status === 'invited'))}
                            >
                                <div className="flex justify-between text-xs font-semibold mb-1">
                                    <span className="text-primary">Stage 2 Invitation Non-response</span>
                                    <span className="text-sky-600 dark:text-sky-400 font-mono">{invitedDropOff} pending</span>
                                </div>
                                <div className="text-[11px] text-muted">Students invited who haven't confirmed attendance or accepted slot</div>
                            </div>

                            <div 
                                className="p-3 rounded-xl bg-surface-elevated border border-border-subtle cursor-pointer hover:border-emerald-500/40 transition-colors"
                                onClick={() => onDrillDown('Active Students In Course', enrollments.filter(e => e.status === 'confirmed'))}
                            >
                                <div className="flex justify-between text-xs font-semibold mb-1">
                                    <span className="text-primary">Stage 3 In-Progress Attendees</span>
                                    <span className="text-emerald-600 dark:text-emerald-400 font-mono">{confirmedDropOff} active</span>
                                </div>
                                <div className="text-[11px] text-muted">Students currently attending course awaiting final graduation date</div>
                            </div>
                        </div>
                    </div>

                    <div className="pt-4 mt-4 border-t border-border-subtle text-[11px] text-muted flex items-center gap-1.5">
                        <Zap size={13} className="text-amber-500 flex-shrink-0" />
                        <span>Fast turnarounds between Stage 1 and Stage 2 significantly boost completion rates.</span>
                    </div>
                </div>

                {/* Monthly Registration & Completion Velocity Area Chart */}
                <div className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-5 flex flex-col lg:col-span-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                        <div>
                            <h4 className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-2">
                                <TrendingUp size={14} className="text-brand-500" /> Monthly Registration & Completion Velocity
                            </h4>
                            <p className="text-xs text-muted mt-0.5">Click any data point to drill down into that specific month's cohort</p>
                        </div>
                        <div className="flex items-center gap-4 text-xs font-medium self-start sm:self-auto">
                            <span className="flex items-center gap-1.5 text-primary">
                                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" /> Registrations
                            </span>
                            <span className="flex items-center gap-1.5 text-primary">
                                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Completions
                            </span>
                        </div>
                    </div>

                    <div className="h-[280px] w-full flex-1">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart 
                                data={trendsData} 
                                margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
                                onClick={(data: any) => {
                                    if (data && data.activePayload && data.activePayload[0]) {
                                        const payload = data.activePayload[0].payload;
                                        onDrillDown(`Cohort Enrollments in ${payload.name}`, payload.items);
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
        </div>
    );
}
