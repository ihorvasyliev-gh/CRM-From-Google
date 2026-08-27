import { useState, useMemo } from 'react';
import { MapPin, Search, ArrowRight, Navigation } from 'lucide-react';
import type { EnrollmentWithRelations } from '../../lib/documentUtils';
import { calculateGeographicFunnel } from './analyticsUtils';

interface AddressFunnelCardProps {
    enrollments: EnrollmentWithRelations[];
    onDrillDown: (title: string, data: EnrollmentWithRelations[]) => void;
}

type ViewMode = 'micro' | 'macro';

export default function AddressFunnelCard({ enrollments, onDrillDown }: AddressFunnelCardProps) {
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

    return (
        <div className="bg-surface rounded-2xl shadow-sm border border-border-subtle p-5 flex flex-col space-y-5">
            {/* Header: Title, Controls & Search */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400">
                        <MapPin size={20} />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-primary uppercase tracking-wider">
                                Geographic Intelligence & Address Funnel
                            </h3>
                            <span className="text-xs font-semibold text-brand-600 dark:text-brand-400 bg-brand-500/10 px-2.5 py-0.5 rounded-full font-mono">
                                {geoReport.microDistricts.length} Locations
                            </span>
                        </div>
                        <p className="text-xs text-muted mt-0.5">
                            Normalized Cork districts, satellite towns, and applicant conversion rates
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

            {/* Quick Metrics Bar */}
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
                    <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
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
    );
}
