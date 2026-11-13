import type { ReactNode } from 'react';
import { formatLocalDate } from '../../lib/dateUtils';
import type { Insights, Share } from './insights';
import { count, percent, plural, type Narrative } from './narrative';
import { foldCourses, formatPeriodLabel, niceStep, type ReportMonth } from './summaryReport';

/**
 * The PDF report as sheets of A4 paper (index.css, .report-sheet): white in either theme, since
 * it is printed or saved as a PDF. Page 1 is the period: a summary in words, the key figures,
 * the months and the courses. Page 2 (optional) is where registrations stand, employment after
 * the course and who registered. Each page is sized to fit: the course table folds what does
 * not fit into "Other courses", and every list is capped.
 */

const COURSE_ROWS_WITH_CHART = 10;
const COURSE_ROWS = 18;

interface SummaryReportSheetProps {
    insights: Insights;
    narrative: Narrative;
    /** The one course the report is about; null for all courses */
    courseName?: string | null;
    /** 1: the period only. 2: also the queue, employment and who registered */
    pages?: 1 | 2;
    /** Date shown as "Prepared …" */
    preparedOn?: Date;
}

export default function SummaryReportSheet({ insights, narrative, courseName = null, pages = 2, preparedOn = new Date() }: SummaryReportSheetProps) {
    const { summary: report, period, outcomes } = insights;
    const isEmpty = report.registrations === 0 && report.completions === 0;
    const showChart = report.months.length >= 2 && !isEmpty;
    const rows = foldCourses(report.courses, showChart ? COURSE_ROWS_WITH_CHART : COURSE_ROWS);
    // One scale for both columns: a course's completions read against its registrations
    const scaleMax = Math.max(1, ...rows.map(r => Math.max(r.registered, r.completed)));
    const subject = courseName ?? 'All courses';
    const footer = (page: number) => (
        <footer className="mt-auto pt-[3mm] flex items-center justify-between text-[7.5pt] text-(--rs-muted) border-t border-(--rs-rule)">
            <span>Cork City Partnership · Courses report · {formatPeriodLabel(period)}</span>
            <span>Page {page} of {pages}</span>
        </footer>
    );

    return (
        <>
            <article className="report-sheet" aria-label="Courses report">
                <header className="flex items-start justify-between gap-6">
                    <img src="/logos-banner.png" alt="Cork City Partnership · SICAP" className="h-[15mm] w-auto" />
                    <p className="text-[8pt] text-(--rs-muted) text-right whitespace-nowrap pt-[1mm]">
                        Prepared {formatLocalDate(preparedOn, { day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                </header>

                <div className="mt-[6mm] pb-[3.5mm] border-b border-(--rs-rule)">
                    <h1 className="text-[20pt] leading-tight font-semibold tracking-tight">Courses report</h1>
                    <p className="mt-[1mm] text-[10.5pt] text-(--rs-ink-2)">
                        {subject} · <span className="font-semibold text-(--rs-ink)">{formatPeriodLabel(period)}</span>
                    </p>
                </div>

                <section className="mt-[4.5mm]" aria-label="Summary">
                    <SectionTitle title="Summary" />
                    <Prose sentences={narrative.summary} />
                </section>

                <section className="grid grid-cols-4 gap-[3mm] mt-[4.5mm]" aria-label="Key figures">
                    <Figure
                        swatch="var(--rs-registered)"
                        label="People registered"
                        value={count(report.peopleRegistered)}
                        hint={plural(report.registrations, 'course registration')}
                    />
                    <Figure
                        swatch="var(--rs-completed)"
                        label="People completed"
                        value={count(report.peopleCompleted)}
                        hint={plural(report.completions, 'course completion')}
                    />
                    <Figure
                        label="Course runs"
                        value={count(report.courseRuns)}
                        hint={`with graduates, across ${plural(report.coursesDelivered, 'course')}`}
                    />
                    <Figure
                        label="Working after the course"
                        value={outcomes.responded > 0 ? `${percent(outcomes.working, outcomes.responded)}%` : '—'}
                        hint={outcomes.responded > 0 ? `${count(outcomes.working)} of ${count(outcomes.responded)} survey answers` : 'no survey answers yet'}
                    />
                </section>

                {showChart && (
                    <section className="mt-[5mm]" aria-label="By month">
                        <SectionTitle title="By month" legend />
                        <MonthChart months={report.months} />
                    </section>
                )}

                <section className="mt-[5mm] min-h-0" aria-label="Courses">
                    <SectionTitle title="Courses by demand" legend={!showChart && !isEmpty} />
                    {isEmpty ? (
                        <p className="py-[10mm] text-center text-(--rs-ink-2)">No registrations or completions in this period.</p>
                    ) : (
                        <>
                            <Prose sentences={narrative.courses} className="mb-[2.5mm]" />
                            <table className="w-full table-fixed border-collapse text-[8.5pt]">
                                <colgroup>
                                    <col className="w-[38%]" />
                                    <col className="w-[10%]" />
                                    <col className="w-[26%]" />
                                    <col className="w-[26%]" />
                                </colgroup>
                                <thead>
                                    <tr className="text-left text-[7.5pt] uppercase tracking-wider text-(--rs-muted) border-b border-(--rs-rule)">
                                        <th className="font-semibold py-[1.2mm] pr-[3mm]">Course</th>
                                        <th className="font-semibold py-[1.2mm] pr-[4mm] text-right">Runs</th>
                                        <th className="font-semibold py-[1.2mm] pr-[3mm]">Registered</th>
                                        <th className="font-semibold py-[1.2mm]">Completed</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map(row => (
                                        <tr key={row.courseId} className="border-b border-(--rs-rule-soft)">
                                            <td className={`py-[1.05mm] pr-[3mm] truncate ${row.courseId === 'other' ? 'text-(--rs-ink-2) italic' : 'font-medium'}`} title={row.name}>
                                                {row.name}
                                            </td>
                                            <td className="py-[1.05mm] pr-[4mm] text-right tabular-nums">{count(row.runs)}</td>
                                            <td className="py-[1.05mm] pr-[3mm]">
                                                <BarCell value={row.registered} max={scaleMax} color="var(--rs-registered)" />
                                            </td>
                                            <td className="py-[1.05mm]">
                                                <BarCell value={row.completed} max={scaleMax} color="var(--rs-completed)" />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="font-semibold">
                                        <td className="pt-[1.6mm] pr-[3mm]">Total</td>
                                        <td className="pt-[1.6mm] pr-[4mm] text-right tabular-nums">{count(report.courseRuns)}</td>
                                        <td className="pt-[1.6mm] pr-[3mm] tabular-nums">{count(report.registrations)}</td>
                                        <td className="pt-[1.6mm] tabular-nums">{count(report.completions)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </>
                    )}
                </section>

                {footer(1)}
            </article>

            {pages === 2 && (
                <article className="report-sheet" aria-label="Courses report, page 2">
                    <header className="flex items-baseline justify-between gap-6 pb-[3mm] border-b border-(--rs-rule)">
                        <p className="text-[10.5pt] font-semibold">Courses report</p>
                        <p className="text-[8.5pt] text-(--rs-ink-2)">{subject} · {formatPeriodLabel(period)}</p>
                    </header>

                    <section className="mt-[6mm]" aria-label="Where registrations stand">
                        <SectionTitle title="Where registrations stand" />
                        <Prose sentences={narrative.pipeline} />
                        <QueueBlock insights={insights} />
                    </section>

                    <section className="mt-[8mm]" aria-label="Employment after the course">
                        <SectionTitle title="Employment after the course" />
                        <Prose sentences={narrative.outcomes} />
                        <OutcomesBlock insights={insights} />
                    </section>

                    {insights.people.total > 0 && (
                        <section className="mt-[8mm]" aria-label="Who registered">
                            <SectionTitle title="Who registered" />
                            <Prose sentences={narrative.people} />
                            <div className="grid grid-cols-3 gap-[5mm] mt-[3.5mm]">
                                <ShareList title="Course language" items={insights.people.languages.slice(0, 6)} total={insights.people.total} />
                                <ShareList title="Where they live" items={insights.people.areas.slice(0, 7)} total={insights.people.total} />
                                <ShareList title="Age" items={insights.people.ages} total={insights.people.total} />
                            </div>
                        </section>
                    )}

                    <section className="mt-[8mm] rounded-[2.5mm] bg-(--rs-panel) px-[4mm] py-[3mm] text-[7.5pt] leading-[1.45] text-(--rs-ink-2)" aria-label="How the figures are counted">
                        <p className="font-semibold text-(--rs-ink)">How the figures are counted</p>
                        <p className="mt-[0.8mm]">
                            A registration is dated by the day the person registered, a completion by the day the course was completed.
                            A person counts once per course, whatever the language. A course run is one course in one language on one date,
                            with at least one graduate. Course runs marked "Ignore in reports" are left out. The queue is today's, whatever
                            the period. Employment is the outcome survey among people who completed a course in the period. Area is worked out
                            from the address and Eircode, and age from the date of birth, as of the day the report was prepared.
                        </p>
                    </section>

                    {footer(2)}
                </article>
            )}
        </>
    );
}

function Prose({ sentences, className = '' }: { sentences: string[]; className?: string }) {
    if (sentences.length === 0) return null;
    return <p className={`text-[9.5pt] leading-[1.5] text-(--rs-ink) ${className}`}>{sentences.join(' ')}</p>;
}

function Figure({ label, value, hint, swatch }: { label: string; value: ReactNode; hint: string; swatch?: string }) {
    return (
        <div className="rounded-[2.5mm] bg-(--rs-panel) px-[3.5mm] py-[3mm] min-w-0">
            <p className="flex items-center gap-[1.6mm] text-[8pt] font-medium text-(--rs-ink-2) whitespace-nowrap">
                {swatch && <span className="inline-block w-[2.4mm] h-[2.4mm] rounded-full shrink-0" style={{ background: swatch }} />}
                {label}
            </p>
            <p className="mt-[1mm] text-[22pt] leading-none font-semibold tracking-tight">{value}</p>
            <p className="mt-[1.6mm] text-[7.5pt] text-(--rs-muted)">{hint}</p>
        </div>
    );
}

function SectionTitle({ title, legend }: { title: string; legend?: boolean }) {
    return (
        <div className="flex items-baseline justify-between gap-4 mb-[1.8mm]">
            <h2 className="text-[11pt] font-semibold">{title}</h2>
            {legend && (
                <div className="flex items-center gap-[4mm] text-[8pt] text-(--rs-ink-2)">
                    <LegendKey color="var(--rs-registered)" label="Registered" />
                    <LegendKey color="var(--rs-completed)" label="Completed" />
                </div>
            )}
        </div>
    );
}

function LegendKey({ color, label }: { color: string; label: string }) {
    return (
        <span className="flex items-center gap-[1.4mm]">
            <span className="inline-block w-[2.6mm] h-[2.6mm] rounded-[0.6mm]" style={{ background: color }} />
            {label}
        </span>
    );
}

function BarCell({ value, max, color }: { value: number; max: number; color: string }) {
    const pct = (value / max) * 100;
    return (
        <div className="flex items-center gap-[2mm]">
            <div className="flex-1 h-[2.4mm]">
                {value > 0 && (
                    <div className="h-full rounded-r-[1mm]" style={{ width: `${Math.max(pct, 1.5)}%`, background: color }} />
                )}
            </div>
            <span className="w-[10mm] text-right tabular-nums">{count(value)}</span>
        </div>
    );
}

// ── Page 2 blocks ──────────────────────────────────────────────────

const SUBHEAD = 'text-[7.5pt] uppercase tracking-wider font-semibold text-(--rs-muted) mb-[1.6mm]';

/** A ranked list: name · bar · count and percent of `total`. */
function ShareList({ title, items, total, color = 'var(--rs-registered)' }: { title: string; items: Share[]; total: number; color?: string }) {
    const max = Math.max(1, ...items.map(i => i.count));
    return (
        <div className="min-w-0">
            <p className={SUBHEAD}>{title}</p>
            <ul className="text-[8.5pt]">
                {items.map(item => (
                    <li key={item.name} className="flex items-center gap-[2mm] py-[0.75mm]">
                        <span className="w-[46%] truncate">{item.name}</span>
                        <span className="flex-1 h-[2.2mm]">
                            <span className="block h-full rounded-r-[1mm]" style={{ width: `${Math.max((item.count / max) * 100, 2)}%`, background: item.name === 'Not known' || item.name === 'Not said' ? 'var(--rs-axis)' : color }} />
                        </span>
                        <span className="w-[15mm] text-right tabular-nums whitespace-nowrap">
                            {count(item.count)} <span className="text-(--rs-muted)">· {percent(item.count, total)}%</span>
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

function QueueBlock({ insights }: { insights: Insights }) {
    const { fates, queue } = insights;
    const segments = [
        { label: 'Completed', value: fates.completed, color: 'var(--rs-completed)' },
        { label: 'Confirmed', value: fates.confirmed, color: '#1f9d8a' },
        { label: 'Invited', value: fates.invited, color: 'var(--rs-registered)' },
        { label: 'Waiting', value: fates.waiting, color: '#e3b23c' },
        { label: 'Withdrew / not accepted', value: fates.left, color: 'var(--rs-axis)' },
    ].filter(s => s.value > 0);
    const longest = queue.courses.filter(c => c.waiting > 0).slice(0, 6).map(c => ({ name: c.name, count: c.waiting }));

    return (
        <div className="grid grid-cols-2 gap-[8mm] mt-[3.5mm]">
            <div className="min-w-0">
                <p className={SUBHEAD}>The period's registrations, as of today</p>
                {fates.total === 0 ? (
                    <p className="text-[8.5pt] text-(--rs-ink-2)">No registrations in the period.</p>
                ) : (
                    <>
                        <div className="flex h-[3.2mm] gap-[0.3mm] rounded-[1mm] overflow-hidden">
                            {segments.map(s => (
                                <span key={s.label} style={{ flexGrow: s.value, flexBasis: 0, minWidth: '0.8mm', background: s.color }} />
                            ))}
                        </div>
                        <ul className="mt-[2mm] text-[8.5pt]">
                            {segments.map(s => (
                                <li key={s.label} className="flex items-center gap-[1.8mm] py-[0.6mm]">
                                    <span className="inline-block w-[2.4mm] h-[2.4mm] rounded-[0.6mm] shrink-0" style={{ background: s.color }} />
                                    <span className="flex-1">{s.label}</span>
                                    <span className="tabular-nums">{count(s.value)} <span className="text-(--rs-muted)">· {percent(s.value, fates.total)}%</span></span>
                                </li>
                            ))}
                        </ul>
                    </>
                )}
                <div className="grid grid-cols-3 gap-[2mm] mt-[3.5mm]">
                    {[
                        { label: 'Waiting today', value: queue.waiting },
                        { label: 'Invited', value: queue.invited },
                        { label: 'Confirmed', value: queue.confirmed },
                    ].map(f => (
                        <div key={f.label} className="rounded-[2mm] bg-(--rs-panel) px-[2.5mm] py-[2mm]">
                            <p className="text-[14pt] leading-none font-semibold">{count(f.value)}</p>
                            <p className="mt-[1mm] text-[7.5pt] text-(--rs-muted)">{f.label}</p>
                        </div>
                    ))}
                </div>
            </div>
            {longest.length > 0
                ? <ShareList title="Longest waiting lists today" items={longest} total={queue.waiting} color="#e3b23c" />
                : <div />}
        </div>
    );
}

function OutcomesBlock({ insights }: { insights: Insights }) {
    const o = insights.outcomes;
    if (o.graduates === 0 || o.asked === 0) return null;
    const max = Math.max(1, o.graduates);
    const steps = [
        { label: 'Completed a course', value: o.graduates, of: 0 },
        { label: 'Sent the survey', value: o.asked, of: o.graduates },
        { label: 'Answered', value: o.responded, of: o.asked },
        { label: 'Working', value: o.working, of: o.responded },
    ];
    const hours = [
        { name: 'Full-time', count: o.fullTime },
        { name: 'Part-time', count: o.partTime },
        { name: 'Not said', count: o.working - o.fullTime - o.partTime },
    ].filter(s => s.count > 0);
    const fields = o.fields.slice(0, 5);

    return (
        <div className="grid grid-cols-2 gap-[8mm] mt-[3.5mm]">
            <div className="min-w-0">
                <p className={SUBHEAD}>From course to work</p>
                <ul className="text-[8.5pt]">
                    {steps.map((s, i) => (
                        <li key={s.label} className="flex items-center gap-[2mm] py-[0.75mm]">
                            <span className="w-[34%]">{s.label}</span>
                            <span className="flex-1 h-[2.6mm]">
                                {s.value > 0 && (
                                    <span className="block h-full rounded-r-[1mm]" style={{ width: `${Math.max((s.value / max) * 100, 1.5)}%`, background: i === 3 ? 'var(--rs-completed)' : 'var(--rs-registered)', opacity: i === 3 ? 1 : 1 - i * 0.25 }} />
                                )}
                            </span>
                            <span className="w-[16mm] text-right tabular-nums whitespace-nowrap">
                                {count(s.value)}{s.of > 0 && <span className="text-(--rs-muted)"> · {percent(s.value, s.of)}%</span>}
                            </span>
                        </li>
                    ))}
                </ul>
            </div>
            {o.working > 0 ? (
                <div className="min-w-0 flex flex-col gap-[3mm]">
                    {fields.length > 0 && <ShareList title="Field of work" items={fields} total={o.working} color="var(--rs-completed)" />}
                    {fields.length <= 3 && hours.length > 0 && <ShareList title="Hours" items={hours} total={o.working} color="var(--rs-completed)" />}
                </div>
            ) : <div />}
        </div>
    );
}

// ── Monthly columns ────────────────────────────────────────────────

const CHART_W = 680; // ≈ the sheet's 180 mm text width at 96 dpi, so 1 unit ≈ 1 px
const CHART_H = 132;
const AXIS_W = 30;
const LABEL_H = 16;

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Column with a 4-unit rounded top and a square foot on the baseline. */
function columnPath(x: number, y: number, w: number, h: number): string {
    const r = Math.min(4, w / 2, h);
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

function MonthChart({ months }: { months: ReportMonth[] }) {
    const top = Math.max(1, ...months.map(m => Math.max(m.registered, m.completed)));
    const step = niceStep(top);
    const yMax = Math.ceil(top / step) * step;
    const ticks = Array.from({ length: yMax / step + 1 }, (_, i) => i * step);

    const plotW = CHART_W - AXIS_W;
    const plotH = CHART_H - LABEL_H - 6;
    const y0 = 6 + plotH;
    const band = plotW / months.length;
    const barW = Math.max(1, Math.min(14, (band * 0.72 - 2) / 2));
    const groupW = barW * 2 + 2;
    const yOf = (v: number) => y0 - (v / yMax) * plotH;

    const multiYear = months[0].month.slice(0, 4) !== months[months.length - 1].month.slice(0, 4);
    const labelEvery = Math.ceil(months.length / (multiYear ? 12 : 14));

    return (
        <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full h-auto block" role="img" aria-label="Registrations and completions by month">
            {ticks.map(t => (
                <g key={t}>
                    <line x1={AXIS_W} x2={CHART_W} y1={yOf(t)} y2={yOf(t)} stroke="var(--rs-rule)" strokeWidth={1} />
                    <text x={AXIS_W - 6} y={yOf(t)} dy="0.32em" textAnchor="end" fontSize={9.5} fill="var(--rs-muted)" className="tabular-nums">
                        {t >= 1000 ? `${t / 1000}K` : t}
                    </text>
                </g>
            ))}
            {months.map((m, i) => {
                const x = AXIS_W + i * band + (band - groupW) / 2;
                const [y, mm] = m.month.split('-');
                const name = MONTH_SHORT[Number(mm) - 1];
                return (
                    <g key={m.month}>
                        {m.registered > 0 && (
                            <path d={columnPath(x, yOf(m.registered), barW, y0 - yOf(m.registered))} fill="var(--rs-registered)" />
                        )}
                        {m.completed > 0 && (
                            <path d={columnPath(x + barW + 2, yOf(m.completed), barW, y0 - yOf(m.completed))} fill="var(--rs-completed)" />
                        )}
                        {i % labelEvery === 0 && (
                            <text x={AXIS_W + i * band + band / 2} y={CHART_H - 3} textAnchor="middle" fontSize={9.5} fill="var(--rs-ink-2)">
                                {multiYear ? `${name} ${y.slice(2)}` : name}
                            </text>
                        )}
                    </g>
                );
            })}
            <line x1={AXIS_W} x2={CHART_W} y1={y0} y2={y0} stroke="var(--rs-axis)" strokeWidth={1} />
        </svg>
    );
}
