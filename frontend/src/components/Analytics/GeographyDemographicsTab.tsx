import { useState, useMemo } from 'react';
import { 
    ResponsiveContainer, 
    PieChart, 
    Pie, 
    Cell, 
    Tooltip as RechartsTooltip, 
    Legend 
} from 'recharts';
import { MapPin, Search, ArrowRight, Navigation, Users, ShieldCheck, CheckCircle } from 'lucide-react';
import type { EnrollmentWithRelations } from '../../lib/documentUtils';
import { calculateGeographicFunnel } from './analyticsUtils';

interface GeographyDemographicsTabProps {
    enrollments: EnrollmentWithRelations[];
    onDrillDown: (title: string, data: EnrollmentWithRelations[]) => void;
}

type ViewMode = 'micro' | 'macro';

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="glass dark:glass-dark p-3 rounded-xl shadow-lg border border-border-subtle backdrop-blur-xl z-50">
                <p className="text-xs font-semibold text-primary mb-1">{label || payload[0]?.payload?.name}</p>
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

export default function GeographyDemographicsTab({ enrollments, onDrillDown }: GeographyDemographicsTabProps) {
    const [viewMode, setViewMode] = useState<ViewMode>('micro');
    const [searchQuery, setSearchQuery] = useState('');

    const geoReport = useMemo(() => calculateGeographicFunnel(enrollments), [enrollments]);

    // Active dataset based on toggle
    const activeList = useMemo(() => {
        const list = viewMode === 'micro' ? geoReport.microDistricts : geoReport.macroRegions;
        if (!searchQuery.trim()) return list;
        const q = searchQuery.toLowerCase().trim();
        return list.filter(item => 
            item.name.toLowerCase().includes(q) || 
            (item.macroRegion && item.macroRegion.toLowerCase().includes(q))
        );
    }, [viewMode, geoReport, searchQuery]);

    const maxTotal = useMemo(() => {
        return Math.max(...activeList.map(item => item.total), 1);
    }, [activeList]);

    const totalStudents = enrollments.length;
    const cityPct = totalStudents > 0 ? Math.round((geoReport.summarySplit.corkCity / totalStudents) * 100) : 0;
    const satellitePct = totalStudents > 0 ? Math.round((geoReport.summarySplit.satelliteTowns / totalStudents) * 100) : 0;
    const countyPct = totalStudents > 0 ? Math.round((geoReport.summarySplit.countyCork / totalStudents) * 100) : 0;

    // Unique students mapping for demographic analysis
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

    // Age Demographics
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

    // Contact Data Completeness Audit
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
            {/* 1. Geographic Intelligence Card */}
            <div className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-5 flex flex-col space-y-5">
                {/* Header: Title, Controls & Search */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-3 rounded-2xl bg-brand-500/10 text-brand-600 dark:text-brand-400 flex-shrink-0">
                            <MapPin size={24} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-base font-bold text-primary">
                                    Geographic Intelligence & Cork Address Funnel
                                </h3>
                                <span className="text-xs font-semibold text-brand-600 dark:text-brand-400 bg-brand-500/10 px-2.5 py-0.5 rounded-full font-mono">
                                    {geoReport.microDistricts.length} Locations Mapped
                                </span>
                            </div>
                            <p className="text-xs text-muted mt-0.5">
                                Normalized Cork City districts, satellite towns, and applicant completion rates
                            </p>
                        </div>
                    </div>

                    {/* Controls: Mode Switcher & Search */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                        {/* Micro / Macro Toggle */}
                        <div className="flex items-center p-1 bg-black/5 dark:bg-white/5 rounded-xl border border-border-subtle/50">
                            <button
                                onClick={() => setViewMode('micro')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                    viewMode === 'micro'
                                        ? 'bg-surface-elevated text-brand-600 dark:text-brand-400 shadow-sm border border-border-subtle'
                                        : 'text-muted hover:text-primary'
                                }`}
                            >
                                Micro-Districts
                            </button>
                            <button
                                onClick={() => setViewMode('macro')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                    viewMode === 'macro'
                                        ? 'bg-surface-elevated text-brand-600 dark:text-brand-400 shadow-sm border border-border-subtle'
                                        : 'text-muted hover:text-primary'
                                }`}
                            >
                                Macro-Zones
                            </button>
                        </div>

                        {/* Search Input */}
                        <div className="relative min-w-[200px]">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={14} />
                            <input
                                type="text"
                                placeholder="Filter locations..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-8 pr-3 py-1.5 bg-surface-elevated border border-border-strong rounded-xl text-xs focus:outline-none focus:border-brand-500 text-primary"
                            />
                        </div>
                    </div>
                </div>

                {/* Quick Geographic Metrics */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="bg-surface-elevated/40 border border-border-subtle rounded-xl p-3 flex items-center justify-between">
                        <div>
                            <span className="text-[10px] font-bold text-muted uppercase tracking-wider block">Top Inflow Location</span>
                            <p className="text-xs font-bold text-primary mt-0.5 truncate max-w-[180px]">
                                {geoReport.topInflowDistrict ? geoReport.topInflowDistrict.name : 'None'}
                            </p>
                        </div>
                        {geoReport.topInflowDistrict && (
                            <span className="text-xs font-bold font-mono text-brand-600 dark:text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded-lg">
                                {geoReport.topInflowDistrict.total} apps
                            </span>
                        )}
                    </div>

                    <div className="bg-surface-elevated/40 border border-border-subtle rounded-xl p-3 flex items-center justify-between">
                        <div>
                            <span className="text-[10px] font-bold text-muted uppercase tracking-wider block">Highest Graduation Rate</span>
                            <p className="text-xs font-bold text-primary mt-0.5 truncate max-w-[180px]">
                                {geoReport.highestSuccessDistrict ? geoReport.highestSuccessDistrict.name : 'None'}
                            </p>
                        </div>
                        {geoReport.highestSuccessDistrict && (
                            <span className="text-xs font-bold font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-lg">
                                {geoReport.highestSuccessDistrict.rate}% grad
                            </span>
                        )}
                    </div>

                    <div className="bg-surface-elevated/40 border border-border-subtle rounded-xl p-3 flex items-center justify-between">
                        <div>
                            <span className="text-[10px] font-bold text-muted uppercase tracking-wider block">Territorial Distribution</span>
                            <p className="text-xs font-bold text-primary mt-0.5">
                                {cityPct}% City • {satellitePct}% Towns • {countyPct}% Co.
                            </p>
                        </div>
                        <div className="p-1.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-lg">
                            <Navigation size={14} />
                        </div>
                    </div>
                </div>

                {/* Address Funnel Table */}
                <div className="border border-border-subtle rounded-xl overflow-hidden bg-surface-elevated/20">
                    {activeList.length === 0 ? (
                        <div className="text-center py-10 text-muted text-xs">
                            {searchQuery ? 'No locations match your search query.' : 'No geographic data available.'}
                        </div>
                    ) : (
                        <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
                            <table className="w-full text-left text-xs border-collapse">
                                <thead className="bg-surface-elevated text-[11px] uppercase font-bold tracking-wider text-muted border-b border-border-subtle sticky top-0 z-10 backdrop-blur-md">
                                    <tr>
                                        <th className="py-2.5 px-3.5">District / Zone</th>
                                        {viewMode === 'micro' && <th className="py-2.5 px-3">Macro Zone</th>}
                                        <th className="py-2.5 px-3 w-44">Applications</th>
                                        <th className="py-2.5 px-3 text-center">Confirmed</th>
                                        <th className="py-2.5 px-3 text-center">Graduates</th>
                                        <th className="py-2.5 px-3 text-center">Success Rate</th>
                                        <th className="py-2.5 px-3.5 text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border-subtle bg-surface">
                                    {activeList.map((item, idx) => {
                                        const sharePct = Math.round((item.total / maxTotal) * 100);
                                        
                                        // Status color for completion rate
                                        let rateColorClass = 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300';
                                        if (item.completionRate >= 65) {
                                            rateColorClass = 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20';
                                        } else if (item.completionRate >= 40) {
                                            rateColorClass = 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400 border border-brand-200 dark:border-brand-500/20';
                                        }

                                        return (
                                            <tr 
                                                key={`${item.name}-${idx}`}
                                                className="hover:bg-brand-500/5 cursor-pointer transition-colors group"
                                                onClick={() => onDrillDown(`Location: ${item.name}`, item.enrollments)}
                                            >
                                                <td className="py-2.5 px-3.5 font-bold text-primary flex items-center gap-2">
                                                    <MapPin size={13} className="text-brand-500 flex-shrink-0" />
                                                    <span className="truncate max-w-[160px] sm:max-w-[220px]">{item.name}</span>
                                                </td>

                                                {viewMode === 'micro' && (
                                                    <td className="py-2.5 px-3 text-muted">
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-black/5 dark:bg-white/5 border border-border-subtle">
                                                            {item.macroRegion || 'Other'}
                                                        </span>
                                                    </td>
                                                )}

                                                <td className="py-2.5 px-3">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-mono font-bold text-primary min-w-[24px]">{item.total}</span>
                                                        <div className="flex-1 h-1.5 bg-black/5 dark:bg-white/5 rounded-full overflow-hidden">
                                                            <div 
                                                                className="h-full bg-brand-500 rounded-full transition-all duration-300"
                                                                style={{ width: `${sharePct}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                </td>

                                                <td className="py-2.5 px-3 text-center font-mono font-semibold text-sky-600 dark:text-sky-400">
                                                    {item.confirmed}
                                                </td>

                                                <td className="py-2.5 px-3 text-center font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                                                    {item.completed}
                                                </td>

                                                <td className="py-2.5 px-3 text-center">
                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold font-mono ${rateColorClass}`}>
                                                        {item.completionRate}%
                                                    </span>
                                                </td>

                                                <td className="py-2.5 px-3.5 text-right">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onDrillDown(`Location: ${item.name}`, item.enrollments);
                                                        }}
                                                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 transition-colors"
                                                    >
                                                        View
                                                        <ArrowRight size={11} className="group-hover:translate-x-0.5 transition-transform" />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* 2. Demographics & Contact Database Health Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Age Demographics Donut */}
                <div className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-5 flex flex-col min-h-[360px]">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-2">
                            <Users size={16} className="text-brand-500" /> Student Age Distribution (DOB)
                        </h3>
                        <span className="text-xs font-semibold text-muted font-mono">{uniqueStudentsData.length} Students</span>
                    </div>

                    <div className="flex-1 w-full relative">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={ageData}
                                    cx="50%"
                                    cy="45%"
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
                                    iconType="circle"
                                    formatter={(value: string) => <span className="text-[11px] text-primary font-medium mr-2">{value}</span>}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Database Quality & Contact Completeness */}
                <div className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-5 flex flex-col justify-between">
                    <div>
                        <h3 className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-2 mb-2">
                            <ShieldCheck size={16} className="text-brand-500" /> Contact Data Quality & Reachability Audit
                        </h3>
                        <p className="text-xs text-muted mb-4">
                            Completeness coverage across <span className="font-semibold text-primary font-mono">{uniqueStudentsData.length}</span> unique student profiles
                        </p>

                        <div className="space-y-3.5">
                            <div>
                                <div className="flex justify-between text-xs font-medium mb-1">
                                    <span className="text-primary font-semibold">Email Address Record</span>
                                    <span className="font-bold font-mono">{dataCompleteness.withEmail}%</span>
                                </div>
                                <div className="h-2 w-full bg-black/5 dark:bg-white/5 rounded-full overflow-hidden">
                                    <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${dataCompleteness.withEmail}%` }} />
                                </div>
                            </div>

                            <div>
                                <div className="flex justify-between text-xs font-medium mb-1">
                                    <span className="text-primary font-semibold">Phone Number Coverage</span>
                                    <span className="font-bold font-mono">{dataCompleteness.withPhone}%</span>
                                </div>
                                <div className="h-2 w-full bg-black/5 dark:bg-white/5 rounded-full overflow-hidden">
                                    <div className="h-full bg-indigo-500 rounded-full transition-all duration-500" style={{ width: `${dataCompleteness.withPhone}%` }} />
                                </div>
                            </div>

                            <div>
                                <div className="flex justify-between text-xs font-medium mb-1">
                                    <span className="text-primary font-semibold">Postal Address Coverage</span>
                                    <span className="font-bold font-mono">{dataCompleteness.withAddress}%</span>
                                </div>
                                <div className="h-2 w-full bg-black/5 dark:bg-white/5 rounded-full overflow-hidden">
                                    <div className="h-full bg-sky-500 rounded-full transition-all duration-500" style={{ width: `${dataCompleteness.withAddress}%` }} />
                                </div>
                            </div>

                            <div>
                                <div className="flex justify-between text-xs font-medium mb-1">
                                    <span className="text-primary font-semibold">Eircode Geo-Tagging</span>
                                    <span className="font-bold font-mono">{dataCompleteness.withEircode}%</span>
                                </div>
                                <div className="h-2 w-full bg-black/5 dark:bg-white/5 rounded-full overflow-hidden">
                                    <div className="h-full bg-amber-500 rounded-full transition-all duration-500" style={{ width: `${dataCompleteness.withEircode}%` }} />
                                </div>
                            </div>

                            <div>
                                <div className="flex justify-between text-xs font-medium mb-1">
                                    <span className="text-primary font-semibold">Date of Birth (Age Profiling)</span>
                                    <span className="font-bold font-mono">{dataCompleteness.withDob}%</span>
                                </div>
                                <div className="h-2 w-full bg-black/5 dark:bg-white/5 rounded-full overflow-hidden">
                                    <div className="h-full bg-purple-500 rounded-full transition-all duration-500" style={{ width: `${dataCompleteness.withDob}%` }} />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-border-subtle flex items-center gap-2 text-xs text-muted">
                        <CheckCircle size={14} className="text-emerald-500 flex-shrink-0" />
                        <span>High contact completeness enables reliable geographic mapping & outcome follow-ups.</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
