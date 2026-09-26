import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Calendar, Clock, LayoutGrid, List, Pin, PinOff, RefreshCw, ArrowDownUp, ChevronRight } from 'lucide-react';
import type { ViewerCourse, ViewerUpcomingCourse } from '../../lib/types';
import { usePersistentState } from '../../hooks/usePersistentState';
import { useNextSessionByCourse, useViewerCourses, useViewerUpcoming } from './useViewerData';
import { useUrlParams, useUrlSearchInput } from './useUrlParams';
import {
    Button, EmptyState, ErrorState, PageHeader, SearchField, SelectField, StatusDistributionBar,
} from './ViewerUI';
import { STATUS_META } from './viewerMeta';
import { pluralize, relativeDay, weekdayDate, daysFromToday } from './viewerUtils';

type CatalogSort = 'name' | 'next' | 'active' | 'queue' | 'pending';
const SORTS: { value: CatalogSort; label: string }[] = [
    { value: 'next', label: 'Next session' },
    { value: 'name', label: 'Name A–Z' },
    { value: 'active', label: 'Most students' },
    { value: 'queue', label: 'Longest queue' },
    { value: 'pending', label: 'Awaiting approval' },
];

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string');
const isView = (v: unknown): v is 'grid' | 'list' => v === 'grid' || v === 'list';

export default function ViewerCourseCatalog() {
    const navigate = useNavigate();
    const { get, setParams } = useUrlParams();
    const search = useUrlSearchInput('q');
    const sort = (SORTS.some(s => s.value === get('sort')) ? get('sort') : 'next') as CatalogSort;

    const [view, setView] = usePersistentState<'grid' | 'list'>('viewer_catalog_view', 'grid', { storage: 'local', validate: isView });
    const [pinned, setPinned] = usePersistentState<string[]>('viewer_pinned_courses', [], { storage: 'local', validate: isStringArray });

    const { data: courses = [], isLoading, error, refetch, isFetching } = useViewerCourses();
    const { data: upcoming = [] } = useViewerUpcoming();
    const nextByCourse = useNextSessionByCourse(upcoming);

    const togglePin = (id: string) => setPinned(prev => (prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]));
    const openCourse = (id: string, params?: Record<string, string>) => {
        const qs = params ? `?${new URLSearchParams(params).toString()}` : '';
        navigate(`/courses/${id}${qs}`);
    };

    const filtered = useMemo(() => {
        const q = search.value.trim().toLowerCase();
        const list = q ? courses.filter(c => c.name.toLowerCase().includes(q)) : [...courses];
        const byName = (a: ViewerCourse, b: ViewerCourse) => a.name.localeCompare(b.name);
        list.sort((a, b) => {
            switch (sort) {
                case 'name': return byName(a, b);
                case 'active': return (b.total_count - b.completed_count) - (a.total_count - a.completed_count) || byName(a, b);
                case 'queue': return b.requested_count - a.requested_count || byName(a, b);
                case 'pending': return b.pending_approval_count - a.pending_approval_count || byName(a, b);
                case 'next': {
                    const an = nextByCourse.get(a.id)?.course_date ?? '9999';
                    const bn = nextByCourse.get(b.id)?.course_date ?? '9999';
                    return an.localeCompare(bn) || byName(a, b);
                }
            }
        });
        return list;
    }, [courses, search.value, sort, nextByCourse]);

    const pinnedCourses = filtered.filter(c => pinned.includes(c.id));
    const otherCourses = filtered.filter(c => !pinned.includes(c.id));

    const totals = useMemo(() => courses.reduce(
        (acc, c) => ({
            students: acc.students + c.total_count,
            pending: acc.pending + c.pending_approval_count,
        }),
        { students: 0, pending: 0 }
    ), [courses]);

    const renderCourses = (list: ViewerCourse[]) =>
        view === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {list.map(c => (
                    <CourseCard key={c.id} course={c} next={nextByCourse.get(c.id)} pinned={pinned.includes(c.id)} onTogglePin={() => togglePin(c.id)} onOpen={openCourse} />
                ))}
            </div>
        ) : (
            <div className="bg-surface rounded-2xl border border-border-subtle divide-y divide-border-subtle overflow-hidden shadow-card">
                {list.map(c => (
                    <CourseListRow key={c.id} course={c} next={nextByCourse.get(c.id)} pinned={pinned.includes(c.id)} onTogglePin={() => togglePin(c.id)} onOpen={openCourse} />
                ))}
            </div>
        );

    return (
        <div className="max-w-7xl mx-auto w-full space-y-5 animate-fadeIn">
            <PageHeader
                title="Courses"
                subtitle={isLoading ? 'Loading courses…' : `${pluralize(courses.length, 'course')} · ${pluralize(totals.students, 'enrollment')}${totals.pending ? ` · ${totals.pending} awaiting approval` : ''}`}
                actions={
                    <Button onClick={() => refetch()} aria-label="Refresh courses" title="Refresh">
                        <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
                        <span className="hidden sm:inline">Refresh</span>
                    </Button>
                }
            />

            <div className="flex flex-col sm:flex-row gap-2">
                <SearchField
                    className="flex-1"
                    value={search.value}
                    onChange={search.setValue}
                    onClear={search.clear}
                    placeholder="Search courses…"
                    onEnter={() => { if (filtered.length === 1) openCourse(filtered[0].id); }}
                />
                <div className="flex gap-2">
                    <SelectField label="Sort courses" value={sort} onChange={v => setParams({ sort: v === 'next' ? null : v })} icon={<ArrowDownUp size={13} />} className="flex-1 sm:w-48">
                        {SORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </SelectField>
                    <div className="flex items-center p-1 bg-surface-elevated border border-border-subtle rounded-xl" role="group" aria-label="Layout">
                        {(['grid', 'list'] as const).map(v => (
                            <button
                                key={v}
                                type="button"
                                onClick={() => setView(v)}
                                aria-pressed={view === v}
                                title={v === 'grid' ? 'Card view' : 'List view'}
                                className={`w-8 h-7 flex items-center justify-center rounded-lg transition-all ${view === v ? 'bg-surface text-primary shadow-xs ring-1 ring-border-subtle' : 'text-muted hover:text-primary'}`}
                            >
                                {v === 'grid' ? <LayoutGrid size={14} /> : <List size={15} />}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {isLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3" aria-busy="true">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="bg-surface rounded-2xl border border-border-subtle p-4 space-y-3 animate-pulse">
                            <div className="h-4 bg-muted/15 rounded-sm w-2/3" />
                            <div className="h-3 bg-muted/10 rounded-sm w-1/2" />
                            <div className="h-1.5 bg-muted/15 rounded-full" />
                            <div className="grid grid-cols-4 gap-2">{[0, 1, 2, 3].map(j => <div key={j} className="h-8 bg-muted/10 rounded-lg" />)}</div>
                        </div>
                    ))}
                </div>
            ) : error ? (
                <ErrorState title="Failed to load courses" error={error} onRetry={() => refetch()} />
            ) : filtered.length === 0 ? (
                <EmptyState
                    icon={<BookOpen size={22} />}
                    title="No courses found"
                    description={search.value.trim() ? `Nothing matches "${search.value.trim()}".` : 'There are no courses yet.'}
                    action={search.value.trim() ? <Button variant="primary" onClick={search.clear}>Clear search</Button> : undefined}
                />
            ) : (
                <div className="space-y-5">
                    {pinnedCourses.length > 0 && (
                        <section className="space-y-2">
                            <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted flex items-center gap-1.5"><Pin size={12} /> Pinned</h2>
                            {renderCourses(pinnedCourses)}
                        </section>
                    )}
                    {otherCourses.length > 0 && (
                        <section className="space-y-2">
                            {pinnedCourses.length > 0 && <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted">All courses</h2>}
                            {renderCourses(otherCourses)}
                        </section>
                    )}
                </div>
            )}
        </div>
    );
}

