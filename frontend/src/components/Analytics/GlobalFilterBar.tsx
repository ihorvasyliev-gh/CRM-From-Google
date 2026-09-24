import { useState, useMemo } from 'react';
import type { ReactNode } from 'react';
import { Calendar, Filter, RotateCcw, Check, Sparkles, BookOpen, Layers } from 'lucide-react';
import Modal from '../ui/Modal';
import { Button } from '../ui/Button';
import { fieldCls, labelCls } from '../ui/styles';
import { SelectField } from '../Viewer/ViewerUI';
import type { EnrollmentWithRelations } from '../../lib/documentUtils';
import { cleanVariant } from '../../lib/types';
import { formatDateDMY } from '../../lib/dateUtils';

export interface AnalyticsFilterState {
    datePreset: 'all' | '30' | '90' | '180' | '365' | 'custom';
    customStartDate: string;
    customEndDate: string;
    courseId: string;
    variant: string;
    priorityOnly: boolean;
}

interface GlobalFilterBarProps {
    filters: AnalyticsFilterState;
    onFiltersChange: (newFilters: AnalyticsFilterState) => void;
    allEnrollments: EnrollmentWithRelations[];
    filteredEnrollments: EnrollmentWithRelations[];
    /** Extra controls rendered at the end of the controls row (exports…). */
    actions?: ReactNode;
}

