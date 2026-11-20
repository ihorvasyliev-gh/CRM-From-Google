import { Children, isValidElement, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Archive, ChevronLeft, ChevronRight, Search, X, UserPlus, Globe, SlidersHorizontal, ArrowDownUp, Calendar, GraduationCap, Timer, Star, AlertTriangle, Clock, Pencil, MailX } from 'lucide-react';
import { formatDayDateShort, formatShortDate } from '../../lib/dateUtils';
import DateCalendarPicker from './DateCalendarPicker';
import { useIsSmallScreen } from '../../hooks/useScreenSize';
import type { EnrollmentRow } from '../../hooks/useEnrollments';
import { CustomTooltip } from '../ui/Tooltip';
import Modal from '../ui/Modal';
import { buttonCls } from '../ui/buttonStyles';
import type { InviteFilter } from '../../lib/inviteDeadline';
import { SORT_HINT, type SortOrder } from './boardSort';
import type { CourseDateChip, EmailStatusFilter, FlagFilter } from './boardFilters';

export interface AttributeFilterCounts {
    priority: number;
    flagged: number;
    pendingApproval: number;
    hasNote: number;
    unreachableEmail: number;
}

interface FilterBarProps {
    enrollments: EnrollmentRow[];
    enrollmentCount: number;
    /** Older enrollments are still loading, so the count will grow */
    countLoading?: boolean;
    filteredCount: number;
    searchQuery: string;
    setSearchQuery: (q: string) => void;
    setEnrollModalOpen: (open: boolean) => void;
    selectedCourse: string;
    setSelectedCourse: (c: string) => void;
    uniqueCourses: { id: string, name: string }[];
    /** Active pipeline counts (requested + invited + confirmed) per course_id */
    courseActiveCounts?: ReadonlyMap<string, number>;
    selectedVariant: string;
    setSelectedVariant: (v: string) => void;
    uniqueVariants: string[];
    selectedCourseDate: string;
    setSelectedCourseDate: (d: string) => void;
    /** `confirmed` / `invited` / `isPast` / `maxCapacity` — breakdown of `count` by status */
    availableCourseDates: CourseDateChip[];
    /** People across all chips; lower than the chip sum when multi-date invites appear on several dates */
    courseDatesTotal?: number;
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
    inviteFilter: InviteFilter;
    setInviteFilter: (f: InviteFilter) => void;
    inviteCounts: { expired: number; soon: number };
    /** Extra attribute filters (shown in the Filters sheet + as removable chips in the toolbar) */
    priorityOnly?: boolean;
    setPriorityOnly?: (v: boolean) => void;
    flagFilter?: FlagFilter;
    setFlagFilter?: (v: FlagFilter) => void;
    pendingApprovalOnly?: boolean;
    setPendingApprovalOnly?: (v: boolean) => void;
    hasNoteOnly?: boolean;
    setHasNoteOnly?: (v: boolean) => void;
    emailFilter?: EmailStatusFilter;
    setEmailFilter?: (v: EmailStatusFilter) => void;
    attributeCounts?: AttributeFilterCounts;
    /** Withdrawn + rejected enrollments left by the filters; their dialog opens from the bar */
    secondaryCount?: number;
    onOpenSecondary?: () => void;
}

const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
    { value: 'date-asc', label: 'Oldest first' },
    { value: 'date-desc', label: 'Newest first' },
    { value: 'name', label: 'By surname' },
];

type ChipTone = 'brand' | 'violet' | 'emerald' | 'red' | 'amber';

const CHIP_ACTIVE: Record<ChipTone, string> = {
    brand: 'bg-brand-500 text-white border-brand-500 shadow-xs',
    violet: 'bg-violet-500 text-white border-violet-500 shadow-xs',
    emerald: 'bg-emerald-700 text-white border-emerald-700 shadow-xs',
    red: 'bg-red-600 text-white border-red-600 shadow-xs',
    amber: 'bg-amber-500 text-white border-amber-500 shadow-xs',
};

