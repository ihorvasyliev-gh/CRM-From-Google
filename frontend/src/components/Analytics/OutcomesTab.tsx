import { useState, useMemo } from 'react';
import { 
    ResponsiveContainer, 
    PieChart, 
    Pie, 
    Cell, 
    BarChart, 
    Bar, 
    XAxis, 
    YAxis, 
    CartesianGrid, 
    Tooltip as RechartsTooltip,
    AreaChart,
    Area
} from 'recharts';
import { Briefcase, Mail, TrendingUp, Users, Clock, HelpCircle, Check, Send } from 'lucide-react';
import type { EnrollmentWithRelations } from '../../lib/documentUtils';
import { copyEmailsToClipboard } from './analyticsUtils';
import Card, { SectionHeader } from '../ui/Card';
import StatTile from '../ui/StatTile';
import { Button } from '../ui/Button';
import { ChartTooltip } from '../ui/chart';
import { CHART, axisProps, gridProps, tooltipCursor } from '../ui/chartTheme';
import { calloutCls } from '../ui/styles';

interface OutcomesTabProps {
    enrollments: EnrollmentWithRelations[];
    employmentStatuses: any[];
    onDrillDown: (title: string, data: EnrollmentWithRelations[]) => void;
}

export default function OutcomesTab({ enrollments, employmentStatuses, onDrillDown }: OutcomesTabProps) {
    const [copiedPending, setCopiedPending] = useState(false);
    const [copiedNotContacted, setCopiedNotContacted] = useState(false);

    // Identify graduates (students with 'completed' enrollments in this filtered list)
    const graduateData = useMemo(() => {
        const uniqueGraduates = new Map<string, { student: any; enrollment: EnrollmentWithRelations; allEnrollments: EnrollmentWithRelations[] }>();
        
        enrollments.forEach(e => {
            if (e.status === 'completed' && e.students) {
                const sid = e.students.id;
                if (!uniqueGraduates.has(sid)) {
                    uniqueGraduates.set(sid, { student: e.students, enrollment: e, allEnrollments: [] });
                }
                uniqueGraduates.get(sid)!.allEnrollments.push(e);
            }
        });

        const gradsList = Array.from(uniqueGraduates.values());
        const totalGraduatesCount = gradsList.length;

        // Map status responses to these graduates
        const responded: EnrollmentWithRelations[] = [];
        const pending: EnrollmentWithRelations[] = [];
        const notContacted: EnrollmentWithRelations[] = [];
        const workingList: EnrollmentWithRelations[] = [];
        
        let workingCount = 0;
        let fullTimeCount = 0;
        let partTimeCount = 0;
        
        const fieldCounts: Record<string, { count: number, enrollments: EnrollmentWithRelations[] }> = {};
        const startedTimeline: Record<string, { count: number, timestamp: number, enrollments: EnrollmentWithRelations[] }> = {};

        // O(1) lookup instead of scanning every status row for every graduate
        const statusByStudent = new Map<string, any>();
        for (const es of employmentStatuses) {
            if (!statusByStudent.has(es.student_id)) statusByStudent.set(es.student_id, es);
        }

        gradsList.forEach(({ student, enrollment }) => {
            const emp = statusByStudent.get(student.id);
            
            if (emp) {
                if (emp.status === 'responded') {
                    responded.push(enrollment);
                    if (emp.is_working) {
                        workingCount++;
                        workingList.push(enrollment);
                        if (emp.employment_type === 'full_time') {
                            fullTimeCount++;
                        } else if (emp.employment_type === 'part_time') {
                            partTimeCount++;
                        }

                        // Field of Work
                        const field = emp.field_of_work?.trim() || 'Other';
                        const normalizedField = field.charAt(0).toUpperCase() + field.slice(1).toLowerCase();
                        if (!fieldCounts[normalizedField]) {
                            fieldCounts[normalizedField] = { count: 0, enrollments: [] };
                        }
                        fieldCounts[normalizedField].count++;
                        fieldCounts[normalizedField].enrollments.push(enrollment);

                        // Employment Timeline (started_month: YYYY-MM)
                        if (emp.started_month && /^\d{4}-\d{2}$/.test(emp.started_month)) {
                            const [year, month] = emp.started_month.split('-');
                            const d = new Date(parseInt(year), parseInt(month) - 1, 1);
                            const formattedMonth = d.toLocaleDateString('en-IE', { month: 'short', year: '2-digit' });
                            
                            if (!startedTimeline[formattedMonth]) {
                                startedTimeline[formattedMonth] = { count: 0, timestamp: d.getTime(), enrollments: [] };
                            }
                            startedTimeline[formattedMonth].count++;
                            startedTimeline[formattedMonth].enrollments.push(enrollment);
                        }
                    }
                } else if (emp.status === 'pending') {
                    pending.push(enrollment);
                } else {
                    notContacted.push(enrollment);
                }
            } else {
                notContacted.push(enrollment);
            }
        });

        // Format charts data
        const responseRate = totalGraduatesCount > 0 ? Math.round((responded.length / totalGraduatesCount) * 100) : 0;
        const employmentRate = responded.length > 0 ? Math.round((workingCount / responded.length) * 100) : 0;

        // Employment Type breakdown
        const employmentTypeData = [
            { name: 'Full-time', value: fullTimeCount, color: CHART.emerald },
            { name: 'Part-time', value: partTimeCount, color: CHART.brand },
            { name: 'Unspecified', value: Math.max(0, workingCount - (fullTimeCount + partTimeCount)), color: CHART.neutral }
        ].filter(d => d.value > 0);

        // Top Fields of Work
        const fieldsData = Object.entries(fieldCounts)
            .map(([name, data]) => ({ name, count: data.count, items: data.enrollments }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 6);

        // Timeline Data sorted by date
        const timelineData = Object.entries(startedTimeline)
            .sort((a, b) => a[1].timestamp - b[1].timestamp)
            .map(([name, data]) => ({
                name,
                'Started Work': data.count,
                items: data.enrollments
            }));

        // Tracking funnel summary
        const funnelData = [
            { name: 'Total Graduates', value: totalGraduatesCount, color: CHART.brand, items: gradsList.map(g => g.enrollment) },
            { name: 'Contacted', value: responded.length + pending.length, color: CHART.violet, items: [...responded, ...pending] },
            { name: 'Responded', value: responded.length, color: CHART.emerald, items: responded }
        ];

        return {
            totalGraduates: totalGraduatesCount,
            respondedCount: responded.length,
            responseRate,
            workingCount,
            employmentRate,
            employmentTypeData,
            fieldsData,
            timelineData,
            funnelData,
            gradsList: gradsList.map(g => g.enrollment),
            respondedList: responded,
            pendingList: pending,
            notContactedList: notContacted,
            workingList
        };
    }, [enrollments, employmentStatuses]);

    const handleCopyPendingEmails = () => {
        const emails = graduateData.pendingList.map(e => e.students?.email || '').filter(Boolean);
        copyEmailsToClipboard(emails);
        setCopiedPending(true);
        setTimeout(() => setCopiedPending(false), 2500);
    };

    const handleCopyNotContactedEmails = () => {
        const emails = graduateData.notContactedList.map(e => e.students?.email || '').filter(Boolean);
        copyEmailsToClipboard(emails);
        setCopiedNotContacted(true);
        setTimeout(() => setCopiedNotContacted(false), 2500);
    };

    const empty = (text: string) => (
        <div className="h-full min-h-[220px] flex flex-col items-center justify-center text-center gap-2">
            <span className="w-10 h-10 rounded-xl bg-surface-elevated border border-border-subtle flex items-center justify-center text-muted">
                <HelpCircle size={18} />
            </span>
            <p className="text-xs text-muted">{text}</p>
        </div>
    );

    return (
        <div className="space-y-5 animate-fadeIn">
            <SectionHeader
                icon={Briefcase}
                tone="success"
                title="Graduate outcomes"
                description="Survey coverage and employment results for graduates in the current scope"
            />

            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <StatTile label="Graduates" icon={Users} tone="brand" value={graduateData.totalGraduates} hint="Unique students" onClick={() => onDrillDown('All Course Graduates', graduateData.gradsList)} />
                <StatTile label="Response rate" icon={Mail} tone="completed" value={`${graduateData.responseRate}%`} hint={`${graduateData.respondedCount} responded`} onClick={() => onDrillDown('Graduates Who Responded', graduateData.respondedList)} />
                <StatTile label="Employment rate" icon={Briefcase} tone="success" value={`${graduateData.employmentRate}%`} hint={`${graduateData.workingCount} employed`} hintTone="positive" onClick={() => onDrillDown('Employed Graduates', graduateData.workingList)} />
                <StatTile label="Pending responses" icon={Clock} tone="warning" value={graduateData.pendingList.length} hint="Survey sent, no reply yet" onClick={() => onDrillDown('Pending Survey Follow-ups', graduateData.pendingList)} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <Card title="Employment type" icon={Briefcase} tone="success" subtitle={`${graduateData.workingCount} employed graduates`}>
                    {graduateData.employmentTypeData.length === 0 ? (
                        empty('No employment type records reported yet.')
                    ) : (
                        <div className="flex flex-col sm:flex-row items-center gap-6">
                            <div className="w-[190px] h-[190px] shrink-0 relative">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={graduateData.employmentTypeData} cx="50%" cy="50%" innerRadius={58} outerRadius={88} paddingAngle={2} dataKey="value" stroke="none">
                                            {graduateData.employmentTypeData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} />
                                            ))}
                                        </Pie>
                                        <RechartsTooltip content={<ChartTooltip />} />
                                    </PieChart>
                                </ResponsiveContainer>
                                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                    <span className="text-2xl font-bold text-primary tabular-nums">{graduateData.workingCount}</span>
                                    <span className="text-[11px] text-muted">employed</span>
                                </div>
                            </div>
                            <ul className="flex-1 w-full space-y-2">
                                {graduateData.employmentTypeData.map(d => {
                                    const pct = graduateData.workingCount > 0 ? Math.round((d.value / graduateData.workingCount) * 100) : 0;
                                    return (
                                        <li key={d.name} className="flex items-center gap-2.5 px-2.5 py-1.5">
                                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                                            <span className="flex-1 text-[13px] text-primary">{d.name}</span>
                                            <span className="text-[13px] font-semibold text-primary tabular-nums">{d.value}</span>
                                            <span className="w-10 text-right text-[11px] text-muted tabular-nums">{pct}%</span>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    )}
                </Card>

                <Card title="Survey coverage" icon={Mail} tone="completed" subtitle="Graduates → contacted → responded">
                    <div className="h-[200px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                data={graduateData.funnelData}
                                layout="vertical"
                                margin={{ top: 0, right: 30, left: 10, bottom: 0 }}
                                onClick={(data: any) => {
                                    if (data && data.activePayload && data.activePayload[0]) {
                                        const payload = data.activePayload[0].payload;
                                        onDrillDown(`Survey Funnel: ${payload.name}`, payload.items);
                                    }
                                }}
                            >
                                <CartesianGrid {...gridProps} horizontal={false} vertical />
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" {...axisProps} width={110} />
                                <RechartsTooltip content={<ChartTooltip />} cursor={tooltipCursor} />
                                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={24} className="cursor-pointer">
                                    {graduateData.funnelData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </Card>

                <Card title="Top fields of work" icon={TrendingUp} tone="success" subtitle="Employed graduates by field">
                    {graduateData.fieldsData.length === 0 ? (
                        empty('No field of work records yet.')
                    ) : (
                        <div className="h-[240px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    data={graduateData.fieldsData}
                                    margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
                                    onClick={(data: any) => {
                                        if (data && data.activePayload && data.activePayload[0]) {
                                            const payload = data.activePayload[0].payload;
                                            onDrillDown(`Field of Work: ${payload.name}`, payload.items);
                                        }
                                    }}
                                >
                                    <CartesianGrid {...gridProps} vertical={false} />
                                    <XAxis dataKey="name" {...axisProps} dy={8} />
                                    <YAxis {...axisProps} allowDecimals={false} />
                                    <RechartsTooltip content={<ChartTooltip />} cursor={tooltipCursor} />
                                    <Bar dataKey="count" name="Graduates" fill={CHART.emerald} radius={[4, 4, 0, 0]} barSize={28} className="cursor-pointer" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </Card>

                <Card title="New jobs started" icon={Clock} subtitle="By month employment began">
                    {graduateData.timelineData.length === 0 ? (
                        empty('No timeline records submitted.')
                    ) : (
                        <div className="h-[240px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart
                                    data={graduateData.timelineData}
                                    margin={{ top: 5, right: 5, left: -25, bottom: 0 }}
                                    onClick={(data: any) => {
                                        if (data && data.activePayload && data.activePayload[0]) {
                                            const payload = data.activePayload[0].payload;
                                            onDrillDown(`Employed in ${payload.name}`, payload.items);
                                        }
                                    }}
                                >
                                    <defs>
                                        <linearGradient id="colorJobs" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor={CHART.emerald} stopOpacity={0.25} />
                                            <stop offset="95%" stopColor={CHART.emerald} stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid {...gridProps} vertical={false} />
                                    <XAxis dataKey="name" {...axisProps} dy={8} />
                                    <YAxis {...axisProps} allowDecimals={false} />
                                    <RechartsTooltip content={<ChartTooltip />} />
                                    <Area type="monotone" dataKey="Started Work" stroke={CHART.emerald} strokeWidth={2} fillOpacity={1} fill="url(#colorJobs)" activeDot={{ r: 4, strokeWidth: 0, className: 'cursor-pointer' }} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </Card>
            </div>

            {/* Follow-up actions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className={`${calloutCls.warning} p-4 flex items-center justify-between gap-4`}>
                    <div className="flex items-center gap-3 min-w-0">
                        <span className="w-9 h-9 rounded-xl bg-warning/15 text-status-requested flex items-center justify-center shrink-0">
                            <Clock size={17} />
                        </span>
                        <div className="min-w-0">
                            <h4 className="text-[13px] font-semibold text-primary">Pending survey replies</h4>
                            <p className="text-xs text-muted mt-0.5">
                                <span className="font-semibold text-primary tabular-nums">{graduateData.pendingList.length}</span> graduates received the survey but haven't replied
                            </p>
                        </div>
                    </div>
                    <Button variant="secondary" size="sm" onClick={handleCopyPendingEmails} disabled={graduateData.pendingList.length === 0}>
                        {copiedPending ? <Check size={14} /> : <Mail size={14} />}
                        {copiedPending ? 'Copied!' : 'Copy emails'}
                    </Button>
                </div>

                <div className={`${calloutCls.brand} p-4 flex items-center justify-between gap-4`}>
                    <div className="flex items-center gap-3 min-w-0">
                        <span className="w-9 h-9 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center shrink-0">
                            <Send size={17} />
                        </span>
                        <div className="min-w-0">
                            <h4 className="text-[13px] font-semibold text-primary">Not yet surveyed</h4>
                            <p className="text-xs text-muted mt-0.5">
                                <span className="font-semibold text-primary tabular-nums">{graduateData.notContactedList.length}</span> graduates are ready for an outcome check-in
                            </p>
                        </div>
                    </div>
                    <Button variant="primary" size="sm" onClick={handleCopyNotContactedEmails} disabled={graduateData.notContactedList.length === 0}>
                        {copiedNotContacted ? <Check size={14} /> : <Mail size={14} />}
                        {copiedNotContacted ? 'Copied!' : 'Copy emails'}
                    </Button>
                </div>
            </div>
        </div>
    );
}
