// Mobile-only controls shared by Outcomes (CRM Graduates) and External Lists (OutreachLists):
// - Compact sort selector for phones (where desktop column headers are hidden)
// - "Filters" button + Bottom Sheet modal (matching EnrollmentBoard's mobile sheet pattern)
// - Quick "To call" toggle chip + removable active filter chips strip
// - Thumb-friendly Call / No answer / Edit action strip for each mobile row
import type { ReactNode } from 'react';
import {
    ArrowDownUp,
    Briefcase,
    Calendar,
    GraduationCap,
    Loader2,
    Mail,
    Pencil,
    Phone,
    PhoneMissed,
    SlidersHorizontal,
    X,
} from 'lucide-react';
import Modal from './ui/Modal';
import { DateInput } from './ui/DatePicker';
import { buttonCls } from './ui/buttonStyles';
import type { OutcomeSort } from '../lib/outcomeSort';
import type { OutcomeTrackingStatus } from '../lib/employmentTypes';
import { formatPhoneForCall } from '../lib/contactUtils';
import { formatDisplayDate } from '../lib/dateUtils';
import {
    OLDER_COMPLETION_OPTIONS,
    RECENT_COMPLETION_OPTIONS,
    type CompletionDateFilter,
} from '../lib/outcomeCompletionDate';

export type OutcomeStatusFilter = 'all' | OutcomeTrackingStatus;
export type OutcomeEmploymentFilter = 'all' | 'working' | 'not_working';
export type OutcomeCallFilter = 'all' | 'called' | 'not_called';

export interface ActiveOutcomeFilter {
    id: string;
    label: string;
    value: string;
    onRemove: () => void;
}

interface SortOption {
    value: string;
    label: string;
}

const GRADUATE_SORT_OPTIONS: SortOption[] = [
    { value: 'name:asc', label: 'Name A–Z' },
    { value: 'name:desc', label: 'Name Z–A' },
    { value: 'completed:desc', label: 'Completed: Newest' },
    { value: 'completed:asc', label: 'Completed: Oldest' },
    { value: 'updated:desc', label: 'Updated: Newest' },
    { value: 'updated:asc', label: 'Updated: Oldest' },
    { value: 'tracking:asc', label: 'Status: Not contacted first' },
    { value: 'tracking:desc', label: 'Status: Responded first' },
    { value: 'employment:asc', label: 'Employment: Working first' },
    { value: 'employment:desc', label: 'Employment: Not working first' },
    { value: 'courses:asc', label: 'Course A–Z' },
    { value: 'courses:desc', label: 'Course Z–A' },
];

const LIST_SORT_OPTIONS: SortOption[] = [
    { value: 'default', label: 'Recently added' },
    { value: 'name:asc', label: 'Name A–Z' },
    { value: 'name:desc', label: 'Name Z–A' },
    { value: 'updated:desc', label: 'Updated: Newest' },
    { value: 'updated:asc', label: 'Updated: Oldest' },
    { value: 'tracking:asc', label: 'Status: Not contacted first' },
    { value: 'tracking:desc', label: 'Status: Responded first' },
    { value: 'employment:asc', label: 'Employment: Working first' },
    { value: 'employment:desc', label: 'Employment: Not working first' },
    { value: 'ref:asc', label: 'IRIS ID A–Z' },
    { value: 'ref:desc', label: 'IRIS ID Z–A' },
];

