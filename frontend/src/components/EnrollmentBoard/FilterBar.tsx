import { useState } from 'react';
import { GraduationCap, Search, X, Plus, Globe, Filter, Calendar, ArrowUpDown, SlidersHorizontal } from 'lucide-react';
import { ALL_STATUSES, SECONDARY_STATUSES, STATUS_CONFIG } from '../../lib/statusConfig';

interface FilterBarProps {
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
    dateFrom: string;
    setDateFrom: (d: string) => void;
    dateTo: string;
    setDateTo: (d: string) => void;
    sortOrder: 'date-asc' | 'date-desc' | 'name';
    setSortOrder: React.Dispatch<React.SetStateAction<'date-asc' | 'date-desc' | 'name'>>;
    statusCounts: Record<string, number>;
    /** Called when user clicks a status badge — used to scroll to that column */
    onStatusBadgeClick?: (status: string) => void;
}

export default function FilterBar({
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
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    sortOrder,
    setSortOrder,
    statusCounts,
    onStatusBadgeClick,
}: FilterBarProps) {
    const hasFilters = searchQuery || selectedCourse !== 'all' || selectedVariant !== 'all' || dateFrom || dateTo;
    const [showAdvanced, setShowAdvanced] = useState(false);

    // п.15: search is "active" when it filters results
    const searchIsFiltering = !!searchQuery && filteredCount < enrollmentCount;

    return (
        <div className="bg-surface rounded-2xl shadow-card border border-border-subtle p-2 md:p-4 space-y-2 md:space-y-3">
            {/* Row 1: Title + Search + Add */}
            <div className="flex flex-col sm:flex-row gap-2 md:gap-3 items-start sm:items-center justify-between">
                <div className="hidden md:flex items-center gap-3">
                    <div className="p-2 bg-brand-500/10 rounded-xl text-brand-500 dark:text-brand-400">
                        <GraduationCap size={20} />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-lg font-bold text-primary tracking-tight">Enrollments</h2>
                            <span className="text-xs font-mono font-bold text-brand-600 dark:text-brand-400 bg-brand-500/10 px-2.5 py-0.5 rounded-full">
                                {enrollmentCount}
                            </span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2 md:gap-3 w-full sm:w-auto">
                    {/* п.15: Search with active-filter highlight */}
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
                            className={`w-full pl-8 py-2 md:py-2.5 bg-surface-elevated border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 focus:bg-background transition-all placeholder:text-muted/60 text-primary ${
                                searchIsFiltering
                                    ? 'border-brand-400 pr-24'
                                    : 'border-border-strong pr-8'
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
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-primary transition-colors"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>
                    <button
                        onClick={() => setEnrollModalOpen(true)}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 md:px-4 md:py-2.5 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-xl transition-all shadow-sm hover:shadow-brand-500/25 active:scale-[0.98] whitespace-nowrap"
                    >
                        <Plus size={16} />
                        <span className="hidden sm:inline">Add</span>
                    </button>
                </div>
            </div>

            {/* Row 2: Course chips */}
            <div className="flex overflow-x-auto md:flex-wrap gap-1.5 items-center scrollbar-none pb-1 -mx-4 px-4 sm:mx-0 sm:px-0">
                <button
                    onClick={() => setSelectedCourse('all')}
                    className={`text-[11px] md:text-xs font-semibold px-2.5 py-1 md:px-3 md:py-1.5 rounded-full border transition-all ${selectedCourse === 'all'
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
                        className={`text-[11px] md:text-xs font-semibold px-2.5 py-1 md:px-3 md:py-1.5 rounded-full border transition-all ${selectedCourse === c.id
                            ? 'bg-brand-500 text-white border-brand-500 shadow-sm'
                            : 'bg-surface-elevated text-muted border-border-strong hover:border-brand-500 hover:text-brand-500'
                            }`}
                    >
                        {c.name}
                    </button>
                ))}
            </div>

            {/* Row 2b: Language chips */}
            {selectedCourse !== 'all' && uniqueVariants.length > 0 && (
                <div className="flex overflow-x-auto md:flex-wrap gap-1.5 items-center scrollbar-none pb-1 -mx-4 px-4 sm:mx-0 sm:px-0">
                    <Globe size={13} className="text-muted mr-0.5" />
                    {uniqueVariants.length > 1 && (
                        <button
                            onClick={() => setSelectedVariant('all')}
                            className={`text-[11px] md:text-xs font-semibold px-2.5 py-1 md:px-3 md:py-1.5 rounded-full border transition-all ${selectedVariant === 'all'
                                ? 'bg-violet-500 text-white border-violet-500 shadow-sm'
                                : 'bg-surface-elevated text-muted border-border-strong hover:border-violet-500 hover:text-violet-500 dark:hover:text-violet-400'
                                }`}
                        >
                            All Languages
                        </button>
                    )}
                    {uniqueVariants.map(v => (
                        <button
                            key={v}
                            onClick={() => setSelectedVariant(v === selectedVariant ? 'all' : v)}
                            className={`text-[11px] md:text-xs font-semibold px-2.5 py-1 md:px-3 md:py-1.5 rounded-full border transition-all ${selectedVariant === v
                                ? 'bg-violet-500 text-white border-violet-500 shadow-sm'
                                : 'bg-surface-elevated text-muted border-border-strong hover:border-violet-500 hover:text-violet-500 dark:hover:text-violet-400'
                                }`}
                        >
                            {v}
                        </button>
                    ))}
                </div>
            )}

            {/* Row 3: Actions + Advanced Toggle */}
            <div className="flex flex-wrap gap-1.5 items-center">
                <button
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className={`flex items-center gap-1 md:gap-1.5 text-[11px] md:text-xs font-medium transition-colors px-2 py-1 md:px-2.5 md:py-1.5 rounded-xl border active:scale-95 ${
                        showAdvanced 
                            ? 'bg-brand-500/10 text-brand-600 border-brand-500/30' 
                            : 'bg-surface-elevated text-muted hover:text-primary border-border-strong'
                    }`}
                >
                    <SlidersHorizontal size={13} />
                    Advanced Filters
                </button>
                {hasFilters && (
                    <button
                        onClick={() => {
                            setSearchQuery('');
                            setSelectedCourse('all');
                            setSelectedVariant('all');
                            setDateFrom('');
                            setDateTo('');
                        }}
                        className="text-[11px] md:text-xs font-medium text-danger hover:text-danger/80 bg-danger/10 px-2 py-1 md:px-3 md:py-1.5 rounded-xl transition-all"
                    >
                        Clear
                    </button>
                )}
                <div className="h-4 w-px bg-border-strong mx-0.5 hidden sm:block"></div>
                <button
                    onClick={() => {
                        setSortOrder(prev => prev === 'date-asc' ? 'date-desc' : prev === 'date-desc' ? 'name' : 'date-asc');
                    }}
                    className="flex items-center gap-1 md:gap-1.5 text-[11px] md:text-xs font-medium text-muted hover:text-primary transition-colors bg-surface-elevated px-2 py-1 md:px-2.5 md:py-1.5 rounded-xl border border-border-strong active:scale-95"
                    title="Toggle Sort Order"
                >
                    <ArrowUpDown size={13} />
                    <span className="hidden sm:inline">
                        {sortOrder === 'date-asc' ? 'Oldest first' : sortOrder === 'date-desc' ? 'Newest first' : 'By Name'}
                    </span>
                    <span className="sm:hidden">
                        {sortOrder === 'date-asc' ? 'Oldest' : sortOrder === 'date-desc' ? 'Newest' : 'Name'}
                    </span>
                </button>
                {/* п.15: counter — only shown when no active search filtering (to avoid duplication) */}
                {!searchIsFiltering && (
                    <span className="text-xs font-mono text-muted ml-auto font-medium tracking-wide">
                        {filteredCount} <span className="opacity-50">/</span> {enrollmentCount} enrollments
                    </span>
                )}
            </div>

            {/* Advanced Filters Panel */}
            {showAdvanced && (
                <div className="p-3 bg-surface-elevated border border-border-strong rounded-xl animate-slideDown flex flex-wrap gap-3 items-center">
                    <div className="flex items-center gap-1.5 text-muted">
                        <Filter size={14} />
                        <span className="text-xs font-medium uppercase tracking-wider">Date:</span>
                    </div>
                    <div className="flex items-center gap-1.5 bg-surface border border-border-subtle rounded-xl px-2.5 py-1">
                        <Calendar size={13} className="text-muted" />
                        <input
                            type="datetime-local"
                            id="date-from"
                            name="dateFrom"
                            className="bg-transparent text-sm outline-none py-0.5 text-primary"
                            value={dateFrom}
                            onChange={e => setDateFrom(e.target.value)}
                            title="From date and time"
                        />
                        <span className="text-muted/50 text-xs">—</span>
                        <input
                            type="datetime-local"
                            id="date-to"
                            name="dateTo"
                            className="bg-transparent text-sm outline-none py-0.5 text-primary"
                            value={dateTo}
                            onChange={e => setDateTo(e.target.value)}
                            title="To date and time"
                        />
                    </div>
                </div>
            )}

            {/* Row 4: Status Summary Bar — п.9: clickable badges */}
            <div className="flex overflow-x-auto md:flex-wrap gap-1.5 scrollbar-none pb-1 -mx-4 px-4 sm:mx-0 sm:px-0">
                {ALL_STATUSES.map(status => {
                    const cfg = STATUS_CONFIG[status];
                    const count = statusCounts[status] || 0;
                    if (count === 0 && SECONDARY_STATUSES.includes(status as typeof SECONDARY_STATUSES[number])) return null;
                    return (
                        <button
                            key={status}
                            onClick={() => onStatusBadgeClick?.(status)}
                            title={`Scroll to ${cfg.label} column`}
                            className={`inline-flex items-center gap-1 md:gap-1.5 text-[10px] md:text-[11px] font-semibold tracking-wider uppercase px-2 py-1 md:px-2.5 md:py-1.5 rounded-lg ${cfg.bg} ${cfg.color} ${cfg.border} border transition-all hover:scale-105 hover:shadow-sm active:scale-95 cursor-pointer`}
                        >
                            {cfg.icon}
                            <span>{cfg.label}</span>
                            <span className="font-mono bg-black/15 dark:bg-white/10 text-primary px-1 py-0.5 md:px-1.5 md:py-0.5 rounded ml-0.5 shadow-sm">{count}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
