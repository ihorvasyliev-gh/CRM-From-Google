import { useState, type ReactNode } from 'react';
import { Search, X, UserPlus, Globe, SlidersHorizontal, ArrowDownUp, Calendar, CalendarRange, GraduationCap } from 'lucide-react';
import { formatDayDateShort, formatShortDate } from '../../lib/dateUtils';
import DateCalendarPicker from './DateCalendarPicker';
import type { EnrollmentRow } from '../../hooks/useEnrollments';
import { CustomTooltip } from '../ui/Tooltip';
import Modal from '../ui/Modal';
import { buttonCls } from '../ui/buttonStyles';

type SortOrder = 'date-asc' | 'date-desc' | 'name';

interface FilterBarProps {
    enrollments: EnrollmentRow[];
    enrollmentCount: number;
    filteredCount: number;
    searchQuery: string;
    setSearchQuery: (q: string) => void;
    setEnrollModalOpen: (open: boolean) => void;
    selectedCourse: string;
    setSelectedCourse: (c: string) => void;
    uniqueCourses: { id: string, name: string }[];
    selectedVariant: string;
    setSelectedVariant: (v: string) => void;
    uniqueVariants: string[];
    selectedCourseDate: string;
    setSelectedCourseDate: (d: string) => void;
    availableCourseDates: { date: string, count: number }[];
    dateFrom: string;
    setDateFrom: (d: string) => void;
    dateTo: string;
    setDateTo: (d: string) => void;
    courseDateFrom: string;
    setCourseDateFrom: (d: string) => void;
    courseDateTo: string;
    setCourseDateTo: (d: string) => void;
    sortOrder: SortOrder;
    setSortOrder: React.Dispatch<React.SetStateAction<SortOrder>>;
}

const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
    { value: 'date-asc', label: 'Oldest first' },
    { value: 'date-desc', label: 'Newest first' },
    { value: 'name', label: 'By name' },
];

type ChipTone = 'brand' | 'violet' | 'emerald';

const CHIP_ACTIVE: Record<ChipTone, string> = {
    brand: 'bg-brand-500 text-white border-brand-500 shadow-sm',
    violet: 'bg-violet-500 text-white border-violet-500 shadow-sm',
    emerald: 'bg-emerald-600 text-white border-emerald-600 shadow-sm',
};

const CHIP_IDLE: Record<ChipTone, string> = {
    brand: 'hover:border-brand-500 hover:text-brand-500',
    violet: 'hover:border-violet-500 hover:text-violet-500 dark:hover:text-violet-400',
    emerald: 'hover:border-emerald-500/60 hover:text-primary',
};

function Chip({ active, tone = 'brand', count, onClick, size = 'sm', children }: {
    active: boolean;
    tone?: ChipTone;
    count?: number;
    onClick: () => void;
    /** `lg` — finger-sized chips for the mobile sheet */
    size?: 'sm' | 'lg';
    children: ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={`inline-flex items-center gap-1.5 font-semibold rounded-full border whitespace-nowrap flex-shrink-0 transition-all active:scale-95 ${
                size === 'lg' ? 'px-3.5 py-2 text-sm' : 'px-2.5 py-1 text-xs'
            } ${active ? CHIP_ACTIVE[tone] : `bg-surface-elevated text-muted border-border-strong ${CHIP_IDLE[tone]}`}`}
        >
            {children}
            {count !== undefined && (
                <span className={`text-[10px] px-1.5 rounded-full font-mono ${active ? 'bg-white/20 text-white' : 'bg-background text-muted'}`}>
                    {count}
                </span>
            )}
        </button>
    );
}