const CHIP_IDLE: Record<ChipTone, string> = {
    brand: 'hover:border-brand-500 hover:text-brand-500',
    violet: 'hover:border-violet-500 hover:text-violet-500 dark:hover:text-violet-400',
    emerald: 'hover:border-emerald-500/60 hover:text-primary',
    red: 'text-red-700 dark:text-red-400 hover:border-red-500',
    amber: 'text-amber-700 dark:text-amber-400 hover:border-amber-500',
};

/**
 * One line of chips that scrolls sideways when they don't fit: arrows appear at the cut-off edges,
 * and the chosen chip is brought into view.
 */
function ChipScroller({ label, className = '', children }: { label: string; className?: string; children: ReactNode }) {
    const ref = useRef<HTMLDivElement>(null);
    const [edges, setEdges] = useState({ left: false, right: false });

    const measure = useCallback(() => {
        const el = ref.current;
        if (!el) return;
        const left = el.scrollLeft > 4;
        const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
        setEdges(prev => (prev.left === left && prev.right === right ? prev : { left, right }));
    }, []);

    // Chips come and go with the data, and the row's width follows the window
    useEffect(() => {
        measure();
        const el = ref.current;
        if (!el || typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver(measure);
        observer.observe(el);
        return () => observer.disconnect();
    });

    const active = Children.toArray(children).findIndex(c => isValidElement<{ active?: boolean }>(c) && c.props.active);
    useEffect(() => {
        const chip = ref.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
        chip?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    }, [active]);

    const page = (direction: 1 | -1) => {
        const el = ref.current;
        el?.scrollBy?.({ left: direction * el.clientWidth * 0.7, behavior: 'smooth' });
    };
    const arrowCls = 'absolute top-1/2 -translate-y-1/2 z-10 w-7 h-7 inline-flex items-center justify-center rounded-full border border-border-strong bg-surface text-muted hover:text-primary shadow-sm';

    return (
        <div className={`relative min-w-0 ${className}`}>
            <div ref={ref} role="group" aria-label={label} onScroll={measure} className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto scrollbar-none">
                {children}
            </div>
            {edges.left && (
                <>
                    <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-14 bg-linear-to-r from-surface to-transparent" />
                    <button type="button" aria-label={`Earlier ${label.toLowerCase()} options`} onClick={() => page(-1)} className={`${arrowCls} left-0`}>
                        <ChevronLeft size={14} />
                    </button>
                </>
            )}
            {edges.right && (
                <>
                    <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-14 bg-linear-to-l from-surface to-transparent" />
                    <button type="button" aria-label={`More ${label.toLowerCase()} options`} onClick={() => page(1)} className={`${arrowCls} right-0`}>
                        <ChevronRight size={14} />
                    </button>
                </>
            )}
        </div>
    );
}

function Chip({ active, tone = 'brand', count, countTone, onClick, size = 'sm', title, children }: {
    active: boolean;
    title?: string;
    tone?: ChipTone;
    count?: number | string;
    countTone?: 'default' | 'full' | 'over';
    onClick: () => void;
    /** `lg` — finger-sized chips for the mobile sheet */
    size?: 'sm' | 'lg';
    children: ReactNode;
}) {
    const badgeCls = active
        ? 'bg-white/20 text-white'
        : countTone === 'over'
            ? 'bg-red-500/15 text-status-rejected font-bold'
            : countTone === 'full'
                ? 'bg-amber-500/15 text-status-requested font-bold'
                : 'bg-background text-muted';
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            title={title}
            className={`inline-flex items-center gap-1.5 font-semibold rounded-full border whitespace-nowrap shrink-0 transition-all active:scale-95 ${
                size === 'lg' ? 'px-3.5 py-2 text-sm' : 'px-2.5 py-1 text-xs'
            } ${active ? CHIP_ACTIVE[tone] : `bg-surface-elevated text-muted border-border-strong ${CHIP_IDLE[tone]}`}`}
        >
            {children}
            {count !== undefined && (
                <span className={`text-xs px-1.5 rounded-full font-mono ${badgeCls}`}>
                    {count}
                </span>
            )}
        </button>
    );
}

