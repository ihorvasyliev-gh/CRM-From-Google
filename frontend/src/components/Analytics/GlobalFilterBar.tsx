import { useState, useMemo } from 'react';
import { Calendar, Filter, X, RotateCcw, Check, Sparkles, BookOpen, Layers } from 'lucide-react';
import type { EnrollmentWithRelations } from '../../lib/documentUtils';
import { cleanVariant } from '../../lib/types';
import { formatDateDMY } from '../../lib/dateUtils';

export interface AnalyticsFilterState {
    datePreset: 'all' | '30' | '90' | '180' | '365' | 'custom';
    customStartDate: string;
    customEndDate: string;
    courseId: string; // 'all' or specific uuid
    variant: string;  // 'all' or specific cleanVariant
    priorityOnly: boolean;
}

interface GlobalFilterBarProps {
    filters: AnalyticsFilterState;
    onFiltersChange: (newFilters: AnalyticsFilterState) => void;
    allEnrollments: EnrollmentWithRelations[];
    filteredEnrollments: EnrollmentWithRelations[];
}

export default function GlobalFilterBar({
    filters,
    onFiltersChange,
    allEnrollments,
    filteredEnrollments,
}: GlobalFilterBarProps) {
    const [showCustomModal, setShowCustomModal] = useState(false);
    const [tempStart, setTempStart] = useState(filters.customStartDate);
    const [tempEnd, setTempEnd] = useState(filters.customEndDate);

    // Extract unique courses for dropdown
    const availableCourses = useMemo(() => {
        const map = new Map<string, string>();
        allEnrollments.forEach(e => {
            if (e.courses?.id && e.courses?.name) {
                map.set(e.courses.id, e.courses.name);
            }
        });
        return Array.from(map.entries())
            .map(([id, name]) => ({ id, name }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [allEnrollments]);

    // Extract unique variants for dropdown
    const availableVariants = useMemo(() => {
        const set = new Set<string>();
        allEnrollments.forEach(e => {
            const v = cleanVariant(e.courses?.name || '', e.course_variant);
            if (v) set.add(v);
        });
        return Array.from(set).sort((a, b) => a.localeCompare(b));
    }, [allEnrollments]);

    // Check how many filters are active
    const activeFiltersCount = useMemo(() => {
        let count = 0;
        if (filters.datePreset !== 'all') count++;
        if (filters.courseId !== 'all') count++;
        if (filters.variant !== 'all') count++;
        if (filters.priorityOnly) count++;
        return count;
    }, [filters]);

    const handlePresetClick = (preset: AnalyticsFilterState['datePreset']) => {
        if (preset === 'custom') {
            setTempStart(filters.customStartDate || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
            setTempEnd(filters.customEndDate || new Date().toISOString().slice(0, 10));
            setShowCustomModal(true);
        } else {
            onFiltersChange({
                ...filters,
                datePreset: preset,
                customStartDate: '',
                customEndDate: ''
            });
        }
    };

    const handleApplyCustomDates = () => {
        onFiltersChange({
            ...filters,
            datePreset: 'custom',
            customStartDate: tempStart,
            customEndDate: tempEnd
        });
        setShowCustomModal(false);
    };

    const handleReset = () => {
        onFiltersChange({
            datePreset: 'all',
            customStartDate: '',
            customEndDate: '',
            courseId: 'all',
            variant: 'all',
            priorityOnly: false
        });
    };

    // Calculate quick stats of the active slice
    const sliceStats = useMemo(() => {
        const total = filteredEnrollments.length;
        const confirmed = filteredEnrollments.filter(e => e.status === 'confirmed').length;
        const completed = filteredEnrollments.filter(e => e.status === 'completed').length;
        const requested = filteredEnrollments.filter(e => e.status === 'requested').length;
        const invited = filteredEnrollments.filter(e => e.status === 'invited').length;
        const uniqueStudents = new Set(filteredEnrollments.map(e => e.student_id)).size;

        return { total, confirmed, completed, queue: requested + invited, uniqueStudents };
    }, [filteredEnrollments]);

    return (
        <div className="bg-surface border border-border-subtle rounded-2xl p-4 shadow-sm space-y-3.5">
            {/* Top row: Date Presets & Selectors */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                
                {/* Date Presets Group */}
                <div className="flex items-center gap-1 p-1 bg-black/5 dark:bg-white/5 rounded-xl flex-wrap">
                    <button
                        onClick={() => handlePresetClick('all')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            filters.datePreset === 'all'
                                ? 'bg-surface-elevated text-brand-600 dark:text-brand-400 shadow-sm border border-border-subtle'
                                : 'text-muted hover:text-primary'
                        }`}
                    >
                        All Time
                    </button>
                    <button
                        onClick={() => handlePresetClick('30')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            filters.datePreset === '30'
                                ? 'bg-surface-elevated text-brand-600 dark:text-brand-400 shadow-sm border border-border-subtle'
                                : 'text-muted hover:text-primary'
                        }`}
                    >
                        30 Days
                    </button>
                    <button
                        onClick={() => handlePresetClick('90')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            filters.datePreset === '90'
                                ? 'bg-surface-elevated text-brand-600 dark:text-brand-400 shadow-sm border border-border-subtle'
                                : 'text-muted hover:text-primary'
                        }`}
                    >
                        90 Days
                    </button>
                    <button
                        onClick={() => handlePresetClick('180')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            filters.datePreset === '180'
                                ? 'bg-surface-elevated text-brand-600 dark:text-brand-400 shadow-sm border border-border-subtle'
                                : 'text-muted hover:text-primary'
                        }`}
                    >
                        6 Months
                    </button>
                    <button
                        onClick={() => handlePresetClick('365')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            filters.datePreset === '365'
                                ? 'bg-surface-elevated text-brand-600 dark:text-brand-400 shadow-sm border border-border-subtle'
                                : 'text-muted hover:text-primary'
                        }`}
                    >
                        12 Months
                    </button>
                    <button
                        onClick={() => handlePresetClick('custom')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            filters.datePreset === 'custom'
                                ? 'bg-surface-elevated text-brand-600 dark:text-brand-400 shadow-sm border border-border-subtle'
                                : 'text-muted hover:text-primary'
                        }`}
                    >
                        <Calendar size={13} />
                        {filters.datePreset === 'custom' && filters.customStartDate && filters.customEndDate ? (
                            <span>{formatDateDMY(filters.customStartDate)} – {formatDateDMY(filters.customEndDate)}</span>
                        ) : (
                            <span>Custom Range</span>
                        )}
                    </button>
                </div>

                {/* Dropdowns Group */}
                <div className="flex flex-wrap items-center gap-2.5">
                    {/* Course Filter */}
                    <div className="flex items-center gap-1.5 bg-surface-elevated border border-border-subtle px-3 py-1.5 rounded-xl text-xs">
                        <BookOpen size={13} className="text-muted flex-shrink-0" />
                        <select
                            value={filters.courseId}
                            onChange={(e) => onFiltersChange({ ...filters, courseId: e.target.value })}
                            className="bg-transparent border-none text-primary font-medium focus:ring-0 cursor-pointer outline-none max-w-[170px] truncate"
                        >
                            <option value="all">All Courses</option>
                            {availableCourses.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Variant Filter */}
                    <div className="flex items-center gap-1.5 bg-surface-elevated border border-border-subtle px-3 py-1.5 rounded-xl text-xs">
                        <Layers size={13} className="text-muted flex-shrink-0" />
                        <select
                            value={filters.variant}
                            onChange={(e) => onFiltersChange({ ...filters, variant: e.target.value })}
                            className="bg-transparent border-none text-primary font-medium focus:ring-0 cursor-pointer outline-none max-w-[140px] truncate"
                        >
                            <option value="all">All Variants</option>
                            {availableVariants.map(v => (
                                <option key={v} value={v}>{v}</option>
                            ))}
                        </select>
                    </div>

                    {/* Priority Toggle */}
                    <button
                        onClick={() => onFiltersChange({ ...filters, priorityOnly: !filters.priorityOnly })}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                            filters.priorityOnly
                                ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'
                                : 'bg-surface-elevated border-border-subtle text-muted hover:text-primary'
                        }`}
                    >
                        <Sparkles size={13} />
                        Priority Only
                    </button>

                    {/* Reset Button */}
                    {activeFiltersCount > 0 && (
                        <button
                            onClick={handleReset}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium text-red-500 bg-red-500/10 hover:bg-red-500/20 transition-colors"
                            title="Reset all filters"
                        >
                            <RotateCcw size={13} />
                            Reset ({activeFiltersCount})
                        </button>
                    )}
                </div>
            </div>

            {/* Bottom row: Slice summary banner */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2.5 border-t border-border-subtle/50 text-xs">
                <div className="flex items-center gap-3 text-muted">
                    <span className="flex items-center gap-1.5 font-medium">
                        <Filter size={13} className="text-brand-500" />
                        Active Scope:
                    </span>
                    <span className="text-primary font-bold">{sliceStats.total} <span className="font-normal text-muted">enrollments</span></span>
                    <span className="w-1 h-1 rounded-full bg-border-strong" />
                    <span className="text-primary font-semibold">{sliceStats.uniqueStudents} <span className="font-normal text-muted">students</span></span>
                    <span className="w-1 h-1 rounded-full bg-border-strong" />
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{sliceStats.completed} <span className="font-normal text-muted">completed</span></span>
                    <span className="w-1 h-1 rounded-full bg-border-strong" />
                    <span className="text-amber-600 dark:text-amber-400 font-semibold">{sliceStats.queue} <span className="font-normal text-muted">in queue</span></span>
                </div>
                
                {allEnrollments.length > 0 && (
                    <div className="text-[11px] text-muted">
                        Showing {Math.round((filteredEnrollments.length / allEnrollments.length) * 100)}% of total database ({allEnrollments.length} total)
                    </div>
                )}
            </div>

            {/* Custom Date Range Modal */}
            {showCustomModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fadeIn">
                    <div className="bg-surface border border-border-subtle rounded-2xl shadow-2xl p-5 max-w-sm w-full space-y-4 animate-scaleIn">
                        <div className="flex items-center justify-between border-b border-border-subtle pb-3">
                            <h3 className="text-sm font-bold text-primary flex items-center gap-2">
                                <Calendar size={16} className="text-brand-500" /> Select Custom Date Range
                            </h3>
                            <button onClick={() => setShowCustomModal(false)} className="p-1 rounded-lg text-muted hover:text-primary">
                                <X size={16} />
                            </button>
                        </div>

                        <div className="space-y-3">
                            <div>
                                <label className="text-[11px] font-bold text-muted uppercase tracking-wider block mb-1">Start Date</label>
                                <input
                                    type="date"
                                    value={tempStart}
                                    onChange={(e) => setTempStart(e.target.value)}
                                    className="w-full bg-surface-elevated border border-border-subtle rounded-xl px-3 py-2 text-sm text-primary focus:outline-none focus:border-brand-500"
                                />
                            </div>
                            <div>
                                <label className="text-[11px] font-bold text-muted uppercase tracking-wider block mb-1">End Date</label>
                                <input
                                    type="date"
                                    value={tempEnd}
                                    onChange={(e) => setTempEnd(e.target.value)}
                                    className="w-full bg-surface-elevated border border-border-subtle rounded-xl px-3 py-2 text-sm text-primary focus:outline-none focus:border-brand-500"
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-subtle">
                            <button
                                onClick={() => setShowCustomModal(false)}
                                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-muted hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleApplyCustomDates}
                                className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 transition-colors shadow-sm"
                            >
                                <Check size={14} /> Apply Range
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