const isoDaysAgo = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function GlobalFilterBar({
    filters,
    onFiltersChange,
    allEnrollments,
    filteredEnrollments,
    actions,
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

    // Check active filters count
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
            setTempStart(filters.customStartDate || isoDaysAgo(30));
            setTempEnd(filters.customEndDate || isoDaysAgo(0));
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

    const presets: { value: AnalyticsFilterState['datePreset']; label: string }[] = [
        { value: 'all', label: 'All time' },
        { value: '30', label: '30 days' },
        { value: '90', label: '90 days' },
        { value: '180', label: '6 months' },
        { value: '365', label: '12 months' },
    ];
    const customLabel = filters.datePreset === 'custom' && filters.customStartDate && filters.customEndDate
        ? `${formatDateDMY(filters.customStartDate)} – ${formatDateDMY(filters.customEndDate)}`
        : 'Custom';
    const share = allEnrollments.length > 0 ? Math.round((filteredEnrollments.length / allEnrollments.length) * 100) : 0;

    return (
        <div className="rounded-2xl bg-surface border border-border-subtle shadow-card">
            {/* Controls */}
            <div className="flex flex-wrap items-center gap-2 p-3 sm:p-3.5">
                <div role="tablist" aria-label="Date range" className="flex items-center gap-0.5 p-1 bg-surface-elevated border border-border-subtle rounded-xl overflow-x-auto scrollbar-none max-w-full shrink-0">
                    {presets.map(p => {
                        const active = filters.datePreset === p.value;
                        return (
                            <button
                                key={p.value}
                                type="button"
                                role="tab"
                                aria-selected={active}
                                onClick={() => handlePresetClick(p.value)}
                                className={`shrink-0 h-7 px-2.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                                    active ? 'bg-surface text-primary shadow-sm ring-1 ring-border-subtle' : 'text-muted hover:text-primary'
                                }`}
                            >
                                {p.label}
                            </button>
                        );
                    })}
                    <button
                        type="button"
                        role="tab"
                        aria-selected={filters.datePreset === 'custom'}
                        onClick={() => handlePresetClick('custom')}
                        className={`shrink-0 flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                            filters.datePreset === 'custom' ? 'bg-surface text-primary shadow-sm ring-1 ring-border-subtle' : 'text-muted hover:text-primary'
                        }`}
                    >
                        <Calendar size={13} />
                        {customLabel}
                    </button>
                </div>

                <div className="contents">
                    <SelectField
                        label="Course"
                        icon={<BookOpen size={14} />}
                        value={filters.courseId}
                        onChange={v => onFiltersChange({ ...filters, courseId: v })}
                        className="w-full sm:w-52"
                    >
                        <option value="all">All courses</option>
                        {availableCourses.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </SelectField>
                    <SelectField
                        label="Variant"
                        icon={<Layers size={14} />}
                        value={filters.variant}
                        onChange={v => onFiltersChange({ ...filters, variant: v })}
                        className="w-full sm:w-40"
                    >
                        <option value="all">All variants</option>
                        {availableVariants.map(v => (
                            <option key={v} value={v}>{v}</option>
                        ))}
                    </SelectField>
                    <button
                        type="button"
                        aria-pressed={filters.priorityOnly}
                        onClick={() => onFiltersChange({ ...filters, priorityOnly: !filters.priorityOnly })}
                        className={`flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-semibold border transition-colors ${
                            filters.priorityOnly
                                ? 'bg-warning/10 border-warning/40 text-status-requested'
                                : 'bg-surface border-border-subtle text-muted hover:text-primary hover:border-border-strong'
                        }`}
                    >
                        <Sparkles size={13} className={filters.priorityOnly ? 'fill-current' : ''} />
                        Priority only
                    </button>
                    {activeFiltersCount > 0 && (
                        <Button variant="ghost" size="md" onClick={handleReset} title="Reset all active filters">
                            <RotateCcw size={13} />
                            Reset ({activeFiltersCount})
                        </Button>
                    )}
                </div>
            </div>

            {/* Scope summary */}
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3.5 sm:px-4 py-2 border-t border-border-subtle bg-surface-elevated/40 rounded-b-2xl text-xs">
                <div className="flex items-center gap-x-3 gap-y-1 text-muted flex-wrap">
                    <span className="flex items-center gap-1.5 font-semibold text-primary">
                        <Filter size={13} className="text-brand-500" />
                        Scope
                    </span>
                    <span><span className="font-semibold text-primary tabular-nums">{sliceStats.total}</span> enrollments</span>
                    <span className="w-1 h-1 rounded-full bg-border-strong" />
                    <span><span className="font-semibold text-primary tabular-nums">{sliceStats.uniqueStudents}</span> students</span>
                    <span className="w-1 h-1 rounded-full bg-border-strong" />
                    <span><span className="font-semibold text-status-confirmed tabular-nums">{sliceStats.completed}</span> graduates</span>
                    <span className="w-1 h-1 rounded-full bg-border-strong" />
                    <span><span className="font-semibold text-status-requested tabular-nums">{sliceStats.queue}</span> in queue</span>
                </div>
                <div className="flex items-center gap-3 ml-auto">
                    {allEnrollments.length > 0 && (
                        <div className="flex items-center gap-2 text-[11px] text-muted">
                            <span className="hidden sm:block w-16 h-1.5 rounded-full bg-border-subtle overflow-hidden">
                                <span className="block h-full bg-brand-500 rounded-full" style={{ width: `${share}%` }} />
                            </span>
                            {share}% of {allEnrollments.length}
                        </div>
                    )}
                    {actions && <div className="flex items-center gap-2">{actions}</div>}
                </div>
            </div>

            {/* Custom Date Range Modal */}
            <Modal
                open={showCustomModal}
                onClose={() => setShowCustomModal(false)}
                title="Custom date range"
                icon={Calendar}
                size="sm"
                labelId="custom-range-title"
                footer={
                    <>
                        <Button variant="ghost" onClick={() => setShowCustomModal(false)}>Cancel</Button>
                        <Button variant="primary" onClick={handleApplyCustomDates}>
                            <Check size={14} /> Apply range
                        </Button>
                    </>
                }
            >
                <div className="space-y-3">
                    <div>
                        <label htmlFor="range-start" className={labelCls}>Start date</label>
                        <input id="range-start" type="date" value={tempStart} onChange={e => setTempStart(e.target.value)} className={fieldCls} />
                    </div>
                    <div>
                        <label htmlFor="range-end" className={labelCls}>End date</label>
                        <input id="range-end" type="date" value={tempEnd} onChange={e => setTempEnd(e.target.value)} className={fieldCls} />
                    </div>
                </div>
            </Modal>
        </div>
    );
}