/** Small uppercase caption in front of a chip group / sheet section. */
function GroupLabel({ icon, children, className = '' }: { icon: ReactNode; children: ReactNode; className?: string }) {
    return (
        <span className={`flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-muted shrink-0 ${className}`}>
            {icon}
            {children}
        </span>
    );
}

/** Pause in typing after which the board filters by the search text */
const SEARCH_DELAY_MS = 200;

/**
 * The search box keeps what is typed to itself and hands it to the board once typing pauses, so a
 * key press repaints only the field, not the whole board. Clearing (× or Escape) applies at once.
 */
function SearchField({ value, onChange }: { value: string; onChange: (q: string) => void }) {
    const [text, setText] = useState(value);
    // The search the board was last given; when its own differs, it was set elsewhere (Reset filters)
    const [sent, setSent] = useState(value);
    if (value !== sent) {
        setSent(value);
        setText(value);
    }

    useEffect(() => {
        if (text === sent) return;
        const timer = setTimeout(() => {
            setSent(text);
            onChange(text);
        }, SEARCH_DELAY_MS);
        return () => clearTimeout(timer);
    }, [text, sent, onChange]);

    const clear = () => {
        setText('');
        setSent('');
        onChange('');
    };

    return (
        <div className="relative flex-1 md:flex-none md:w-56 xl:w-80">
            <Search
                className={`absolute left-3 top-1/2 -translate-y-1/2 transition-colors ${text ? 'text-brand-500' : 'text-muted'}`}
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
                title="Search by name, email, phone, course, language, notes or eircode"
                onKeyDown={e => {
                    if (e.key === 'Escape' && text) {
                        e.preventDefault();
                        clear();
                    }
                }}
                className={`w-full h-9 pl-9 pr-8 bg-surface-elevated border rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 focus:bg-background transition-all placeholder:text-muted/60 text-primary [&::-webkit-search-cancel-button]:hidden ${
                    text ? 'border-brand-400' : 'border-border-strong'
                }`}
                value={text}
                onChange={e => setText(e.target.value)}
            />
            {text && (
                <button
                    type="button"
                    onClick={clear}
                    aria-label="Clear search"
                    className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 text-muted hover:text-primary transition-colors"
                >
                    <X size={14} />
                </button>
            )}
        </div>
    );
}

/** Picker values are "YYYY-MM-DDT00:00" — show them as "1 Oct" in chips. */
function formatRange(from: string, to: string) {
    return `${from ? formatShortDate(from.split('T')[0]) : '…'} – ${to ? formatShortDate(to.split('T')[0]) : '…'}`;
}

