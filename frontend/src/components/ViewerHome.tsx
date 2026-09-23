import { useMemo, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, BookOpen, Calendar, CalendarDays, CheckCircle2, Clock, Pin, Search, Users } from 'lucide-react';
import type { ViewerUpcomingCourse } from '../lib/types';
import { formatDateLong, todayISO } from '../lib/dateUtils';
import { usePersistentState } from '../hooks/usePersistentState';
import { useViewerCourses, useViewerUpcoming } from './Viewer/useViewerData';
import { ErrorState, Kbd, StatusDistributionBar } from './Viewer/ViewerUI';
import { daysFromToday, pluralize, relativeDay, weekdayDate } from './Viewer/viewerUtils';

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string');

function greeting(): string {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
}

type Bucket = 'Today' | 'Tomorrow' | 'Next 7 days' | 'Next 2 weeks' | 'Later';
function bucketOf(date: string): Bucket {
    const diff = daysFromToday(date) ?? 0;
    if (diff <= 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff < 7) return 'Next 7 days';
    if (diff < 14) return 'Next 2 weeks';
    return 'Later';
}

export default function ViewerHome({ onOpenSearch }: { onOpenSearch?: () => void }) {
    const navigate = useNavigate();
    const { data: courses = [], isLoading: loadingCourses, error: coursesError, refetch: refetchCourses } = useViewerCourses();
    const { data: upcoming = [], isLoading: loadingUpcoming, error: upcomingError, refetch: refetchUpcoming } = useViewerUpcoming();
    const [pinned] = usePersistentState<string[]>('viewer_pinned_courses', [], { storage: 'local', validate: isStringArray });

    const openSession = (s: ViewerUpcomingCourse) => navigate(`/courses/${s.course_id}?date=${s.course_date}`);

    const groups = useMemo(() => {
        const map = new Map<Bucket, ViewerUpcomingCourse[]>();
        upcoming.forEach(s => {
            const b = bucketOf(s.course_date);
            map.set(b, [...(map.get(b) || []), s]);
        });
        return (['Today', 'Tomorrow', 'Next 7 days', 'Next 2 weeks', 'Later'] as Bucket[])
            .filter(b => map.has(b))
            .map(b => ({ bucket: b, sessions: map.get(b)! }));
    }, [upcoming]);

    const stats = useMemo(() => {
        const next14 = upcoming.filter(s => (daysFromToday(s.course_date) ?? 99) < 14);
        return {
            sessions: next14.length,
            confirmed: next14.reduce((s, x) => s + x.confirmed_count, 0),
            pending: next14.reduce((s, x) => s + x.pending_count, 0),
            awaiting: courses.reduce((s, c) => s + c.pending_approval_count, 0),
            queue: courses.reduce((s, c) => s + c.requested_count, 0),
        };
    }, [upcoming, courses]);

    const attention = courses.filter(c => c.pending_approval_count > 0).sort((a, b) => b.pending_approval_count - a.pending_approval_count);
    const pinnedCourses = courses.filter(c => pinned.includes(c.id));
    const quickCourses = pinnedCourses.length > 0
        ? pinnedCourses
        : [...courses].sort((a, b) => (b.total_count - b.completed_count) - (a.total_count - a.completed_count)).slice(0, 5);

    const loading = loadingCourses || loadingUpcoming;

    return (
        <div className="max-w-7xl mx-auto w-full space-y-6 animate-fadeIn">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                <div>
                    <p className="text-xs font-semibold text-muted">{formatDateLong(todayISO())}</p>
                    <h1 className="text-2xl sm:text-[28px] font-bold tracking-tight text-primary leading-tight">{greeting()}</h1>
                </div>
                <button
                    type="button"
                    onClick={onOpenSearch}
                    className="sm:hidden group flex items-center gap-2 h-10 px-3 w-full bg-surface border border-border-subtle hover:border-brand-500/40 rounded-xl text-sm text-muted shadow-card transition-colors"
                >
                    <Search size={16} className="group-hover:text-brand-500" />
                    <span className="flex-1 text-left">Find a student or course…</span>
                    <Kbd>Ctrl K</Kbd>
                </button>
            </div>

            {/* KPI tiles */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatTile label="Sessions · next 14 days" value={stats.sessions} icon={<CalendarDays size={16} />} tone="brand" loading={loading} onClick={() => document.getElementById('viewer-upcoming')?.scrollIntoView({ behavior: 'smooth' })} />
                <StatTile label="Confirmed attendees" value={stats.confirmed} icon={<CheckCircle2 size={16} />} tone="emerald" loading={loading} hint={stats.pending ? `+${stats.pending} awaiting reply` : undefined} />
                <StatTile label="Waiting in queues" value={stats.queue} icon={<Users size={16} />} tone="amber" loading={loading} onClick={() => navigate('/students?status=requested')} />
                <StatTile label="Awaiting admin approval" value={stats.awaiting} icon={<Clock size={16} />} tone="violet" loading={loading} />
            </div>

            {(coursesError || upcomingError) && (
                <ErrorState title="Some data failed to load" error={coursesError || upcomingError} onRetry={() => { refetchCourses(); refetchUpcoming(); }} />
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Upcoming sessions */}
                <section id="viewer-upcoming" className="lg:col-span-2 space-y-3 scroll-mt-20">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-bold text-primary flex items-center gap-2"><Calendar size={15} className="text-brand-500" /> Upcoming sessions</h2>
                        <button type="button" onClick={() => navigate('/courses')} className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline">All courses</button>
                    </div>
                    {loadingUpcoming ? (
                        <div className="bg-surface rounded-2xl border border-border-subtle p-4 space-y-3">
                            {[0, 1, 2, 3].map(i => <div key={i} className="h-12 bg-muted/10 rounded-xl animate-pulse" />)}
                        </div>
                    ) : groups.length === 0 ? (
                        <div className="bg-surface rounded-2xl border border-dashed border-border-strong/60 p-8 text-center">
                            <Calendar size={22} className="mx-auto text-muted mb-2" />
                            <p className="text-sm font-semibold text-primary">No upcoming sessions</p>
                            <p className="text-xs text-muted mt-0.5">New course dates will show up here.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {groups.map(({ bucket, sessions }) => (
                                <div key={bucket} className="space-y-1.5">
                                    <h3 className={`text-[11px] font-bold uppercase tracking-wider ${bucket === 'Today' ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted'}`}>
                                        {bucket} <span className="text-muted font-semibold normal-case tracking-normal">· {pluralize(sessions.length, 'session')}</span>
                                    </h3>
                                    <div className="bg-surface rounded-2xl border border-border-subtle divide-y divide-border-subtle shadow-card overflow-hidden">
                                        {sessions.map(s => <SessionRow key={`${s.course_id}-${s.course_date}`} session={s} onOpen={() => openSession(s)} />)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                {/* Side column */}
                <aside className="space-y-6">
                    {attention.length > 0 && (
                        <section className="space-y-2">
                            <h2 className="text-sm font-bold text-primary flex items-center gap-2"><Clock size={15} className="text-amber-500" /> Awaiting admin approval</h2>
                            <div className="bg-surface rounded-2xl border border-border-subtle divide-y divide-border-subtle shadow-card overflow-hidden">
                                {attention.map(c => (
                                    <button key={c.id} type="button" onClick={() => navigate(`/courses/${c.id}?status=awaiting`)} className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-surface-elevated/60 transition-colors group">
                                        <span className="flex-1 min-w-0 text-sm font-medium text-primary truncate group-hover:text-brand-600 dark:group-hover:text-brand-400">{c.name}</span>
                                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold status-pill-requested tabular-nums">{c.pending_approval_count}</span>
                                    </button>
                                ))}
                            </div>
                        </section>
                    )}

                    <section className="space-y-2">
                        <h2 className="text-sm font-bold text-primary flex items-center gap-2">
                            {pinnedCourses.length > 0 ? <><Pin size={15} className="text-brand-500" /> Pinned courses</> : <><BookOpen size={15} className="text-brand-500" /> Most active courses</>}
                        </h2>
                        {loadingCourses ? (
                            <div className="bg-surface rounded-2xl border border-border-subtle p-4 space-y-3">{[0, 1, 2].map(i => <div key={i} className="h-10 bg-muted/10 rounded-xl animate-pulse" />)}</div>
                        ) : quickCourses.length === 0 ? (
                            <p className="text-xs text-muted">No courses yet.</p>
                        ) : (
                            <div className="bg-surface rounded-2xl border border-border-subtle divide-y divide-border-subtle shadow-card overflow-hidden">
                                {quickCourses.map(c => (
                                    <button key={c.id} type="button" onClick={() => navigate(`/courses/${c.id}`)} className="w-full px-4 py-3 text-left hover:bg-surface-elevated/60 transition-colors group space-y-1.5">
                                        <div className="flex items-center gap-2">
                                            <span className="flex-1 min-w-0 text-sm font-semibold text-primary truncate group-hover:text-brand-600 dark:group-hover:text-brand-400">{c.name}</span>
                                            <span className="text-[11px] text-muted tabular-nums">{c.total_count}</span>
                                            <ArrowRight size={13} className="text-muted group-hover:translate-x-0.5 transition-transform" />
                                        </div>
                                        <StatusDistributionBar counts={{ confirmed: c.confirmed_count, invited: c.invited_count, requested: c.requested_count, completed: c.completed_count }} />
                                    </button>
                                ))}
                            </div>
                        )}
                        {pinnedCourses.length === 0 && courses.length > 0 && (
                            <p className="text-[11px] text-muted">Tip: pin courses on the Courses page to keep them here.</p>
                        )}
                    </section>
                </aside>
            </div>
        </div>
    );
}

const TONES = {
    brand: 'text-brand-600 dark:text-brand-400 bg-brand-500/10',
    emerald: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
    amber: 'text-amber-600 dark:text-amber-400 bg-amber-500/10',
    violet: 'text-violet-600 dark:text-violet-400 bg-violet-500/10',
};

function StatTile({ label, value, icon, tone, loading, hint, onClick }: {
    label: string; value: number; icon: ReactNode; tone: keyof typeof TONES; loading: boolean; hint?: string; onClick?: () => void;
}) {
    const Tag = onClick ? 'button' : 'div';
    return (
        <Tag
            {...(onClick ? { type: 'button' as const, onClick } : {})}
            className={`text-left bg-surface rounded-2xl border border-border-subtle p-4 shadow-card ${onClick ? 'hover:border-brand-500/40 hover:shadow-card-hover transition-all' : ''}`}
        >
            <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-muted leading-tight">{label}</span>
                <span className={`p-1.5 rounded-lg shrink-0 ${TONES[tone]}`}>{icon}</span>
            </div>
            {loading ? (
                <div className="h-7 w-12 bg-muted/15 rounded-lg animate-pulse mt-2" />
            ) : (
                <div className="text-2xl font-bold text-primary tabular-nums mt-1">{value}</div>
            )}
            {hint && !loading && <div className="text-[11px] text-muted mt-0.5">{hint}</div>}
        </Tag>
    );
}

function SessionRow({ session, onOpen }: { session: ViewerUpcomingCourse; onOpen: () => void }) {
    const diff = daysFromToday(session.course_date) ?? 0;
    const d = new Date(`${session.course_date}T12:00:00`);
    const total = session.confirmed_count + session.pending_count;
    return (
        <button type="button" onClick={onOpen} className="w-full flex items-center gap-3 px-3 sm:px-4 py-3 text-left hover:bg-surface-elevated/60 transition-colors group">
            <div className={`w-11 shrink-0 rounded-xl text-center py-1 border ${diff <= 1 ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-700 dark:text-emerald-300' : 'bg-surface-elevated border-border-subtle text-primary'}`}>
                <div className="text-[9px] font-bold uppercase leading-none mt-0.5">{d.toLocaleDateString('en-IE', { weekday: 'short' })}</div>
                <div className="text-base font-bold leading-tight tabular-nums">{d.getDate()}</div>
                <div className="text-[9px] font-semibold uppercase leading-none mb-0.5 opacity-80">{d.toLocaleDateString('en-IE', { month: 'short' })}</div>
            </div>
            <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-primary truncate group-hover:text-brand-600 dark:group-hover:text-brand-400">{session.course_name}</div>
                <div className="text-xs text-muted">{weekdayDate(session.course_date)} · {relativeDay(session.course_date)}</div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 text-[11px] font-bold tabular-nums">
                <span className="px-2 py-0.5 rounded-full status-pill-confirmed" title="Confirmed">{session.confirmed_count}<span className="hidden sm:inline font-semibold"> confirmed</span></span>
                {session.pending_count > 0 && (
                    <span className="px-2 py-0.5 rounded-full status-pill-invited" title="Invited, waiting for a reply">{session.pending_count}<span className="hidden sm:inline font-semibold"> pending</span></span>
                )}
                {total === 0 && <span className="text-muted font-medium">No bookings</span>}
            </div>
            <ArrowRight size={14} className="text-muted shrink-0 hidden sm:block group-hover:translate-x-0.5 transition-transform" />
        </button>
    );
}