interface CourseItemProps {
    course: ViewerCourse;
    next?: ViewerUpcomingCourse;
    pinned: boolean;
    onTogglePin: () => void;
    onOpen: (id: string, params?: Record<string, string>) => void;
}

function PinButton({ pinned, onToggle, name }: { pinned: boolean; onToggle: () => void; name: string }) {
    return (
        <button
            type="button"
            onClick={e => { e.stopPropagation(); onToggle(); }}
            onKeyDown={e => e.stopPropagation()}
            aria-pressed={pinned}
            aria-label={pinned ? `Unpin ${name}` : `Pin ${name}`}
            title={pinned ? 'Unpin' : 'Pin to top'}
            className={`p-1.5 rounded-lg transition-all shrink-0 ${pinned ? 'text-brand-500 bg-brand-500/10' : 'text-muted/60 hover:text-primary hover:bg-surface-elevated opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100'}`}
        >
            {pinned ? <PinOff size={14} /> : <Pin size={14} />}
        </button>
    );
}

function NextSession({ next }: { next?: ViewerUpcomingCourse }) {
    if (!next) return <span className="text-muted/70">No upcoming session</span>;
    const soon = (daysFromToday(next.course_date) ?? 99) <= 2;
    return (
        <span className="inline-flex items-center gap-1.5 min-w-0">
            <Calendar size={12} className={soon ? 'text-emerald-500' : 'text-muted'} />
            <span className="font-semibold text-primary">{weekdayDate(next.course_date)}</span>
            <span className={soon ? 'text-status-confirmed font-semibold' : 'text-muted'}>· {relativeDay(next.course_date)}</span>
            <span className="text-muted truncate">· {next.confirmed_count} confirmed{next.pending_count ? `, ${next.pending_count} pending` : ''}</span>
        </span>
    );
}

