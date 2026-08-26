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
    PieChart, 
    Pie, 
    Legend 
} from 'recharts';
import { Users, MapPin, Repeat, ShieldCheck, CheckCircle } from 'lucide-react';
import type { EnrollmentWithRelations } from '../../lib/documentUtils';
import { classifyCorkRegion } from './analyticsUtils';

interface DemographicsTabProps {
    enrollments: EnrollmentWithRelations[];
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

export default function DemographicsTab({ enrollments, onDrillDown }: DemographicsTabProps) {
    // Unique students mapping
    const uniqueStudentsData = useMemo(() => {
        const studentMap = new Map<string, {
            student: any;
            enrollments: EnrollmentWithRelations[];
        }>();

        enrollments.forEach(e => {
            const sid = e.student_id ?? e.students?.id;
            if (!sid || !e.students) return;
            if (!studentMap.has(sid)) {
                studentMap.set(sid, { student: e.students, enrollments: [] });
            }
            studentMap.get(sid)!.enrollments.push(e);
        });

        return Array.from(studentMap.values());
    }, [enrollments]);

    // 1. Age Demographics
    const ageData = useMemo(() => {
        const groups: Record<string, { count: number, enrollments: EnrollmentWithRelations[] }> = {
            'Under 18': { count: 0, enrollments: [] },
            '18 - 25': { count: 0, enrollments: [] },
            '26 - 35': { count: 0, enrollments: [] },
            '36 - 50': { count: 0, enrollments: [] },
            '51+': { count: 0, enrollments: [] },
            'Unknown': { count: 0, enrollments: [] }
        };

        const currentYear = new Date().getFullYear();

        uniqueStudentsData.forEach(({ student, enrollments }) => {
            const dob = student.dob;
            if (!dob) {
                groups['Unknown'].count++;
                groups['Unknown'].enrollments.push(...enrollments);
                return;
            }
            
            const birthYear = new Date(dob).getFullYear();
            if (isNaN(birthYear)) {
                groups['Unknown'].count++;
                groups['Unknown'].enrollments.push(...enrollments);
                return;
            }

            const age = currentYear - birthYear;
            if (age < 18) { groups['Under 18'].count++; groups['Under 18'].enrollments.push(...enrollments); }
            else if (age <= 25) { groups['18 - 25'].count++; groups['18 - 25'].enrollments.push(...enrollments); }
            else if (age <= 35) { groups['26 - 35'].count++; groups['26 - 35'].enrollments.push(...enrollments); }
            else if (age <= 50) { groups['36 - 50'].count++; groups['36 - 50'].enrollments.push(...enrollments); }
            else { groups['51+'].count++; groups['51+'].enrollments.push(...enrollments); }
        });

        const colors = ['#818cf8', '#a78bfa', '#ec4899', '#f43f5e', '#fb923c', '#94a3b8'];
        return Object.entries(groups)
            .filter(([_, data]) => data.count > 0)
            .map(([name, data], idx) => ({
                name,
                value: data.count,
                color: colors[idx % colors.length],
                items: data.enrollments
            }));
    }, [uniqueStudentsData]);

    // 2. Regional Distribution (Cork Areas)
    const locationData = useMemo(() => {
        const counts: Record<string, { count: number, enrollments: EnrollmentWithRelations[] }> = {
            'Cork City': { count: 0, enrollments: [] },
            'South Cork': { count: 0, enrollments: [] },
            'East Cork': { count: 0, enrollments: [] },
            'West Cork': { count: 0, enrollments: [] },
            'North Cork': { count: 0, enrollments: [] },
            'Other Cork Area': { count: 0, enrollments: [] },
            'Other / Unknown': { count: 0, enrollments: [] }
        };

        uniqueStudentsData.forEach(({ student, enrollments }) => {
            const region = classifyCorkRegion(student.address, student.eircode);
            counts[region].count++;
            counts[region].enrollments.push(...enrollments);
        });

        const colors = ['#6366f1', '#10b981', '#a855f7', '#f97316', '#ec4899', '#06b6d4', '#94a3b8'];
        return Object.entries(counts)
            .filter(([_, data]) => data.count > 0)
            .map(([name, data], idx) => ({
                name,
                value: data.count,
                color: colors[idx % colors.length],
                items: data.enrollments
            }))
            .sort((a, b) => b.value - a.value);
    }, [uniqueStudentsData]);

    // 3. Multi-course Students Analysis
    const repeatLearnersData = useMemo(() => {
        let singleCourse = 0;
        let twoCourses = 0;
        let threePlusCourses = 0;
        const singleItems: EnrollmentWithRelations[] = [];
        const multiItems: EnrollmentWithRelations[] = [];

        uniqueStudentsData.forEach(({ enrollments }) => {
            const count = enrollments.length;
            if (count === 1) {
                singleCourse++;
                singleItems.push(...enrollments);
            } else if (count === 2) {
                twoCourses++;
                multiItems.push(...enrollments);
            } else {
                threePlusCourses++;
                multiItems.push(...enrollments);
            }
        });

        const totalUnique = uniqueStudentsData.length;
        const multiCount = twoCourses + threePlusCourses;
        const repeatRate = totalUnique > 0 ? Math.round((multiCount / totalUnique) * 100) : 0;

        const chartData = [
            { name: '1 Course', value: singleCourse, color: '#3b82f6', items: singleItems },
            { name: '2 Courses', value: twoCourses, color: '#8b5cf6', items: multiItems },
            { name: '3+ Courses', value: threePlusCourses, color: '#10b981', items: multiItems },
        ].filter(d => d.value > 0);

        return {
            totalUnique,
            multiCount,
            repeatRate,
            chartData,
            multiItems
        };
    }, [uniqueStudentsData]);

    // 4. Contact Data Completeness Audit
    const dataCompleteness = useMemo(() => {
        const total = uniqueStudentsData.length;
        if (total === 0) return { withEmail: 0, withPhone: 0, withAddress: 0, withEircode: 0, withDob: 0 };

        let hasEmail = 0;
        let hasPhone = 0;
        let hasAddress = 0;
        let hasEircode = 0;
        let hasDob = 0;

        uniqueStudentsData.forEach(({ student }) => {
            if (student.email && student.email.trim()) hasEmail++;
            if (student.phone && student.phone.trim()) hasPhone++;
            if (student.address && student.address.trim()) hasAddress++;
            if (student.eircode && student.eircode.trim()) hasEircode++;
            if (student.dob) hasDob++;
        });

        return {
            withEmail: Math.round((hasEmail / total) * 100),
            withPhone: Math.round((hasPhone / total) * 100),
            withAddress: Math.round((hasAddress / total) * 100),
            withEircode: Math.round((hasEircode / total) * 100),
            withDob: Math.round((hasDob / total) * 100),
        };
    }, [uniqueStudentsData]);

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Top Overview Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div 
                    className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-4 relative overflow-hidden group card-hover cursor-pointer"
                    onClick={() => onDrillDown('Unique Registered Students', enrollments)}
                >
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-brand-500 to-indigo-600" />
                    <div className="flex items-start justify-between relative z-10">
                        <div>
                            <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1">Unique Students</p>
                            <p className="text-2xl font-mono font-bold text-primary">{uniqueStudentsData.length}</p>
                        </div>
                        <div className="p-2 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400">
                            <Users size={18} />
                        </div>
                    </div>
                </div>

                <div 
                    className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-4 relative overflow-hidden group card-hover cursor-pointer"
                    onClick={() => onDrillDown('Multi-Course Learners', repeatLearnersData.multiItems)}
                >
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-violet-500 to-fuchsia-500" />
                    <div className="flex items-start justify-between relative z-10">
                        <div>
                            <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1">Multi-Course Retention</p>
                            <p className="text-2xl font-mono font-bold text-primary">{repeatLearnersData.repeatRate}%</p>
                        </div>
                        <div className="p-2 rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400">
                            <Repeat size={18} />
                        </div>
                    </div>
                </div>

                <div className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-4 relative overflow-hidden group card-hover">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400 to-teal-500" />
                    <div className="flex items-start justify-between relative z-10">
                        <div>
                            <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1">Phone Reachability</p>
                            <p className="text-2xl font-mono font-bold text-primary">{dataCompleteness.withPhone}%</p>
                        </div>
                        <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                            <ShieldCheck size={18} />
                        </div>
                    </div>
                </div>

                <div className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-4 relative overflow-hidden group card-hover">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 to-orange-500" />
                    <div className="flex items-start justify-between relative z-10">
                        <div>
                            <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1">Eircode Coverage</p>
                            <p className="text-2xl font-mono font-bold text-primary">{dataCompleteness.withEircode}%</p>
                        </div>
                        <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                            <MapPin size={18} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Charts Row 1: Age & Geography */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Age Demographics Donut */}
                <div className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-5 flex flex-col min-h-[360px]">
                    <h3 className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-2 mb-4">
                        <Users size={16} className="text-brand-500" /> Age Group Distribution
                    </h3>
                    <div className="flex-1 w-full relative">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={ageData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={65}
                                    outerRadius={95}
                                    paddingAngle={3}
                                    dataKey="value"
                                    stroke="none"
                                    onClick={(data: any) => {
                                        if (data && data.payload) {
                                            onDrillDown(`Age Group: ${data.name}`, data.payload.items);
                                        }
                                    }}
                                    className="cursor-pointer outline-none"
                                >
                                    {ageData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} className="hover:opacity-85 transition-opacity" />
                                    ))}
                                </Pie>
                                <RechartsTooltip content={<CustomTooltip />} />
                                <Legend 
                                    verticalAlign="bottom" 
                                    height={40} 
                                    iconType="circle"
                                    formatter={(value: string) => <span className="text-[11px] text-primary font-medium mr-2">{value}</span>}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Regional Distribution Pie */}
                <div className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-5 flex flex-col min-h-[360px]">
                    <h3 className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-2 mb-4">
                        <MapPin size={16} className="text-brand-500" /> Regional Cork Locations (Eircode Mapping)
                    </h3>
                    <div className="flex-1 w-full relative">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={locationData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={65}
                                    outerRadius={95}
                                    paddingAngle={3}
                                    dataKey="value"
                                    stroke="none"
                                    onClick={(data: any) => {
                                        if (data && data.payload) {
                                            onDrillDown(`Region: ${data.name}`, data.payload.items);
                                        }
                                    }}
                                    className="cursor-pointer outline-none"
                                >
                                    {locationData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} className="hover:opacity-85 transition-opacity" />
                                    ))}
                                </Pie>
                                <RechartsTooltip content={<CustomTooltip />} />
                                <Legend 
                                    verticalAlign="bottom" 
                                    height={40} 
                                    iconType="circle"
                                    formatter={(value: string) => <span className="text-[11px] text-primary font-medium mr-2">{value}</span>}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Charts Row 2: Retention & Contact Health */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Multi-course retention */}
                <div className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-5 flex flex-col min-h-[320px]">
                    <h3 className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-2 mb-4">
                        <Repeat size={16} className="text-brand-500" /> Course Enrollment Multiplicity
                    </h3>
                    <div className="flex-1 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart 
                                data={repeatLearnersData.chartData} 
                                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                                onClick={(data: any) => {
                                    if (data && data.activePayload && data.activePayload[0]) {
                                        const payload = data.activePayload[0].payload;
                                        onDrillDown(`Enrollments: ${payload.name}`, payload.items);
                                    }
                                }}
                            >
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-chart-border, #e2e8f0)" opacity={0.5} />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--color-chart-text, #64748b)', fontSize: 11 }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--color-chart-text, #64748b)', fontSize: 11 }} />
                                <RechartsTooltip content={<CustomTooltip />} />
                                <Bar dataKey="value" name="Students" radius={[6, 6, 0, 0]} barSize={36} className="cursor-pointer">
                                    {repeatLearnersData.chartData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Database Health Card */}
                <div className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-5 flex flex-col justify-between">
                    <div>
                        <h3 className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-2 mb-4">
                            <ShieldCheck size={16} className="text-brand-500" /> Contact Database Quality Audit
                        </h3>
                        <p className="text-xs text-muted mb-4">
                            Completeness audit across <span className="font-semibold text-primary">{uniqueStudentsData.length}</span> unique student profiles
                        </p>

                        <div className="space-y-3">
                            <div>
                                <div className="flex justify-between text-xs font-medium mb-1">
                                    <span className="text-primary">Email Address Completeness</span>
                                    <span className="font-bold font-mono">{dataCompleteness.withEmail}%</span>
                                </div>
                                <div className="h-2 w-full bg-black/5 dark:bg-white/5 rounded-full overflow-hidden">
                                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${dataCompleteness.withEmail}%` }} />
                                </div>
                            </div>

                            <div>
                                <div className="flex justify-between text-xs font-medium mb-1">
                                    <span className="text-primary">Phone Number Coverage</span>
                                    <span className="font-bold font-mono">{dataCompleteness.withPhone}%</span>
                                </div>
                                <div className="h-2 w-full bg-black/5 dark:bg-white/5 rounded-full overflow-hidden">
                                    <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${dataCompleteness.withPhone}%` }} />
                                </div>
                            </div>

                            <div>
                                <div className="flex justify-between text-xs font-medium mb-1">
                                    <span className="text-primary">Postal Address Record</span>
                                    <span className="font-bold font-mono">{dataCompleteness.withAddress}%</span>
                                </div>
                                <div className="h-2 w-full bg-black/5 dark:bg-white/5 rounded-full overflow-hidden">
                                    <div className="h-full bg-sky-500 rounded-full" style={{ width: `${dataCompleteness.withAddress}%` }} />
                                </div>
                            </div>

                            <div>
                                <div className="flex justify-between text-xs font-medium mb-1">
                                    <span className="text-primary">Eircode Geo Tagging</span>
                                    <span className="font-bold font-mono">{dataCompleteness.withEircode}%</span>
                                </div>
                                <div className="h-2 w-full bg-black/5 dark:bg-white/5 rounded-full overflow-hidden">
                                    <div className="h-full bg-amber-500 rounded-full" style={{ width: `${dataCompleteness.withEircode}%` }} />
                                </div>
                            </div>

                            <div>
                                <div className="flex justify-between text-xs font-medium mb-1">
                                    <span className="text-primary">Date of Birth (Age Analysis)</span>
                                    <span className="font-bold font-mono">{dataCompleteness.withDob}%</span>
                                </div>
                                <div className="h-2 w-full bg-black/5 dark:bg-white/5 rounded-full overflow-hidden">
                                    <div className="h-full bg-fuchsia-500 rounded-full" style={{ width: `${dataCompleteness.withDob}%` }} />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-border-subtle flex items-center gap-2 text-xs text-muted">
                        <CheckCircle size={14} className="text-emerald-500 flex-shrink-0" />
                        <span>High data completeness ensures accurate demographic & regional reporting.</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
