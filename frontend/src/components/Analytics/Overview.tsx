import { useMemo, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip } from 'recharts';
import {
    ArrowRight, BookOpen, Briefcase, CalendarDays, Eye, EyeOff, GraduationCap, Hourglass, Layers, Loader2,
    Sparkles, UserPlus, Users,
} from 'lucide-react';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import StatTile from '../ui/StatTile';
import Pagination from '../ui/Pagination';
import { EmptyState } from '../ui/States';
import { ChartTooltip, LegendItem } from '../ui/chart';
import { CHART, axisProps, gridProps, tooltipCursor, clickedRow } from '../ui/chartTheme';
import { tableWrapCls, tableCls, theadCls, thCls, tbodyCls, trCls, tdCls } from '../ui/styles';
import type { EnrollmentWithRelations } from '../../lib/documentUtils';
import { formatDisplayDate } from '../../lib/dateUtils';
import { completedIn, registeredIn, type Insights, type Share } from './insights';
import { count, percent, plural, type Narrative } from './narrative';
import { completionDay, formatPeriodLabel, registrationDay } from './summaryReport';
import type { CourseRun } from './courseRuns';

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const REGISTERED = CHART.brand;
const COMPLETED = CHART.emerald;

export type DrillDown = (title: string, data: EnrollmentWithRelations[], runKey?: string) => void;

interface OverviewProps {
    insights: Insights;
    narrative: Narrative;
    /** Counted enrollments in the chosen course(s): what the figures were worked out from */
    enrollments: EnrollmentWithRelations[];
    runs: CourseRun[];
    loading: boolean;
    onDrillDown: DrillDown;
    onSetRunIgnored: (runKey: string, ignore: boolean) => Promise<void>;
}

/** " · ▲ 18%" against the period before, or nothing when there is no earlier period to compare with. */
function trend(before: number | undefined, now: number): string {
    if (before === undefined || before === 0 || before === now) return '';
    const pct = Math.round((Math.abs(now - before) / before) * 100);
    return ` · ${now > before ? '▲' : '▼'} ${pct}%`;
}

