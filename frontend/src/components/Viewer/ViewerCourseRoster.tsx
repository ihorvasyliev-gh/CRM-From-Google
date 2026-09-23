import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
    ArrowLeft, ArrowDownUp, Calendar, CheckSquare, ChevronRight, Clock, Copy, Download, FileSpreadsheet,
    GraduationCap, Layers, Loader2, Minus, Phone, RefreshCw, Square, Users, X, AlertTriangle,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { cleanVariant, type ViewerCourseRosterItem } from '../../lib/types';
import { formatDateDMY } from '../../lib/dateUtils';
import { exportViewerRosterToExcel } from '../../lib/excelExport';
import { toast } from '../../lib/toast';
import { isAnyModalOpen } from '../../hooks/useModalBehavior';
import { useNextSessionByCourse, useViewerCourses, useViewerUpcoming } from './useViewerData';
import { useUrlParams, useUrlSearchInput } from './useUrlParams';
import { usePublishStudentList, useStudentDrawer } from './studentDrawer';
import CompletionRequestModal, { type CompletionTarget } from './CompletionRequestModal';
import {
    Avatar, Button, CopyText, EmptyState, ErrorState, FilterChip, PriorityStar, SearchField,
    Segmented, SelectField, SkeletonRows, StatusBadge, StatusDistributionBar, type SegmentOption,
} from './ViewerUI';
import { handleRowArrowKeys } from './viewerMeta';
import {
    copyList, daysFromToday, fullName, isCompletable, nameSortKey, pluralize, relativeDay, sessionDate, weekdayDate,
} from './viewerUtils';

type RosterTab = 'all' | 'confirmed' | 'invited' | 'requested' | 'completed' | 'awaiting' | 'declined';
type RosterSort = 'queue' | 'session' | 'newest' | 'name';

const TABS: RosterTab[] = ['all', 'confirmed', 'invited', 'requested', 'completed', 'awaiting', 'declined'];
const SORTS: { value: RosterSort; label: string }[] = [
    { value: 'queue', label: 'Queue order' },
    { value: 'session', label: 'Course date' },
    { value: 'newest', label: 'Newest first' },
    { value: 'name', label: 'Name A–Z' },
];
const STATUS_RANK: Record<string, number> = { confirmed: 1, invited: 2, requested: 3, completed: 4, rejected: 5, withdrawn: 6 };

function matchesSearch(item: ViewerCourseRosterItem, q: string): boolean {
    if (!q) return true;
    const phoneDigits = (item.phone || '').replace(/\D/g, '');
    const haystack = `${item.first_name} ${item.last_name} ${item.last_name} ${item.first_name} ${item.email} ${item.phone || ''}`.toLowerCase();
    return q.toLowerCase().split(/\s+/).every(token => {
        const digits = token.replace(/\D/g, '');
        return haystack.includes(token) || (digits.length >= 3 && phoneDigits.includes(digits));
    });
}

