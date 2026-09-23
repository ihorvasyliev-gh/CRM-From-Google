import React, { useEffect, useRef } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import {
    ArrowDownUp, BookOpen, Calendar, ChevronLeft, ChevronRight, MessageSquare, RefreshCw, Star, Users,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { cleanVariant, type ViewerStudentDirectoryItem } from '../lib/types';
import { formatDateDMY } from '../lib/dateUtils';
import { useViewerCourses } from './Viewer/useViewerData';
import { useUrlParams, useUrlSearchInput } from './Viewer/useUrlParams';
import { usePublishStudentList, useStudentDrawer } from './Viewer/studentDrawer';
import {
    Avatar, Button, ContactActions, CopyText, EmptyState, ErrorState, FilterChip, PageHeader, PriorityStar,
    SearchField, Segmented, SelectField, SkeletonRows, StatusBadge, type SegmentOption,
} from './Viewer/ViewerUI';
import { handleRowArrowKeys } from './Viewer/viewerMeta';
import { fullName, pluralize, relativeDay } from './Viewer/viewerUtils';

export type { ViewerStudentDirectoryItem };
export type SortOption = 'date_desc' | 'date_asc' | 'queue' | 'name_asc';
export type StatusFilterOption = 'all' | 'requested' | 'invited' | 'confirmed' | 'completed';

const STATUS_OPTIONS: SegmentOption<StatusFilterOption>[] = [
    { value: 'all', label: 'All' },
    { value: 'requested', label: 'In queue', dot: 'bg-amber-500' },
    { value: 'invited', label: 'Invited', dot: 'bg-sky-500' },
    { value: 'confirmed', label: 'Confirmed', dot: 'bg-emerald-500' },
    { value: 'completed', label: 'Completed', dot: 'bg-violet-500' },
];
const SORT_OPTIONS: { value: SortOption; label: string }[] = [
    { value: 'date_desc', label: 'Newest first' },
    { value: 'date_asc', label: 'Oldest first' },
    { value: 'queue', label: 'Queue position' },
    { value: 'name_asc', label: 'Name A–Z' },
];

const PAGE_SIZE = 50;

export default function ViewerStudentsDirectory() {
    const { get, setParams } = useUrlParams();
    const drawer = useStudentDrawer();
    const search = useUrlSearchInput('q', { page: null });

    const courseId = get('course') || 'all';
    const status = (STATUS_OPTIONS.some(o => o.value === get('status')) ? get('status') : 'all') as StatusFilterOption;
    const priorityOnly = get('priority') === '1';
    const sortBy = (SORT_OPTIONS.some(o => o.value === get('sort')) ? get('sort') : 'date_desc') as SortOption;
    const page = Math.max(1, parseInt(get('page', '1'), 10) || 1);
    const committedSearch = search.committed;

    const { data: courses = [] } = useViewerCourses();

    const {
        data: students = [],
        isLoading,
        isFetching,
        isPlaceholderData,
        error,
        refetch,
    } = useQuery<ViewerStudentDirectoryItem[]>({
        queryKey: ['viewer_students_directory', committedSearch, courseId, status, priorityOnly, sortBy, page],
        queryFn: async () => {
            const { data, error } = await supabase.rpc('get_viewer_students_directory', {
                p_search: committedSearch || null,
                p_course_id: courseId === 'all' ? null : courseId,
                p_status: status === 'all' ? null : status,
                p_priority_only: priorityOnly,
                p_sort_by: sortBy,
                p_limit: PAGE_SIZE,
                p_offset: (page - 1) * PAGE_SIZE,
            });
            if (error) throw error;
            return (data || []) as ViewerStudentDirectoryItem[];
        },
        // Keep the current page on screen while the next page / search result loads
        placeholderData: keepPreviousData,
    });

    usePublishStudentList(students.map(s => s.student_id));

    const totalCount = students.length > 0 ? Number(students[0].total_count) : 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
    const from = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
    const to = Math.min(page * PAGE_SIZE, totalCount);

    // Scroll back to the top of the list when the page changes
    const topRef = useRef<HTMLDivElement>(null);
    const prevPage = useRef(page);
    useEffect(() => {
        if (prevPage.current !== page) topRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
        prevPage.current = page;
    }, [page]);

    const setFilter = (patch: Record<string, string | number | boolean | null>) => setParams({ ...patch, page: null });
    const goToPage = (p: number) => setParams({ page: p <= 1 ? null : p });

    const selectedCourse = courses.find(c => c.id === courseId);
    const isFiltered = !!(search.value.trim() || courseId !== 'all' || status !== 'all' || priorityOnly || sortBy !== 'date_desc');
    const resetFilters = () => {
        search.setValue('');
        setParams({ q: null, course: null, status: null, priority: null, sort: null, page: null });
    };

    return (
        <div ref={topRef} className="max-w-7xl mx-auto w-full min-w-0 space-y-4 animate-fadeIn scroll-mt-20">
            <PageHeader
                title="Students"
                subtitle={
                    isLoading ? 'Loading…' : error ? 'Failed to load' : (
                        <span className="inline-flex items-center gap-2">
                            {pluralize(totalCount, 'student')}{isFiltered ? ' match' : ''}
                            {isFetching && <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse" title="Updating…" />}
                        </span>
                    )
                }
                actions={
                    <Button onClick={() => refetch()} aria-label="Refresh students" title="Refresh">
                        <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
                        <span className="hidden sm:inline">Refresh</span>
                    </Button>
                }
            />

            {/* Toolbar */}
            <div className="space-y-2">
                <SearchField
                    value={search.value}
                    onChange={search.setValue}
                    onClear={search.clear}
                    placeholder="Search by name, email, phone or eircode…"
                    ariaLabel="Search students"
                    onEnter={() => { if (students.length === 1) drawer.open(students[0].student_id); }}
                />
                <div className="flex flex-col md:flex-row gap-2">
                    <Segmented className="self-start" ariaLabel="Status filter" options={STATUS_OPTIONS} value={status} onChange={v => setFilter({ status: v === 'all' ? null : v })} />
                    <div className="flex gap-2 flex-1 min-w-0">
                        <SelectField label="Course filter" value={courseId} onChange={v => setFilter({ course: v === 'all' ? null : v })} className="flex-1 min-w-0 md:max-w-[260px]" icon={<BookOpen size={13} />}>
                            <option value="all">All courses</option>
                            {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </SelectField>
                        <button
                            type="button"
                            aria-pressed={priorityOnly}
                            onClick={() => setFilter({ priority: priorityOnly ? null : '1' })}
                            className={`h-9 px-3 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 border whitespace-nowrap transition-all ${
                                priorityOnly ? 'priority-badge' : 'bg-surface text-muted hover:text-primary border-border-subtle'
                            }`}
                            title="Show priority students only"
                        >
                            <Star size={13} className={priorityOnly ? 'fill-amber-400 text-amber-500' : ''} />
                            <span className="hidden sm:inline">Priority</span>
                        </button>
                        <SelectField label="Sort by" value={sortBy} onChange={v => setFilter({ sort: v === 'date_desc' ? null : v })} className="w-40 shrink-0" icon={<ArrowDownUp size={13} />}>
                            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </SelectField>
                    </div>
                </div>
                {isFiltered && (
                    <div className="flex items-center gap-1.5 flex-wrap text-xs">
                        {search.value.trim() && <FilterChip label={`"${search.value.trim()}"`} onRemove={search.clear} />}
                        {selectedCourse && <FilterChip label={selectedCourse.name} onRemove={() => setFilter({ course: null })} />}
                        {status !== 'all' && <FilterChip label={STATUS_OPTIONS.find(o => o.value === status)?.label} onRemove={() => setFilter({ status: null })} />}
                        {priorityOnly && <FilterChip label="Priority" onRemove={() => setFilter({ priority: null })} />}
                        {sortBy !== 'date_desc' && <FilterChip label={SORT_OPTIONS.find(o => o.value === sortBy)?.label} onRemove={() => setFilter({ sort: null })} />}
                        <button type="button" onClick={resetFilters} className="ml-1 font-semibold text-brand-600 dark:text-brand-400 hover:underline">
                            Reset filters
                        </button>
                    </div>
                )}
            </div>

            {/* Results */}
            {isLoading ? (
                <SkeletonRows rows={8} />
            ) : error ? (
                <ErrorState title="Failed to load students" error={error} onRetry={() => refetch()} />
            ) : students.length === 0 ? (
                <EmptyState
                    icon={<Users size={22} />}
                    title={isFiltered ? 'No students match these filters' : 'No students yet'}
                    description={isFiltered ? 'Try a different search or reset the filters.' : 'Students will appear here once they register.'}
                    action={isFiltered ? <Button variant="primary" onClick={resetFilters}>Reset filters</Button> : undefined}
                />
            ) : (
                <>
                    <div className={`bg-surface rounded-2xl border border-border-subtle shadow-card overflow-hidden transition-opacity ${isPlaceholderData ? 'opacity-60' : ''}`}>
                        <div className="hidden md:flex items-center gap-3 px-4 h-10 border-b border-border-subtle bg-surface-elevated/50 text-[11px] font-bold uppercase tracking-wider text-muted">
                            <span className="flex-1 pl-12">Student</span>
                            <span className="hidden lg:block w-36">Phone</span>
                            <span className="w-[30%]">Course & status</span>
                            <span className="w-28">Registered</span>
                            <span className="w-[88px]" />
                        </div>
                        <div data-row-list className="divide-y divide-border-subtle">
                            {students.map(s => (
                                <StudentRow key={s.student_id} student={s} onOpen={() => drawer.open(s.student_id)} active={drawer.currentId === s.student_id} />
                            ))}
                        </div>
                    </div>

                    {totalPages > 1 && (
                        <nav className="flex items-center justify-between gap-3" aria-label="Pagination">
                            <span className="text-xs text-muted">
                                <strong className="text-primary tabular-nums">{from}–{to}</strong> of <span className="tabular-nums">{totalCount}</span>
                            </span>
                            <div className="flex items-center gap-1">
                                <Button size="sm" onClick={() => goToPage(page - 1)} disabled={page <= 1} aria-label="Previous page">
                                    <ChevronLeft size={14} /> <span className="hidden sm:inline">Previous</span>
                                </Button>
                                <span className="px-2 text-xs font-medium text-muted tabular-nums">
                                    Page <strong className="text-primary">{page}</strong> of <strong className="text-primary">{totalPages}</strong>
                                </span>
                                <Button size="sm" onClick={() => goToPage(page + 1)} disabled={page >= totalPages} aria-label="Next page">
                                    <span className="hidden sm:inline">Next</span> <ChevronRight size={14} />
                                </Button>
                            </div>
                        </nav>
                    )}
                </>
            )}
        </div>
    );
}

function StudentRow({ student, onOpen, active }: { student: ViewerStudentDirectoryItem; onOpen: () => void; active: boolean }) {
    const name = fullName(student);
    const variant = student.primary_course_name && student.primary_course_variant
        ? cleanVariant(student.primary_course_name, student.primary_course_variant)
        : null;

    const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.target !== e.currentTarget) return;
        if (handleRowArrowKeys(e)) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); }
    };

    return (
        <div
            data-row
            data-testid="student-row"
            tabIndex={0}
            onClick={onOpen}
            onKeyDown={onKeyDown}
            aria-label={`Open ${name}`}
            className={`group flex items-center gap-3 px-3 sm:px-4 py-3 cursor-pointer transition-colors focus-visible:outline-none focus-visible:bg-brand-500/5 ${
                active ? 'bg-brand-500/[0.07]' : 'hover:bg-surface-elevated/60'
            }`}
        >
            <Avatar id={student.student_id} person={student} />

            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-semibold text-sm text-primary truncate group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">{name}</span>
                    {student.is_priority && <PriorityStar />}
                    {student.notes_count > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-muted" title={`${pluralize(student.notes_count, 'note')}`}>
                            <MessageSquare size={11} className="text-brand-500" />{student.notes_count}
                        </span>
                    )}
                </div>
                <div className="text-xs text-muted flex items-center gap-2 min-w-0">
                    <CopyText value={student.email} label="Email" className="min-w-0" />
                    {student.phone && <CopyText value={student.phone} label="Phone" className="lg:hidden shrink-0 hidden sm:block">· {student.phone}</CopyText>}
                </div>
                {/* Mobile: course & status */}
                <div className="md:hidden flex items-center gap-1.5 mt-1.5 min-w-0">
                    <StatusBadge status={student.primary_status} queuePosition={student.primary_queue_position} />
                    <span className="text-[11px] text-muted truncate">{student.primary_course_name}</span>
                    {student.total_enrollments > 1 && <span className="text-[10px] font-bold text-brand-600 dark:text-brand-400 shrink-0">+{student.total_enrollments - 1}</span>}
                </div>
            </div>

            <div className="hidden lg:block w-36 text-xs text-muted truncate">
                {student.phone ? <CopyText value={student.phone} label="Phone" /> : <span className="text-muted/50">—</span>}
            </div>

            <div className="hidden md:block w-[30%] min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-xs font-medium text-primary truncate">{student.primary_course_name || <span className="text-muted">No course</span>}</span>
                    {variant && <span className="text-[10px] text-muted bg-surface-elevated border border-border-subtle px-1.5 py-0.5 rounded-md shrink-0">{variant}</span>}
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                    <StatusBadge status={student.primary_status} queuePosition={student.primary_queue_position} />
                    {student.total_enrollments > 1 && (
                        <span className="text-[10px] font-bold text-brand-600 dark:text-brand-400" title="Enrolled in other courses too">
                            +{student.total_enrollments - 1} more
                        </span>
                    )}
                </div>
            </div>

            <div className="hidden md:block w-28 text-xs">
                <div className="text-primary inline-flex items-center gap-1"><Calendar size={11} className="text-muted" />{formatDateDMY(student.created_at)}</div>
                <div className="text-[11px] text-muted">{relativeDay(student.created_at.slice(0, 10))}</div>
            </div>

            <div className="flex items-center justify-end gap-1 md:w-[88px] shrink-0">
                <ContactActions phone={student.phone} name={name} className="hidden xl:flex opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity" />
                <ChevronRight size={16} className="text-muted/60 group-hover:text-muted" />
            </div>
        </div>
    );
}
