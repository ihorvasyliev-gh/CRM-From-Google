import { memo, useState, useCallback, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import { Check, Copy, Loader2, ListChecks, ChevronLeft, ChevronRight, Calendar, Star, Timer, AlertTriangle } from 'lucide-react';
import { useDroppable } from '@dnd-kit/core';
import type { EnrollmentRow } from '../../hooks/useEnrollments';
import type { EnrollmentStatus, StudentFlag } from '../../lib/types';
import { STATUS_CONFIG } from '../../lib/statusConfig';
import EnrollmentCard from './EnrollmentCard';
import { sessionForEnrollment, type CourseSession } from '../../lib/courseSessions';
import { CustomTooltip } from '../ui/Tooltip';
import { useCardsAnimation } from '../../hooks/useListAnimation';
import { todayISO } from '../../lib/dateUtils';
import { normalizeEmail } from '../../lib/emailOptOut';
import type { InviteFilter } from '../../lib/inviteDeadline';
import type { SortOrder } from './boardSort';
import { computeColumnGroups, pickTopN } from './boardFilters';

// Cards rendered at first, and added each time the list is scrolled near its end. A column shows
// about six cards at a time; rendering 50 in each of the four columns at once (some 11,000 DOM
// nodes) blocked a phone for well over a second when the board opened.
const INITIAL_CARDS = 16;
const MORE_CARDS = 32;
/** Cards slide into place while at most this many are rendered in the column */
const ANIMATED_CARDS_MAX = 48;
const EMPTY_OPTED_OUT: ReadonlySet<string> = new Set();

interface StatusColumnProps {
    status: string;
    items: EnrollmentRow[];
    selectedIds: Set<string>;
    selectAllInList: (items: EnrollmentRow[]) => void;
    handleCopyEmails: (items: EnrollmentRow[], label: string) => void;
    toggleSelect: (id: string) => void;
    /** Adds a run of cards to the selection (Shift+click) */
    selectMany?: (ids: string[]) => void;
    /** Replaces the selection with the first N picked from this queue */
    onSelectTopN?: (ids: string[]) => void;
    togglePriority: (id: string, current: boolean) => void;
    openEditNote: (enrollment: EnrollmentRow) => void;
    onUpdateNote?: (id: string, noteText: string) => Promise<boolean | void> | void;
    queuePositions: Map<string, number>;
    /** Places of students queued in several languages of a course */
    queueDetails: Map<string, string>;
    flagsByStudentId: Map<string, StudentFlag[]>;
    completedCoursesByStudentId: Map<string, Array<{id: string, name: string}>>;
    onFlagClick: (enrollment: EnrollmentRow) => void;
    emptyFlags: StudentFlag[];
    emptyCompletedCourses: Array<{id: string, name: string}>;
    totalCount?: number;
    onShowDetail?: (enrollment: EnrollmentRow) => void;
    onMoveStatus?: (id: string, currentStatus: string, targetStatus: EnrollmentStatus) => void;
    /** Normalized emails present in email_opt_outs */
    optedOutEmails?: ReadonlySet<string>;
    /** Opens the Pending Approvals dialog from a card's completion-requested banner */
    onOpenApprovals?: () => void;
    /** Time, place and days of the course dates, keyed by courseDateKey */
    sessions: ReadonlyMap<string, CourseSession>;
    /** The board's filters and search: when they change, the column shows its new cards at once */
    filters: object;
    /** Current board sort order (controls date group dividers in Invited & Confirmed) */
    sortOrder?: SortOrder;
    /** Older enrollments of this status are still loading (the first load reads current ones first) */
    loadingOlder?: boolean;
    /** Clickable header alert counters for Invited */
    expiredCount?: number;
    dueSoonCount?: number;
    inviteFilter?: InviteFilter;
    onToggleInviteFilter?: (target: 'expired' | 'soon') => void;
    /** Clickable Priority filter toggle in Requested header */
    priorityOnly?: boolean;
    onTogglePriorityFilter?: () => void;
    /** Cohort seat fill when filtered to a single capped course date (shown in Confirmed header) */
    cohortCapacity?: { confirmed: number; max: number } | null;
    /** Suggested Top-N preset (e.g. course max_capacity) */
    suggestedTopN?: number | null;
    /** Desktop column collapse state */
    collapsed?: boolean;
    canCollapse?: boolean;
    onToggleCollapse?: () => void;
    /** True when the floating bulk action bar is open (adds bottom clearance so last cards stay reachable) */
    hasSelection?: boolean;
}

const StatusColumn = function StatusColumn({
    status,
    items,
    selectedIds,
    selectAllInList,
    handleCopyEmails,
    toggleSelect,
    selectMany,
    onSelectTopN,
    togglePriority,
    openEditNote,
    onUpdateNote,
    queuePositions,
    queueDetails,
    flagsByStudentId,
    completedCoursesByStudentId,
    onFlagClick,
    emptyFlags,
    emptyCompletedCourses,
    totalCount: _totalCount = 0,
    onShowDetail,
    onMoveStatus,
    optedOutEmails = EMPTY_OPTED_OUT,
    onOpenApprovals,
    sessions,
    filters,
    sortOrder = 'date-asc',
    loadingOlder = false,
    expiredCount = 0,
    dueSoonCount = 0,
    inviteFilter = 'all',
    onToggleInviteFilter,
    priorityOnly = false,
    onTogglePriorityFilter,
    cohortCapacity = null,
    suggestedTopN = null,
    collapsed = false,
    canCollapse = false,
    onToggleCollapse,
    hasSelection = false,
}: StatusColumnProps) {
    const cfg = STATUS_CONFIG[status];

    const { isOver, setNodeRef } = useDroppable({
        id: status
    });

    // Shift+click selects every card from the one clicked before to this one, in the column's order
    const itemsRef = useRef(items);
    useEffect(() => {
        itemsRef.current = items;
    }, [items]);
    const anchorRef = useRef<string | null>(null);
    const handleToggle = useCallback((id: string, range?: boolean) => {
        const anchor = anchorRef.current;
        anchorRef.current = id;
        if (range && selectMany && anchor && anchor !== id) {
            const list = itemsRef.current;
            const from = list.findIndex(e => e.id === anchor);
            const to = list.findIndex(e => e.id === id);
            if (from !== -1 && to !== -1) {
                selectMany(list.slice(Math.min(from, to), Math.max(from, to) + 1).map(e => e.id));
                return;
            }
        }
        toggleSelect(id);
    }, [selectMany, toggleSelect]);

    // Top-N queue selection popover (Requested column only)
    const [topNOpen, setTopNOpen] = useState(false);
    const [customN, setCustomN] = useState('');
    const [skipUnreachable, setSkipUnreachable] = useState(true);
    const topNRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        if (!topNOpen) return;
        const onDown = (e: MouseEvent) => {
            if (!topNRef.current?.contains(e.target as Node)) setTopNOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                setTopNOpen(false);
            }
        };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [topNOpen]);

    const applyTopN = useCallback((n: number) => {
        if (n <= 0) return;
        const picked = pickTopN(itemsRef.current, n, optedOutEmails, skipUnreachable);
        if (picked.length > 0) {
            if (onSelectTopN) onSelectTopN(picked);
            else selectMany?.(picked);
        }
        setTopNOpen(false);
        setCustomN('');
    }, [optedOutEmails, skipUnreachable, onSelectTopN, selectMany]);

    const topNPresets = useMemo(() => {
        const base = [5, 10, 12, 15];
        if (suggestedTopN && suggestedTopN > 0 && !base.includes(suggestedTopN)) {
            return [...base, suggestedTopN].sort((a, b) => a - b);
        }
        return base;
    }, [suggestedTopN]);

    const [visibleCount, setVisibleCount] = useState(INITIAL_CARDS);
    const sentinelRef = useRef<HTMLDivElement | null>(null);
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    // Cards slide into place when others leave or arrive; above a few dozen rendered cards
    // measuring them all on every change would cost more than it shows
    const animateCards = useCardsAnimation<HTMLDivElement>(!collapsed && Math.min(items.length, visibleCount) <= ANIMATED_CARDS_MAX, filters);
    // Cards brought in by other filters or a new search don't drop in either: only the ones that
    // arrive (moved here, new) do
    const [cardsFilters, setCardsFilters] = useState(filters);
    const refiltered = cardsFilters !== filters;
    useLayoutEffect(() => {
        if (refiltered) setCardsFilters(filters);
    }, [refiltered, filters]);
    const cardsRef = useCallback((node: HTMLDivElement | null) => {
        scrollContainerRef.current = node;
        animateCards(node);
    }, [animateCards]);

    // Intersection Observer for reliable infinite scroll
    useEffect(() => {
        if (collapsed) return;
        const sentinel = sentinelRef.current;
        if (!sentinel) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    setVisibleCount(prev => {
                        if (prev >= items.length) return prev;
                        return prev + MORE_CARDS;
                    });
                }
            },
            {
                root: scrollContainerRef.current,
                // Well ahead of the end, so cards are there before they scroll into view
                rootMargin: '600px',
                threshold: 0,
            }
        );

        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [items.length, visibleCount, collapsed]);

    // Reset the lazy-render window when the list changes (filters, search) — but not while the user
    // is scrolled down: realtime updates also produce a new array and would otherwise yank cards away.
    useEffect(() => {
        if ((scrollContainerRef.current?.scrollTop ?? 0) < 100) {
            setVisibleCount(INITIAL_CARDS);
        }
    }, [items]);

    const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        const el = e.currentTarget;
        if (el.scrollHeight - el.scrollTop - el.clientHeight < 600) {
            setVisibleCount(prev => {
                if (prev >= items.length) return prev;
                return prev + MORE_CARDS;
            });
        }
    }, [items.length]);

    const today = todayISO();
    const groups = useMemo(
        () => computeColumnGroups(items, status, sortOrder, today),
        [items, status, sortOrder, today],
    );

    if (!cfg) return null;

    // Collapsed slim vertical rail (desktop xl+): stays a valid drag-and-drop target
    if (collapsed) {
        return (
            <div
                ref={setNodeRef}
                role="region"
                aria-label={`${cfg.label} column (collapsed)`}
                className={`flex-1 min-h-0 w-11 flex flex-col items-center bg-surface rounded-2xl shadow-card border border-border-subtle overflow-hidden transition-all duration-200 ${
                    isOver ? 'ring-2 ring-brand-500 bg-brand-50/50 dark:bg-brand-500/10 scale-[1.01]' : ''
                }`}
            >
                <div className={`h-[3px] w-full bg-linear-to-r ${cfg.gradient} shrink-0`} />
                <button
                    type="button"
                    onClick={onToggleCollapse}
                    aria-label={`Expand ${cfg.label} column (${items.length})`}
                    title={`Expand ${cfg.label} (${items.length})`}
                    className="flex-1 w-full flex flex-col items-center py-3 gap-2.5 text-muted hover:text-primary hover:bg-surface-elevated/60 transition-colors cursor-pointer"
                >
                    <ChevronRight size={14} className="shrink-0" />
                    <span className={`${cfg.color} flex items-center shrink-0`}>{cfg.icon}</span>
                    <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full tabular-nums ${cfg.pillBg}`}>
                        {items.length}
                    </span>
                    <span
                        className={`text-xs font-semibold tracking-wide whitespace-nowrap ${cfg.color}`}
                        style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                    >
                        {cfg.label}
                    </span>
                    {isOver && (
                        <span className="mt-auto text-[10px] font-bold text-brand-500 uppercase">Drop</span>
                    )}
                </button>
            </div>
        );
    }

    const allSelected = items.length > 0 && items.every(e => selectedIds.has(e.id));
    const someSelected = items.some(e => selectedIds.has(e.id));
    const priorityCount = items.filter(e => e.is_priority).length;
    const canPickTopN = status === 'requested' && items.length > 0 && !!(onSelectTopN || selectMany);

    const renderCard = (enrollment: EnrollmentRow) => {
        const emailNorm = normalizeEmail(enrollment.students?.email);
        return (
            <EnrollmentCard
                key={enrollment.id}
                enrollment={enrollment}
                status={status}
                isSelected={selectedIds.has(enrollment.id)}
                toggleSelect={handleToggle}
                togglePriority={togglePriority}
                openEditNote={openEditNote}
                onUpdateNote={onUpdateNote}
                queuePosition={queuePositions.get(enrollment.id)}
                queueDetail={queueDetails.get(enrollment.id)}
                studentFlags={flagsByStudentId.get(enrollment.student_id) || emptyFlags}
                completedCourses={completedCoursesByStudentId.get(enrollment.student_id) || emptyCompletedCourses}
                onFlagClick={onFlagClick}
                onShowDetail={onShowDetail}
                onMoveStatus={onMoveStatus}
                emailOptedOut={!!emailNorm && optedOutEmails.has(emailNorm)}
                onOpenApprovals={onOpenApprovals}
                session={sessionForEnrollment(enrollment, sessions)}
                dropIn={!refiltered}
            />
        );
    };

    const renderCardsList = () => {
        if (!groups) {
            return items.slice(0, visibleCount).map(renderCard);
        }

        let budget = visibleCount;
        const nodes: React.ReactNode[] = [];
        for (const group of groups) {
            if (budget <= 0) break;
            const visibleInGroup = group.items.slice(0, budget);
            budget -= visibleInGroup.length;
            const groupAllSelected = group.items.every(e => selectedIds.has(e.id));
            const groupSomeSelected = group.items.some(e => selectedIds.has(e.id));
            const capText = status === 'confirmed' && group.maxCapacity != null
                ? `${group.items.length}/${group.maxCapacity}`
                : `${group.items.length}`;
            const isOverCap = status === 'confirmed' && group.maxCapacity != null && group.items.length > group.maxCapacity;

            nodes.push(
                <div key={group.key} className="space-y-1.5">
                    <div
                        data-testid={`date-group-${group.key}`}
                        className={`flex items-center justify-between gap-1.5 px-2 py-1 rounded-lg text-[11px] font-semibold border ${
                            group.kind === 'priority'
                                ? 'bg-warning/10 border-warning/25 text-status-requested'
                                : group.isPast
                                    ? 'bg-amber-500/10 border-amber-500/30 text-status-requested'
                                    : 'bg-surface-elevated/80 border-border-subtle/80 text-muted'
                        }`}
                    >
                        <div className="flex items-center gap-1.5 min-w-0">
                            {group.kind === 'priority' ? (
                                <Star size={11} fill="currentColor" className="shrink-0" />
                            ) : group.isPast ? (
                                <AlertTriangle size={11} className="shrink-0" />
                            ) : (
                                <Calendar size={11} className="shrink-0" />
                            )}
                            <span className="truncate">
                                {group.isPast ? `Past · ${group.label}` : group.label}
                            </span>
                            <span className={`font-mono text-[10px] px-1.5 py-px rounded-full ${
                                isOverCap ? 'bg-red-500/15 text-status-rejected font-bold' : 'bg-background/70 text-primary'
                            }`}>
                                {capText}
                            </span>
                        </div>
                        <button
                            type="button"
                            onClick={() => selectAllInList(group.items)}
                            aria-label={`${groupAllSelected ? 'Deselect' : 'Select'} all ${group.items.length} in ${group.label}`}
                            title={`${groupAllSelected ? 'Deselect' : 'Select'} all ${group.items.length} in ${group.label}`}
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold transition-colors cursor-pointer shrink-0 ${
                                groupAllSelected
                                    ? 'bg-brand-500 text-white'
                                    : groupSomeSelected
                                        ? 'bg-brand-500/20 text-brand-600 dark:text-brand-400'
                                        : 'hover:bg-surface text-muted hover:text-primary'
                            }`}
                        >
                            {groupAllSelected ? <Check size={10} strokeWidth={3} /> : null}
                            <span>{groupAllSelected ? 'Selected' : 'Select'}</span>
                        </button>
                    </div>
                    {visibleInGroup.map(renderCard)}
                </div>
            );
        }
        return nodes;
    };

    return (
        <div
            ref={setNodeRef}
            className={`flex-1 min-h-0 flex flex-col bg-transparent md:bg-surface rounded-xl md:rounded-2xl shadow-none md:shadow-card border-0 md:border border-border-subtle overflow-hidden transition-colors duration-200 ${
                isOver ? 'ring-2 ring-brand-500 bg-brand-50/50 dark:bg-brand-500/5' : ''
            }`}
        >
            <div className={`sticky top-0 z-10 border-b ${cfg.border} bg-surface-elevated`}>
                <div className={`h-[3px] w-full bg-linear-to-r ${cfg.gradient}`} />
                <div className="status-column-header px-2 py-2 md:px-3.5 md:py-2.5">
                    <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1.5 md:gap-2 min-w-0 flex-wrap">
                            <span className={`${cfg.color} flex items-center shrink-0 scale-90 md:scale-100`}>
                                {cfg.icon}
                            </span>
                            <h3 className={`text-[13px] md:text-sm font-semibold ${cfg.color}`}>{cfg.label}</h3>
                            <span className={`text-xs font-semibold px-1.5 py-0.5 md:px-2 md:py-0.5 rounded-full ${cfg.pillBg} shadow-xs tabular-nums`}>
                                {items.length}
                            </span>
                            {loadingOlder && (
                                <span role="status" className="flex items-center text-muted" title="Loading older enrollments">
                                    <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                                    <span className="sr-only">Loading older enrollments</span>
                                </span>
                            )}
                            {status === 'requested' && (priorityCount > 0 || priorityOnly) && (
                                onTogglePriorityFilter ? (
                                    <button
                                        type="button"
                                        onClick={onTogglePriorityFilter}
                                        aria-pressed={priorityOnly}
                                        className={`flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full shadow-xs transition-all cursor-pointer ${
                                            priorityOnly
                                                ? 'bg-amber-500 text-white ring-2 ring-amber-500/30'
                                                : 'priority-badge hover:brightness-95'
                                        }`}
                                        title={priorityOnly ? 'Showing priority only — click to show all' : `${priorityCount} priority — click to filter`}
                                    >
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="shrink-0">
                                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                                        </svg>
                                        {priorityCount}
                                    </button>
                                ) : (
                                    <span
                                        className="flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full priority-badge shadow-xs"
                                        title={`${priorityCount} priority enrollment${priorityCount > 1 ? 's' : ''}`}
                                    >
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="shrink-0">
                                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                                        </svg>
                                        {priorityCount}
                                    </span>
                                )
                            )}
                            {status === 'invited' && (expiredCount > 0 || inviteFilter === 'expired') && onToggleInviteFilter && (
                                <button
                                    type="button"
                                    onClick={() => onToggleInviteFilter('expired')}
                                    aria-pressed={inviteFilter === 'expired'}
                                    title={inviteFilter === 'expired' ? 'Showing expired only — click to show all' : `${expiredCount} expired invitation(s) — click to filter`}
                                    className={`inline-flex items-center gap-0.5 text-[11px] font-bold px-1.5 py-0.5 rounded-full tabular-nums transition-all cursor-pointer ${
                                        inviteFilter === 'expired'
                                            ? 'bg-red-600 text-white shadow-xs'
                                            : 'bg-red-500/15 text-status-rejected hover:bg-red-500/25'
                                    }`}
                                >
                                    <Timer size={10} />
                                    {expiredCount}
                                </button>
                            )}
                            {status === 'invited' && (dueSoonCount > 0 || inviteFilter === 'soon') && onToggleInviteFilter && (
                                <button
                                    type="button"
                                    onClick={() => onToggleInviteFilter('soon')}
                                    aria-pressed={inviteFilter === 'soon'}
                                    title={inviteFilter === 'soon' ? 'Showing due within 48h — click to show all' : `${dueSoonCount} due within 48h — click to filter`}
                                    className={`inline-flex items-center gap-0.5 text-[11px] font-bold px-1.5 py-0.5 rounded-full tabular-nums transition-all cursor-pointer ${
                                        inviteFilter === 'soon'
                                            ? 'bg-amber-500 text-white shadow-xs'
                                            : 'bg-amber-500/15 text-status-requested hover:bg-amber-500/25'
                                    }`}
                                >
                                    {dueSoonCount} soon
                                </button>
                            )}
                            {status === 'confirmed' && cohortCapacity && (
                                <span
                                    title={`${cohortCapacity.confirmed} confirmed of ${cohortCapacity.max} places`}
                                    className={`text-[11px] font-bold font-mono px-1.5 py-0.5 rounded-full ${
                                        cohortCapacity.confirmed > cohortCapacity.max
                                            ? 'bg-red-500/15 text-status-rejected'
                                            : cohortCapacity.confirmed === cohortCapacity.max
                                                ? 'bg-amber-500/15 text-status-requested'
                                                : 'bg-success/15 text-status-confirmed'
                                    }`}
                                >
                                    {cohortCapacity.confirmed}/{cohortCapacity.max}
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                            {canPickTopN && (
                                <div ref={topNRef} className="relative">
                                    <CustomTooltip content="Select first N in queue">
                                        <button
                                            type="button"
                                            onClick={() => setTopNOpen(prev => !prev)}
                                            aria-label="Select top N in queue"
                                            aria-expanded={topNOpen}
                                            className={`hit-area p-1.5 rounded-lg transition-colors ${
                                                topNOpen
                                                    ? 'bg-brand-500/15 text-brand-600 dark:text-brand-400'
                                                    : 'text-muted hover:text-primary hover:bg-surface'
                                            }`}
                                        >
                                            <ListChecks size={14} />
                                        </button>
                                    </CustomTooltip>
                                    {topNOpen && (
                                        <div
                                            role="dialog"
                                            aria-label="Select top N from queue"
                                            className="absolute right-0 top-full mt-1.5 z-40 w-56 rounded-xl bg-surface border border-border-subtle shadow-float p-3 space-y-2.5 animate-popoverScaleIn origin-top-right"
                                        >
                                            <p className="text-xs font-bold text-primary">Select first N in queue</p>
                                            <div className="flex flex-wrap gap-1.5">
                                                {topNPresets.map(n => (
                                                    <button
                                                        key={n}
                                                        type="button"
                                                        onClick={() => applyTopN(n)}
                                                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                                                            suggestedTopN === n
                                                                ? 'bg-brand-500/10 border-brand-500/40 text-brand-600 dark:text-brand-400 hover:bg-brand-500/20'
                                                                : 'bg-surface-elevated border-border-subtle text-primary hover:border-brand-500'
                                                        }`}
                                                    >
                                                        Top {n}
                                                    </button>
                                                ))}
                                            </div>
                                            <form
                                                className="flex gap-1.5"
                                                onSubmit={e => {
                                                    e.preventDefault();
                                                    const n = parseInt(customN, 10);
                                                    if (n > 0) applyTopN(n);
                                                }}
                                            >
                                                <input
                                                    type="number"
                                                    min={1}
                                                    max={items.length}
                                                    value={customN}
                                                    onChange={e => setCustomN(e.target.value)}
                                                    placeholder="Custom…"
                                                    aria-label="Custom number of students"
                                                    className="w-full min-w-0 px-2.5 py-1.5 text-xs bg-surface-elevated border border-border-subtle rounded-lg text-primary focus:outline-hidden focus:border-brand-500"
                                                />
                                                <button
                                                    type="submit"
                                                    disabled={!parseInt(customN, 10)}
                                                    className="px-2.5 py-1.5 text-xs font-semibold text-white bg-brand-500 hover:bg-brand-600 disabled:opacity-40 rounded-lg transition-colors shrink-0"
                                                >
                                                    Pick
                                                </button>
                                            </form>
                                            <label className="flex items-center gap-2 text-[11px] text-muted cursor-pointer select-none">
                                                <input
                                                    type="checkbox"
                                                    checked={skipUnreachable}
                                                    onChange={e => setSkipUnreachable(e.target.checked)}
                                                    className="rounded-sm accent-brand-500"
                                                />
                                                <span>Skip unsubscribed &amp; no email</span>
                                            </label>
                                        </div>
                                    )}
                                </div>
                            )}
                            {items.length > 0 && (
                                <CustomTooltip content={`Copy all ${items.length} ${cfg.label} emails`}>
                                    <button
                                        onClick={() => handleCopyEmails(items, cfg.label)}
                                        aria-label={`Copy all ${cfg.label} emails`}
                                        className="hit-area p-1.5 text-muted hover:text-primary hover:bg-surface rounded-lg transition-colors"
                                    >
                                        <Copy size={14} />
                                    </button>
                                </CustomTooltip>
                            )}
                            {items.length > 0 && (
                                <CustomTooltip content={allSelected ? `Deselect all ${items.length} in column` : `Select all ${items.length} in column`}>
                                    <button
                                        onClick={() => selectAllInList(items)}
                                        aria-label={allSelected ? 'Deselect all in column' : 'Select all in column'}
                                        className={`hit-area w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${allSelected
                                            ? 'bg-brand-500 border-brand-500 text-white shadow-xs'
                                            : someSelected
                                                ? 'bg-brand-500/20 border-brand-500/50 text-brand-500'
                                                : 'border-border-strong hover:border-brand-500/50'
                                            }`}
                                    >
                                        {(allSelected || someSelected) && <Check size={12} strokeWidth={3} />}
                                    </button>
                                </CustomTooltip>
                            )}
                            {canCollapse && onToggleCollapse && (
                                <CustomTooltip content={`Collapse ${cfg.label} column`}>
                                    <button
                                        type="button"
                                        onClick={onToggleCollapse}
                                        aria-label={`Collapse ${cfg.label} column`}
                                        className="hidden xl:inline-flex items-center justify-center p-1 text-muted hover:text-primary hover:bg-surface rounded-lg transition-colors"
                                    >
                                        <ChevronLeft size={14} />
                                    </button>
                                </CustomTooltip>
                            )}
                        </div>
                    </div>

                </div>
            </div>

            <div className="flex-1 min-h-0 relative" style={{ minHeight: 0 }}>
                <div
                    ref={cardsRef}
                    className={`status-column-cards p-2 overflow-y-auto space-y-1.5 bg-transparent md:bg-surface overscroll-y-contain touch-pan-y ${hasSelection ? 'pb-24' : ''}`}
                    style={{ height: '100%' }}
                    onScroll={handleScroll}
                >
                    {items.length === 0 && (
                        <div className={`flex flex-col items-center justify-center py-10 mx-1 mt-2 rounded-xl border-2 border-dashed transition-all duration-200 ${
                            isOver
                                ? `${cfg.border} ${cfg.bg}`
                                : 'border-border-strong/40'
                        }`}>
                            <div className={`w-10 h-10 rounded-full ${cfg.bg} flex items-center justify-center mb-2.5 ${cfg.color} ${isOver ? 'scale-110' : 'opacity-40'} transition-transform`}>
                                {cfg.icon}
                            </div>
                            <p className={`text-xs font-semibold uppercase tracking-wider transition-colors ${isOver ? cfg.color : 'text-muted'}`}>
                                {isOver ? 'Drop here' : loadingOlder ? 'Loading…' : 'No enrollments'}
                            </p>
                        </div>
                    )}
                    {renderCardsList()}
                    {/* Sentinel for IntersectionObserver lazy load */}
                    {visibleCount < items.length && (
                        <div ref={sentinelRef} className="py-3 flex items-center justify-center">
                            <div className="flex gap-1">
                                <div className="w-1.5 h-1.5 rounded-full bg-brand-400/60 animate-bounce" style={{ animationDelay: '0ms' }} />
                                <div className="w-1.5 h-1.5 rounded-full bg-brand-400/60 animate-bounce" style={{ animationDelay: '150ms' }} />
                                <div className="w-1.5 h-1.5 rounded-full bg-brand-400/60 animate-bounce" style={{ animationDelay: '300ms' }} />
                            </div>
                        </div>
                    )}
                </div>
                {items.length > 0 && (
                    <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-10 bg-linear-to-t from-background md:from-surface to-transparent rounded-b-xl md:rounded-b-2xl" />
                )}
            </div>
        </div>
    );
};

export default memo(StatusColumn, (prev, next) => {
    if (prev.status !== next.status) return false;
    if (prev.toggleSelect !== next.toggleSelect) return false;
    if (prev.selectMany !== next.selectMany) return false;
    if (prev.onSelectTopN !== next.onSelectTopN) return false;
    if (prev.togglePriority !== next.togglePriority) return false;
    if (prev.openEditNote !== next.openEditNote) return false;
    if (prev.onUpdateNote !== next.onUpdateNote) return false;
    if (prev.selectAllInList !== next.selectAllInList) return false;
    if (prev.handleCopyEmails !== next.handleCopyEmails) return false;
    if (prev.onFlagClick !== next.onFlagClick) return false;
    if (prev.totalCount !== next.totalCount) return false;
    if (prev.onShowDetail !== next.onShowDetail) return false;
    if (prev.onMoveStatus !== next.onMoveStatus) return false;
    if (prev.optedOutEmails !== next.optedOutEmails) return false;
    if (prev.onOpenApprovals !== next.onOpenApprovals) return false;
    if (prev.sessions !== next.sessions) return false;
    if (prev.filters !== next.filters) return false;
    if (prev.sortOrder !== next.sortOrder) return false;
    if (prev.loadingOlder !== next.loadingOlder) return false;
    if (prev.expiredCount !== next.expiredCount) return false;
    if (prev.dueSoonCount !== next.dueSoonCount) return false;
    if (prev.inviteFilter !== next.inviteFilter) return false;
    if (prev.onToggleInviteFilter !== next.onToggleInviteFilter) return false;
    if (prev.priorityOnly !== next.priorityOnly) return false;
    if (prev.onTogglePriorityFilter !== next.onTogglePriorityFilter) return false;
    if (prev.cohortCapacity?.confirmed !== next.cohortCapacity?.confirmed || prev.cohortCapacity?.max !== next.cohortCapacity?.max) return false;
    if (prev.suggestedTopN !== next.suggestedTopN) return false;
    if (prev.collapsed !== next.collapsed) return false;
    if (prev.canCollapse !== next.canCollapse) return false;
    if (prev.onToggleCollapse !== next.onToggleCollapse) return false;
    if (prev.hasSelection !== next.hasSelection) return false;

    if (prev.items === next.items &&
        prev.selectedIds === next.selectedIds &&
        prev.queuePositions === next.queuePositions &&
        prev.queueDetails === next.queueDetails &&
        prev.flagsByStudentId === next.flagsByStudentId &&
        prev.completedCoursesByStudentId === next.completedCoursesByStudentId) {
        return true;
    }

    if (prev.items.length !== next.items.length) return false;
    // A changed row is a new object in the cached list (unchanged ones keep theirs), whatever
    // changed in it: the student's phone or name, a note, a date, a completion request
    for (let i = 0; i < prev.items.length; i++) {
        if (prev.items[i] !== next.items[i]) return false;
    }

    for (const item of prev.items) {
        if (prev.selectedIds.has(item.id) !== next.selectedIds.has(item.id)) return false;
    }
    for (const item of next.items) {
        if (prev.selectedIds.has(item.id) !== next.selectedIds.has(item.id)) return false;
    }

    for (const item of prev.items) {
        if (prev.queuePositions.get(item.id) !== next.queuePositions.get(item.id)) return false;
        if (prev.queueDetails.get(item.id) !== next.queueDetails.get(item.id)) return false;
    }

    // Compare flags and completed courses count for students in this column
    for (const item of prev.items) {
        const prevFlags = prev.flagsByStudentId.get(item.student_id);
        const nextFlags = next.flagsByStudentId.get(item.student_id);
        if ((prevFlags?.length || 0) !== (nextFlags?.length || 0)) return false;

        const prevCourses = prev.completedCoursesByStudentId.get(item.student_id);
        const nextCourses = next.completedCoursesByStudentId.get(item.student_id);
        if ((prevCourses?.length || 0) !== (nextCourses?.length || 0)) return false;
    }

    return true;
});
