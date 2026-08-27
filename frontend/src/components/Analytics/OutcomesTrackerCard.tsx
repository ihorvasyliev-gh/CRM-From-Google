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
    Legend 
} from 'recharts';
import { Briefcase, Mail, TrendingUp, Users, Check, Send, HelpCircle } from 'lucide-react';
import type { EnrollmentWithRelations } from '../../lib/documentUtils';
import { copyEmailsToClipboard } from './analyticsUtils';

interface OutcomesTrackerCardProps {
    enrollments: EnrollmentWithRelations[];
    employmentStatuses: any[];
    onDrillDown: (title: string, data: EnrollmentWithRelations[]) => void;
}

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="glass dark:glass-dark p-3 rounded-xl shadow-lg border border-border-subtle backdrop-blur-xl z-50">
                <p className="text-xs font-semibold text-primary mb-1.5">{label || payload[0]?.payload?.name}</p>
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

export default function OutcomesTrackerCard({ enrollments, employmentStatuses, onDrillDown }: OutcomesTrackerCardProps) {
    const [copiedPending, setCopiedPending] = useState(false);
    const [copiedNotContacted, setCopiedNotContacted] = useState(false);

    const graduateData = useMemo(() => {
        const uniqueGraduates = new Map<string, { student: any; enrollment: EnrollmentWithRelations }>();
        
        enrollments.forEach(e => {
            if (e.status === 'completed' && e.students) {
                const sid = e.students.id;
                if (!uniqueGraduates.has(sid)) {
                    uniqueGraduates.set(sid, { student: e.students, enrollment: e });
                }
            }
        });

        const gradsList = Array.from(uniqueGraduates.values());
        const totalGraduatesCount = gradsList.length;

        const responded: EnrollmentWithRelations[] = [];
        const pending: EnrollmentWithRelations[] = [];
        const notContacted: EnrollmentWithRelations[] = [];
        const workingList: EnrollmentWithRelations[] = [];
        
        let workingCount = 0;
        let fullTimeCount = 0;
        let partTimeCount = 0;
        
        const fieldCounts: Record<string, { count: number, enrollments: EnrollmentWithRelations[] }> = {};

        gradsList.forEach(({ student, enrollment }) => {
            const emp = employmentStatuses.find(es => es.student_id === student.id);
            
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

                        const field = emp.field_of_work?.trim() || 'Other';
                        const normalizedField = field.charAt(0).toUpperCase() + field.slice(1).toLowerCase();
                        if (!fieldCounts[normalizedField]) {
                            fieldCounts[normalizedField] = { count: 0, enrollments: [] };
                        }
                        fieldCounts[normalizedField].count++;
                        fieldCounts[normalizedField].enrollments.push(enrollment);
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

        const responseRate = totalGraduatesCount > 0 ? Math.round((responded.length / totalGraduatesCount) * 100) : 0;
        const employmentRate = responded.length > 0 ? Math.round((workingCount / responded.length) * 100) : 0;

        const employmentTypeData = [
            { name: 'Full-time', value: fullTimeCount, color: '#10b981' },
            { name: 'Part-time', value: partTimeCount, color: '#6366f1' },
            { name: 'Unspecified', value: Math.max(0, workingCount - (fullTimeCount + partTimeCount)), color: '#94a3b8' }
        ].filter(d => d.value > 0);

        const fieldsData = Object.entries(fieldCounts)
            .map(([name, data]) => ({ name, count: data.count, items: data.enrollments }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        return {
            totalGraduates: totalGraduatesCount,
            respondedCount: responded.length,
            responseRate,
            workingCount,
            employmentRate,
            employmentTypeData,
            fieldsData,
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

    return (
        <div className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-5 flex flex-col space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        <Briefcase size={20} />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-primary uppercase tracking-wider">
                                Graduate Outcomes & Employment
                            </h3>
                            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full font-mono">
                                {graduateData.employmentRate}% Employed
                            </span>
                        </div>
                        <p className="text-xs text-muted mt-0.5">
                            Post-course tracking, survey responses, and active industries
                        </p>
                    </div>
                </div>
            </div>

            {/* Metrics Tiles */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div 
                    className="bg-surface-elevated/40 border border-border-subtle rounded-xl p-3.5 cursor-pointer hover:border-brand-500/40 transition-all card-hover"
                    onClick={() => onDrillDown('All Course Graduates', graduateData.gradsList)}
                >
                    <span className="text-[10px] font-bold text-muted uppercase tracking-wider block">Graduates</span>
                    <p className="text-2xl font-mono font-bold text-primary mt-1">{graduateData.totalGraduates}</p>
                </div>

                <div 
                    className="bg-surface-elevated/40 border border-border-subtle rounded-xl p-3.5 cursor-pointer hover:border-brand-500/40 transition-all card-hover"
                    onClick={() => onDrillDown('Graduates Responded', graduateData.respondedList)}
                >
                    <span className="text-[10px] font-bold text-muted uppercase tracking-wider block">Survey Responded</span>
                    <p className="text-2xl font-mono font-bold text-violet-500 mt-1">
                        {graduateData.responseRate}% 
                        <span className="text-xs font-normal text-muted ml-1">({graduateData.respondedCount})</span>
                    </p>
                </div>

                <div 
                    className="bg-surface-elevated/40 border border-border-subtle rounded-xl p-3.5 cursor-pointer hover:border-brand-500/40 transition-all card-hover"
                    onClick={() => onDrillDown('Employed Graduates', graduateData.workingList)}
                >
                    <span className="text-[10px] font-bold text-muted uppercase tracking-wider block">Employed Rate</span>
                    <p className="text-2xl font-mono font-bold text-emerald-500 mt-1">
                        {graduateData.employmentRate}%
                        <span className="text-xs font-normal text-muted ml-1">({graduateData.workingCount})</span>
                    </p>
                </div>

                <div 
                    className="bg-surface-elevated/40 border border-border-subtle rounded-xl p-3.5 cursor-pointer hover:border-brand-500/40 transition-all card-hover"
                    onClick={() => onDrillDown('Pending Surveys', graduateData.pendingList)}
                >
                    <span className="text-[10px] font-bold text-muted uppercase tracking-wider block">Pending Follow-up</span>
                    <p className="text-2xl font-mono font-bold text-amber-500 mt-1">{graduateData.pendingList.length}</p>
                </div>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 pt-2 border-t border-border-subtle/50">
                {/* Employment Type Donut */}
                <div className="flex flex-col">
                    <span className="text-[11px] font-bold text-muted uppercase tracking-wider flex items-center gap-1.5 mb-3">
                        <Users size={14} className="text-brand-500" /> Full-time vs Part-time Split
                    </span>
                    {graduateData.employmentTypeData.length === 0 ? (
                        <div className="h-[200px] flex flex-col items-center justify-center text-center">
                            <HelpCircle className="text-muted w-6 h-6 mb-1.5 opacity-30" />
                            <p className="text-xs text-muted">No employment records submitted yet.</p>
                        </div>
                    ) : (
                        <div className="h-[200px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={graduateData.employmentTypeData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={50}
                                        outerRadius={75}
                                        paddingAngle={4}
                                        dataKey="value"
                                        stroke="none"
                                    >
                                        {graduateData.employmentTypeData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
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

                {/* Top Fields of Work Bar Chart */}
                <div className="flex flex-col">
                    <span className="text-[11px] font-bold text-muted uppercase tracking-wider flex items-center gap-1.5 mb-3">
                        <TrendingUp size={14} className="text-brand-500" /> Top Fields & Industries
                    </span>
                    {graduateData.fieldsData.length === 0 ? (
                        <div className="h-[200px] flex flex-col items-center justify-center text-center">
                            <HelpCircle className="text-muted w-6 h-6 mb-1.5 opacity-30" />
                            <p className="text-xs text-muted">No industry data reported yet.</p>
                        </div>
                    ) : (
                        <div className="h-[200px] w-full">
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
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-chart-border, #e2e8f0)" opacity={0.5} />
                                    <XAxis 
                                        dataKey="name" 
                                        axisLine={false} 
                                        tickLine={false} 
                                        tick={{ fill: 'var(--color-chart-text, #64748b)', fontSize: 10 }}
                                        dy={6}
                                    />
                                    <YAxis 
                                        axisLine={false} 
                                        tickLine={false} 
                                        tick={{ fill: 'var(--color-chart-text, #64748b)', fontSize: 10 }}
                                    />
                                    <RechartsTooltip content={<CustomTooltip />} />
                                    <Bar 
                                        dataKey="count" 
                                        name="Graduates" 
                                        fill="#10b981" 
                                        radius={[3, 3, 0, 0]} 
                                        barSize={24} 
                                        className="cursor-pointer"
                                    />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>
            </div>

            {/* Fast Action Banners */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border-subtle/50">
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 flex items-center justify-between gap-3">
                    <div>
                        <span className="font-bold text-xs text-primary block">Pending Inquiries</span>
                        <p className="text-[11px] text-muted">{graduateData.pendingList.length} surveys waiting response</p>
                    </div>
                    <button
                        onClick={handleCopyPendingEmails}
                        disabled={graduateData.pendingList.length === 0}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-40 transition-colors shadow-sm"
                    >
                        {copiedPending ? <Check size={12} /> : <Mail size={12} />}
                        <span>{copiedPending ? 'Copied!' : 'Copy Emails'}</span>
                    </button>
                </div>

                <div className="bg-brand-500/5 border border-brand-500/20 rounded-xl p-3 flex items-center justify-between gap-3">
                    <div>
                        <span className="font-bold text-xs text-primary block">Not Yet Surveyed</span>
                        <p className="text-[11px] text-muted">{graduateData.notContactedList.length} ready for check-in</p>
                    </div>
                    <button
                        onClick={handleCopyNotContactedEmails}
                        disabled={graduateData.notContactedList.length === 0}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40 transition-colors shadow-sm"
                    >
                        {copiedNotContacted ? <Check size={12} /> : <Send size={12} />}
                        <span>{copiedNotContacted ? 'Copied!' : 'Copy Emails'}</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
