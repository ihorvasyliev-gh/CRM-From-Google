import { useMemo } from 'react';
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
    Legend,
    AreaChart,
    Area
} from 'recharts';
import { Briefcase, Mail, TrendingUp, Users, Clock, HelpCircle } from 'lucide-react';
import type { EnrollmentWithRelations } from '../../lib/documentUtils';

interface OutcomesTabProps {
    enrollments: EnrollmentWithRelations[];
    employmentStatuses: any[];
    onDrillDown: (title: string, data: EnrollmentWithRelations[]) => void;
}

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="glass dark:glass-dark p-3 rounded-xl shadow-lg border border-border-subtle backdrop-blur-xl z-50">
                <p className="text-sm font-semibold text-primary mb-1">{label || payload[0]?.payload?.name}</p>
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

export default function OutcomesTab({ enrollments, employmentStatuses, onDrillDown }: OutcomesTabProps) {
    // ─── Data Processing ──────────────────────────────────────────

    // 1. Identify graduates (students with 'completed' enrollments in this filtered list)
    const graduateData = useMemo(() => {
        const uniqueGraduates = new Map<string, { student: any; enrollment: EnrollmentWithRelations }>();
        
        enrollments.forEach(e => {
            if (e.status === 'completed' && e.students) {
                const sid = e.students.id;
                // If student completed multiple courses, we keep the last one or just group them
                if (!uniqueGraduates.has(sid)) {
                    uniqueGraduates.set(sid, { student: e.students, enrollment: e });
                }
            }
        });

        const gradsList = Array.from(uniqueGraduates.values());
        const totalGraduatesCount = gradsList.length;

        // Map status responses to these graduates
        const responded: any[] = [];
        const pending: any[] = [];
        const notContacted: any[] = [];
        let workingCount = 0;
        let fullTimeCount = 0;
        let partTimeCount = 0;
        
        const fieldCounts: Record<string, { count: number, enrollments: EnrollmentWithRelations[] }> = {};
        const startedTimeline: Record<string, { count: number, timestamp: number, enrollments: EnrollmentWithRelations[] }> = {};

        gradsList.forEach(({ student, enrollment }) => {
            const emp = employmentStatuses.find(es => es.student_id === student.id);
            
            if (emp) {
                if (emp.status === 'responded') {
                    responded.push(enrollment);
                    if (emp.is_working) {
                        workingCount++;
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
            { name: 'Full-time', value: fullTimeCount, color: '#10B981' },
            { name: 'Part-time', value: partTimeCount, color: '#3B82F6' },
            { name: 'Unspecified/Other', value: workingCount - (fullTimeCount + partTimeCount), color: '#8B5CF6' }
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
            { name: 'Total Graduates', value: totalGraduatesCount, color: '#6366F1', items: gradsList.map(g => g.enrollment) },
            { name: 'Contacted', value: responded.length + pending.length, color: '#8B5CF6', items: [...responded, ...pending] },
            { name: 'Responded', value: responded.length, color: '#10B981', items: responded }
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
            workingList: gradsList.filter(g => {
                const emp = employmentStatuses.find(es => es.student_id === g.student.id);
                return emp && emp.status === 'responded' && emp.is_working;
            }).map(g => g.enrollment)
        };
    }, [enrollments, employmentStatuses]);

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Header Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Total Graduates */}
                <div 
                    onClick={() => onDrillDown('All Course Graduates', graduateData.gradsList)}
                    className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-5 relative overflow-hidden group card-hover cursor-pointer"
                >
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-brand-500 to-indigo-600" />
                    <div className="flex items-start justify-between relative z-10">
                        <div>
                            <p className="text-[11px] font-bold text-muted uppercase tracking-wider mb-1">Total Graduates</p>
                            <p className="text-3xl font-mono font-bold text-primary">{graduateData.totalGraduates}</p>
                        </div>
                        <div className="p-2.5 rounded-xl bg-brand-500/10 text-brand-600">
                            <Users size={20} />
                        </div>
                    </div>
                </div>

                {/* Response Rate */}
                <div 
                    onClick={() => onDrillDown('Graduates Responded', graduateData.respondedList)}
                    className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-5 relative overflow-hidden group card-hover cursor-pointer"
                >
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-violet-500 to-fuchsia-500" />
                    <div className="flex items-start justify-between relative z-10">
                        <div>
                            <p className="text-[11px] font-bold text-muted uppercase tracking-wider mb-1">Response Rate</p>
                            <p className="text-3xl font-mono font-bold text-primary">
                                {graduateData.responseRate}% 
                                <span className="text-xs text-muted font-sans font-normal ml-1">({graduateData.respondedCount} responses)</span>
                            </p>
                        </div>
                        <div className="p-2.5 rounded-xl bg-violet-500/10 text-violet-600">
                            <Mail size={20} />
                        </div>
                    </div>
                </div>

                {/* Employment Rate */}
                <div 
                    onClick={() => onDrillDown('Employed Graduates', graduateData.workingList)}
                    className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-5 relative overflow-hidden group card-hover cursor-pointer"
                >
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400 to-teal-500" />
                    <div className="flex items-start justify-between relative z-10">
                        <div>
                            <p className="text-[11px] font-bold text-muted uppercase tracking-wider mb-1">Employment Rate</p>
                            <p className="text-3xl font-mono font-bold text-primary">
                                {graduateData.employmentRate}%
                                <span className="text-xs text-muted font-sans font-normal ml-1">({graduateData.workingCount} working)</span>
                            </p>
                        </div>
                        <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600">
                            <Briefcase size={20} />
                        </div>
                    </div>
                </div>

                {/* Pending Surveys */}
                <div 
                    onClick={() => onDrillDown('Pending Survey Responses', graduateData.pendingList)}
                    className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-5 relative overflow-hidden group card-hover cursor-pointer"
                >
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 to-orange-500" />
                    <div className="flex items-start justify-between relative z-10">
                        <div>
                            <p className="text-[11px] font-bold text-muted uppercase tracking-wider mb-1">Pending Responses</p>
                            <p className="text-3xl font-mono font-bold text-primary">{graduateData.pendingList.length}</p>
                        </div>
                        <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600">
                            <Clock size={20} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Charts Row 1 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Employment Type Donut Chart */}
                <div className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-5 flex flex-col min-h-[350px]">
                    <h3 className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-2 mb-6">
                        <Briefcase size={16} className="text-brand-500" /> Employment Type
                    </h3>
                    {graduateData.employmentTypeData.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-center">
                            <HelpCircle className="text-muted w-10 h-10 mb-2 opacity-50" />
                            <p className="text-sm text-muted">No employment type data available.</p>
                        </div>
                    ) : (
                        <div className="flex-1 w-full relative">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={graduateData.employmentTypeData}
                                        cx="50%"
                                        cy="45%"
                                        innerRadius={60}
                                        outerRadius={90}
                                        paddingAngle={3}
                                        dataKey="value"
                                        stroke="none"
                                        className="outline-none"
                                    >
                                        {graduateData.employmentTypeData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} className="hover:opacity-85 transition-opacity outline-none" />
                                        ))}
                                    </Pie>
                                    <RechartsTooltip content={<CustomTooltip />} />
                                    <Legend 
                                        verticalAlign="bottom" 
                                        iconType="circle"
                                        formatter={(value: string, entry: any) => {
                                            const itemVal = entry.payload.value;
                                            const pct = graduateData.workingCount > 0 ? Math.round((itemVal / graduateData.workingCount) * 100) : 0;
                                            return <span className="text-xs text-primary font-medium">{value} ({pct}%)</span>;
                                        }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>

                {/* Survey Response Funnel */}
                <div className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-5 flex flex-col min-h-[350px] lg:col-span-2">
                    <h3 className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-2 mb-6">
                        <Mail size={16} className="text-brand-500" /> Survey Coverage Funnel
                    </h3>
                    <div className="flex-1 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart 
                                data={graduateData.funnelData} 
                                layout="vertical" 
                                margin={{ top: 0, right: 30, left: 20, bottom: 0 }}
                                onClick={(data: any) => {
                                    if (data && data.activePayload && data.activePayload[0]) {
                                        const payload = data.activePayload[0].payload;
                                        onDrillDown(`Survey Funnel: ${payload.name}`, payload.items);
                                    }
                                }}
                            >
                                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="rgb(var(--border-subtle))" />
                                <XAxis type="number" hide />
                                <YAxis 
                                    dataKey="name" 
                                    type="category" 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{ fill: 'rgb(var(--text-muted))', fontSize: 11, fontWeight: 500 }}
                                    width={100}
                                />
                                <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: 'rgb(var(--border-subtle))', opacity: 0.2 }} />
                                <Bar 
                                    dataKey="value" 
                                    radius={[0, 6, 6, 0]} 
                                    barSize={28}
                                    className="cursor-pointer"
                                >
                                    {graduateData.funnelData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} className="hover:opacity-85 transition-opacity" />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Charts Row 2 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Top Fields of Work */}
                <div className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-5 flex flex-col min-h-[350px] lg:col-span-2">
                    <h3 className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-2 mb-6">
                        <TrendingUp size={16} className="text-brand-500" /> Top Fields of Employment
                    </h3>
                    {graduateData.fieldsData.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-center">
                            <HelpCircle className="text-muted w-10 h-10 mb-2 opacity-50" />
                            <p className="text-sm text-muted">No industry data reported yet.</p>
                        </div>
                    ) : (
                        <div className="flex-1 w-full">
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
                                    <defs>
                                        <linearGradient id="colorField" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#3b82f6" />
                                            <stop offset="100%" stopColor="#1d4ed8" />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgb(var(--border-subtle))" />
                                    <XAxis 
                                        dataKey="name" 
                                        axisLine={false} 
                                        tickLine={false} 
                                        tick={{ fill: 'rgb(var(--text-muted))', fontSize: 11 }}
                                        dy={10}
                                    />
                                    <YAxis 
                                        axisLine={false} 
                                        tickLine={false} 
                                        tick={{ fill: 'rgb(var(--text-muted))', fontSize: 11 }}
                                    />
                                    <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: 'rgb(var(--border-subtle))', opacity: 0.1 }} />
                                    <Bar 
                                        dataKey="count" 
                                        name="Graduates"
                                        radius={[4, 4, 0, 0]} 
                                        barSize={32}
                                        fill="url(#colorField)"
                                        className="cursor-pointer"
                                    />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>

                {/* Job Starting Timeline */}
                <div className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-5 flex flex-col min-h-[350px] lg:col-span-1">
                    <h3 className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-2 mb-6">
                        <Clock size={16} className="text-brand-500" /> New Jobs Timeline
                    </h3>
                    {graduateData.timelineData.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-center">
                            <HelpCircle className="text-muted w-10 h-10 mb-2 opacity-50" />
                            <p className="text-sm text-muted">No timeline data available.</p>
                        </div>
                    ) : (
                        <div className="flex-1 w-full">
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
                                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgb(var(--border-subtle))" />
                                    <XAxis 
                                        dataKey="name" 
                                        axisLine={false} 
                                        tickLine={false} 
                                        tick={{ fill: 'rgb(var(--text-muted))', fontSize: 11 }} 
                                        dy={10}
                                    />
                                    <YAxis 
                                        axisLine={false} 
                                        tickLine={false} 
                                        tick={{ fill: 'rgb(var(--text-muted))', fontSize: 11 }} 
                                    />
                                    <RechartsTooltip content={<CustomTooltip />} />
                                    <Area 
                                        type="monotone" 
                                        dataKey="Started Work" 
                                        stroke="#10b981" 
                                        strokeWidth={3}
                                        fillOpacity={1} 
                                        fill="url(#colorJobs)" 
                                        activeDot={{ r: 6, strokeWidth: 0, className: "cursor-pointer" }}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