/** Compact sort dropdown shown in the list header on mobile phones where column headers are hidden. */
export function MobileSortSelect({
    variant,
    sort,
    onChange,
}: {
    variant: 'graduates' | 'lists';
    sort: OutcomeSort | null;
    onChange: (next: OutcomeSort | null) => void;
}) {
    const options = variant === 'graduates' ? GRADUATE_SORT_OPTIONS : LIST_SORT_OPTIONS;
    const currentValue = sort ? `${sort.key}:${sort.dir}` : 'default';

    return (
        <label className="inline-flex items-center gap-1 h-7 pl-2 pr-1.5 rounded-lg bg-surface border border-border-subtle text-xs text-muted max-w-[190px] focus-within:border-brand-500">
            <ArrowDownUp size={12} className="shrink-0 text-brand-500" aria-hidden />
            <span className="sr-only">Sort by</span>
            <select
                aria-label="Sort by"
                value={currentValue}
                onChange={e => {
                    const val = e.target.value;
                    if (val === 'default') {
                        onChange(null);
                        return;
                    }
                    const [key, dir] = val.split(':') as [OutcomeSort['key'], OutcomeSort['dir']];
                    onChange({ key, dir });
                }}
                className="bg-transparent text-xs font-semibold text-primary truncate focus:outline-hidden cursor-pointer pr-0.5 min-w-0"
            >
                {options.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
            </select>
        </label>
    );
}

/** Mobile-only button that opens the filter bottom sheet and shows the active filter count badge. */
export function MobileFiltersButton({
    activeCount,
    onClick,
}: {
    activeCount: number;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label="Open filters"
            className={`md:hidden inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border text-xs font-semibold transition-all active:scale-95 shrink-0 ${
                activeCount > 0
                    ? 'bg-brand-500/15 text-brand-700 dark:text-brand-300 border-brand-500/40'
                    : 'bg-surface text-primary border-border-strong'
            }`}
        >
            <SlidersHorizontal size={14} aria-hidden />
            <span>Filters</span>
            {activeCount > 0 && (
                <span className="min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-brand-500 text-white text-[10px] font-bold">
                    {activeCount}
                </span>
            )}
        </button>
    );
}

/**
 * Single-line horizontally scrollable mobile strip under Search + Filters:
 * quick "To call" toggle chip + removable active filter chips + Clear all.
 */
export function MobileQuickFilterStrip({
    showToCall,
    toCallActive,
    toCallCount,
    onToggleToCall,
    activeFilters,
    onClearAll,
}: {
    showToCall: boolean;
    toCallActive: boolean;
    toCallCount: number;
    onToggleToCall: () => void;
    activeFilters: ActiveOutcomeFilter[];
    onClearAll: () => void;
}) {
    const visibleChips = activeFilters.filter(f => !(toCallActive && f.id === 'call'));
    if (!showToCall && visibleChips.length === 0) return null;

    return (
        <div
            className="md:hidden flex items-center gap-1.5 overflow-x-auto scrollbar-none -mx-1 px-1 py-0.5"
            aria-label="Quick filters"
        >
            {showToCall && (
                <button
                    type="button"
                    aria-pressed={toCallActive}
                    onClick={onToggleToCall}
                    className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border text-xs font-semibold whitespace-nowrap shrink-0 transition-all active:scale-95 ${
                        toCallActive
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                            : 'bg-surface text-primary border-border-strong'
                    }`}
                >
                    <Phone size={11} aria-hidden />
                    <span>To call</span>
                    <span className={`text-[11px] font-mono px-1.5 rounded-full ${
                        toCallActive ? 'bg-white/20 text-white' : 'bg-surface-elevated text-muted'
                    }`}>
                        {toCallCount}
                    </span>
                </button>
            )}

            {visibleChips.map(filter => (
                <span
                    key={filter.id}
                    className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-full bg-brand-500/10 border border-brand-500/30 text-xs whitespace-nowrap shrink-0"
                >
                    <span className="text-muted">{filter.label}:</span>
                    <span className="font-semibold text-primary max-w-[140px] truncate">{filter.value}</span>
                    <button
                        type="button"
                        onClick={filter.onRemove}
                        aria-label={`Remove ${filter.label} filter`}
                        className="p-0.5 rounded-full text-muted hover:text-danger transition-colors"
                    >
                        <X size={12} />
                    </button>
                </span>
            ))}

            {activeFilters.length > 0 && (
                <button
                    type="button"
                    onClick={onClearAll}
                    aria-label="Reset filters"
                    className="text-xs font-semibold text-danger px-2 py-1 whitespace-nowrap shrink-0"
                >
                    Reset
                </button>
            )}
        </div>
    );
}

function SheetSectionLabel({ icon, children }: { icon: ReactNode; children: ReactNode }) {
    return (
        <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
            {icon}
            {children}
        </span>
    );
}

function SheetChip({
    active,
    onClick,
    count,
    children,
}: {
    active: boolean;
    onClick: () => void;
    count?: number;
    children: ReactNode;
}) {
    return (
        <button
            type="button"
            aria-pressed={active}
            onClick={onClick}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border text-sm font-semibold whitespace-nowrap transition-all active:scale-95 ${
                active
                    ? 'bg-brand-500 text-white border-brand-500 shadow-xs'
                    : 'bg-surface-elevated text-muted border-border-strong hover:text-primary'
            }`}
        >
            <span>{children}</span>
            {count !== undefined && (
                <span className={`text-xs font-mono px-1.5 rounded-full ${
                    active ? 'bg-white/20 text-white' : 'bg-background text-muted'
                }`}>
                    {count}
                </span>
            )}
        </button>
    );
}

export interface OutcomeFiltersSheetProps {
    open: boolean;
    onClose: () => void;
    filteredCount: number;
    totalCount: number;
    noun: 'graduate' | 'contact';
    activeFilterCount: number;
    onClearAll: () => void;
    filterStatus: OutcomeStatusFilter;
    onSelectStatus: (next: OutcomeStatusFilter) => void;
    statusCounts: Record<OutcomeStatusFilter, number>;
    filterEmployment: OutcomeEmploymentFilter;
    onSelectEmployment: (next: OutcomeEmploymentFilter) => void;
    workingCount: number;
    notWorkingCount: number;
    callsApplicable: boolean;
    filterCall: OutcomeCallFilter;
    onSelectCall: (next: OutcomeCallFilter) => void;
    callCounts: { all: number; called: number; not_called: number };
    /** Optional course filter (CRM Graduates only). */
    courseFilter?: {
        courses: string[];
        value: string;
        onChange: (next: string) => void;
    };
    /** Optional completion date filter (CRM Graduates only). */
    completionFilter?: {
        value: CompletionDateFilter;
        onChange: (next: CompletionDateFilter) => void;
        from: string;
        to: string;
        today: string;
        hint: string | null;
        onFromChange: (next: string) => void;
        onToChange: (next: string) => void;
        onResetDates: () => void;
    };
}

/** Mobile bottom sheet holding all filters for Outcomes (CRM Graduates & External Lists). */
export function OutcomeFiltersSheet({
    open,
    onClose,
    filteredCount,
    totalCount,
    noun,
    activeFilterCount,
    onClearAll,
    filterStatus,
    onSelectStatus,
    statusCounts,
    filterEmployment,
    onSelectEmployment,
    workingCount,
    notWorkingCount,
    callsApplicable,
    filterCall,
    onSelectCall,
    callCounts,
    courseFilter,
    completionFilter,
}: OutcomeFiltersSheetProps) {
    const plural = (n: number) => (n === 1 ? noun : `${noun}s`);

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Filters"
            subtitle={`${filteredCount} of ${totalCount} ${plural(totalCount)}`}
            icon={SlidersHorizontal}
            sheetOnMobile
            labelId="outcomes-filters-title"
            bodyClassName="space-y-5"
            footer={
                <>
                    {activeFilterCount > 0 && (
                        <button
                            type="button"
                            onClick={onClearAll}
                            className="h-10 px-4 text-sm font-semibold text-danger rounded-xl hover:bg-danger/10 transition-colors"
                        >
                            Clear all
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={onClose}
                        className={buttonCls('primary', 'lg', 'flex-1 sm:flex-none')}
                    >
                        Show {filteredCount} {plural(filteredCount)}
                    </button>
                </>
            }
        >
            <section className="space-y-2">
                <SheetSectionLabel icon={<Mail size={12} />}>Status</SheetSectionLabel>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Sheet status filter">
                    {([
                        { value: 'all', label: 'All' },
                        { value: 'not_contacted', label: 'Not Contacted' },
                        { value: 'pending', label: 'Pending' },
                        { value: 'responded', label: 'Responded' },
                    ] as const).map(({ value, label }) => (
                        <SheetChip
                            key={value}
                            active={filterStatus === value}
                            count={statusCounts[value]}
                            onClick={() => onSelectStatus(value)}
                        >
                            {label}
                        </SheetChip>
                    ))}
                </div>
            </section>

            <section className="space-y-2">
                <SheetSectionLabel icon={<Briefcase size={12} />}>Employment</SheetSectionLabel>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Sheet employment filter">
                    <SheetChip active={filterEmployment === 'all'} onClick={() => onSelectEmployment('all')}>
                        All
                    </SheetChip>
                    <SheetChip active={filterEmployment === 'working'} count={workingCount} onClick={() => onSelectEmployment('working')}>
                        Working
                    </SheetChip>
                    <SheetChip active={filterEmployment === 'not_working'} count={notWorkingCount} onClick={() => onSelectEmployment('not_working')}>
                        Not working
                    </SheetChip>
                </div>
            </section>

            {callsApplicable && callCounts.all > 0 && (
                <section className="space-y-2">
                    <SheetSectionLabel icon={<Phone size={12} />}>Calls</SheetSectionLabel>
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Sheet calls filter">
                        <SheetChip active={filterCall === 'all'} onClick={() => onSelectCall('all')}>
                            All calls
                        </SheetChip>
                        <SheetChip active={filterCall === 'not_called'} count={callCounts.not_called} onClick={() => onSelectCall('not_called')}>
                            Not called yet
                        </SheetChip>
                        <SheetChip active={filterCall === 'called'} count={callCounts.called} onClick={() => onSelectCall('called')}>
                            Called, no answer
                        </SheetChip>
                    </div>
                </section>
            )}

            {courseFilter && courseFilter.courses.length > 1 && (
                <section className="space-y-2">
                    <SheetSectionLabel icon={<GraduationCap size={12} />}>Course</SheetSectionLabel>
                    <select
                        aria-label="Sheet course filter"
                        value={courseFilter.value}
                        onChange={e => courseFilter.onChange(e.target.value)}
                        className="w-full h-10 text-sm bg-background border border-border-strong rounded-xl px-3 text-primary focus:outline-hidden focus:ring-2 focus:ring-brand-500/20"
                    >
                        <option value="all">All courses</option>
                        {courseFilter.courses.map(c => (
                            <option key={c} value={c}>{c}</option>
                        ))}
                    </select>
                </section>
            )}

            {completionFilter && (
                <section className="space-y-2">
                    <SheetSectionLabel icon={<Calendar size={12} />}>Completed date</SheetSectionLabel>
                    <select
                        aria-label="Sheet completion date filter"
                        value={completionFilter.value}
                        onChange={e => completionFilter.onChange(e.target.value as CompletionDateFilter)}
                        className="w-full h-10 text-sm bg-background border border-border-strong rounded-xl px-3 text-primary focus:outline-hidden focus:ring-2 focus:ring-brand-500/20"
                    >
                        <option value="all">Completed: Any time</option>
                        <optgroup label="Recently">
                            {RECENT_COMPLETION_OPTIONS.map(o => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                        </optgroup>
                        <optgroup label="A while ago">
                            {OLDER_COMPLETION_OPTIONS.map(o => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                        </optgroup>
                        <optgroup label="Custom">
                            <option value="custom">Custom date range…</option>
                        </optgroup>
                    </select>

                    {completionFilter.value !== 'all' && completionFilter.value !== 'custom' && completionFilter.hint && (
                        <p className="text-xs text-muted">{completionFilter.hint}</p>
                    )}

                    {completionFilter.value === 'custom' && (
                        <div className="grid grid-cols-2 gap-2 pt-1">
                            <div className="space-y-1">
                                <label htmlFor="sheet-completed-from" className="block text-xs text-muted">From</label>
                                <DateInput
                                    id="sheet-completed-from"
                                    value={completionFilter.from}
                                    max={completionFilter.today}
                                    placeholder="Any date"
                                    onChange={completionFilter.onFromChange}
                                    className="w-full text-xs bg-background border border-border-strong rounded-xl px-2.5 py-2 font-medium focus:outline-hidden focus:ring-2 focus:ring-brand-500/20"
                                />
                            </div>
                            <div className="space-y-1">
                                <label htmlFor="sheet-completed-to" className="block text-xs text-muted">To</label>
                                <DateInput
                                    id="sheet-completed-to"
                                    value={completionFilter.to}
                                    max={completionFilter.today}
                                    placeholder="Any date"
                                    onChange={completionFilter.onToChange}
                                    className="w-full text-xs bg-background border border-border-strong rounded-xl px-2.5 py-2 font-medium focus:outline-hidden focus:ring-2 focus:ring-brand-500/20"
                                />
                            </div>
                            {(completionFilter.from || completionFilter.to) && (
                                <button
                                    type="button"
                                    onClick={completionFilter.onResetDates}
                                    className="col-span-2 text-xs font-semibold text-muted hover:text-primary py-1 text-left"
                                >
                                    Reset dates
                                </button>
                            )}
                        </div>
                    )}
                </section>
            )}
        </Modal>
    );
}

/**
 * Thumb-friendly action strip rendered at the bottom of each card on mobile phones (< sm):
 * direct green Call button (tel:), No answer toggle (when awaiting reply), and Edit button.
 */
export function MobileRowActions({
    name,
    phone,
    status,
    calledAt,
    callBusy,
    onDial,
    onToggleNoAnswer,
    onEdit,
}: {
    name: string;
    phone: string | null | undefined;
    status: OutcomeTrackingStatus;
    calledAt: string | null | undefined;
    callBusy: boolean;
    onDial: () => void;
    onToggleNoAnswer: () => void;
    onEdit: () => void;
}) {
    const telUrl = formatPhoneForCall(phone);
    const showNoAnswer = status !== 'responded';

    return (
        <div
            role="group"
            aria-label={`Quick actions for ${name}`}
            className="sm:hidden mt-2.5 pt-2 border-t border-border-subtle/60 flex items-center gap-1.5"
        >
            {telUrl && (
                <a
                    href={telUrl}
                    onClick={e => {
                        e.stopPropagation();
                        onDial();
                    }}
                    aria-label={`Call ${name}`}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-xl text-xs font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/20 active:scale-[0.98] transition-all whitespace-nowrap"
                >
                    <Phone size={13} aria-hidden />
                    <span>Call</span>
                </a>
            )}

            {showNoAnswer && (
                <button
                    type="button"
                    disabled={callBusy}
                    aria-pressed={!!calledAt}
                    aria-label={
                        calledAt
                            ? `${name}: no answer on ${formatDisplayDate(calledAt)}. Tap to clear`
                            : `Mark ${name} no answer`
                    }
                    onClick={e => {
                        e.stopPropagation();
                        if (!callBusy) onToggleNoAnswer();
                    }}
                    className={`flex-1 inline-flex items-center justify-center gap-1.5 h-9 px-2.5 rounded-xl text-xs font-semibold border active:scale-[0.98] transition-all whitespace-nowrap disabled:opacity-60 min-w-0 ${
                        calledAt
                            ? 'bg-warning/15 text-status-requested border-warning/35'
                            : 'bg-surface-elevated text-muted border-border-strong hover:text-primary'
                    }`}
                >
                    {callBusy
                        ? <Loader2 size={13} className="animate-spin shrink-0" aria-hidden />
                        : <PhoneMissed size={13} className="shrink-0" aria-hidden />}
                    <span className="truncate">
                        {calledAt ? `No answer · ${formatDisplayDate(calledAt)}` : 'No answer'}
                    </span>
                </button>
            )}

            <button
                type="button"
                aria-label={`Edit outcome for ${name}`}
                onClick={e => {
                    e.stopPropagation();
                    onEdit();
                }}
                className={`${!showNoAnswer ? 'flex-1' : 'shrink-0'} inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-xl text-xs font-semibold bg-surface-elevated text-primary border border-border-strong hover:border-brand-500/50 active:scale-[0.98] transition-all whitespace-nowrap`}
            >
                <Pencil size={12} aria-hidden />
                <span>Edit</span>
            </button>
        </div>
    );
}
