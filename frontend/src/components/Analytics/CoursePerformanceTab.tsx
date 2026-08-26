import { useState, useMemo } from 'react';
import { 
    ResponsiveContainer, 
    BarChart, 
    Bar, 
    XAxis, 
    YAxis, 
    CartesianGrid, 
    Tooltip as RechartsTooltip, 
    Legend
} from 'recharts';
import { BookOpen, GraduationCap, Search, ChevronLeft, ChevronRight, ArrowRight, Layers, TrendingUp, Percent } from 'lucide-react';
import type { EnrollmentWithRelations } from '../../lib/documentUtils';
import { cleanVariant } from '../../lib/types';
import { formatDateDMY } from '../../lib/dateUtils';

interface CoursePerformanceTabProps {
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

export default function CoursePerformanceTab({ enrollments, onDrillDown }: CoursePerformanceTabProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 6;

    // 1. Group by Course
    const coursePerformance = useMemo(() => {
        const courseMap = new Map<string, {
            id: string;
            name: string;
            total: number;
            requested: number;
            invited: number;
            confirmed: number;
            completed: number;
            withdrawn: number;
            variants: Map<string, number>;
            enrollments: EnrollmentWithRelations[];
            cycleDaysList: number[];
        }>();

        enrollments.forEach(e => {
            const courseId = e.course_id || 'unknown';
            const courseName = e.courses?.name || 'Unknown Course';
            const variant = cleanVariant(courseName, e.course_variant);

            if (!courseMap.has(courseId)) {
                courseMap.set(courseId, {
                    id: courseId,
                    name: courseName,
                    total: 0,
                    requested: 0,
                    invited: 0,
                    confirmed: 0,
                    completed: 0,
                    withdrawn: 0,
                    variants: new Map(),
                    enrollments: [],
                    cycleDaysList: []
                });
            }

            const c = courseMap.get(courseId)!;
            c.total++;
            c.enrollments.push(e);
            
            if (e.status === 'requested') c.requested++;
            else if (e.status === 'invited') c.invited++;
            else if (e.status === 'confirmed') c.confirmed++;
            else if (e.status === 'completed') {
                c.completed++;
                if (e.created_at && (e.completed_at || e.completed_date)) {
                    const start = new Date(e.created_at).getTime();
                    const end = new Date(e.completed_at || e.completed_date!).getTime();
                    const diffDays = Math.max(0, Math.round((end - start) / (1000 * 60 * 60 * 24)));
                    c.cycleDaysList.push(diffDays);
                }
            } else if (e.status === 'withdrawn') c.withdrawn++;

            c.variants.set(variant, (c.variants.get(variant) || 0) + 1);
        });

        return Array.from(courseMap.values()).map(c => {
            const completionRate = c.total > 0 ? Math.round((c.completed / c.total) * 100) : 0;
            const dropOffRate = 100 - completionRate;
            const avgCycleDays = c.cycleDaysList.length > 0
                ? Math.round(c.cycleDaysList.reduce((a, b) => a + b, 0) / c.cycleDaysList.length)
                : null;

            return {
                ...c,
                completionRate,
                dropOffRate,
                avgCycleDays,
                variantsList: Array.from(c.variants.entries()).map(([name, count]) => ({ name, count }))
            };
        }).sort((a, b) => b.total - a.total);
    }, [enrollments]);

    // 2. Bar Chart Data for Course Comparison
    const comparisonChartData = useMemo(() => {
        return coursePerformance.slice(0, 7).map(c => ({
            name: c.name.length > 20 ? c.name.slice(0, 18) + '...' : c.name,
            fullName: c.name,
            Applicants: c.total,
            Graduates: c.completed,
            items: c.enrollments
        }));
    }, [coursePerformance]);

    // 3. Variant Breakdown Chart Data
    const variantBreakdownData = useMemo(() => {
        const counts: Record<string, { count: number, items: EnrollmentWithRelations[] }> = {};
        enrollments.forEach(e => {
            const v = cleanVariant(e.courses?.name || '', e.course_variant);
            if (!counts[v]) counts[v] = { count: 0, items: [] };
            counts[v].count++;
            counts[v].items.push(e);
        });

        return Object.entries(counts)
            .map(([name, data]) => ({ name, value: data.count, items: data.items }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 8);
    }, [enrollments]);

    // 4. Conducted Course Runs (runs with at least 1 completed enrollment)
    const conductedRuns = useMemo(() => {
        const groups: Record<string, {
            courseId: string;
            courseName: string;
            variant: string;
            date: string | null;
            completedEnrollments: EnrollmentWithRelations[];
            allEnrollments: EnrollmentWithRelations[];
        }> = {};

        enrollments.forEach(e => {
            const courseId = e.course_id || 'unknown';
            const courseName = e.courses?.name || 'Unknown Course';
            const variant = cleanVariant(courseName, e.course_variant);
            const dateKey = e.invited_date || e.confirmed_date || 'No Date';
            const key = `${courseId}-${variant}-${dateKey}`;

            if (!groups[key]) {
                groups[key] = {
                    courseId,
                    courseName,
                    variant,
                    date: e.invited_date || e.confirmed_date,
                    completedEnrollments: [],
                    allEnrollments: []
                };
            }

            groups[key].allEnrollments.push(e);
            if (e.status === 'completed') {
                groups[key].completedEnrollments.push(e);
            }
        });

        return Object.values(groups)
            .filter(g => g.completedEnrollments.length > 0)
            .map(g => ({
                ...g,
                completedCount: g.completedEnrollments.length,
                totalRunParticipants: g.allEnrollments.length
            }))
            .sort((a, b) => {
                if (!a.date && !b.date) return a.courseName.localeCompare(b.courseName);
                if (!a.date) return 1;
                if (!b.date) return -1;
                return b.date.localeCompare(a.date);
            });
    }, [enrollments]);

    const filteredRuns = useMemo(() => {
        if (!searchQuery.trim()) return conductedRuns;
        const q = searchQuery.toLowerCase().trim();
        return conductedRuns.filter(r => 
            r.courseName.toLowerCase().includes(q) ||
            r.variant.toLowerCase().includes(q) ||
            (r.date && r.date.includes(q))
        );
    }, [conductedRuns, searchQuery]);

    const totalPages = Math.ceil(filteredRuns.length / itemsPerPage) || 1;
    const paginatedRuns = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filteredRuns.slice(start, start + itemsPerPage);
    }, [filteredRuns, currentPage]);

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Top Course Leaderboard Matrix */}
            <div>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-2">
                        <BookOpen size={16} className="text-brand-500" /> Course Performance Matrix
                    </h3>
                    <span className="text-xs text-muted font-medium">
                        {coursePerformance.length} courses cataloged
                    </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {coursePerformance.slice(0, 6).map((c) => (
                        <div 
                            key={c.id}
                            className="bg-surface border border-border-subtle rounded-2xl p-4 shadow-sm hover:border-brand-500/40 hover:shadow-md transition-all cursor-pointer group"
                            onClick={() => onDrillDown(`Course: ${c.name}`, c.enrollments)}
                        >
                            <div className="flex items-start justify-between gap-2 mb-3">
                                <div>
                                    <h4 className="font-bold text-sm text-primary group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors line-clamp-1">
                                        {c.name}
                                    </h4>
                                    <span className="text-[11px] text-muted">
                                        {c.variantsList.length} variant{c.variantsList.length > 1 ? 's' : ''} offered
                                    </span>
                                </div>
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400 border border-brand-200 dark:border-brand-500/20 font-mono">
                                    {c.total} apps
                                </span>
                            </div>

                            {/* Progress bar for completion */}
                            <div className="space-y-1.5 mb-3">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-muted font-medium flex items-center gap-1">
                                        <Percent size={12} /> Completion Rate
                                    </span>
                                    <span className="font-bold text-primary font-mono">{c.completionRate}%</span>
                                </div>
                                <div className="h-2 w-full bg-black/5 dark:bg-white/5 rounded-full overflow-hidden flex">
                                    <div 
                                        className="h-full bg-gradient-to-r from-brand-500 to-violet-500 rounded-full transition-all duration-500" 
                                        style={{ width: `${c.completionRate}%` }} 
                                    />
                                </div>
                            </div>

                            {/* Mini stats grid */}
                            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border-subtle/60 text-center">
                                <div className="bg-surface-elevated/50 p-1.5 rounded-lg">
                                    <span className="text-[10px] text-muted block uppercase">Graduates</span>
                                    <span className="text-xs font-bold font-mono text-emerald-600 dark:text-emerald-400">{c.completed}</span>
                                </div>
                                <div className="bg-surface-elevated/50 p-1.5 rounded-lg">
                                    <span className="text-[10px] text-muted block uppercase">Confirmed</span>
                                    <span className="text-xs font-bold font-mono text-sky-600 dark:text-sky-400">{c.confirmed}</span>
                                </div>
                                <div className="bg-surface-elevated/50 p-1.5 rounded-lg">
                                    <span className="text-[10px] text-muted block uppercase">Avg Cycle</span>
                                    <span className="text-xs font-bold font-mono text-primary">
                                        {c.avgCycleDays !== null ? `${c.avgCycleDays}d` : '-'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Visual Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Course Volume Comparison */}
                <div className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-5 flex flex-col min-h-[360px]">
                    <h3 className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-2 mb-4">
                        <TrendingUp size={16} className="text-brand-500" /> Applicants vs Graduates by Course
                    </h3>
                    <div className="flex-1 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart 
                                data={comparisonChartData}
                                margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
                                onClick={(data: any) => {
                                    if (data && data.activePayload && data.activePayload[0]) {
                                        const payload = data.activePayload[0].payload;
                                        onDrillDown(`Course: ${payload.fullName}`, payload.items);
                                    }
                                }}
                            >
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
                                <Legend 
                                    verticalAlign="top" 
                                    height={36} 
                                    iconType="circle"
                                    formatter={(value: string) => <span className="text-xs text-primary font-medium mr-2">{value}</span>}
                                />
                                <Bar dataKey="Applicants" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={20} className="cursor-pointer" />
                                <Bar dataKey="Graduates" fill="#10b981" radius={[4, 4, 0, 0]} barSize={20} className="cursor-pointer" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Variant Popularity Distribution */}
                <div className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-5 flex flex-col min-h-[360px]">
                    <h3 className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-2 mb-4">
                        <Layers size={16} className="text-brand-500" /> Variant / Language Distribution
                    </h3>
                    <div className="flex-1 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart 
                                data={variantBreakdownData}
                                layout="vertical"
                                margin={{ top: 0, right: 30, left: 10, bottom: 0 }}
                                onClick={(data: any) => {
                                    if (data && data.activePayload && data.activePayload[0]) {
                                        const payload = data.activePayload[0].payload;
                                        onDrillDown(`Variant: ${payload.name}`, payload.items);
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
                                    tick={{ fill: 'var(--color-chart-text, #64748b)', fontSize: 11, fontWeight: 500 }}
                                    width={110}
                                />
                                <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: 'var(--color-chart-border, #e2e8f0)', opacity: 0.2 }} />
                                <Bar dataKey="value" name="Enrollments" fill="#8b5cf6" radius={[0, 6, 6, 0]} barSize={24} className="cursor-pointer" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Conducted Course Runs Catalog */}
            <div className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-5">
                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between mb-5">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-violet-500/10 text-violet-600 dark:text-violet-400 rounded-xl">
                            <GraduationCap size={20} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-sm font-bold text-primary uppercase tracking-wider">
                                    Conducted Course Runs Catalog
                                </h3>
                                <span className="text-xs font-semibold text-brand-600 dark:text-brand-400 bg-brand-500/10 px-2.5 py-0.5 rounded-full font-mono">
                                    {filteredRuns.length} runs
                                </span>
                            </div>
                            <p className="text-xs text-muted mt-0.5">Historical course cohorts with confirmed completions</p>
                        </div>
                    </div>
                    
                    {/* Search Bar */}
                    <div className="relative w-full sm:w-72">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={15} />
                        <input
                            type="text"
                            placeholder="Search by course or variant..."
                            className="w-full pl-9 pr-4 py-2 bg-surface-elevated border border-border-strong rounded-xl text-xs sm:text-sm focus:outline-none focus:border-brand-500 text-primary"
                            value={searchQuery}
                            onChange={e => {
                                setSearchQuery(e.target.value);
                                setCurrentPage(1);
                            }}
                        />
                    </div>
                </div>

                {/* Table */}
                <div className="border border-border-subtle rounded-xl overflow-hidden bg-surface-elevated/20">
                    {paginatedRuns.length === 0 ? (
                        <div className="text-center py-10 text-muted text-sm">
                            {searchQuery ? 'No course runs match your search query.' : 'No conducted course runs found.'}
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs sm:text-sm border-collapse">
                                <thead className="bg-surface-elevated text-xs uppercase font-bold tracking-wider text-muted border-b border-border-subtle">
                                    <tr>
                                        <th className="py-3 px-4">Course Name</th>
                                        <th className="py-3 px-4">Level / Variant</th>
                                        <th className="py-3 px-4">Course Date</th>
                                        <th className="py-3 px-4 text-center">Graduates</th>
                                        <th className="py-3 px-4 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border-subtle bg-surface">
                                    {paginatedRuns.map((r, idx) => (
                                        <tr 
                                            key={`${r.courseId}-${r.variant}-${r.date || idx}`}
                                            className="hover:bg-brand-500/5 cursor-pointer transition-colors group"
                                            onClick={() => onDrillDown(
                                                `${r.courseName} - ${r.variant} (${formatDateDMY(r.date)}) Graduates`,
                                                r.completedEnrollments
                                            )}
                                        >
                                            <td className="py-3.5 px-4 font-semibold text-primary">
                                                {r.courseName}
                                            </td>
                                            <td className="py-3.5 px-4">
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400 border border-brand-100 dark:border-brand-500/20">
                                                    {r.variant}
                                                </span>
                                            </td>
                                            <td className="py-3.5 px-4 text-muted font-mono text-xs">
                                                {formatDateDMY(r.date) || 'No date set'}
                                            </td>
                                            <td className="py-3.5 px-4 text-center">
                                                <span className="inline-flex items-center justify-center min-w-[28px] h-6 px-2 rounded-full text-xs font-bold font-mono bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-500/20">
                                                    {r.completedCount}
                                                </span>
                                            </td>
                                            <td className="py-3.5 px-4 text-right">
                                                <button 
                                                    className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onDrillDown(
                                                            `${r.courseName} - ${r.variant} (${formatDateDMY(r.date)}) Graduates`,
                                                            r.completedEnrollments
                                                        );
                                                    }}
                                                >
                                                    View Graduates
                                                    <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between gap-4 mt-4 px-1 text-xs">
                        <div className="text-muted font-medium">
                            Showing <span className="font-semibold text-primary">{(currentPage - 1) * itemsPerPage + 1}</span> to{' '}
                            <span className="font-semibold text-primary">
                                {Math.min(currentPage * itemsPerPage, filteredRuns.length)}
                            </span> of{' '}
                            <span className="font-semibold text-primary">{filteredRuns.length}</span> runs
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                disabled={currentPage === 1}
                                className="p-1.5 rounded-lg border border-border-subtle bg-surface hover:bg-surface-elevated disabled:opacity-40 transition-colors"
                            >
                                <ChevronLeft size={15} />
                            </button>
                            <span className="font-semibold text-primary px-1">
                                {currentPage} / {totalPages}
                            </span>
                            <button
                                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                disabled={currentPage === totalPages}
                                className="p-1.5 rounded-lg border border-border-subtle bg-surface hover:bg-surface-elevated disabled:opacity-40 transition-colors"
                            >
                                <ChevronRight size={15} />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