export default function ViewerCourseRoster({ courseId }: { courseId: string }) {
    const { get, setParams } = useUrlParams();
    const drawer = useStudentDrawer();
    const search = useUrlSearchInput('q');

    const tab = (TABS as string[]).includes(get('status')) ? (get('status') as RosterTab) : 'all';
    const sort = SORTS.some(s => s.value === get('sort')) ? (get('sort') as RosterSort) : 'queue';
    const dateFilter = get('date');
    const stream = get('stream');
    const showPast = get('past') === '1';

    const { data: courses = [], isLoading: loadingCourses } = useViewerCourses();
    const course = courses.find(c => c.id === courseId);
    const { data: upcoming = [] } = useViewerUpcoming();
    const nextSession = useNextSessionByCourse(upcoming).get(courseId);

    const {
        data: roster = [],
        isLoading,
        isFetching,
        error,
        refetch,
        dataUpdatedAt,
    } = useQuery<ViewerCourseRosterItem[]>({
        queryKey: ['viewer_course_roster', courseId],
        queryFn: async () => {
            const { data, error } = await supabase.rpc('get_viewer_course_roster', {
                p_course_id: courseId,
                p_status: null,
                p_search: null,
            });
            if (error) throw error;
            return (data || []) as ViewerCourseRosterItem[];
        },
    });

    const courseName = course?.name ?? '';

    // ── Derived collections ───────────────────────────────────
    const counts = useMemo(() => {
        const c: Record<RosterTab, number> = { all: roster.length, confirmed: 0, invited: 0, requested: 0, completed: 0, awaiting: 0, declined: 0 };
        roster.forEach(r => {
            if (r.status in c) c[r.status as RosterTab]++;
            if (r.completion_request_status === 'pending') c.awaiting++;
            if (r.completion_request_status === 'rejected' && r.status !== 'completed') c.declined++;
        });
        return c;
    }, [roster]);

    const inTab = useCallback((r: ViewerCourseRosterItem) => {
        switch (tab) {
            case 'all': return true;
            case 'awaiting': return r.completion_request_status === 'pending';
            case 'declined': return r.completion_request_status === 'rejected' && r.status !== 'completed';
            default: return r.status === tab;
        }
    }, [tab]);

    const streams = useMemo(() => {
        const set = new Set<string>();
        roster.forEach(r => { if (r.course_variant?.trim()) set.add(cleanVariant(courseName, r.course_variant)); });
        return Array.from(set).sort();
    }, [roster, courseName]);

    const inStream = useCallback((r: ViewerCourseRosterItem) =>
        !stream || cleanVariant(courseName, r.course_variant).toLowerCase() === stream.toLowerCase(), [stream, courseName]);

    const showDates = tab === 'all' || tab === 'confirmed' || tab === 'invited';
    const dates = useMemo(() => {
        if (!showDates) return [];
        const map = new Map<string, number>();
        roster.forEach(r => {
            if (!inTab(r) || !inStream(r)) return;
            const d = sessionDate(r);
            if (d) map.set(d, (map.get(d) || 0) + 1);
        });
        return Array.from(map.entries()).map(([date, count]) => ({ date, count, diff: daysFromToday(date) ?? 0 })).sort((a, b) => a.date.localeCompare(b.date));
    }, [roster, inTab, inStream, showDates]);
    const pastDates = dates.filter(d => d.diff < 0);
    const visibleDates = showPast || pastDates.some(d => d.date === dateFilter) ? dates : dates.filter(d => d.diff >= 0);

    const rows = useMemo(() => {
        const q = search.value.trim();
        const list = roster.filter(r => inTab(r) && inStream(r) && matchesSearch(r, q) && (!dateFilter || !showDates || sessionDate(r) === dateFilter));
        const byName = (a: ViewerCourseRosterItem, b: ViewerCourseRosterItem) => nameSortKey(a).localeCompare(nameSortKey(b));
        const created = (r: ViewerCourseRosterItem) => new Date(r.created_at).getTime();
        return list.sort((a, b) => {
            if (sort === 'name') return byName(a, b);
            if (sort === 'session') {
                const ad = sessionDate(a) ?? '9999';
                const bd = sessionDate(b) ?? '9999';
                return ad.localeCompare(bd) || byName(a, b);
            }
            if (tab === 'all' && a.status !== b.status) return (STATUS_RANK[a.status] ?? 99) - (STATUS_RANK[b.status] ?? 99);
            if (a.is_priority !== b.is_priority) return a.is_priority ? -1 : 1;
            if (sort === 'newest') return created(b) - created(a) || byName(a, b);
            if (a.status === 'requested' && b.status === 'requested' && a.queue_position != null && b.queue_position != null && a.queue_position !== b.queue_position) {
                return a.queue_position - b.queue_position;
            }
            return created(a) - created(b) || byName(a, b);
        });
    }, [roster, inTab, inStream, search.value, dateFilter, showDates, sort, tab]);

    usePublishStudentList(rows.map(r => r.student_id));

    // ── Selection ────────────────────────────────────────────
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const lastClicked = useRef<number | null>(null);
    useEffect(() => { setSelected(new Set()); lastClicked.current = null; }, [courseId]);

    const selectedRows = useMemo(() => rows.filter(r => selected.has(r.enrollment_id)), [rows, selected]);
    const allSelected = rows.length > 0 && selectedRows.length === rows.length;
    const someSelected = selectedRows.length > 0 && !allSelected;

    const toggleRow = (index: number, shiftKey: boolean) => {
        const id = rows[index].enrollment_id;
        const anchor = lastClicked.current;
        setSelected(prev => {
            const next = new Set(prev);
            const willSelect = !next.has(id);
            if (shiftKey && anchor !== null && anchor < rows.length) {
                const [from, to] = [Math.min(anchor, index), Math.max(anchor, index)];
                for (let i = from; i <= to; i++) {
                    if (willSelect) next.add(rows[i].enrollment_id);
                    else next.delete(rows[i].enrollment_id);
                }
            } else if (willSelect) next.add(id);
            else next.delete(id);
            return next;
        });
        lastClicked.current = index;
    };
    const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map(r => r.enrollment_id)));
    const clearSelection = useCallback(() => setSelected(new Set()), []);

    // Esc clears the selection (when nothing else wants it)
    useEffect(() => {
        if (selected.size === 0) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape' || e.defaultPrevented || isAnyModalOpen()) return;
            const t = e.target as HTMLElement | null;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
            clearSelection();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [selected.size, clearSelection]);

    // ── Actions ──────────────────────────────────────────────
    const [completionTargets, setCompletionTargets] = useState<CompletionTarget[] | null>(null);
    const [exporting, setExporting] = useState(false);

    const toTarget = (r: ViewerCourseRosterItem): CompletionTarget => ({ enrollmentId: r.enrollment_id, name: fullName(r), sessionDate: sessionDate(r) });
    const completableSelected = selectedRows.filter(r => isCompletable(r.status, r.completion_request_status));

    const exportRows = async (items: ViewerCourseRosterItem[], label: string) => {
        if (items.length === 0) return;
        setExporting(true);
        try {
            await exportViewerRosterToExcel({ items, courseName: courseName || 'course', filterLabel: label });
            toast.success(`Exported ${pluralize(items.length, 'student')} to Excel`);
        } catch (err) {
            toast.error((err as Error)?.message || 'Export failed');
        } finally {
            setExporting(false);
        }
    };

    const setFilter = (patch: Record<string, string | null>) => {
        setParams(patch);
    };

    const hasFilters = !!(search.value.trim() || dateFilter || stream || tab !== 'all');
    const resetFilters = () => {
        search.setValue('');
        setParams({ q: null, date: null, stream: null, status: null, past: null });
    };

    const tabOptions: SegmentOption<RosterTab>[] = [
        { value: 'all', label: 'All', count: counts.all },
        { value: 'confirmed', label: 'Confirmed', count: counts.confirmed, dot: 'bg-emerald-500' },
        { value: 'invited', label: 'Invited', count: counts.invited, dot: 'bg-sky-500' },
        { value: 'requested', label: 'In queue', count: counts.requested, dot: 'bg-amber-500' },
        { value: 'completed', label: 'Completed', count: counts.completed, dot: 'bg-violet-500' },
        ...(counts.awaiting || tab === 'awaiting' ? [{ value: 'awaiting' as const, label: 'Awaiting approval', count: counts.awaiting, icon: <Clock size={12} className="text-amber-500" /> }] : []),
        ...(counts.declined || tab === 'declined' ? [{ value: 'declined' as const, label: 'Declined', count: counts.declined, icon: <AlertTriangle size={12} className="text-red-500" /> }] : []),
    ];

    if (!loadingCourses && !course && !isLoading && roster.length === 0) {
        return (
            <div className="max-w-3xl mx-auto w-full pt-6">
                <EmptyState
                    icon={<Layers size={22} />}
                    title="Course not found"
                    description="It may have been removed, or the link is out of date."
                    action={<Link to="/courses" className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-brand-500 text-white text-xs font-semibold"><ArrowLeft size={14} /> All courses</Link>}
                />
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto w-full space-y-4 animate-fadeIn pb-20">
            {/* Header */}
            <div className="space-y-3">
                <Link to="/courses" className="inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-primary transition-colors group">
                    <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
                    All courses
                </Link>
                <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                        <h1 className="text-2xl sm:text-[28px] font-bold tracking-tight text-primary leading-tight">
                            {course?.name ?? <span className="inline-block h-7 w-64 bg-muted/15 rounded-lg animate-pulse align-middle" />}
                        </h1>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                            <span className="inline-flex items-center gap-1"><Users size={13} /> {pluralize(course?.total_count ?? roster.length, 'student')}</span>
                            {nextSession && (
                                <button
                                    type="button"
                                    onClick={() => setFilter({ status: null, date: nextSession.course_date })}
                                    className="inline-flex items-center gap-1 hover:text-primary"
                                    title="Show students booked for the next session"
                                >
                                    <Calendar size={13} className="text-emerald-500" />
                                    Next session <strong className="text-primary">{weekdayDate(nextSession.course_date)}</strong> · {relativeDay(nextSession.course_date)}
                                </button>
                            )}
                            {dataUpdatedAt > 0 && <span className="hidden sm:inline">Updated {new Date(dataUpdatedAt).toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' })}</span>}
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <Button onClick={() => refetch()} aria-label="Refresh roster" title="Refresh">
                            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
                            <span className="hidden sm:inline">Refresh</span>
                        </Button>
                        <Button
                            onClick={() => exportRows(rows, `${tab}${dateFilter ? `_${dateFilter}` : ''}`)}
                            disabled={exporting || rows.length === 0}
                            title="Export the students shown below to Excel"
                        >
                            {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} className="text-emerald-500" />}
                            Export {rows.length > 0 ? rows.length : ''}
                        </Button>
                    </div>
                </div>
                {course && (
                    <StatusDistributionBar className="h-2" counts={{ confirmed: counts.confirmed, invited: counts.invited, requested: counts.requested, completed: counts.completed }} />
                )}
            </div>

            {/* Attention banners */}
            {counts.declined > 0 && tab !== 'declined' && (
                <button
                    type="button"
                    onClick={() => setFilter({ status: 'declined', date: null })}
                    className="w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-red-500/5 border border-red-500/20 text-left text-xs text-red-700 dark:text-red-300 hover:bg-red-500/10 transition-colors"
                >
                    <AlertTriangle size={14} className="shrink-0" />
                    <span className="flex-1"><strong>{pluralize(counts.declined, 'completion request')}</strong> declined by an admin — review and re-submit if needed.</span>
                    <ChevronRight size={14} />
                </button>
            )}

            {/* Toolbar */}
            <div className="sticky top-[57px] z-10 -mx-3 sm:mx-0 px-3 sm:px-0 py-2 bg-background/90 backdrop-blur-md space-y-2">
                <div className="flex flex-col gap-2">
                    <Segmented className="self-start" ariaLabel="Status" options={tabOptions} value={tab} onChange={v => { setFilter({ status: v === 'all' ? null : v, date: null }); }} />
                    <div className="flex gap-2 flex-1 min-w-0">
                        <SearchField className="flex-1 min-w-0" value={search.value} onChange={search.setValue} onClear={search.clear} placeholder="Search name, email, phone…" ariaLabel="Search students in this course" />
                        {streams.length > 1 && (
                            <SelectField label="Stream" value={stream || 'all'} onChange={v => setFilter({ stream: v === 'all' ? null : v, date: null })} className="w-36 hidden sm:block" icon={<Layers size={13} />}>
                                <option value="all">All streams</option>
                                {streams.map(s => <option key={s} value={s}>{s}</option>)}
                            </SelectField>
                        )}
                        <SelectField label="Sort" value={sort} onChange={v => setFilter({ sort: v === 'queue' ? null : v })} className="w-40 hidden sm:block" icon={<ArrowDownUp size={13} />}>
                            {SORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </SelectField>
                    </div>
                </div>

                {/* Mobile-only secondary filters */}
                <div className="flex gap-2 sm:hidden">
                    {streams.length > 1 && (
                        <SelectField label="Stream" value={stream || 'all'} onChange={v => setFilter({ stream: v === 'all' ? null : v, date: null })} className="flex-1" icon={<Layers size={13} />}>
                            <option value="all">All streams</option>
                            {streams.map(s => <option key={s} value={s}>{s}</option>)}
                        </SelectField>
                    )}
                    <SelectField label="Sort" value={sort} onChange={v => setFilter({ sort: v === 'queue' ? null : v })} className="flex-1" icon={<ArrowDownUp size={13} />}>
                        {SORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </SelectField>
                </div>

                {showDates && dates.length > 0 && (
                    <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none" role="group" aria-label="Course dates">
                        <Calendar size={14} className="text-muted shrink-0 mr-0.5" />
                        <DateChip active={!dateFilter} onClick={() => setFilter({ date: null })} label="All dates" count={dates.reduce((s, d) => s + d.count, 0)} />
                        {!showPast && pastDates.length > 0 && !pastDates.some(d => d.date === dateFilter) && (
                            <button type="button" onClick={() => setFilter({ past: '1' })} className="shrink-0 h-7 px-2.5 rounded-lg text-xs font-semibold text-muted hover:text-primary border border-dashed border-border-strong">
                                +{pastDates.length} past
                            </button>
                        )}
                        {visibleDates.map(d => (
                            <DateChip
                                key={d.date}
                                active={dateFilter === d.date}
                                onClick={() => setFilter({ date: dateFilter === d.date ? null : d.date })}
                                label={d.diff === 0 ? 'Today' : d.diff === 1 ? 'Tomorrow' : weekdayDate(d.date)}
                                title={`${formatDateDMY(d.date)} · ${relativeDay(d.date)}`}
                                count={d.count}
                                past={d.diff < 0}
                                today={d.diff === 0}
                            />
                        ))}
                        {showPast && pastDates.length > 0 && (
                            <button type="button" onClick={() => setFilter({ past: null })} className="shrink-0 h-7 px-2.5 rounded-lg text-xs font-semibold text-muted hover:text-primary">
                                Hide past
                            </button>
                        )}
                    </div>
                )}

                {hasFilters && !isLoading && (
                    <div className="flex items-center gap-1.5 flex-wrap text-xs">
                        <span className="text-muted mr-1">
                            Showing <strong className="text-primary">{rows.length}</strong> of {roster.length}
                        </span>
                        {dateFilter && <FilterChip label={`Date: ${formatDateDMY(dateFilter)}`} onRemove={() => setFilter({ date: null })} />}
                        {stream && <FilterChip label={`Stream: ${stream}`} onRemove={() => setFilter({ stream: null })} />}
                        {search.value.trim() && <FilterChip label={`"${search.value.trim()}"`} onRemove={search.clear} />}
                        <button type="button" onClick={resetFilters} className="ml-1 font-semibold text-brand-600 dark:text-brand-400 hover:underline">Clear all</button>
                    </div>
                )}
            </div>

            {/* List */}
            {isLoading ? (
                <SkeletonRows />
            ) : error ? (
                <ErrorState title="Failed to load roster" error={error} onRetry={() => refetch()} />
            ) : rows.length === 0 ? (
                <EmptyState
                    icon={<Users size={22} />}
                    title={hasFilters ? 'No students match' : 'No students yet'}
                    description={hasFilters ? 'Try another tab, date or search.' : 'Nobody is enrolled in this course yet.'}
                    action={hasFilters ? <Button variant="primary" onClick={resetFilters}>Clear filters</Button> : undefined}
                />
            ) : (
                <div className="bg-surface rounded-2xl border border-border-subtle shadow-card overflow-hidden">
                    {/* Column header */}
                    <div className="flex items-center gap-3 px-3 sm:px-4 h-10 border-b border-border-subtle bg-surface-elevated/50 text-[11px] font-bold uppercase tracking-wider text-muted">
                        <button
                            type="button"
                            role="checkbox"
                            aria-checked={allSelected ? 'true' : someSelected ? 'mixed' : 'false'}
                            aria-label={allSelected ? 'Deselect all' : 'Select all'}
                            onClick={toggleAll}
                            className="p-1 -m-1 text-muted hover:text-brand-600"
                        >
                            {allSelected ? <CheckSquare size={17} className="text-brand-500" /> : someSelected ? <MinusSquare /> : <Square size={17} />}
                        </button>
                        <span className="flex-1">{selectedRows.length > 0 ? `${selectedRows.length} selected` : `${pluralize(rows.length, 'student')}`}</span>
                        <span className="hidden lg:block w-40">Phone</span>
                        <span className="hidden md:block w-36">Status</span>
                        <span className="hidden md:block w-36">Course date</span>
                        <span className="w-[120px] hidden sm:block" />
                    </div>
                    <div data-row-list className="divide-y divide-border-subtle">
                        {rows.map((r, i) => (
                            <RosterRow
                                key={r.enrollment_id}
                                item={r}
                                courseName={courseName}
                                selected={selected.has(r.enrollment_id)}
                                onToggle={shift => toggleRow(i, shift)}
                                onOpen={() => drawer.open(r.student_id)}
                                onRequestCompletion={() => setCompletionTargets([toTarget(r)])}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* Floating bulk action bar */}
            {selectedRows.length > 0 && (
                <div className="fixed left-1/2 bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] lg:bottom-6 z-30 w-[calc(100%-1.5rem)] sm:w-auto max-w-3xl animate-slideUpCenter" role="toolbar" aria-label="Bulk actions">
                    <div className="flex items-center gap-1.5 p-1.5 pl-3 bg-surface-elevated/95 backdrop-blur-md border border-border-strong/60 rounded-2xl shadow-float overflow-x-auto scrollbar-none">
                        <span className="text-xs font-bold text-primary whitespace-nowrap pr-1">{selectedRows.length} selected</span>
                        <Button size="sm" variant="ghost" onClick={() => copyList(selectedRows.map(r => r.email), 'Emails')} title="Copy emails (comma separated, ready for BCC)">
                            <Copy size={13} /> Emails
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => copyList(selectedRows.map(r => r.phone), 'Phone numbers')} title="Copy phone numbers">
                            <Phone size={13} /> Phones
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => exportRows(selectedRows, `${tab}_selected_${selectedRows.length}`)} disabled={exporting}>
                            {exporting ? <Loader2 size={13} className="animate-spin" /> : <FileSpreadsheet size={13} className="text-emerald-500" />} Export
                        </Button>
                        <Button
                            size="sm"
                            variant="success"
                            disabled={completableSelected.length === 0}
                            onClick={() => setCompletionTargets(completableSelected.map(toTarget))}
                            title={completableSelected.length === 0 ? 'None of the selected students can be marked completed' : 'Request completion for the selected students'}
                        >
                            <GraduationCap size={13} /> Mark completed{completableSelected.length !== selectedRows.length && completableSelected.length > 0 ? ` (${completableSelected.length})` : ''}
                        </Button>
                        <button type="button" onClick={clearSelection} aria-label="Clear selection" title="Clear selection (Esc)" className="p-1.5 text-muted hover:text-primary rounded-lg hover:bg-surface shrink-0">
                            <X size={15} />
                        </button>
                    </div>
                </div>
            )}

            {completionTargets && (
                <CompletionRequestModal
                    targets={completionTargets}
                    context={courseName}
                    onClose={() => setCompletionTargets(null)}
                    onSubmitted={clearSelection}
                />
            )}
        </div>
    );
}

function MinusSquare() {
    return (
        <span className="relative inline-flex w-[17px] h-[17px] items-center justify-center text-brand-500">
            <Square size={17} className="absolute inset-0" />
            <Minus size={11} strokeWidth={3} />
        </span>
    );
}

function DateChip({ active, onClick, label, count, title, past, today }: { active: boolean; onClick: () => void; label: string; count: number; title?: string; past?: boolean; today?: boolean }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            title={title}
            className={`shrink-0 h-7 px-2.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 border transition-all whitespace-nowrap ${
                active
                    ? 'bg-brand-500 text-white border-brand-500 shadow-sm'
                    : today
                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 hover:border-emerald-500/60'
                    : `bg-surface border-border-subtle hover:border-border-strong ${past ? 'text-muted' : 'text-primary'}`
            }`}
        >
            {label}
            <span className={`tabular-nums text-[10px] font-bold ${active ? 'text-white/80' : 'text-muted'}`}>{count}</span>
        </button>
    );
}

function RosterRow({
    item,
    courseName,
    selected,
    onToggle,
    onOpen,
    onRequestCompletion,
}: {
    item: ViewerCourseRosterItem;
    courseName: string;
    selected: boolean;
    onToggle: (shift: boolean) => void;
    onOpen: () => void;
    onRequestCompletion: () => void;
}) {
    const name = fullName(item);
    const pending = item.completion_request_status === 'pending';
    const declined = item.completion_request_status === 'rejected' && item.status !== 'completed';
    const canComplete = isCompletable(item.status, item.completion_request_status);
    const session = sessionDate(item);
    const variant = item.course_variant ? cleanVariant(courseName, item.course_variant) : '';
    const sessionDiff = daysFromToday(session);

    const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.target !== e.currentTarget) return;
        if (handleRowArrowKeys(e)) return;
        if (e.key === 'Enter') { e.preventDefault(); onOpen(); }
        else if (e.key === ' ' || e.key === 'x') { e.preventDefault(); onToggle(e.shiftKey); }
    };

    return (
        <div
            data-row
            data-testid="roster-row"
            tabIndex={0}
            onClick={e => {
                if (e.shiftKey || e.metaKey || e.ctrlKey) { e.preventDefault(); onToggle(e.shiftKey); return; }
                onOpen();
            }}
            onKeyDown={onKeyDown}
            className={`group flex items-center gap-3 px-3 sm:px-4 py-3 cursor-pointer transition-colors focus-visible:outline-none focus-visible:bg-brand-500/5 focus-visible:shadow-[inset_3px_0_0_0] focus-visible:shadow-brand-500 ${
                selected ? 'bg-brand-500/[0.06]' : 'hover:bg-surface-elevated/60'
            }`}
        >
            <button
                type="button"
                role="checkbox"
                aria-checked={selected}
                aria-label={selected ? `Deselect ${name}` : `Select ${name}`}
                onClick={e => { e.stopPropagation(); onToggle(e.shiftKey); }}
                onKeyDown={e => e.stopPropagation()}
                className="p-1 -m-1 text-muted hover:text-brand-600 shrink-0 self-start sm:self-center mt-2 sm:mt-0"
            >
                {selected ? <CheckSquare size={17} className="text-brand-500" /> : <Square size={17} />}
            </button>

            <Avatar id={item.student_id} person={item} />

            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-semibold text-sm text-primary truncate group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">{name}</span>
                    {item.is_priority && <PriorityStar />}
                    {variant && <span className="hidden sm:inline text-[10px] font-medium text-muted bg-surface-elevated border border-border-subtle px-1.5 py-0.5 rounded-md shrink-0">{variant}</span>}
                </div>
                <div className="text-xs text-muted flex items-center gap-2 min-w-0">
                    <CopyText value={item.email} label="Email" className="min-w-0" />
                    {item.phone && <CopyText value={item.phone} label="Phone" className="lg:hidden shrink-0">· {item.phone}</CopyText>}
                </div>
                {/* Mobile meta */}
                <div className="md:hidden flex items-center flex-wrap gap-1.5 mt-1.5">
                    <StatusBadge status={item.status} queuePosition={item.queue_position} pendingApproval={pending} />
                    {session && <span className="text-[11px] text-muted inline-flex items-center gap-1"><Calendar size={11} />{weekdayDate(session)}</span>}
                    {variant && <span className="sm:hidden text-[10px] text-muted">{variant}</span>}
                </div>
                {declined && (
                    <p className="mt-1 text-[11px] text-red-600 dark:text-red-400 line-clamp-2">
                        <strong>Completion declined:</strong> {item.completion_rejection_reason || 'no reason given'}
                    </p>
                )}
            </div>

            <div className="hidden lg:block w-40 text-xs text-muted truncate">
                {item.phone ? <CopyText value={item.phone} label="Phone" /> : <span className="text-muted/50">—</span>}
            </div>

            <div className="hidden md:block w-36">
                <StatusBadge status={item.status} queuePosition={item.queue_position} pendingApproval={pending} />
            </div>

            <div className="hidden md:block w-36 text-xs">
                {item.status === 'completed' && item.completed_date ? (
                    <span className="text-muted" title="Completed on">
                        <GraduationCap size={11} className="inline mr-1 -mt-0.5" />{formatDateDMY(item.completed_date)}
                    </span>
                ) : session ? (
                    <>
                        <div className="font-semibold text-primary">{weekdayDate(session)}</div>
                        <div className={`text-[11px] ${sessionDiff !== null && sessionDiff >= 0 && sessionDiff <= 2 ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-muted'}`}>{relativeDay(session)}</div>
                    </>
                ) : (
                    <span className="text-muted" title="Registered on">Reg. {formatDateDMY(item.created_at)}</span>
                )}
            </div>

            <div className="flex items-center justify-end gap-1 sm:w-[120px] shrink-0">
                {canComplete ? (
                    <button
                        type="button"
                        onClick={e => { e.stopPropagation(); onRequestCompletion(); }}
                        onKeyDown={e => e.stopPropagation()}
                        className="inline-flex items-center gap-1 h-8 px-2 rounded-lg text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10 border border-transparent hover:border-emerald-500/30 transition-colors"
                        title={declined ? 'Re-submit completion request' : 'Request completion'}
                        aria-label={`Mark ${name} completed`}
                    >
                        <GraduationCap size={15} />
                        <span className="hidden sm:inline">{declined ? 'Re-submit' : 'Complete'}</span>
                    </button>
                ) : null}
                <ChevronRight size={16} className="text-muted/60 group-hover:text-muted hidden sm:block" />
            </div>
        </div>
    );
}
