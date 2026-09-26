import { useState, useMemo } from 'react';
import { 
    ResponsiveContainer, 
    BarChart, 
    Bar, 
    XAxis, 
    YAxis, 
    CartesianGrid, 
    Tooltip as RechartsTooltip,
} from 'recharts';
import { BookOpen, TrendingUp, Layers, Percent, GraduationCap, ArrowRight } from 'lucide-react';
import Card, { SectionHeader } from '../ui/Card';
import Badge from '../ui/Badge';
import SearchInput from '../ui/SearchInput';
import Pagination from '../ui/Pagination';
import { EmptyState } from '../ui/States';
import { ChartTooltip, LegendItem } from '../ui/chart';
import { CHART, axisProps, axisTick, gridProps, tooltipCursor } from '../ui/chartTheme';
import { tableWrapCls, tableCls, theadCls, thCls, tbodyCls, trCls, tdCls } from '../ui/styles';
import type { EnrollmentWithRelations } from '../../lib/documentUtils';
import { cleanVariant } from '../../lib/types';
import { formatDateDMY } from '../../lib/dateUtils';

interface CourseMatrixTabProps {
    enrollments: EnrollmentWithRelations[];
    onDrillDown: (title: string, data: EnrollmentWithRelations[]) => void;
}

export default function CourseMatrixTab({ enrollments, onDrillDown }: CourseMatrixTabProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 6;

    // 1. Group by Course Performance
    const coursePerformance = useMemo(() => {
        const courseMap = new Map<string, {
            id: string;
            name: string;
            total: number;
            requested: number;
            invited: number;
            confirmed: number;
            completed: number;
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
            }

            c.variants.set(variant, (c.variants.get(variant) || 0) + 1);
        });

        return Array.from(courseMap.values()).map(c => {
            const completionRate = c.total > 0 ? Math.round((c.completed / c.total) * 100) : 0;
            const avgCycleDays = c.cycleDaysList.length > 0
                ? Math.round(c.cycleDaysList.reduce((a, b) => a + b, 0) / c.cycleDaysList.length)
                : null;

            return {
                ...c,
                completionRate,
                avgCycleDays,
                variantsList: Array.from(c.variants.entries()).map(([name, count]) => ({ name, count }))
            };
        }).sort((a, b) => b.total - a.total);
    }, [enrollments]);

    // 2. Bar Chart Data for Top Courses Comparison
    const comparisonChartData = useMemo(() => {
        return coursePerformance.slice(0, 6).map(c => ({
            name: c.name.length > 18 ? c.name.slice(0, 16) + '...' : c.name,
            fullName: c.name,
            Applicants: c.total,
            Graduates: c.completed,
            items: c.enrollments
        }));
    }, [coursePerformance]);

    // 3. Variant Breakdown Data
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

    // 4. Conducted Course Runs (historical cohorts with completions)
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
        <div className="space-y-5 animate-fadeIn">
            <SectionHeader
                icon={BookOpen}
                tone="completed"
                title="Courses & cohorts"
                description="Enrollment volume, completion rate and delivery variants per course"
                actions={<Badge tone="completed" shape="pill">{coursePerformance.length} courses</Badge>}
            />

            {/* Top courses */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
                {coursePerformance.slice(0, 6).map(c => (
                    <button
                        key={c.id}
                        type="button"
                        onClick={() => onDrillDown(`Course: ${c.name}`, c.enrollments)}
                        className="group text-left p-4 rounded-2xl bg-surface border border-border-subtle shadow-card hover:shadow-card-hover hover:border-border-strong transition-all"
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                                <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-completed/15 text-status-completed shrink-0">
                                    <BookOpen size={15} />
                                </span>
                                <div className="min-w-0">
                                    <h4 className="text-[13px] font-semibold text-primary truncate group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">{c.name}</h4>
                                    <p className="text-[11px] text-muted">{c.variantsList.length} variant{c.variantsList.length === 1 ? '' : 's'}</p>
                                </div>
                            </div>
                            <Badge tone="brand" shape="pill" className="tabular-nums shrink-0">{c.total} apps</Badge>
                        </div>

                        <div className="mt-4">
                            <div className="flex items-center justify-between text-[11px] mb-1.5">
                                <span className="text-muted flex items-center gap-1"><Percent size={11} /> Completion rate</span>
                                <span className="font-semibold text-primary tabular-nums">{c.completionRate}%</span>
                            </div>
                            <div className="h-1.5 w-full bg-border-subtle rounded-full overflow-hidden">
                                <div className="h-full bg-brand-500 rounded-full transition-all duration-500" style={{ width: `${c.completionRate}%` }} />
                            </div>
                        </div>

                        <dl className="mt-4 grid grid-cols-3 divide-x divide-border-subtle border-t border-border-subtle pt-3 text-center">
                            <div>
                                <dt className="text-[10px] text-muted uppercase tracking-wider">Graduates</dt>
                                <dd className="text-sm font-semibold text-status-confirmed tabular-nums mt-0.5">{c.completed}</dd>
                            </div>
                            <div>
                                <dt className="text-[10px] text-muted uppercase tracking-wider">Confirmed</dt>
                                <dd className="text-sm font-semibold text-status-invited tabular-nums mt-0.5">{c.confirmed}</dd>
                            </div>
                            <div>
                                <dt className="text-[10px] text-muted uppercase tracking-wider">Avg cycle</dt>
                                <dd className="text-sm font-semibold text-primary tabular-nums mt-0.5">{c.avgCycleDays !== null ? `${c.avgCycleDays}d` : '—'}</dd>
                            </div>
                        </dl>
                    </button>
                ))}
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <Card
                    title="Applicants vs graduates"
                    icon={TrendingUp}
                    subtitle="Top six courses by volume"
                    action={
                        <div className="hidden sm:flex items-center gap-3">
                            <LegendItem color={CHART.brand} label="Applicants" />
                            <LegendItem color={CHART.emerald} label="Graduates" />
                        </div>
                    }
                >
                    <div className="h-[260px] w-full">
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
                                <CartesianGrid {...gridProps} vertical={false} />
                                <XAxis dataKey="name" {...axisProps} tick={{ ...axisTick, fontSize: 10 }} dy={6} />
                                <YAxis {...axisProps} allowDecimals={false} />
                                <RechartsTooltip content={<ChartTooltip />} cursor={tooltipCursor} />
                                <Bar dataKey="Applicants" fill={CHART.brand} radius={[4, 4, 0, 0]} barSize={14} className="cursor-pointer" />
                                <Bar dataKey="Graduates" fill={CHART.emerald} radius={[4, 4, 0, 0]} barSize={14} className="cursor-pointer" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </Card>

                <Card title="Delivery variants" icon={Layers} tone="completed" subtitle="Enrollments per variant / language">
                    <div className="h-[260px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                data={variantBreakdownData}
                                layout="vertical"
                                margin={{ top: 0, right: 20, left: 10, bottom: 0 }}
                                onClick={(data: any) => {
                                    if (data && data.activePayload && data.activePayload[0]) {
                                        const payload = data.activePayload[0].payload;
                                        onDrillDown(`Variant: ${payload.name}`, payload.items);
                                    }
                                }}
                            >
                                <CartesianGrid {...gridProps} horizontal={false} vertical />
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" {...axisProps} width={110} />
                                <RechartsTooltip content={<ChartTooltip />} cursor={tooltipCursor} />
                                <Bar dataKey="value" name="Enrollments" fill={CHART.violet} radius={[0, 4, 4, 0]} barSize={16} className="cursor-pointer" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </Card>
            </div>

            {/* Conducted runs */}
            <Card
                title="Conducted course runs"
                icon={GraduationCap}
                tone="success"
                subtitle={`${filteredRuns.length} cohorts with completions`}
                divided
                flush
                action={
                    <SearchInput
                        value={searchQuery}
                        onChange={v => {
                            setSearchQuery(v);
                            setCurrentPage(1);
                        }}
                        placeholder="Search course or variant…"
                        aria-label="Search course runs"
                        wrapperClassName="hidden sm:block w-64"
                    />
                }
            >
                {paginatedRuns.length === 0 ? (
                    <EmptyState
                        bare
                        icon={<GraduationCap size={22} />}
                        title={searchQuery ? 'No matching course runs' : 'No completed runs yet'}
                        description={searchQuery ? 'Try a different search term.' : 'Runs appear here once students complete a course.'}
                    />
                ) : (
                    <div className={tableWrapCls}>
                        <table className={tableCls}>
                            <thead className={theadCls}>
                                <tr>
                                    <th className={thCls}>Course</th>
                                    <th className={thCls}>Variant</th>
                                    <th className={thCls}>Date</th>
                                    <th className={`${thCls} text-right`}>Graduates</th>
                                    <th className={thCls}><span className="sr-only">Action</span></th>
                                </tr>
                            </thead>
                            <tbody className={tbodyCls}>
                                {paginatedRuns.map((r, idx) => (
                                    <tr
                                        key={`${r.courseId}-${r.variant}-${r.date || idx}`}
                                        className={`${trCls} cursor-pointer group`}
                                        onClick={() => onDrillDown(`${r.courseName} - ${r.variant} (${formatDateDMY(r.date)}) Graduates`, r.completedEnrollments)}
                                    >
                                        <td className={`${tdCls} font-semibold text-primary`}>{r.courseName}</td>
                                        <td className={tdCls}><Badge tone="brand">{r.variant}</Badge></td>
                                        <td className={`${tdCls} text-muted tabular-nums`}>{formatDateDMY(r.date) || 'No date recorded'}</td>
                                        <td className={`${tdCls} text-right`}>
                                            <Badge tone="success" shape="pill" className="tabular-nums">{r.completedCount}</Badge>
                                        </td>
                                        <td className={`${tdCls} text-right`}>
                                            <button
                                                className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 dark:text-brand-400 opacity-70 group-hover:opacity-100 transition-opacity whitespace-nowrap"
                                                onClick={e => {
                                                    e.stopPropagation();
                                                    onDrillDown(`${r.courseName} - ${r.variant} (${formatDateDMY(r.date)}) Graduates`, r.completedEnrollments);
                                                }}
                                            >
                                                View graduates
                                                <ArrowRight size={12} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                <Pagination
                    page={currentPage}
                    totalPages={totalPages}
                    totalItems={filteredRuns.length}
                    pageSize={itemsPerPage}
                    onPageChange={setCurrentPage}
                    itemLabel="cohorts"
                />
            </Card>
        </div>
    );
}
