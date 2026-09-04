import { useState } from 'react';
import { GraduationCap, Search, X, UserPlus, Globe, Filter, ArrowUpDown, SlidersHorizontal, Clock, ArrowDownUp, CaseSensitive, Calendar, ChevronDown } from 'lucide-react';
import { ALL_STATUSES, SECONDARY_STATUSES, STATUS_CONFIG } from '../../lib/statusConfig';
import { formatDayDateShort } from '../../lib/dateUtils';
import DateCalendarPicker from './DateCalendarPicker';
import type { EnrollmentRow } from '../../hooks/useEnrollments';
import { CustomTooltip } from '../ui/Tooltip';

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
    sortOrder: 'date-asc' | 'date-desc' | 'name';
    setSortOrder: React.Dispatch<React.SetStateAction<'date-asc' | 'date-desc' | 'name'>>;
    statusCounts: Record<string, number>;
    /** Called when user clicks a status badge — used to scroll to that column */
    onStatusBadgeClick?: (status: string) => void;
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
    statusCounts,
    onStatusBadgeClick,
}: FilterBarProps) {
    const hasNonSearchFilters = selectedCourse !== 'all' || selectedVariant !== 'all' || selectedCourseDate !== 'all' || dateFrom || dateTo || courseDateFrom || courseDateTo;
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    // п.15: search is "active" when it filters results
    const searchIsFiltering = !!searchQuery && filteredCount < enrollmentCount;

    const clearAll = () => {
        setSearchQuery('');
        setSelectedCourse('all');
        setSelectedVariant('all');
        setSelectedCourseDate('all');
        setDateFrom('');
        setDateTo('');
        setCourseDateFrom('');
        setCourseDateTo('');
    };

    const activeFilters: { id: string; label: string; value: string; onRemove: () => void }[] = [];

    if (searchQuery.trim()) {
        activeFilters.push({
            id: 'search',
            label: 'Search',
            value: `"${searchQuery.trim()}"`,
            onRemove: () => setSearchQuery(''),
        });
    }

    if (selectedCourse !== 'all') {
        const courseName = uniqueCourses.find(c => c.id === selectedCourse)?.name || 'Course';
        activeFilters.push({
            id: 'course',
            label: 'Course',
            value: courseName,
            onRemove: () => {
                setSelectedCourse('all');
                setSelectedVariant('all');
            },
        });
    }

    if (selectedVariant !== 'all') {
        activeFilters.push({
            id: 'variant',
            label: 'Language',
            value: selectedVariant,
            onRemove: () => setSelectedVariant('all'),
        });
    }

    if (selectedCourseDate !== 'all') {
        activeFilters.push({
            id: 'courseDate',
            label: 'Date',
            value: formatDayDateShort(selectedCourseDate),
            onRemove: () => setSelectedCourseDate('all'),
        });
    }

    if (dateFrom || dateTo) {
        activeFilters.push({
            id: 'createdDate',
            label: 'Created',
            value: `${dateFrom || '...'} – ${dateTo || '...'}`,
            onRemove: () => {
                setDateFrom('');
                setDateTo('');
            },
        });
    }

    if (courseDateFrom || courseDateTo) {
        activeFilters.push({
            id: 'courseDateRange',
            label: 'Course Range',
            value: `${courseDateFrom || '...'} – ${courseDateTo || '...'}`,
            onRemove: () => {
                setCourseDateFrom('');
                setCourseDateTo('');
            },
        });
    }

    return (
        <div className="filter-bar-container bg-transparent md:bg-surface rounded-none md:rounded-2xl shadow-none md:shadow-card border-0 md:border border-border-subtle p-0 md:p-4 space-y-2">
            {/* Row 1: Title + Search + Filter Toggle (Mobile) + Add */}
            <div className="flex flex-col sm:flex-row gap-1.5 md:gap-3 items-start sm:items-center justify-between">
                <div className="hidden md:flex items-center gap-3">
                    <div className="p-2 bg-brand-500/10 rounded-xl text-brand-500 dark:text-brand-400">
                        <GraduationCap size={20} />
                    </div>
                    <div className="flex items-center gap-2">
                        <h2 className="text-lg font-bold text-primary tracking-tight">Enrollments</h2>
                        <span className="text-xs font-mono font-bold text-brand-600 dark:text-brand-400 bg-brand-500/10 px-2.5 py-0.5 rounded-full">
                            {enrollmentCount}
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-1.5 md:gap-3 w-full sm:w-auto">
                    {/* Search with active-filter highlight + Clear × inside */}
                    <div className="relative flex-1 sm:w-72">
                        <Search
                            className={`absolute left-3 top-1/2 -translate-y-1/2 transition-colors ${searchIsFiltering ? 'text-brand-500' : 'text-muted'}`}
                            size={16}
                        />
                        <input
                            type="text"
                            id="search-query"
                            name="searchQuery"
                            placeholder="Search by name, email or phone..."
                            className={`w-full pl-8 py-1.5 md:py-2.5 bg-surface-elevated border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 focus:bg-background transition-all placeholder:text-muted/60 text-primary ${
                                searchIsFiltering
                                    ? 'border-brand-400 pr-24'
                                    : searchQuery
                                        ? 'border-border-strong pr-8'
                                        : 'border-border-strong pr-3'
                            }`}
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                        {/* п.15: "Showing X of Y" badge inside search field */}
                        {searchIsFiltering && (
                            <span className="absolute right-8 top-1/2 -translate-y-1/2 text-[10px] font-bold text-brand-600 dark:text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded-full whitespace-nowrap pointer-events-none">
                                {filteredCount} of {enrollmentCount}
                            </span>
                        )}
                        {searchQuery && (
                            <CustomTooltip content="Clear search">
                                <button
                                    onClick={() => setSearchQuery('')}
                                    aria-label="Clear search"
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-primary transition-colors"
                                >
                                    <X size={14} />
                                </button>
                            </CustomTooltip>
                        )}
                    </div>

                    {/* Mobile menu toggle button with arrow */}
                    <CustomTooltip content={mobileMenuOpen ? 'Hide filter options' : 'Show filter options'}>
                        <button
                            type="button"
                            onClick={() => setMobileMenuOpen(prev => !prev)}
                            className={`md:hidden flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition-all active:scale-95 whitespace-nowrap ${
                                mobileMenuOpen || hasNonSearchFilters
                                    ? 'bg-brand-500/15 text-brand-600 dark:text-brand-400 border-brand-500/40 shadow-xs'
                                    : 'bg-surface-elevated text-muted border-border-strong hover:text-primary'
                            }`}
                            title={mobileMenuOpen ? 'Hide filter options' : 'Show filter options'}
                            aria-label={mobileMenuOpen ? 'Hide filter options' : 'Show filter options'}
                        >
                            <SlidersHorizontal size={13} />
                            {hasNonSearchFilters && (
                                <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
                            )}
                            <ChevronDown size={14} className={`transition-transform duration-200 ${mobileMenuOpen ? 'rotate-180' : ''}`} />
                        </button>
                    </CustomTooltip>

                    {/* Clear all filters × button — only when non-search filters active */}
                    {hasNonSearchFilters && (
                        <CustomTooltip content="Clear all filters">
                            <button
                                onClick={clearAll}
                                aria-label="Clear all filters"
                                className="flex items-center gap-1 text-[11px] font-medium text-danger hover:text-danger/80 bg-danger/10 hover:bg-danger/15 px-2 py-1.5 rounded-xl transition-all active:scale-95 whitespace-nowrap"
                            >
                                <X size={12} />
                                <span className="hidden sm:inline">Clear</span>
                            </button>
                        </CustomTooltip>
                    )}

                    <button
                        onClick={() => setEnrollModalOpen(true)}
                        className="flex items-center justify-center gap-1.5 px-3 py-1.5 md:px-4 md:py-2.5 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-xl transition-all shadow-sm hover:shadow-brand-500/25 active:scale-[0.98] whitespace-nowrap"
                    >
                        <UserPlus size={16} />
                        <span className="hidden sm:inline">Add</span>
                    </button>
                </div>
            </div>


            {/* Collapsible Filters Container (always visible on desktop, toggled by arrow on mobile) */}
            <div className={`${mobileMenuOpen ? 'block' : 'hidden md:block'} space-y-2 transition-all`}>
                {/* Row 2: Course chips */}
                <div className="flex overflow-x-auto md:flex-wrap gap-1.5 items-center scrollbar-none -mx-3 px-3 sm:mx-0 sm:px-0 pt-1">
                    <button
                        onClick={() => {
                            setSelectedCourse('all');
                            setSelectedVariant('all');
                        }}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-full border whitespace-nowrap flex-shrink-0 transition-all ${selectedCourse === 'all'
                            ? 'bg-brand-500 text-white border-brand-500 shadow-sm'
                            : 'bg-surface-elevated text-muted border-border-strong hover:border-brand-500 hover:text-brand-500'
                            }`}
                    >
                        All Courses
                    </button>
                    {uniqueCourses.map(c => (
                        <button
                            key={c.id}
                            onClick={() => {
                                const newCourse = c.id === selectedCourse ? 'all' : c.id;
                                setSelectedCourse(newCourse);
                                setSelectedVariant('all');
                            }}
                            className={`px-2.5 py-1 text-xs font-semibold rounded-full border whitespace-nowrap flex-shrink-0 transition-all ${selectedCourse === c.id
                                ? 'bg-brand-500 text-white border-brand-500 shadow-sm'
                                : 'bg-surface-elevated text-muted border-border-strong hover:border-brand-500 hover:text-brand-500'
                                }`}
                        >
                            {c.name}
                        </button>
                    ))}
                </div>

                {/* Row 2.5: Language chips below courses */}
                {selectedCourse !== 'all' && uniqueVariants.length > 0 && (
                    <div className="flex overflow-x-auto md:flex-wrap gap-1.5 items-center scrollbar-none -mx-3 px-3 sm:mx-0 sm:px-0 py-1.5 border-t border-border-subtle/30 mt-1">
                        <CustomTooltip content="Language filter">
                            <div className="flex items-center text-muted mr-1 flex-shrink-0 cursor-default" aria-label="Language filter">
                                <Globe size={14} className="text-muted/70 flex-shrink-0" />
                            </div>
                        </CustomTooltip>
                        {uniqueVariants.length > 1 && (
                            <button
                                onClick={() => setSelectedVariant('all')}
                                className={`px-2.5 py-1 text-xs font-semibold rounded-full border whitespace-nowrap flex-shrink-0 transition-all ${selectedVariant === 'all'
                                    ? 'bg-violet-500 text-white border-violet-500 shadow-sm'
                                    : 'bg-surface-elevated text-muted border-border-strong hover:border-violet-500 hover:text-violet-500 dark:hover:text-violet-400'
                                    }`}
                            >
                                All
                            </button>
                        )}
                        {uniqueVariants.map(v => (
                            <button
                                key={v}
                                onClick={() => setSelectedVariant(v === selectedVariant ? 'all' : v)}
                                className={`px-2.5 py-1 text-xs font-semibold rounded-full border whitespace-nowrap flex-shrink-0 transition-all ${selectedVariant === v
                                    ? 'bg-violet-500 text-white border-violet-500 shadow-sm'
                                    : 'bg-surface-elevated text-muted border-border-strong hover:border-violet-500 hover:text-violet-500 dark:hover:text-violet-400'
                                    }`}
                            >
                                {v}
                            </button>
                        ))}
                    </div>
                )}

                {/* Row 2.8: Course Date chips (convenient 1-tap filtering for Mobile & Desktop) */}
                {availableCourseDates.length > 0 && (
                    <div className="flex overflow-x-auto items-center gap-1.5 scrollbar-none -mx-3 px-3 sm:mx-0 sm:px-0 py-1.5 border-t border-border-subtle/30 mt-1 animate-fadeIn">
                        <div className="flex items-center gap-1 text-muted mr-1 text-xs font-semibold flex-shrink-0">
                            <Calendar size={13} className="text-emerald-500 flex-shrink-0" />
                            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                                Dates:
                            </span>
                        </div>

                        <button
                            type="button"
                            onClick={() => setSelectedCourseDate('all')}
                            className={`px-2.5 py-1 text-xs font-bold rounded-xl border whitespace-nowrap flex-shrink-0 transition-all flex items-center gap-1.5 ${
                                selectedCourseDate === 'all'
                                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                                    : 'bg-surface-elevated text-muted border-border-strong hover:border-emerald-500/50 hover:text-primary'
                            }`}
                        >
                            <span>All Dates</span>
                            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                                selectedCourseDate === 'all' ? 'bg-white/20 text-white' : 'bg-background text-muted'
                            }`}>
                                {availableCourseDates.reduce((sum, d) => sum + d.count, 0)}
                            </span>
                        </button>

                        {availableCourseDates.map(({ date, count }) => {
                            const isActive = selectedCourseDate === date;
                            return (
                                <button
                                    key={date}
                                    type="button"
                                    onClick={() => setSelectedCourseDate(isActive ? 'all' : date)}
                                    className={`px-2.5 py-1 text-xs font-semibold rounded-xl border whitespace-nowrap flex-shrink-0 transition-all flex items-center gap-1.5 ${
                                        isActive
                                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                                            : 'bg-surface-elevated text-muted border-border-strong hover:border-emerald-500/50 hover:text-primary'
                                    }`}
                                >
                                    <span>{formatDayDateShort(date)}</span>
                                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                                        isActive ? 'bg-white/20 text-white' : 'bg-background text-muted'
                                    }`}>
                                        {count}
                                    </span>
                                </button>
                            );
                        })}

                        {/* Quick Range / Advanced toggle button */}
                        <CustomTooltip content="Custom Date Range & Advanced Filters">
                            <button
                                type="button"
                                onClick={() => setShowAdvanced(prev => !prev)}
                                aria-label="Custom Date Range & Advanced Filters"
                                className={`px-2 py-1 text-[11px] font-semibold rounded-xl border whitespace-nowrap flex-shrink-0 transition-all flex items-center gap-1 ${
                                    showAdvanced || (dateFrom || dateTo || courseDateFrom || courseDateTo)
                                        ? 'bg-brand-500/15 text-brand-600 dark:text-brand-400 border-brand-500/40'
                                        : 'bg-surface-elevated text-muted border-border-strong hover:text-primary hover:border-brand-500'
                                }`}
                            >
                                <SlidersHorizontal size={11} />
                                <span className="hidden sm:inline">Range</span>
                                {(dateFrom || dateTo || courseDateFrom || courseDateTo) && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-brand-500 ml-0.5" />
                                )}
                            </button>
                        </CustomTooltip>
                    </div>
                )}
            </div>

            {/* Advanced Filters Panel */}
            {showAdvanced && (
                <div className="p-3 bg-surface-elevated border border-border-strong rounded-xl animate-slideDown flex flex-wrap gap-3 items-center">
                    {/* Sort pills */}
                    <div className="flex items-center gap-1.5">
                        <div className="flex items-center gap-1 text-muted mr-0.5">
                            <ArrowDownUp size={12} />
                            <span className="text-[10px] font-medium uppercase tracking-wider">Sort:</span>
                        </div>
                        {([
                            { value: 'date-asc', label: 'Oldest first', icon: <Clock size={10} /> },
                            { value: 'date-desc', label: 'Newest first', icon: <ArrowUpDown size={10} /> },
                            { value: 'name', label: 'By Name', icon: <CaseSensitive size={10} /> },
                        ] as const).map(opt => (
                            <button
                                key={opt.value}
                                onClick={() => setSortOrder(opt.value)}
                                className={`flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-all active:scale-95 ${
                                    sortOrder === opt.value
                                        ? 'bg-brand-500 text-white border-brand-500 shadow-sm'
                                        : 'bg-surface text-muted border-border-strong hover:border-brand-500 hover:text-brand-500'
                                }`}
                            >
                                {opt.icon}
                                {opt.label}
                            </button>
                        ))}
                    </div>

                    <div className="h-4 w-px bg-border-strong hidden sm:block" />

                    {/* Created Date range */}
                    <div className="flex items-center gap-1.5 text-muted">
                        <Filter size={12} />
                        <span className="text-[10px] font-medium uppercase tracking-wider">Created:</span>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <DateCalendarPicker
                            label="From"
                            value={dateFrom}
                            onChange={setDateFrom}
                            placeholder="Select start date"
                            enrollments={enrollments}
                            selectedCourse={selectedCourse}
                            limitDate={dateTo}
                            isEndDate={false}
                            dateField="created_at"
                        />
                        <span className="text-muted/45 text-xs hidden sm:inline">—</span>
                        <DateCalendarPicker
                            label="To"
                            value={dateTo}
                            onChange={setDateTo}
                            placeholder="Select end date"
                            enrollments={enrollments}
                            selectedCourse={selectedCourse}
                            limitDate={dateFrom}
                            isEndDate={true}
                            dateField="created_at"
                        />
                    </div>

                    <div className="h-4 w-px bg-border-strong hidden sm:block" />

                    {/* Course Date range */}
                    <div className="flex items-center gap-1.5 text-muted">
                        <Calendar size={12} />
                        <span className="text-[10px] font-medium uppercase tracking-wider">Course Date:</span>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <DateCalendarPicker
                            label="From"
                            value={courseDateFrom}
                            onChange={setCourseDateFrom}
                            placeholder="Course start date"
                            enrollments={enrollments}
                            selectedCourse={selectedCourse}
                            limitDate={courseDateTo}
                            isEndDate={false}
                            dateField="confirmed_date"
                        />
                        <span className="text-muted/45 text-xs hidden sm:inline">—</span>
                        <DateCalendarPicker
                            label="To"
                            value={courseDateTo}
                            onChange={setCourseDateTo}
                            placeholder="Course end date"
                            enrollments={enrollments}
                            selectedCourse={selectedCourse}
                            limitDate={courseDateFrom}
                            isEndDate={true}
                            dateField="confirmed_date"
                        />
                    </div>
                </div>
            )}

            {/* Active Filter Chips Strip (Desktop & Mobile) */}
            {activeFilters.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap pt-2 pb-0.5 border-t border-border-subtle/50 text-xs animate-fadeIn">
                    <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-muted flex-shrink-0 flex items-center gap-1 mr-1">
                        <Filter size={11} className="text-brand-500" />
                        Applied ({activeFilters.length}):
                    </span>

                    {activeFilters.map(filter => (
                        <span
                            key={filter.id}
                            className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-0.5 rounded-full bg-surface-elevated border border-border-strong text-xs font-medium text-primary shadow-2xs group hover:border-brand-500/50 transition-all"
                        >
                            <span className="text-muted font-normal text-[11px]">{filter.label}:</span>
                            <span className="font-semibold text-primary max-w-[160px] truncate">{filter.value}</span>
                            <button
                                type="button"
                                onClick={filter.onRemove}
                                aria-label={`Remove ${filter.label} filter`}
                                className="p-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 text-muted hover:text-danger transition-colors cursor-pointer"
                            >
                                <X size={12} />
                            </button>
                        </span>
                    ))}

                    <button
                        type="button"
                        onClick={clearAll}
                        className="text-[11px] font-semibold text-danger hover:text-danger/80 hover:underline px-2 py-0.5 rounded-lg transition-colors ml-auto sm:ml-1 cursor-pointer"
                    >
                        Clear all
                    </button>
                </div>
            )}

            {/* Row 3 (bottom): Advanced Filters icon + Hide Past toggle + Status Summary Bar */}
            <div className="hidden md:flex overflow-x-auto md:flex-wrap gap-1.5 items-center scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0">
                {/* counter */}
                {!searchIsFiltering && (
                    <span className="text-[10px] font-mono text-muted font-medium tracking-wide mr-1">
                        {filteredCount}<span className="opacity-40">/</span>{enrollmentCount}
                    </span>
                )}

                <div className="h-3.5 w-px bg-border-strong" />

                {/* Advanced Filters — compact icon pill matching status badges */}
                <CustomTooltip content="Advanced Filters">
                    <button
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        aria-label="Advanced Filters"
                        className={`inline-flex items-center gap-1 text-[10px] md:text-[11px] font-semibold tracking-wider uppercase px-2 py-1 md:px-2.5 md:py-1.5 rounded-lg border transition-all hover:scale-105 hover:shadow-sm active:scale-95 ${
                            showAdvanced
                                ? 'bg-brand-500/15 text-brand-600 dark:text-brand-400 border-brand-500/40'
                                : 'bg-surface-elevated text-muted border-border-strong hover:border-brand-500 hover:text-brand-500'
                        }`}
                    >
                        <SlidersHorizontal size={11} />
                        <span>Filters</span>
                        {(dateFrom || dateTo || courseDateFrom || courseDateTo) && (
                            <span className="w-1.5 h-1.5 rounded-full bg-brand-500 ml-0.5" />
                        )}
                    </button>
                </CustomTooltip>

                <div className="h-3.5 w-px bg-border-strong" />

                {ALL_STATUSES.map(status => {
                    const cfg = STATUS_CONFIG[status];
                    const count = statusCounts[status] || 0;
                    if (count === 0 && SECONDARY_STATUSES.includes(status as typeof SECONDARY_STATUSES[number])) return null;
                    return (
                        <CustomTooltip key={status} content={`Scroll to ${cfg.label} column`}>
                            <button
                                onClick={() => onStatusBadgeClick?.(status)}
                                aria-label={`Scroll to ${cfg.label} column`}
                                className={`inline-flex items-center gap-1 md:gap-1.5 text-[10px] md:text-[11px] font-semibold tracking-wider uppercase px-2 py-1 md:px-2.5 md:py-1.5 rounded-lg ${cfg.bg} ${cfg.color} ${cfg.border} border transition-all hover:scale-105 hover:shadow-sm active:scale-95 cursor-pointer`}
                            >
                                {cfg.icon}
                                <span>{cfg.label}</span>
                                <span className="font-mono bg-black/15 dark:bg-white/10 text-primary px-1 py-0.5 md:px-1.5 md:py-0.5 rounded ml-0.5 shadow-sm">{count}</span>
                            </button>
                        </CustomTooltip>
                    );
                })}
            </div>
        </div>
    );
}
