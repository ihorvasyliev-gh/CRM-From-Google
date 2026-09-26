import { useState, useMemo } from 'react';
import { 
    ResponsiveContainer, 
    PieChart, 
    Pie, 
    Cell, 
    Tooltip as RechartsTooltip,
} from 'recharts';
import { MapPin, ArrowRight, Navigation, Users, ShieldCheck, CheckCircle } from 'lucide-react';
import Card, { SectionHeader } from '../ui/Card';
import Badge from '../ui/Badge';
import StatTile from '../ui/StatTile';
import SearchInput from '../ui/SearchInput';
import { Segmented } from '../ui/Tabs';
import { EmptyState } from '../ui/States';
import { ChartTooltip } from '../ui/chart';
import { CHART_SERIES } from '../ui/chartTheme';
import { tableWrapCls, tableCls, theadCls, thCls, tbodyCls, trCls, tdCls } from '../ui/styles';
import type { EnrollmentWithRelations } from '../../lib/documentUtils';
import { calculateGeographicFunnel } from './analyticsUtils';

interface GeographyDemographicsTabProps {
    enrollments: EnrollmentWithRelations[];
    onDrillDown: (title: string, data: EnrollmentWithRelations[]) => void;
}

type ViewMode = 'micro' | 'macro';

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

        const colors = CHART_SERIES;
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

    const completeness = [
        { label: 'Email address', value: dataCompleteness.withEmail, bar: 'bg-success' },
        { label: 'Phone number', value: dataCompleteness.withPhone, bar: 'bg-brand-500' },
        { label: 'Postal address', value: dataCompleteness.withAddress, bar: 'bg-info' },
        { label: 'Eircode', value: dataCompleteness.withEircode, bar: 'bg-warning' },
        { label: 'Date of birth', value: dataCompleteness.withDob, bar: 'bg-completed' },
    ];
    const ageTotal = ageData.reduce((sum, d) => sum + d.value, 0);

    return (
        <div className="space-y-5 animate-fadeIn">
            <SectionHeader
                icon={MapPin}
                tone="brand"
                title="Geography & demographics"
                description="Normalised Cork districts, satellite towns and county areas with completion rates per location"
                actions={<Badge tone="brand" shape="pill">{geoReport.microDistricts.length} locations mapped</Badge>}
            />

            {/* Highlights */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                <StatTile
                    label="Top inflow location"
                    icon={MapPin}
                    tone="brand"
                    accent={false}
                    value={<span className="text-lg">{geoReport.topInflowDistrict ? geoReport.topInflowDistrict.name : '—'}</span>}
                    hint={geoReport.topInflowDistrict ? `${geoReport.topInflowDistrict.total} applications` : 'No data'}
                />
                <StatTile
                    label="Highest graduation rate"
                    icon={CheckCircle}
                    tone="success"
                    accent={false}
                    value={<span className="text-lg">{geoReport.highestSuccessDistrict ? geoReport.highestSuccessDistrict.name : '—'}</span>}
                    hint={geoReport.highestSuccessDistrict ? `${geoReport.highestSuccessDistrict.rate}% graduated` : 'No data'}
                    hintTone="positive"
                />
                <StatTile
                    label="Territorial split"
                    icon={Navigation}
                    tone="info"
                    accent={false}
                    value={<span className="text-lg">{cityPct}% city</span>}
                    hint={`${satellitePct}% satellite towns · ${countyPct}% county`}
                />
            </div>

            {/* Address funnel table */}
            <Card
                title="Applications by location"
                icon={Navigation}
                subtitle="Click a row to see its students"
                divided
                flush
                action={
                    <div className="hidden md:flex items-center gap-2">
                        <Segmented<ViewMode>
                            ariaLabel="Location granularity"
                            value={viewMode}
                            onChange={setViewMode}
                            options={[
                                { value: 'micro', label: 'Districts' },
                                { value: 'macro', label: 'Zones' },
                            ]}
                        />
                        <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Filter locations…" aria-label="Filter locations" wrapperClassName="w-56" />
                    </div>
                }
            >
                <div className="md:hidden flex flex-col gap-2 p-3 border-b border-border-subtle">
                    <Segmented<ViewMode>
                        ariaLabel="Location granularity"
                        value={viewMode}
                        onChange={setViewMode}
                        options={[
                            { value: 'micro', label: 'Districts' },
                            { value: 'macro', label: 'Zones' },
                        ]}
                    />
                    <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Filter locations…" aria-label="Filter locations" />
                </div>
                {activeList.length === 0 ? (
                    <EmptyState bare icon={<MapPin size={22} />} title={searchQuery ? 'No matching locations' : 'No geographic data'} description={searchQuery ? 'Try a different search term.' : 'Addresses will appear here once students have them on file.'} />
                ) : (
                    <div className={`${tableWrapCls} max-h-[420px] overflow-y-auto`}>
                        <table className={tableCls}>
                            <thead className={`${theadCls} sticky top-0 z-10`}>
                                <tr>
                                    <th className={thCls}>{viewMode === 'micro' ? 'District' : 'Zone'}</th>
                                    {viewMode === 'micro' && <th className={thCls}>Zone</th>}
                                    <th className={`${thCls} w-56`}>Applications</th>
                                    <th className={`${thCls} text-right`}>Confirmed</th>
                                    <th className={`${thCls} text-right`}>Graduates</th>
                                    <th className={`${thCls} text-right`}>Success</th>
                                    <th className={thCls}><span className="sr-only">Action</span></th>
                                </tr>
                            </thead>
                            <tbody className={tbodyCls}>
                                {activeList.map((item, idx) => {
                                    const sharePct = Math.round((item.total / maxTotal) * 100);
                                    const rateTone = item.completionRate >= 65 ? 'success' : item.completionRate >= 40 ? 'brand' : 'neutral';
                                    return (
                                        <tr
                                            key={`${item.name}-${idx}`}
                                            className={`${trCls} cursor-pointer group`}
                                            onClick={() => onDrillDown(`Location: ${item.name}`, item.enrollments)}
                                        >
                                            <td className={`${tdCls} font-semibold text-primary`}>
                                                <span className="flex items-center gap-2">
                                                    <MapPin size={13} className="text-muted shrink-0" />
                                                    <span className="truncate max-w-[160px] sm:max-w-[240px]">{item.name}</span>
                                                </span>
                                            </td>
                                            {viewMode === 'micro' && (
                                                <td className={tdCls}>
                                                    <Badge>{item.macroRegion || 'Other'}</Badge>
                                                </td>
                                            )}
                                            <td className={tdCls}>
                                                <div className="flex items-center gap-2.5">
                                                    <span className="font-semibold text-primary tabular-nums w-7">{item.total}</span>
                                                    <div className="flex-1 h-1.5 bg-border-subtle rounded-full overflow-hidden">
                                                        <div className="h-full bg-brand-500 rounded-full" style={{ width: `${sharePct}%` }} />
                                                    </div>
                                                </div>
                                            </td>
                                            <td className={`${tdCls} text-right tabular-nums text-status-invited font-medium`}>{item.confirmed}</td>
                                            <td className={`${tdCls} text-right tabular-nums text-status-confirmed font-medium`}>{item.completed}</td>
                                            <td className={`${tdCls} text-right`}>
                                                <Badge tone={rateTone} shape="pill" className="tabular-nums">{item.completionRate}%</Badge>
                                            </td>
                                            <td className={`${tdCls} text-right`}>
                                                <button
                                                    onClick={e => {
                                                        e.stopPropagation();
                                                        onDrillDown(`Location: ${item.name}`, item.enrollments);
                                                    }}
                                                    className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 dark:text-brand-400 opacity-70 group-hover:opacity-100 transition-opacity"
                                                >
                                                    View
                                                    <ArrowRight size={12} />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Age distribution */}
                <Card title="Age distribution" icon={Users} subtitle={`${uniqueStudentsData.length} students · from date of birth`}>
                    <div className="flex flex-col sm:flex-row items-center gap-6">
                        <div className="w-[200px] h-[200px] shrink-0 relative">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={ageData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={62}
                                        outerRadius={92}
                                        paddingAngle={2}
                                        dataKey="value"
                                        stroke="none"
                                        onClick={(data: any) => {
                                            if (data && data.payload) {
                                                onDrillDown(`Age Group: ${data.name}`, data.payload.items);
                                            }
                                        }}
                                        className="cursor-pointer outline-hidden"
                                    >
                                        {ageData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} className="hover:opacity-85 transition-opacity" />
                                        ))}
                                    </Pie>
                                    <RechartsTooltip content={<ChartTooltip />} />
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                <span className="text-2xl font-bold text-primary tabular-nums">{uniqueStudentsData.length}</span>
                                <span className="text-[11px] text-muted">students</span>
                            </div>
                        </div>
                        <ul className="flex-1 w-full space-y-1">
                            {ageData.map(d => (
                                <li key={d.name}>
                                    <button
                                        type="button"
                                        onClick={() => onDrillDown(`Age Group: ${d.name}`, d.items)}
                                        className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-surface-elevated transition-colors text-left"
                                    >
                                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                                        <span className="flex-1 text-[13px] text-primary">{d.name}</span>
                                        <span className="text-[13px] font-semibold text-primary tabular-nums">{d.value}</span>
                                        <span className="w-10 text-right text-[11px] text-muted tabular-nums">
                                            {ageTotal ? Math.round((d.value / ageTotal) * 100) : 0}%
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                </Card>

                {/* Contact data quality */}
                <Card
                    title="Contact data quality"
                    icon={ShieldCheck}
                    tone="success"
                    subtitle={`Completeness across ${uniqueStudentsData.length} unique student profiles`}
                    bodyClassName="flex flex-col"
                >
                    <div className="space-y-4">
                        {completeness.map(c => (
                            <div key={c.label}>
                                <div className="flex justify-between text-xs mb-1.5">
                                    <span className="text-primary font-medium">{c.label}</span>
                                    <span className="font-semibold text-primary tabular-nums">{c.value}%</span>
                                </div>
                                <div className="h-2 w-full bg-border-subtle rounded-full overflow-hidden">
                                    <div className={`h-full ${c.bar} rounded-full transition-all duration-500`} style={{ width: `${c.value}%` }} />
                                </div>
                            </div>
                        ))}
                    </div>
                    <p className="mt-auto pt-4 flex items-start gap-2 text-[11px] text-muted">
                        <CheckCircle size={13} className="text-status-confirmed shrink-0 mt-px" />
                        Complete contact details make location mapping and outcome follow-ups reliable.
                    </p>
                </Card>
            </div>
        </div>
    );
}