export default function Overview({ insights, narrative, enrollments, runs, loading, onDrillDown, onSetRunIgnored }: OverviewProps) {
    const { summary, previous, outcomes, period } = insights;
    const isEmpty = summary.registrations === 0 && summary.completions === 0;

    const registered = () => enrollments.filter(e => registeredIn(e, period));
    const completed = () => enrollments.filter(e => completedIn(e, period));

    return (
        <div className="flex flex-col gap-4 sm:gap-5">
            {/* The period in four figures */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
                <StatTile
                    label="People registered"
                    icon={UserPlus}
                    tone="brand"
                    value={count(summary.peopleRegistered)}
                    hint={`${plural(summary.registrations, 'course registration')}${trend(previous?.registrations, summary.registrations)}`}
                    title={previous ? `${count(previous.registrations)} course registrations in the period before (${formatPeriodLabel(previous.period)})` : undefined}
                    loading={loading}
                    onClick={() => onDrillDown('Registered in the period', registered())}
                />
                <StatTile
                    label="People completed"
                    icon={GraduationCap}
                    tone="success"
                    value={count(summary.peopleCompleted)}
                    hint={`${plural(summary.completions, 'completion')}${trend(previous?.completions, summary.completions)}`}
                    title={previous ? `${count(previous.completions)} completions in the period before (${formatPeriodLabel(previous.period)})` : undefined}
                    loading={loading}
                    onClick={() => onDrillDown('Completed a course in the period', completed())}
                />
                <StatTile
                    label="Course runs"
                    icon={CalendarDays}
                    tone="info"
                    value={count(summary.courseRuns)}
                    hint={`with graduates, across ${plural(summary.coursesDelivered, 'course')}`}
                    loading={loading}
                />
                <StatTile
                    label="Working after the course"
                    icon={Briefcase}
                    tone="completed"
                    value={outcomes.responded > 0 ? `${percent(outcomes.working, outcomes.responded)}%` : '—'}
                    hint={outcomes.responded > 0
                        ? `${count(outcomes.working)} of ${count(outcomes.responded)} who answered the survey`
                        : 'No survey answers for this period yet'}
                    loading={loading}
                />
            </div>

            {isEmpty && !loading ? (
                <EmptyState
                    icon={<CalendarDays size={22} />}
                    title="Nothing in this period"
                    description="No one registered or completed a course in these dates. Choose a longer period above."
                />
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
                    <MonthsCard insights={insights} enrollments={enrollments} onDrillDown={onDrillDown} />
                    <Card title="In short" icon={Sparkles} subtitle="Written from the figures on this page">
                        <ul className="space-y-2.5 text-sm leading-relaxed text-primary">
                            {[...narrative.summary, ...narrative.courses.slice(0, 1)].map(sentence => (
                                <li key={sentence} className="flex gap-2.5">
                                    <span aria-hidden className="mt-2 w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0" />
                                    <span>{sentence}</span>
                                </li>
                            ))}
                        </ul>
                    </Card>
                </div>
            )}

            {!isEmpty && <CoursesCard insights={insights} enrollments={enrollments} onDrillDown={onDrillDown} />}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
                <QueueCard insights={insights} enrollments={enrollments} onDrillDown={onDrillDown} />
                <OutcomesCard insights={insights} note={narrative.outcomes[narrative.outcomes.length - 1]} />
            </div>

            {insights.people.total > 0 && <PeopleCard insights={insights} />}

            <CourseRunsCard runs={runs} onDrillDown={onDrillDown} onSetRunIgnored={onSetRunIgnored} />
        </div>
    );
}

// ── By month ───────────────────────────────────────────────────────

function MonthsCard({ insights, enrollments, onDrillDown }: Pick<OverviewProps, 'insights' | 'enrollments' | 'onDrillDown'>) {
    const { months } = insights.summary;
    const multiYear = months.length > 0 && months[0].month.slice(0, 4) !== months[months.length - 1].month.slice(0, 4);
    const data = useMemo(() => months.map(m => {
        const [y, mm] = m.month.split('-');
        return {
            month: m.month,
            name: multiYear ? `${MONTH_SHORT[Number(mm) - 1]} ${y.slice(2)}` : MONTH_SHORT[Number(mm) - 1],
            title: `${MONTH_LONG[Number(mm) - 1]} ${y}`,
            Registered: m.registered,
            Completed: m.completed,
        };
    }), [months, multiYear]);

    const openMonth = (row: (typeof data)[number]) => {
        const inMonth = (day: string | null) => !!day && day.startsWith(row.month);
        onDrillDown(
            `Registered or completed in ${row.title}`,
            enrollments.filter(e =>
                (registeredIn(e, insights.period) && inMonth(registrationDay(e))) ||
                (completedIn(e, insights.period) && inMonth(completionDay(e)))),
        );
    };

    return (
        <Card
            className="lg:col-span-2"
            bodyClassName="flex flex-col"
            title="By month"
            icon={CalendarDays}
            subtitle="People who registered and who completed a course. Click a month to see them"
            action={
                <div className="hidden sm:flex items-center gap-3">
                    <LegendItem color={REGISTERED} label="Registered" />
                    <LegendItem color={COMPLETED} label="Completed" />
                </div>
            }
        >
            <div className="flex-1 min-h-[240px] sm:min-h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                        data={data}
                        margin={{ top: 8, right: 4, left: -22, bottom: 0 }}
                        barGap={2}
                        barCategoryGap="22%"
                        onClick={state => {
                            const row = clickedRow(data, state);
                            if (row) openMonth(row);
                        }}
                    >
                        <CartesianGrid {...gridProps} vertical={false} />
                        <XAxis dataKey="name" {...axisProps} dy={6} minTickGap={8} />
                        <YAxis {...axisProps} allowDecimals={false} />
                        <RechartsTooltip content={<ChartTooltip />} cursor={tooltipCursor} />
                        <Bar dataKey="Registered" fill={REGISTERED} radius={[3, 3, 0, 0]} maxBarSize={18} className="cursor-pointer" />
                        <Bar dataKey="Completed" fill={COMPLETED} radius={[3, 3, 0, 0]} maxBarSize={18} className="cursor-pointer" />
                    </BarChart>
                </ResponsiveContainer>
            </div>
            <div className="flex sm:hidden items-center justify-center gap-4 mt-2">
                <LegendItem color={REGISTERED} label="Registered" />
                <LegendItem color={COMPLETED} label="Completed" />
            </div>
        </Card>
    );
}

// ── Courses ────────────────────────────────────────────────────────

const COURSES_SHOWN = 8;

function InlineBar({ value, max, color }: { value: number; max: number; color: string }) {
    return (
        <div className="flex items-center gap-2 min-w-[72px]">
            <div className="hidden sm:block flex-1 h-2 rounded-full bg-surface-elevated overflow-hidden">
                {value > 0 && <div className="h-full rounded-full" style={{ width: `${Math.max((value / max) * 100, 3)}%`, background: color }} />}
            </div>
            <span className="w-10 text-right tabular-nums font-semibold text-primary">{count(value)}</span>
        </div>
    );
}

function CoursesCard({ insights, enrollments, onDrillDown }: Pick<OverviewProps, 'insights' | 'enrollments' | 'onDrillDown'>) {
    const [showAll, setShowAll] = useState(false);
    const { courses } = insights.summary;
    const waiting = useMemo(() => new Map(insights.queue.courses.map(c => [c.courseId, c.waiting])), [insights.queue.courses]);
    const rows = showAll ? courses : courses.slice(0, COURSES_SHOWN);
    const max = Math.max(1, ...courses.map(c => Math.max(c.registered, c.completed)));
    const openCourse = (c: (typeof courses)[number]) => onDrillDown(
        `${c.name}: registered or completed in the period`,
        enrollments.filter(e => e.course_id === c.courseId && (registeredIn(e, insights.period) || completedIn(e, insights.period))),
    );

    return (
        <Card
            title="Courses"
            icon={BookOpen}
            tone="completed"
            subtitle="Demand and delivery in the period, most asked-for first. Click a course to see its people"
            divided
            flush
        >
            {/* Phone: a list, since five columns do not fit */}
            <ul className="sm:hidden divide-y divide-border-subtle">
                {rows.map(c => (
                    <li key={c.courseId}>
                        <button type="button" onClick={() => openCourse(c)} className="w-full text-left px-4 py-3 active:bg-surface-elevated/60">
                            <span className="flex items-start justify-between gap-3">
                                <span className="font-semibold text-sm text-primary">{c.name}</span>
                                {waiting.get(c.courseId)
                                    ? <Badge tone="warning" shape="pill" className="tabular-nums shrink-0">{count(waiting.get(c.courseId)!)} waiting</Badge>
                                    : null}
                            </span>
                            {([['Registered', c.registered, REGISTERED], ['Completed', c.completed, COMPLETED]] as const).map(([label, value, color]) => (
                                <span key={label} className="mt-1.5 grid grid-cols-[4.75rem_minmax(0,1fr)_2.25rem] items-center gap-2 text-xs">
                                    <span className="text-muted">{label}</span>
                                    <span className="h-2 rounded-full bg-surface-elevated overflow-hidden">
                                        {value > 0 && <span className="block h-full rounded-full" style={{ width: `${Math.max((value / max) * 100, 3)}%`, background: color }} />}
                                    </span>
                                    <span className="text-right tabular-nums font-semibold text-primary">{count(value)}</span>
                                </span>
                            ))}
                            <span className="mt-1.5 block text-xs text-muted">{plural(c.runs, 'course run')} with graduates</span>
                        </button>
                    </li>
                ))}
                <li className="px-4 py-3 text-xs text-muted bg-surface-elevated/40">
                    Total: <span className="font-semibold text-primary tabular-nums">{count(insights.summary.registrations)}</span> registered ·{' '}
                    <span className="font-semibold text-primary tabular-nums">{count(insights.summary.completions)}</span> completed ·{' '}
                    <span className="font-semibold text-primary tabular-nums">{count(insights.queue.waiting)}</span> waiting now
                </li>
            </ul>

            <div className={`hidden sm:block ${tableWrapCls}`}>
                <table className={tableCls}>
                    <thead className={theadCls}>
                        <tr>
                            <th className={thCls}>Course</th>
                            <th className={`${thCls} sm:w-[24%]`}>Registered</th>
                            <th className={`${thCls} sm:w-[24%]`}>Completed</th>
                            <th className={`${thCls} text-right`}>Runs</th>
                            <th className={`${thCls} text-right`} title="Waiting for an invitation today, whatever the period">Waiting now</th>
                        </tr>
                    </thead>
                    <tbody className={tbodyCls}>
                        {rows.map(c => (
                            <tr
                                key={c.courseId}
                                className={`${trCls} cursor-pointer`}
                                onClick={() => openCourse(c)}
                            >
                                <td className={`${tdCls} font-semibold text-primary`}>{c.name}</td>
                                <td className={tdCls}><InlineBar value={c.registered} max={max} color={REGISTERED} /></td>
                                <td className={tdCls}><InlineBar value={c.completed} max={max} color={COMPLETED} /></td>
                                <td className={`${tdCls} text-right tabular-nums text-muted`}>{count(c.runs)}</td>
                                <td className={`${tdCls} text-right tabular-nums`}>
                                    {waiting.get(c.courseId)
                                        ? <Badge tone="warning" shape="pill" className="tabular-nums">{count(waiting.get(c.courseId)!)}</Badge>
                                        : <span className="text-muted">0</span>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr className="border-t border-border-subtle bg-surface-elevated/40 font-semibold text-primary">
                            <td className={tdCls}>Total</td>
                            <td className={`${tdCls} text-right sm:text-left tabular-nums`}>{count(insights.summary.registrations)}</td>
                            <td className={`${tdCls} text-right sm:text-left tabular-nums`}>{count(insights.summary.completions)}</td>
                            <td className={`${tdCls} text-right tabular-nums`}>{count(insights.summary.courseRuns)}</td>
                            <td className={`${tdCls} text-right tabular-nums`}>{count(insights.queue.waiting)}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
            {courses.length > COURSES_SHOWN && (
                <button
                    type="button"
                    onClick={() => setShowAll(v => !v)}
                    className="w-full px-4 py-2.5 border-t border-border-subtle text-xs font-semibold text-brand-600 dark:text-brand-400 hover:bg-surface-elevated/50 transition-colors"
                >
                    {showAll ? 'Show fewer' : `Show all ${courses.length} courses`}
                </button>
            )}
        </Card>
    );
}

// ── The queue today ────────────────────────────────────────────────

function QueueCard({ insights, enrollments, onDrillDown }: Pick<OverviewProps, 'insights' | 'enrollments' | 'onDrillDown'>) {
    const { queue, fates } = insights;
    const longest = queue.courses.filter(c => c.waiting > 0).slice(0, 5);
    const max = Math.max(1, ...longest.map(c => c.waiting));
    const stages = [
        { label: 'Waiting for an invitation', value: queue.waiting, status: 'requested', dot: CHART.requested },
        { label: 'Invited, no reply yet', value: queue.invited, status: 'invited', dot: CHART.invited },
        { label: 'Confirmed for a date', value: queue.confirmed, status: 'confirmed', dot: CHART.confirmed },
    ] as const;
    const segments = [
        { label: 'Completed', value: fates.completed, color: CHART.completed },
        { label: 'Confirmed', value: fates.confirmed, color: CHART.confirmed },
        { label: 'Invited', value: fates.invited, color: CHART.invited },
        { label: 'Waiting', value: fates.waiting, color: CHART.requested },
        { label: 'Withdrew / not accepted', value: fates.left, color: CHART.neutral },
    ].filter(s => s.value > 0);

    return (
        <Card title="The queue today" icon={Hourglass} tone="warning" subtitle="Where registrations stand right now, whatever the period">
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {stages.map(s => (
                    <button
                        key={s.status}
                        type="button"
                        onClick={() => onDrillDown(s.label, enrollments.filter(e => e.status === s.status))}
                        className="text-left rounded-xl bg-surface-elevated/60 border border-border-subtle px-3 py-2.5 hover:border-border-strong transition-colors"
                    >
                        <span className="block text-xl font-bold text-primary tabular-nums leading-none">{count(s.value)}</span>
                        <span className="mt-1.5 flex items-start gap-1.5 text-xs text-muted leading-snug">
                            <span className="mt-1 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: s.dot }} />
                            {s.label}
                        </span>
                    </button>
                ))}
            </div>

            {longest.length > 0 && (
                <div className="mt-4">
                    <p className="text-xs font-semibold text-muted mb-2">Longest waiting lists</p>
                    <ul className="space-y-1.5">
                        {longest.map(c => (
                            <li key={c.courseId}>
                                <button
                                    type="button"
                                    onClick={() => onDrillDown(`Waiting for ${c.name}`, enrollments.filter(e => e.course_id === c.courseId && e.status === 'requested'))}
                                    className="w-full grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2.5rem] items-center gap-2.5 text-xs group"
                                >
                                    <span className="truncate text-left text-primary font-medium group-hover:underline">{c.name}</span>
                                    <span className="h-2 rounded-full bg-surface-elevated overflow-hidden">
                                        <span className="block h-full rounded-full" style={{ width: `${Math.max((c.waiting / max) * 100, 3)}%`, background: CHART.requested }} />
                                    </span>
                                    <span className="text-right tabular-nums font-semibold text-primary">{count(c.waiting)}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {fates.total > 0 && (
                <div className="mt-4 pt-4 border-t border-border-subtle">
                    <p className="text-xs font-semibold text-muted mb-2">
                        What became of the {plural(fates.total, 'registration')} made in the period
                    </p>
                    <div className="flex h-2.5 rounded-full overflow-hidden gap-px bg-surface" role="img" aria-label={segments.map(s => `${s.label} ${s.value}`).join(', ')}>
                        {segments.map(s => (
                            <span key={s.label} title={`${s.label}: ${count(s.value)}`} style={{ flexGrow: s.value, flexBasis: 0, minWidth: 3, background: s.color }} />
                        ))}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1">
                        {segments.map(s => (
                            <span key={s.label} className="inline-flex items-center gap-1.5 text-xs text-muted">
                                <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                                {s.label}
                                <span className="font-semibold text-primary tabular-nums">{count(s.value)}</span>
                                <span className="tabular-nums">({percent(s.value, fates.total)}%)</span>
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </Card>
    );
}

// ── Employment outcomes ────────────────────────────────────────────

function OutcomesCard({ insights, note }: { insights: Insights; note?: string }) {
    const o = insights.outcomes;
    const steps = [
        { label: 'Completed a course', value: o.graduates, of: o.graduates },
        { label: 'Sent the survey', value: o.asked, of: o.graduates },
        { label: 'Answered', value: o.responded, of: o.asked },
        { label: 'Working', value: o.working, of: o.responded },
    ];
    const max = Math.max(1, o.graduates);
    const fields = o.fields.slice(0, 5);

    return (
        <Card title="Employment after the course" icon={Briefcase} tone="completed" subtitle="The outcome survey among people who completed a course in the period">
            {o.graduates === 0 ? (
                <p className="text-sm text-muted py-6 text-center">Nobody completed a course in this period.</p>
            ) : (
                <>
                    <ul className="space-y-2">
                        {steps.map((s, i) => (
                            <li key={s.label} className="grid grid-cols-[8.5rem_minmax(0,1fr)_5.5rem] items-center gap-2.5 text-xs">
                                <span className="text-muted">{s.label}</span>
                                <span className="h-2.5 rounded-full bg-surface-elevated overflow-hidden">
                                    {s.value > 0 && (
                                        <span
                                            className="block h-full rounded-full"
                                            style={{ width: `${Math.max((s.value / max) * 100, 2)}%`, background: i === 3 ? COMPLETED : CHART.violet, opacity: i === 3 ? 1 : 1 - i * 0.22 }}
                                        />
                                    )}
                                </span>
                                <span className="text-right tabular-nums">
                                    <span className="font-semibold text-primary">{count(s.value)}</span>
                                    {i > 0 && s.of > 0 && <span className="text-muted"> · {percent(s.value, s.of)}%</span>}
                                </span>
                            </li>
                        ))}
                    </ul>

                    {o.working > 0 && (
                        <div className="mt-4 pt-4 border-t border-border-subtle grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <p className="text-xs font-semibold text-muted mb-2">Hours</p>
                                <ShareBars
                                    items={[
                                        { name: 'Full-time', count: o.fullTime },
                                        { name: 'Part-time', count: o.partTime },
                                        { name: 'Not said', count: o.working - o.fullTime - o.partTime },
                                    ].filter(s => s.count > 0)}
                                    total={o.working}
                                    color={COMPLETED}
                                />
                            </div>
                            {fields.length > 0 && (
                                <div>
                                    <p className="text-xs font-semibold text-muted mb-2">Field of work</p>
                                    <ShareBars items={fields} total={o.working} color={COMPLETED} />
                                </div>
                            )}
                        </div>
                    )}

                    {note && (o.responded < 10 || o.asked === 0) && <p className="mt-3 text-xs text-muted">{note}</p>}
                </>
            )}
        </Card>
    );
}

// ── Who registered ─────────────────────────────────────────────────

/** A ranked list of shares: name · bar · count and percent of `total`. */
export function ShareBars({ items, total, color }: { items: Share[]; total: number; color: string }) {
    const max = Math.max(1, ...items.map(i => i.count));
    return (
        <ul className="space-y-1.5">
            {items.map(item => (
                <li key={item.name} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_4.75rem] items-center gap-2.5 text-xs">
                    <span className={`truncate ${item.name === 'Not known' || item.name === 'Not said' ? 'text-muted' : 'text-primary font-medium'}`} title={item.name}>{item.name}</span>
                    <span className="h-2 rounded-full bg-surface-elevated overflow-hidden">
                        <span
                            className="block h-full rounded-full"
                            style={{ width: `${Math.max((item.count / max) * 100, 3)}%`, background: item.name === 'Not known' || item.name === 'Not said' ? CHART.neutral : color }}
                        />
                    </span>
                    <span className="text-right tabular-nums">
                        <span className="font-semibold text-primary">{count(item.count)}</span>
                        <span className="text-muted"> · {percent(item.count, total)}%</span>
                    </span>
                </li>
            ))}
        </ul>
    );
}

function PeopleCard({ insights }: { insights: Insights }) {
    const p = insights.people;
    const blocks = [
        { title: 'Course language', items: p.languages.slice(0, 6), color: CHART.brand },
        { title: 'Where they live', items: p.areas.slice(0, 7), color: CHART.sky },
        { title: 'Age', items: p.ages, color: CHART.violet },
    ];
    return (
        <Card title="Who registered" icon={Users} tone="info" subtitle={`The ${plural(p.total, 'person', 'people')} who registered in the period`}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-5">
                {blocks.map(b => (
                    <div key={b.title} className="min-w-0">
                        <p className="text-xs font-semibold text-muted mb-2">{b.title}</p>
                        <ShareBars items={b.items} total={p.total} color={b.color} />
                    </div>
                ))}
            </div>
        </Card>
    );
}

// ── Course runs ────────────────────────────────────────────────────

const RUNS_PER_PAGE = 8;

function CourseRunsCard({ runs, onDrillDown, onSetRunIgnored }: Pick<OverviewProps, 'runs' | 'onDrillDown' | 'onSetRunIgnored'>) {
    const [page, setPage] = useState(1);
    const [saving, setSaving] = useState<string | null>(null);
    const totalPages = Math.max(1, Math.ceil(runs.length / RUNS_PER_PAGE));
    const current = Math.min(page, totalPages);
    const shown = runs.slice((current - 1) * RUNS_PER_PAGE, current * RUNS_PER_PAGE);
    const ignoredCount = runs.filter(r => r.ignored).length;

    const setIgnored = async (run: CourseRun) => {
        if (saving) return;
        setSaving(run.key);
        try {
            await onSetRunIgnored(run.key, !run.ignored);
        } finally {
            setSaving(null);
        }
    };

    return (
        <Card
            title="Course runs in the period"
            icon={Layers}
            tone="success"
            subtitle={`${plural(runs.length - ignoredCount, 'run')} with graduates${ignoredCount > 0 ? ` · ${count(ignoredCount)} ignored in reports` : ''}. "Ignore" leaves a run out of every figure here and in the PDF`}
            divided
            flush
        >
            {runs.length === 0 ? (
                <EmptyState bare icon={<GraduationCap size={22} />} title="No course runs in this period" description="A run appears here once someone completes the course." />
            ) : (
                <div className={tableWrapCls}>
                    <table className={tableCls}>
                        <thead className={theadCls}>
                            <tr>
                                <th className={thCls}>Date</th>
                                <th className={thCls}>Course</th>
                                <th className={`${thCls} hidden sm:table-cell`}>Language</th>
                                <th className={`${thCls} text-right`}>Graduates</th>
                                <th className={thCls}><span className="sr-only">Actions</span></th>
                            </tr>
                        </thead>
                        <tbody className={tbodyCls}>
                            {shown.map(r => {
                                const title = `${r.courseName} · ${r.variant} · ${formatDisplayDate(r.date) || 'no date'}: graduates`;
                                return (
                                    <tr key={r.key} className={`${trCls} cursor-pointer group`} onClick={() => onDrillDown(title, r.graduates, r.key)}>
                                        <td className={`${tdCls} text-muted tabular-nums whitespace-nowrap`}>{formatDisplayDate(r.date) || 'No date'}</td>
                                        <td className={`${tdCls} font-semibold ${r.ignored ? 'text-muted' : 'text-primary'}`}>
                                            <span className="inline-flex items-center gap-2 flex-wrap">
                                                <span className={r.ignored ? 'line-through decoration-border-strong' : ''}>{r.courseName}</span>
                                                <span className="sm:hidden text-xs font-medium text-muted">{r.variant}</span>
                                                {r.ignored && <Badge tone="warning" title="Left out of Analytics and the PDF report">Ignored in reports</Badge>}
                                            </span>
                                        </td>
                                        <td className={`${tdCls} hidden sm:table-cell ${r.ignored ? 'opacity-60' : ''}`}><Badge tone="brand">{r.variant}</Badge></td>
                                        <td className={`${tdCls} text-right tabular-nums font-semibold ${r.ignored ? 'text-muted' : 'text-primary'}`}>{count(r.graduates.length)}</td>
                                        <td className={`${tdCls} text-right`}>
                                            <div className="inline-flex items-center gap-3 justify-end">
                                                <button
                                                    type="button"
                                                    disabled={!!saving}
                                                    title={r.ignored
                                                        ? 'Count this course run in Analytics and the PDF report again'
                                                        : 'Ignore in reports: leave this course run out of Analytics and the PDF report'}
                                                    className={`inline-flex items-center gap-1 text-xs font-semibold whitespace-nowrap transition-opacity disabled:opacity-40 ${
                                                        r.ignored ? 'text-primary hover:text-brand-600 dark:hover:text-brand-400' : 'text-muted hover:text-primary'
                                                    }`}
                                                    onClick={e => {
                                                        e.stopPropagation();
                                                        void setIgnored(r);
                                                    }}
                                                >
                                                    {saving === r.key ? <Loader2 size={12} className="animate-spin" /> : r.ignored ? <Eye size={12} /> : <EyeOff size={12} />}
                                                    {r.ignored ? 'Count again' : 'Ignore'}
                                                </button>
                                                <ArrowRight size={13} aria-hidden className="hidden sm:block text-brand-600 dark:text-brand-400 opacity-50 group-hover:opacity-100 transition-opacity" />
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
            <Pagination page={current} totalPages={totalPages} totalItems={runs.length} pageSize={RUNS_PER_PAGE} onPageChange={setPage} itemLabel="course runs" />
        </Card>
    );
}