const STAT_KEYS = [
    { key: 'confirmed', field: 'confirmed_count' },
    { key: 'invited', field: 'invited_count' },
    { key: 'requested', field: 'requested_count' },
    { key: 'completed', field: 'completed_count' },
] as const;

function CourseCard({ course, next, pinned, onTogglePin, onOpen }: CourseItemProps) {
    const open = () => onOpen(course.id);
    return (
        <div
            role="link"
            tabIndex={0}
            aria-label={`Open ${course.name}`}
            onClick={open}
            onKeyDown={e => { if (e.key === 'Enter') open(); }}
            className="group bg-surface rounded-2xl border border-border-subtle shadow-card hover:shadow-card-hover hover:border-brand-500/40 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-500/40 transition-all cursor-pointer p-4 flex flex-col gap-3"
        >
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <h3 className="font-bold text-primary text-[15px] leading-snug line-clamp-2 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">{course.name}</h3>
                    <p className="text-xs text-muted mt-0.5">{pluralize(course.total_count, 'student')}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    {course.pending_approval_count > 0 && (
                        <button
                            type="button"
                            onClick={e => { e.stopPropagation(); onOpen(course.id, { status: 'awaiting' }); }}
                            className="px-2 py-0.5 rounded-full text-[10px] font-bold status-pill-requested inline-flex items-center gap-1"
                            title="Completion requests waiting for admin approval"
                        >
                            <Clock size={10} /> {course.pending_approval_count} awaiting
                        </button>
                    )}
                    <PinButton pinned={pinned} onToggle={onTogglePin} name={course.name} />
                </div>
            </div>

            <div className="text-xs"><NextSession next={next} /></div>

            <StatusDistributionBar counts={{ confirmed: course.confirmed_count, invited: course.invited_count, requested: course.requested_count, completed: course.completed_count }} />

            <div className="grid grid-cols-4 gap-1.5">
                {STAT_KEYS.map(({ key, field }) => (
                    <button
                        key={key}
                        type="button"
                        onClick={e => { e.stopPropagation(); onOpen(course.id, { status: key }); }}
                        onKeyDown={e => e.stopPropagation()}
                        className="rounded-xl px-1.5 py-1.5 text-center hover:bg-surface-elevated border border-transparent hover:border-border-subtle transition-colors"
                        title={`Show ${STATUS_META[key].label.toLowerCase()} students`}
                    >
                        <span className="block text-sm font-bold text-primary tabular-nums">{course[field]}</span>
                        <span className="flex items-center justify-center gap-1 text-[10px] text-muted font-semibold">
                            <span className={`w-1.5 h-1.5 rounded-full ${STATUS_META[key].dot}`} />
                            {STATUS_META[key].label}
                        </span>
                    </button>
                ))}
            </div>
        </div>
    );
}

function CourseListRow({ course, next, pinned, onTogglePin, onOpen }: CourseItemProps) {
    const open = () => onOpen(course.id);
    return (
        <div
            role="link"
            tabIndex={0}
            aria-label={`Open ${course.name}`}
            onClick={open}
            onKeyDown={e => { if (e.key === 'Enter') open(); }}
            className="group flex items-center gap-3 px-4 py-3 hover:bg-surface-elevated/60 focus-visible:outline-hidden focus-visible:bg-surface-elevated cursor-pointer transition-colors"
        >
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-primary text-sm truncate group-hover:text-brand-600 dark:group-hover:text-brand-400">{course.name}</h3>
                    {course.pending_approval_count > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold status-pill-requested shrink-0">{course.pending_approval_count} awaiting</span>
                    )}
                </div>
                <div className="text-xs mt-0.5 truncate"><NextSession next={next} /></div>
            </div>
            <div className="hidden md:flex items-center gap-4 text-xs tabular-nums shrink-0">
                {STAT_KEYS.map(({ key, field }) => (
                    <span key={key} className="flex items-center gap-1.5 w-[88px]" title={STATUS_META[key].label}>
                        <span className={`w-1.5 h-1.5 rounded-full ${STATUS_META[key].dot}`} />
                        <strong className="text-primary">{course[field]}</strong>
                        <span className="text-muted truncate">{STATUS_META[key].label}</span>
                    </span>
                ))}
            </div>
            <span className="md:hidden text-xs text-muted tabular-nums shrink-0">{course.total_count}</span>
            <PinButton pinned={pinned} onToggle={onTogglePin} name={course.name} />
            <ChevronRight size={16} className="text-muted shrink-0" />
        </div>
    );
}