export default function FilterBar({
    enrollments,
    enrollmentCount,
    countLoading = false,
    filteredCount,
    searchQuery,
    setSearchQuery,
    setEnrollModalOpen,
    selectedCourse,
    setSelectedCourse,
    uniqueCourses,
    courseActiveCounts,
    selectedVariant,
    setSelectedVariant,
    uniqueVariants,
    selectedCourseDate,
    setSelectedCourseDate,
    availableCourseDates,
    courseDatesTotal,
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
    inviteFilter,
    setInviteFilter,
    inviteCounts,
    priorityOnly = false,
    setPriorityOnly,
    flagFilter = 'all',
    setFlagFilter,
    pendingApprovalOnly = false,
    setPendingApprovalOnly,
    hasNoteOnly = false,
    setHasNoteOnly,
    emailFilter = 'all',
    setEmailFilter,
    attributeCounts,
    secondaryCount = 0,
    onOpenSecondary,
}: FilterBarProps) {
    const [sheetOpen, setSheetOpen] = useState(false);
    const isSmallScreen = useIsSmallScreen();

    const hasCreatedRange = !!(dateFrom || dateTo);
    const hasCourseRange = !!(courseDateFrom || courseDateTo);
    const isFiltered = filteredCount < enrollmentCount;
    const shownCount = countLoading ? `${enrollmentCount}+` : enrollmentCount;
    // Language chips only help when there is something to choose between (or one is already picked)
    const showLanguages = selectedCourse !== 'all' && (uniqueVariants.length > 1 || selectedVariant !== 'all');
    const datesTotal = courseDatesTotal ?? availableCourseDates.reduce((sum, d) => sum + d.count, 0);
    const hasAttributeControls = !!(setPriorityOnly || setFlagFilter || setPendingApprovalOnly || setHasNoteOnly || setEmailFilter);

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
        setInviteFilter('all');
        setPriorityOnly?.(false);
        setFlagFilter?.('all');
        setPendingApprovalOnly?.(false);
        setHasNoteOnly?.(false);
        setEmailFilter?.('all');
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
    if (inviteFilter !== 'all') {
        activeFilters.push({
            id: 'invites',
            label: 'Invites',
            value: { expired: 'Expired', soon: 'Due soon', attention: 'Expired + due soon' }[inviteFilter],
            onRemove: () => setInviteFilter('all'),
        });
    }
    if (priorityOnly && setPriorityOnly) {
        activeFilters.push({ id: 'priority', label: 'Priority', value: 'Starred', onRemove: () => setPriorityOnly(false) });
    }
    if (flagFilter !== 'all' && setFlagFilter) {
        activeFilters.push({
            id: 'flags',
            label: 'Flags',
            value: flagFilter === 'flagged' ? 'Flagged only' : 'Hide flagged',
            onRemove: () => setFlagFilter('all'),
        });
    }
    if (pendingApprovalOnly && setPendingApprovalOnly) {
        activeFilters.push({ id: 'approval', label: 'Approval', value: 'Pending', onRemove: () => setPendingApprovalOnly(false) });
    }
    if (hasNoteOnly && setHasNoteOnly) {
        activeFilters.push({ id: 'notes', label: 'Notes', value: 'Has note', onRemove: () => setHasNoteOnly(false) });
    }
    if (emailFilter !== 'all' && setEmailFilter) {
        activeFilters.push({
            id: 'email',
            label: 'Email',
            value: emailFilter === 'unreachable' ? 'No email / unsub' : 'Can email',
            onRemove: () => setEmailFilter('all'),
        });
    }
    // Desktop: the course has its own chip row, and with a course chosen its languages and dates stay
    // in view as chips (the usual next step); the rest of the filters set in the sheet show in the toolbar
    const showDrillDown = selectedCourse !== 'all' && (showLanguages || availableCourseDates.length > 0);
    const showToolbarExpired = inviteCounts.expired > 0 || inviteFilter === 'expired';
    const desktopFilters = activeFilters.filter(f =>
        f.id !== 'course' &&
        !(showDrillDown && (f.id === 'variant' || f.id === 'courseDate')) &&
        !(showToolbarExpired && f.id === 'invites' && inviteFilter === 'expired'));
    // What the Filters button holds: on a phone the course too
    const sheetFilterCount = isSmallScreen ? activeFilters.length : activeFilters.filter(f => f.id !== 'course').length;

    const renderFilterChip = (filter: typeof activeFilters[number]) => (
        <span
            key={filter.id}
            className="inline-flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-full bg-brand-500/10 border border-brand-500/30 text-xs whitespace-nowrap shrink-0"
        >
            <span className="text-muted text-xs">{filter.label}:</span>
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

    const renderRangePickers = () => {
        const pair = 'flex flex-col sm:flex-row sm:items-center gap-2';
        return (
            <>
                <div className="space-y-1.5">
                    <GroupLabel icon={<Calendar size={12} />}>Created</GroupLabel>
                    <div className={pair}>
                        <DateCalendarPicker label="From" value={dateFrom} onChange={setDateFrom} placeholder="Start date"
                            enrollments={enrollments} selectedCourse={selectedCourse} limitDate={dateTo} isEndDate={false} dateField="created_at" />
                        <DateCalendarPicker label="To" value={dateTo} onChange={setDateTo} placeholder="End date"
                            enrollments={enrollments} selectedCourse={selectedCourse} limitDate={dateFrom} isEndDate={true} dateField="created_at" />
                    </div>
                </div>
                <div className="space-y-1.5">
                    <GroupLabel icon={<GraduationCap size={12} />}>Course date</GroupLabel>
                    <div className={pair}>
                        <DateCalendarPicker label="From" value={courseDateFrom} onChange={setCourseDateFrom} placeholder="Start date"
                            enrollments={enrollments} selectedCourse={selectedCourse} limitDate={courseDateTo} isEndDate={false} dateField="confirmed_date" />
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

    // Only offered when there is something to show (or a filter is already on)
    const showInviteChips = inviteCounts.expired > 0 || inviteCounts.soon > 0 || inviteFilter !== 'all';
    const renderInviteChips = (size: 'sm' | 'lg') => (
        <>
            <Chip tone="red" size={size} active={inviteFilter === 'expired'} count={inviteCounts.expired}
                onClick={() => setInviteFilter(inviteFilter === 'expired' ? 'all' : 'expired')}>
                Expired
            </Chip>
            <Chip tone="amber" size={size} active={inviteFilter === 'soon'} count={inviteCounts.soon}
                onClick={() => setInviteFilter(inviteFilter === 'soon' ? 'all' : 'soon')}>
                Due in 48h
            </Chip>
            {(inviteCounts.expired > 0 && inviteCounts.soon > 0 || inviteFilter === 'attention') && (
                <Chip tone="amber" size={size} active={inviteFilter === 'attention'} count={inviteCounts.expired + inviteCounts.soon}
                    onClick={() => setInviteFilter(inviteFilter === 'attention' ? 'all' : 'attention')}>
                    All needing attention
                </Chip>
            )}
        </>
    );

    const renderDateChips = (size: 'sm' | 'lg') => (
        <>
            <Chip tone="emerald" size={size} active={selectedCourseDate === 'all'} count={datesTotal} onClick={() => setSelectedCourseDate('all')}>
                All dates
            </Chip>
            {availableCourseDates.map(({ date, count, confirmed = 0, invited = 0, isPast, maxCapacity }) => {
                const badgeText = maxCapacity != null ? `${confirmed}/${maxCapacity}` : count;
                const countTone = maxCapacity != null
                    ? (confirmed > maxCapacity ? 'over' : confirmed === maxCapacity ? 'full' : 'default')
                    : 'default';
                const tooltipParts: string[] = [];
                if (isPast) tooltipParts.push('Past date with active enrollments');
                if (maxCapacity != null) tooltipParts.push(`${confirmed}/${maxCapacity} confirmed`);
                else if (confirmed > 0 || invited > 0) tooltipParts.push(`${confirmed} confirmed`);
                if (invited > 0) tooltipParts.push(`${invited} invited, not answered yet`);
                const tooltip = tooltipParts.length > 0 ? tooltipParts.join(' · ') : undefined;
                return (
                    <Chip
                        key={date}
                        tone={isPast ? 'amber' : 'emerald'}
                        size={size}
                        active={selectedCourseDate === date}
                        count={badgeText}
                        countTone={countTone}
                        title={tooltip}
                        onClick={() => setSelectedCourseDate(selectedCourseDate === date ? 'all' : date)}
                    >
                        {isPast && <span className="text-[10px] font-bold uppercase opacity-80">Past</span>}
                        {formatDayDateShort(date)}
                    </Chip>
                );
            })}
        </>
    );

    return (
        <div className="filter-bar-container shrink-0 bg-transparent md:bg-surface rounded-none md:rounded-2xl shadow-none md:shadow-card border-0 md:border border-border-subtle p-0 md:p-3 space-y-1.5 md:space-y-2.5">
            {/* Row 1: search + controls + Add */}
            <div className="flex items-center gap-1.5 md:gap-2">
                <SearchField value={searchQuery} onChange={setSearchQuery} />

                {/* Every other filter lives in one sheet (on a phone, the course too) */}
                <button
                    type="button"
                    onClick={() => setSheetOpen(true)}
                    aria-label="Open filters"
                    className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border text-xs font-semibold transition-all active:scale-95 shrink-0 ${
                        sheetFilterCount > 0
                            ? 'bg-brand-500/15 text-brand-700 dark:text-brand-300 border-brand-500/40'
                            : 'bg-surface-elevated text-primary border-border-strong hover:border-brand-500'
                    }`}
                >
                    <SlidersHorizontal size={14} />
                    <span>Filters</span>
                    {sheetFilterCount > 0 && (
                        <span className="min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-brand-500 text-white text-[10px] font-bold">
                            {sheetFilterCount}
                        </span>
                    )}
                </button>

                <label title={SORT_HINT} className="hidden md:inline-flex items-center gap-1.5 h-9 pl-3 pr-1 rounded-xl border border-border-strong bg-surface-elevated text-xs text-muted shrink-0 focus-within:border-brand-500">
                    <ArrowDownUp size={13} />
                    <span className="sr-only">Sort</span>
                    <select
                        value={sortOrder}
                        onChange={e => setSortOrder(e.target.value as SortOrder)}
                        className="bg-transparent text-xs font-semibold text-primary pr-1 focus:outline-hidden cursor-pointer"
                    >
                        {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                </label>

                {/* Desktop quick alert pill when invitations have expired */}
                {showToolbarExpired && (
                    <button
                        type="button"
                        aria-pressed={inviteFilter === 'expired'}
                        aria-label={`Filter expired invitations (${inviteCounts.expired})`}
                        onClick={() => setInviteFilter(inviteFilter === 'expired' ? 'all' : 'expired')}
                        className={`hidden md:inline-flex items-center gap-1.5 h-9 px-2.5 rounded-xl border text-xs font-semibold transition-all active:scale-95 shrink-0 whitespace-nowrap ${
                            inviteFilter === 'expired'
                                ? 'bg-red-600 text-white border-red-600 shadow-xs'
                                : 'bg-red-500/10 text-status-rejected border-red-500/30 hover:bg-red-500/20'
                        }`}
                    >
                        <Timer size={13} />
                        <span className="font-mono">{inviteCounts.expired}</span>
                        <span className="hidden xl:inline">expired</span>
                    </button>
                )}

                {/* Desktop: the filters set in the sheet, removable in one click */}
                {desktopFilters.length > 0 && (
                    <div className="hidden md:flex items-center gap-1.5 min-w-0 overflow-x-auto scrollbar-none">
                        {desktopFilters.map(renderFilterChip)}
                    </div>
                )}

                <div className="hidden md:flex items-center gap-2 ml-auto shrink-0">
                    {secondaryCount > 0 && onOpenSecondary && (
                        <CustomTooltip content="Withdrawn & Rejected">
                            <button
                                type="button"
                                onClick={onOpenSecondary}
                                aria-label={`Withdrawn & Rejected (${secondaryCount})`}
                                className="inline-flex items-center gap-1.5 h-9 px-2.5 rounded-xl border border-border-strong bg-surface-elevated text-xs font-semibold text-muted hover:text-primary hover:border-brand-500 transition-all active:scale-95"
                            >
                                <Archive size={13} />
                                <span className="hidden 2xl:inline">Withdrawn & Rejected</span>
                                <span className="font-mono">{secondaryCount}</span>
                            </button>
                        </CustomTooltip>
                    )}
                    <span className="text-xs text-muted whitespace-nowrap" aria-live="polite">
                        {isFiltered ? (
                            <><span className="font-mono font-bold text-primary">{filteredCount}</span> of <span className="font-mono">{shownCount}</span></>
                        ) : (
                            <><span className="font-mono font-bold text-primary">{shownCount}</span> total</>
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
                        data-add-enrollment
                        className={buttonCls('primary', 'md', 'h-9 w-9 md:w-auto px-0 md:px-4 text-sm shrink-0')}
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
                        className="text-xs font-semibold text-danger px-2 py-1 whitespace-nowrap shrink-0"
                    >
                        Clear all
                    </button>
                </div>
            )}

            {/* Desktop row 2: every course, one click each, on one line so the board keeps its height */}
            {uniqueCourses.length > 0 && (
                <ChipScroller label="Course" className="hidden md:flex">
                    <Chip active={selectedCourse === 'all'} onClick={() => selectCourse('all')}>All courses</Chip>
                    {uniqueCourses.map(c => {
                        const activeCount = courseActiveCounts?.get(c.id);
                        return (
                            <Chip
                                key={c.id}
                                active={selectedCourse === c.id}
                                count={activeCount && activeCount > 0 ? activeCount : undefined}
                                title={activeCount ? `${c.name} — ${activeCount} active in pipeline` : c.name}
                                onClick={() => selectCourse(c.id)}
                            >
                                {c.name}
                            </Chip>
                        );
                    })}
                </ChipScroller>
            )}

            {/* Desktop row 3, with a course chosen: its languages and course dates, one scrollable line with arrows */}
            {showDrillDown && (
                <ChipScroller label="Course options" className="hidden md:flex">
                    {showLanguages && (
                        <>
                            <GroupLabel icon={<Globe size={12} />} className="mr-0.5">Language</GroupLabel>
                            {renderLanguageChips('sm')}
                        </>
                    )}
                    {showLanguages && availableCourseDates.length > 0 && <div className="h-4 w-px bg-border-strong mx-1.5 shrink-0" />}
                    {availableCourseDates.length > 0 && (
                        <>
                            <GroupLabel icon={<Calendar size={12} />} className="mr-0.5 text-status-confirmed">Dates</GroupLabel>
                            {renderDateChips('sm')}
                        </>
                    )}
                </ChipScroller>
            )}

            {/* The filter sheet: a bottom sheet on a phone, a dialog on a larger screen */}
            <Modal
                open={sheetOpen}
                onClose={() => setSheetOpen(false)}
                title="Filters"
                subtitle={isFiltered ? `${filteredCount} of ${shownCount} enrollments` : `${shownCount} enrollments`}
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
                <section className="space-y-2 md:hidden">
                    <GroupLabel icon={<GraduationCap size={12} />}>Course</GroupLabel>
                    <div className="flex flex-wrap gap-1.5">
                        <Chip size="lg" active={selectedCourse === 'all'} onClick={() => selectCourse('all')}>All courses</Chip>
                        {uniqueCourses.map(c => {
                            const activeCount = courseActiveCounts?.get(c.id);
                            return (
                                <Chip
                                    key={c.id}
                                    size="lg"
                                    active={selectedCourse === c.id}
                                    count={activeCount && activeCount > 0 ? activeCount : undefined}
                                    onClick={() => selectCourse(c.id)}
                                >
                                    {c.name}
                                </Chip>
                            );
                        })}
                    </div>
                </section>

                {showInviteChips && (
                    <section className="space-y-2">
                        <GroupLabel icon={<Timer size={12} />} className="text-status-rejected">Invites</GroupLabel>
                        <div className="flex flex-wrap gap-1.5">{renderInviteChips('lg')}</div>
                    </section>
                )}

                {hasAttributeControls && (
                    <section className="space-y-2">
                        <GroupLabel icon={<SlidersHorizontal size={12} />}>Quick filters</GroupLabel>
                        <div className="flex flex-wrap gap-1.5">
                            {setPriorityOnly && (
                                <Chip
                                    tone="amber"
                                    size="lg"
                                    active={priorityOnly}
                                    count={attributeCounts?.priority}
                                    onClick={() => setPriorityOnly(!priorityOnly)}
                                >
                                    <Star size={12} /> Priority
                                </Chip>
                            )}
                            {setFlagFilter && (
                                <>
                                    <Chip
                                        tone="red"
                                        size="lg"
                                        active={flagFilter === 'flagged'}
                                        count={attributeCounts?.flagged}
                                        onClick={() => setFlagFilter(flagFilter === 'flagged' ? 'all' : 'flagged')}
                                    >
                                        <AlertTriangle size={12} /> Flagged
                                    </Chip>
                                    <Chip
                                        tone="brand"
                                        size="lg"
                                        active={flagFilter === 'unflagged'}
                                        onClick={() => setFlagFilter(flagFilter === 'unflagged' ? 'all' : 'unflagged')}
                                    >
                                        Hide flagged
                                    </Chip>
                                </>
                            )}
                            {setPendingApprovalOnly && ((attributeCounts?.pendingApproval ?? 0) > 0 || pendingApprovalOnly) && (
                                <Chip
                                    tone="amber"
                                    size="lg"
                                    active={pendingApprovalOnly}
                                    count={attributeCounts?.pendingApproval}
                                    onClick={() => setPendingApprovalOnly(!pendingApprovalOnly)}
                                >
                                    <Clock size={12} /> Pending approval
                                </Chip>
                            )}
                            {setHasNoteOnly && (
                                <Chip
                                    tone="brand"
                                    size="lg"
                                    active={hasNoteOnly}
                                    count={attributeCounts?.hasNote}
                                    onClick={() => setHasNoteOnly(!hasNoteOnly)}
                                >
                                    <Pencil size={12} /> Has note
                                </Chip>
                            )}
                            {setEmailFilter && (
                                <>
                                    <Chip
                                        tone="red"
                                        size="lg"
                                        active={emailFilter === 'unreachable'}
                                        count={attributeCounts?.unreachableEmail}
                                        onClick={() => setEmailFilter(emailFilter === 'unreachable' ? 'all' : 'unreachable')}
                                    >
                                        <MailX size={12} /> No email / unsub
                                    </Chip>
                                    <Chip
                                        tone="emerald"
                                        size="lg"
                                        active={emailFilter === 'emailable'}
                                        onClick={() => setEmailFilter(emailFilter === 'emailable' ? 'all' : 'emailable')}
                                    >
                                        Can email
                                    </Chip>
                                </>
                            )}
                        </div>
                    </section>
                )}

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

                <section className="space-y-2 md:hidden">
                    <GroupLabel icon={<ArrowDownUp size={12} />}>Sort</GroupLabel>
                    <div className="grid grid-cols-3 gap-1 p-1 bg-surface-elevated rounded-xl border border-border-subtle">
                        {SORT_OPTIONS.map(o => (
                            <button
                                key={o.value}
                                type="button"
                                onClick={() => setSortOrder(o.value)}
                                aria-pressed={sortOrder === o.value}
                                className={`py-2 text-xs font-semibold rounded-lg transition-all ${
                                    sortOrder === o.value ? 'bg-brand-500 text-white shadow-xs' : 'text-muted'
                                }`}
                            >
                                {o.label}
                            </button>
                        ))}
                    </div>
                </section>

                <section className="space-y-4">{renderRangePickers()}</section>
            </Modal>
        </div>
    );
}