/** Small uppercase caption in front of a chip group / sheet section. */
function GroupLabel({ icon, children, className = '' }: { icon: ReactNode; children: ReactNode; className?: string }) {
    return (
        <span className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted flex-shrink-0 ${className}`}>
            {icon}
            {children}
        </span>
    );
}

/** Picker values are "YYYY-MM-DDT00:00" — show them as "1 Oct" in chips. */
function formatRange(from: string, to: string) {
    return `${from ? formatShortDate(from.split('T')[0]) : '…'} – ${to ? formatShortDate(to.split('T')[0]) : '…'}`;
}

export default function FilterBar({
    enrollments,
    enrollmentCount,
    filteredCount,
    searchQuery,
    setSearchQuery,
    setEnrollModalOpen,
    selectedCourse,
    setSelectedCourse,
    uniqueCourses,
    selectedVariant,
    setSelectedVariant,
    uniqueVariants,
    selectedCourseDate,
    setSelectedCourseDate,
    availableCourseDates,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    courseDateFrom,
    setCourseDateFrom,
    courseDateTo,
    setCourseDateTo,
    sortOrder,
    setSortOrder,
}: FilterBarProps) {
    const [showRanges, setShowRanges] = useState(false);
    const [sheetOpen, setSheetOpen] = useState(false);

    const hasCreatedRange = !!(dateFrom || dateTo);
    const hasCourseRange = !!(courseDateFrom || courseDateTo);
    const rangeCount = (hasCreatedRange ? 1 : 0) + (hasCourseRange ? 1 : 0);
    const isFiltered = filteredCount < enrollmentCount;
    // Language chips only help when there is something to choose between (or one is already picked)
    const showLanguages = selectedCourse !== 'all' && (uniqueVariants.length > 1 || selectedVariant !== 'all');
    const datesTotal = availableCourseDates.reduce((sum, d) => sum + d.count, 0);

    const selectCourse = (id: string) => {
        setSelectedCourse(id === selectedCourse ? 'all' : id);
        setSelectedVariant('all');
    };
    const clearCreatedRange = () => { setDateFrom(''); setDateTo(''); };
    const clearCourseRange = () => { setCourseDateFrom(''); setCourseDateTo(''); };

    // Search is left alone: it has its own × inside the field
    const clearFilters = () => {
        setSelectedCourse('all');
        setSelectedVariant('all');
        setSelectedCourseDate('all');
        clearCreatedRange();
        clearCourseRange();
    };

    const activeFilters: { id: string; label: string; value: string; onRemove: () => void }[] = [];
    if (selectedCourse !== 'all') {
        activeFilters.push({
            id: 'course',
            label: 'Course',
            value: uniqueCourses.find(c => c.id === selectedCourse)?.name || 'Course',
            onRemove: () => selectCourse(selectedCourse),
        });
    }
    if (selectedVariant !== 'all') {
        activeFilters.push({ id: 'variant', label: 'Language', value: selectedVariant, onRemove: () => setSelectedVariant('all') });
    }
    if (selectedCourseDate !== 'all') {
        activeFilters.push({ id: 'courseDate', label: 'Date', value: formatDayDateShort(selectedCourseDate), onRemove: () => setSelectedCourseDate('all') });
    }
    if (hasCreatedRange) {
        activeFilters.push({ id: 'createdDate', label: 'Created', value: formatRange(dateFrom, dateTo), onRemove: clearCreatedRange });
    }
    if (hasCourseRange) {
        activeFilters.push({ id: 'courseDateRange', label: 'Course dates', value: formatRange(courseDateFrom, courseDateTo), onRemove: clearCourseRange });
    }
    const rangeFilters = activeFilters.filter(f => f.id === 'createdDate' || f.id === 'courseDateRange');

    const renderFilterChip = (filter: typeof activeFilters[number]) => (
        <span
            key={filter.id}
            className="inline-flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-full bg-brand-500/10 border border-brand-500/30 text-xs whitespace-nowrap flex-shrink-0"
        >
            <span className="text-muted text-[11px]">{filter.label}:</span>
            <span className="font-semibold text-primary max-w-[160px] truncate">{filter.value}</span>
            <button
                type="button"
                onClick={filter.onRemove}
                aria-label={`Remove ${filter.label} filter`}
                className="p-1 rounded-full text-muted hover:text-danger hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
            >
                <X size={12} />
            </button>
        </span>
    );

    const renderRangePickers = (stacked: boolean) => {
        const pair = `flex ${stacked ? 'flex-col' : 'flex-row items-center'} gap-2`;
        const dash = !stacked && <span className="text-muted/45 text-xs">—</span>;
        return (
            <>
                <div className={stacked ? 'space-y-1.5' : 'flex items-center gap-2'}>
                    <GroupLabel icon={<Calendar size={12} />}>Created</GroupLabel>
                    <div className={pair}>
                        <DateCalendarPicker label="From" value={dateFrom} onChange={setDateFrom} placeholder="Start date"
                            enrollments={enrollments} selectedCourse={selectedCourse} limitDate={dateTo} isEndDate={false} dateField="created_at" />
                        {dash}
                        <DateCalendarPicker label="To" value={dateTo} onChange={setDateTo} placeholder="End date"
                            enrollments={enrollments} selectedCourse={selectedCourse} limitDate={dateFrom} isEndDate={true} dateField="created_at" />
                    </div>
                </div>
                <div className={stacked ? 'space-y-1.5' : 'flex items-center gap-2'}>
                    <GroupLabel icon={<GraduationCap size={12} />}>Course date</GroupLabel>
                    <div className={pair}>
                        <DateCalendarPicker label="From" value={courseDateFrom} onChange={setCourseDateFrom} placeholder="Start date"
                            enrollments={enrollments} selectedCourse={selectedCourse} limitDate={courseDateTo} isEndDate={false} dateField="confirmed_date" />
                        {dash}
                        <DateCalendarPicker label="To" value={courseDateTo} onChange={setCourseDateTo} placeholder="End date"
                            enrollments={enrollments} selectedCourse={selectedCourse} limitDate={courseDateFrom} isEndDate={true} dateField="confirmed_date" />
                    </div>
                </div>
            </>
        );
    };

    const renderLanguageChips = (size: 'sm' | 'lg') => (
        <>
            {uniqueVariants.length > 1 && (
                <Chip tone="violet" size={size} active={selectedVariant === 'all'} onClick={() => setSelectedVariant('all')}>All</Chip>
            )}
            {uniqueVariants.map(v => (
                <Chip key={v} tone="violet" size={size} active={selectedVariant === v} onClick={() => setSelectedVariant(v === selectedVariant ? 'all' : v)}>
                    {v}
                </Chip>
            ))}
        </>
    );

    const renderDateChips = (size: 'sm' | 'lg') => (
        <>
            <Chip tone="emerald" size={size} active={selectedCourseDate === 'all'} count={datesTotal} onClick={() => setSelectedCourseDate('all')}>
                All dates
            </Chip>
            {availableCourseDates.map(({ date, count }) => (
                <Chip
                    key={date}
                    tone="emerald"
                    size={size}
                    active={selectedCourseDate === date}
                    count={count}
                    onClick={() => setSelectedCourseDate(selectedCourseDate === date ? 'all' : date)}
                >
                    {formatDayDateShort(date)}
                </Chip>
            ))}
        </>
    );

    return (
        <div className="filter-bar-container flex-shrink-0 bg-transparent md:bg-surface rounded-none md:rounded-2xl shadow-none md:shadow-card border-0 md:border border-border-subtle p-0 md:p-3 space-y-1.5 md:space-y-2.5">
            {/* Row 1: search + controls + Add */}
            <div className="flex items-center gap-1.5 md:gap-2">
                <div className="relative flex-1 md:flex-none md:w-56 xl:w-80">
                    <Search
                        className={`absolute left-3 top-1/2 -translate-y-1/2 transition-colors ${searchQuery ? 'text-brand-500' : 'text-muted'}`}
                        size={16}
                    />
                    <input
                        type="search"
                        id="search-query"
                        name="searchQuery"
                        data-page-search=""
                        autoComplete="off"
                        enterKeyHint="search"
                        placeholder="Name, email or phone…"
                        onKeyDown={e => {
                            if (e.key === 'Escape' && searchQuery) {
                                e.preventDefault();
                                setSearchQuery('');
                            }
                        }}
                        className={`w-full h-9 pl-9 pr-8 bg-surface-elevated border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 focus:bg-background transition-all placeholder:text-muted/60 text-primary [&::-webkit-search-cancel-button]:hidden ${
                            searchQuery ? 'border-brand-400' : 'border-border-strong'
                        }`}
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            onClick={() => setSearchQuery('')}
                            aria-label="Clear search"
                            className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 text-muted hover:text-primary transition-colors"
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>

                {/* Mobile: every filter lives in one bottom sheet */}
                <button
                    type="button"
                    onClick={() => setSheetOpen(true)}
                    aria-label="Open filters"
                    className={`md:hidden inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border text-xs font-semibold transition-all active:scale-95 flex-shrink-0 ${
                        activeFilters.length > 0
                            ? 'bg-brand-500/15 text-brand-600 dark:text-brand-400 border-brand-500/40'
                            : 'bg-surface-elevated text-muted border-border-strong'
                    }`}
                >
                    <SlidersHorizontal size={14} />
                    <span>Filters</span>
                    {activeFilters.length > 0 && (
                        <span className="min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-brand-500 text-white text-[10px] font-bold">
                            {activeFilters.length}
                        </span>
                    )}
                </button>

                {/* Desktop: date ranges toggle + sort */}
                <button
                    type="button"
                    onClick={() => setShowRanges(v => !v)}
                    aria-expanded={showRanges}
                    aria-label="Date range filters"
                    title="Filter by created / course date range"
                    className={`hidden md:inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border text-xs font-semibold transition-all active:scale-95 flex-shrink-0 ${
                        showRanges || rangeCount > 0
                            ? 'bg-brand-500/15 text-brand-600 dark:text-brand-400 border-brand-500/40'
                            : 'bg-surface-elevated text-muted border-border-strong hover:text-primary hover:border-brand-500'
                    }`}
                >
                    <CalendarRange size={14} />
                    <span className="hidden xl:inline">Date range</span>
                    {rangeCount > 0 && (
                        <span className="min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-brand-500 text-white text-[10px] font-bold">
                            {rangeCount}
                        </span>
                    )}
                </button>

                <label className="hidden md:inline-flex items-center gap-1.5 h-9 pl-3 pr-1 rounded-xl border border-border-strong bg-surface-elevated text-xs text-muted flex-shrink-0 focus-within:border-brand-500">
                    <ArrowDownUp size={13} />
                    <span className="sr-only">Sort</span>
                    <select
                        value={sortOrder}
                        onChange={e => setSortOrder(e.target.value as SortOrder)}
                        className="bg-transparent text-xs font-semibold text-primary pr-1 focus:outline-none cursor-pointer"
                    >
                        {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                </label>

                {/* Ranges are hidden behind the toggle — keep them visible as chips while it's closed */}
                {!showRanges && rangeFilters.length > 0 && (
                    <div className="hidden md:flex items-center gap-1.5 min-w-0 overflow-x-auto scrollbar-none">
                        {rangeFilters.map(renderFilterChip)}
                    </div>
                )}

                <div className="hidden md:flex items-center gap-2 ml-auto flex-shrink-0">
                    <span className="text-xs text-muted whitespace-nowrap" aria-live="polite">
                        {isFiltered ? (
                            <><span className="font-mono font-bold text-primary">{filteredCount}</span> of <span className="font-mono">{enrollmentCount}</span></>
                        ) : (
                            <><span className="font-mono font-bold text-primary">{enrollmentCount}</span> total</>
                        )}
                    </span>
                    {activeFilters.length > 0 && (
                        <button type="button" onClick={clearFilters} aria-label="Clear filters" className={buttonCls('danger-soft', 'sm')}>
                            <X size={13} />
                            Clear<span className="hidden xl:inline"> filters</span>
                        </button>
                    )}
                </div>

                <CustomTooltip content="Enroll a student">
                    <button
                        type="button"
                        onClick={() => setEnrollModalOpen(true)}
                        aria-label="Add enrollment"
                        className={buttonCls('primary', 'md', 'h-9 w-9 md:w-auto px-0 md:px-4 text-sm flex-shrink-0')}
                    >
                        <UserPlus size={16} />
                        <span className="hidden md:inline">Add</span>
                    </button>
                </CustomTooltip>
            </div>

            {/* Mobile: what's applied, removable in one tap */}
            {activeFilters.length > 0 && (
                <div className="md:hidden flex items-center gap-1.5 overflow-x-auto scrollbar-none -mx-2 px-2 sm:mx-0 sm:px-0">
                    {activeFilters.map(renderFilterChip)}
                    <button
                        type="button"
                        onClick={clearFilters}
                        className="text-[11px] font-semibold text-danger px-2 py-1 whitespace-nowrap flex-shrink-0"
                    >
                        Clear all
                    </button>
                </div>
            )}

            {/* Desktop row 2: courses */}
            <div className="hidden md:flex flex-wrap gap-1.5 items-center">
                <Chip active={selectedCourse === 'all'} onClick={() => selectCourse('all')}>All courses</Chip>
                {uniqueCourses.map(c => (
                    <Chip key={c.id} active={selectedCourse === c.id} onClick={() => selectCourse(c.id)}>{c.name}</Chip>
                ))}
            </div>

            {/* Desktop row 3: language + upcoming course dates, one line */}
            {(showLanguages || availableCourseDates.length > 0) && (
                <div className="hidden md:flex items-center gap-1.5 overflow-x-auto scrollbar-none">
                    {showLanguages && (
                        <>
                            <GroupLabel icon={<Globe size={12} />} className="mr-0.5">Language</GroupLabel>
                            {renderLanguageChips('sm')}
                        </>
                    )}
                    {showLanguages && availableCourseDates.length > 0 && <div className="h-4 w-px bg-border-strong mx-1.5 flex-shrink-0" />}
                    {availableCourseDates.length > 0 && (
                        <>
                            <GroupLabel icon={<Calendar size={12} />} className="mr-0.5 text-status-confirmed">Dates</GroupLabel>
                            {renderDateChips('sm')}
                        </>
                    )}
                </div>
            )}

            {/* Desktop: date range pickers */}
            {showRanges && (
                <div className="hidden md:flex flex-wrap items-center gap-x-5 gap-y-2 p-2.5 bg-surface-elevated/60 border border-border-subtle rounded-xl animate-slideDown">
                    {renderRangePickers(false)}
                </div>
            )}

            {/* Mobile filter sheet */}
            <Modal
                open={sheetOpen}
                onClose={() => setSheetOpen(false)}
                title="Filters"
                subtitle={isFiltered ? `${filteredCount} of ${enrollmentCount} enrollments` : `${enrollmentCount} enrollments`}
                icon={SlidersHorizontal}
                sheetOnMobile
                labelId="enrollment-filters-title"
                bodyClassName="space-y-5"
                footer={
                    <>
                        {activeFilters.length > 0 && (
                            <button type="button" onClick={clearFilters} className="h-10 px-4 text-sm font-semibold text-danger rounded-xl hover:bg-danger/10 transition-colors">
                                Clear all
                            </button>
                        )}
                        <button type="button" onClick={() => setSheetOpen(false)} className={buttonCls('primary', 'lg', 'flex-1 sm:flex-none')}>
                            Show {filteredCount} {filteredCount === 1 ? 'result' : 'results'}
                        </button>
                    </>
                }
            >
                <section className="space-y-2">
                    <GroupLabel icon={<GraduationCap size={12} />}>Course</GroupLabel>
                    <div className="flex flex-wrap gap-1.5">
                        <Chip size="lg" active={selectedCourse === 'all'} onClick={() => selectCourse('all')}>All courses</Chip>
                        {uniqueCourses.map(c => (
                            <Chip key={c.id} size="lg" active={selectedCourse === c.id} onClick={() => selectCourse(c.id)}>{c.name}</Chip>
                        ))}
                    </div>
                </section>

                {showLanguages && (
                    <section className="space-y-2">
                        <GroupLabel icon={<Globe size={12} />}>Language</GroupLabel>
                        <div className="flex flex-wrap gap-1.5">{renderLanguageChips('lg')}</div>
                    </section>
                )}

                {availableCourseDates.length > 0 && (
                    <section className="space-y-2">
                        <GroupLabel icon={<Calendar size={12} />} className="text-status-confirmed">Upcoming dates</GroupLabel>
                        <div className="flex flex-wrap gap-1.5">{renderDateChips('lg')}</div>
                    </section>
                )}

                <section className="space-y-2">
                    <GroupLabel icon={<ArrowDownUp size={12} />}>Sort</GroupLabel>
                    <div className="grid grid-cols-3 gap-1 p-1 bg-surface-elevated rounded-xl border border-border-subtle">
                        {SORT_OPTIONS.map(o => (
                            <button
                                key={o.value}
                                type="button"
                                onClick={() => setSortOrder(o.value)}
                                aria-pressed={sortOrder === o.value}
                                className={`py-2 text-xs font-semibold rounded-lg transition-all ${
                                    sortOrder === o.value ? 'bg-brand-500 text-white shadow-sm' : 'text-muted'
                                }`}
                            >
                                {o.label}
                            </button>
                        ))}
                    </div>
                </section>

                <section className="space-y-4">{renderRangePickers(true)}</section>
            </Modal>
        </div>
    );
}
