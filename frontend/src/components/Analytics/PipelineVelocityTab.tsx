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
import Card, { SectionHeader } from '../ui/Card';
import Badge from '../ui/Badge';
import { ChartTooltip, LegendItem } from '../ui/chart';
import { CHART, axisProps, gridProps } from '../ui/chartTheme';

interface PipelineVelocityTabProps {
    enrollments: EnrollmentWithRelations[];
    onDrillDown: (title: string, data: EnrollmentWithRelations[]) => void;
}

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

    const stages = [
        {
            key: 'requested', label: 'Requested', value: funnel.everRequested, tone: 'warning' as const, bar: 'bg-warning',
            sub: 'Applications received', conv: null as number | null, days: null as number | null, daysLabel: '',
            onClick: () => onDrillDown('Stage 1: Candidate Applications (Requested)', enrollments),
        },
        {
            key: 'invited', label: 'Invited', value: funnel.everInvited, tone: 'info' as const, bar: 'bg-info',
            sub: 'Invited to a course date', conv: funnel.requestedToInvited, days: speed.avgDaysToInvite, daysLabel: 'to invite',
            onClick: () => onDrillDown('Stage 2: Invited Students', enrollments.filter(e => e.invited_date || ['invited', 'confirmed', 'completed'].includes(e.status))),
        },
        {
            key: 'confirmed', label: 'Confirmed', value: funnel.everConfirmed, tone: 'success' as const, bar: 'bg-success',
            sub: 'Confirmed attendance', conv: funnel.invitedToConfirmed, days: speed.avgDaysToConfirm, daysLabel: 'to respond',
            onClick: () => onDrillDown('Stage 3: Confirmed Students', enrollments.filter(e => e.confirmed_date || ['confirmed', 'completed'].includes(e.status))),
        },
        {
            key: 'completed', label: 'Graduated', value: funnel.everCompleted, tone: 'completed' as const, bar: 'bg-completed',
            sub: 'Completed the course', conv: funnel.confirmedToCompleted, days: speed.avgDaysToComplete, daysLabel: 'duration',
            onClick: () => onDrillDown('Stage 4: Completed Graduates', enrollments.filter(e => e.completed_date || e.status === 'completed')),
        },
    ];
    const inflow = Math.max(1, funnel.everRequested);

    const dropOffs = [
        {
            label: 'Waiting queue', value: requestedDropOff, unit: 'pending', tone: 'text-status-requested',
            desc: 'Registered but not yet invited to a course date',
            onClick: () => onDrillDown('Applicants Not Yet Invited', enrollments.filter(e => e.status === 'requested')),
        },
        {
            label: 'Invitation non-response', value: invitedDropOff, unit: 'pending', tone: 'text-status-invited',
            desc: "Invited but haven't confirmed a place yet",
            onClick: () => onDrillDown('Invited Students Awaiting Confirmation', enrollments.filter(e => e.status === 'invited')),
        },
        {
            label: 'In progress', value: confirmedDropOff, unit: 'active', tone: 'text-status-confirmed',
            desc: 'Attending, awaiting the completion date',
            onClick: () => onDrillDown('Active Students In Course', enrollments.filter(e => e.status === 'confirmed')),
        },
    ];

    return (
        <div className="space-y-5 animate-fadeIn">
            <SectionHeader
                icon={Zap}
                tone="warning"
                title="Pipeline conversion & velocity"
                description="How applicants move through each stage, where they drop off and how long each step takes"
                actions={
                    <>
                        <Badge tone="success" shape="pill">{funnel.overallSuccessRate}% success rate</Badge>
                        <Badge tone="neutral" shape="pill" icon={<Clock size={11} />}>
                            {speed.avgTotalCycleDays} days full cycle
                        </Badge>
                    </>
                }
            />

            {/* Funnel */}
            <Card title="Candidate progression funnel" icon={TrendingUp} subtitle="Click a stage to see the students in it">
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                    {stages.map((st, idx) => (
                        <button
                            key={st.key}
                            type="button"
                            onClick={st.onClick}
                            className="group text-left p-4 rounded-xl bg-surface-elevated/50 border border-border-subtle hover:border-border-strong hover:bg-surface-elevated transition-colors"
                        >
                            <div className="flex items-center justify-between gap-2">
                                <span className="flex items-center gap-2 text-xs font-semibold text-muted">
                                    <span className={`w-2 h-2 rounded-full ${st.bar}`} />
                                    Stage {idx + 1} · <span className="text-primary">{st.label}</span>
                                </span>
                                {st.conv !== null && (
                                    <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-brand-600 dark:text-brand-400 tabular-nums">
                                        <ArrowRight size={11} /> {st.conv}%
                                    </span>
                                )}
                            </div>
                            <p className="mt-3 text-[28px] leading-none font-bold text-primary tabular-nums tracking-tight">{st.value}</p>
                            <div className="mt-3 h-1.5 rounded-full bg-border-subtle overflow-hidden">
                                <div className={`h-full rounded-full ${st.bar}`} style={{ width: `${Math.min(100, Math.round((st.value / inflow) * 100))}%` }} />
                            </div>
                            <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted">
                                <span className="truncate">{st.sub}</span>
                                {st.days !== null && (
                                    <span className="shrink-0 tabular-nums">avg <span className="font-semibold text-primary">{st.days}d</span> {st.daysLabel}</span>
                                )}
                            </div>
                        </button>
                    ))}
                </div>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Drop-off diagnostics */}
                <Card
                    title="Drop-off diagnostics"
                    icon={AlertCircle}
                    tone="warning"
                    subtitle="Where applicants are currently waiting"
                    bodyClassName="flex flex-col"
                >
                    <div className="space-y-2">
                        {dropOffs.map(d => (
                            <button
                                key={d.label}
                                type="button"
                                onClick={d.onClick}
                                className="w-full text-left p-3 rounded-xl border border-border-subtle hover:border-border-strong hover:bg-surface-elevated/60 transition-colors"
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-[13px] font-semibold text-primary">{d.label}</span>
                                    <span className={`text-xs font-semibold tabular-nums ${d.tone}`}>{d.value} {d.unit}</span>
                                </div>
                                <p className="text-[11px] text-muted mt-0.5">{d.desc}</p>
                            </button>
                        ))}
                    </div>
                    <div className="mt-auto pt-4 text-[11px] text-muted flex items-start gap-1.5">
                        <CheckCircle2 size={13} className="text-status-confirmed shrink-0 mt-px" />
                        <span>Short turnaround between request and invite noticeably improves completion rates.</span>
                    </div>
                </Card>

                {/* Monthly velocity */}
                <Card
                    className="lg:col-span-2"
                    title="Monthly registrations & completions"
                    icon={TrendingUp}
                    subtitle="Click a month to open that cohort"
                    action={
                        <div className="hidden sm:flex items-center gap-3">
                            <LegendItem color={CHART.brand} label="Registrations" />
                            <LegendItem color={CHART.emerald} label="Completions" />
                        </div>
                    }
                >
                    <div className="h-[280px] w-full">
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
                                        <stop offset="5%" stopColor={CHART.brand} stopOpacity={0.25} />
                                        <stop offset="95%" stopColor={CHART.brand} stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="flowColorComp" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor={CHART.emerald} stopOpacity={0.25} />
                                        <stop offset="95%" stopColor={CHART.emerald} stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid {...gridProps} vertical={false} />
                                <XAxis dataKey="name" {...axisProps} dy={8} />
                                <YAxis {...axisProps} allowDecimals={false} />
                                <RechartsTooltip content={<ChartTooltip />} />
                                <Area
                                    type="monotone"
                                    dataKey="Registrations"
                                    stroke={CHART.brand}
                                    strokeWidth={2}
                                    fillOpacity={1}
                                    fill="url(#flowColorReg)"
                                    activeDot={{ r: 4, strokeWidth: 0, className: 'cursor-pointer' }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="Completions"
                                    stroke={CHART.emerald}
                                    strokeWidth={2}
                                    fillOpacity={1}
                                    fill="url(#flowColorComp)"
                                    activeDot={{ r: 4, strokeWidth: 0, className: 'cursor-pointer' }}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </Card>
            </div>
        </div>
    );
}
