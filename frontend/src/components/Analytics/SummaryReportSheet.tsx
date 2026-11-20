import type { ReactNode } from 'react';
import { formatLocalDate } from '../../lib/dateUtils';
import { AGE_GROUPS, NOT_KNOWN, type Insights, type Share } from './insights';
import { count, formatPercent, percent, plural, type Narrative } from './narrative';
import { formatPeriodLabel, niceStep, type ReportCourseRow, type ReportMonth } from './summaryReport';

/**
 * The PDF report as sheets of A4 paper (index.css, .report-sheet): always white paper in either
 * theme, styled as an institutional annual-report document harmonised with Cork City Partnership
 * and SICAP branding. Page 1 is the executive overview (KPIs with trend badges, key highlights,
 * monthly trend chart, and courses table with live waiting queues). Page 2 covers the pipeline
 * & waiting lists, post-course employment (conversion funnel, hours donut, sector breakdown),
 * participant profile (language, area, vertical age histogram), and methodology.
 */

const COURSE_ROWS_WITH_CHART = 15;
const COURSE_ROWS = 22;

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

interface CourseTableRow extends ReportCourseRow {
    waiting: number;
}

function foldCourseTable(rows: CourseTableRow[], limit: number): CourseTableRow[] {
    if (rows.length <= limit) return rows;
    const kept = rows.slice(0, Math.max(0, limit - 1));
    const rest = rows.slice(kept.length);
    return [
        ...kept,
        {
            courseId: 'other',
            name: `Other courses (${rest.length})`,
            registered: rest.reduce((sum, c) => sum + c.registered, 0),
            completed: rest.reduce((sum, c) => sum + c.completed, 0),
            runs: rest.reduce((sum, c) => sum + c.runs, 0),
            waiting: rest.reduce((sum, c) => sum + c.waiting, 0),
        },
    ];
}

interface BadgeInfo {
    label: string;
    tone: 'up' | 'down' | 'neutral';
}

function trendBadge(before: number | undefined, now: number): BadgeInfo | null {
    if (before === undefined) return null;
    if (before === now) return { label: '0%', tone: 'neutral' };
    if (before === 0) return now > 0 ? { label: 'New', tone: 'up' } : null;
    const pct = Math.round(((now - before) / before) * 100);
    if (pct > 0) return { label: `▲ ${pct}%`, tone: 'up' };
    if (pct < 0) return { label: `▼ ${Math.abs(pct)}%`, tone: 'down' };
    return { label: '0%', tone: 'neutral' };
}

export default function SummaryReportSheet({ insights, narrative, courseName = null, pages = 2, preparedOn = new Date() }: SummaryReportSheetProps) {
    const { summary: report, period, outcomes, previous, queue } = insights;
    const isEmpty = report.registrations === 0 && report.completions === 0;
    const showChart = report.months.length >= 2 && !isEmpty;
    const waitingByCourse = new Map(queue.courses.map(c => [c.courseId, c.waiting]));
    const fullRows: CourseTableRow[] = report.courses.map(c => ({
        ...c,
        waiting: waitingByCourse.get(c.courseId) ?? 0,
    }));
    const rows = foldCourseTable(fullRows, showChart ? COURSE_ROWS_WITH_CHART : COURSE_ROWS);
    const tableWaitingTotal = fullRows.reduce((sum, c) => sum + c.waiting, 0);
    const extraWaiting = Math.max(0, queue.waiting - tableWaitingTotal);

    const rowPad = rows.length > 13 ? 'py-[0.58mm]' : rows.length > 10 ? 'py-[0.78mm]' : 'py-[1.05mm]';
    const tableText = rows.length > 13 ? 'text-[7.75pt]' : rows.length > 10 ? 'text-[8pt]' : 'text-[8.25pt]';
    // One scale for both columns: a course's completions read against its registrations
    const scaleMax = Math.max(1, ...rows.map(r => Math.max(r.registered, r.completed)));
    const subject = courseName ?? 'All courses';
    const perRun = report.courseRuns > 0 ? Math.round((report.completions / report.courseRuns) * 10) / 10 : null;
    const { highlights } = narrative;

    const regTrend = trendBadge(previous?.peopleRegistered, report.peopleRegistered);
    const compTrend = trendBadge(previous?.peopleCompleted, report.peopleCompleted);
    const runsBadge: BadgeInfo | null = perRun !== null ? { label: `${count(perRun)} / run`, tone: 'neutral' } : null;
    const surveyBadge: BadgeInfo | null = outcomes.asked > 0
        ? { label: `${percent(outcomes.responded, outcomes.asked)}% replied`, tone: 'neutral' }
        : null;

    const footer = (page: number) => (
        <footer className="pt-[2mm] shrink-0 flex items-center justify-between text-[7.2pt] text-(--rs-muted) border-t border-(--rs-rule)">
            <span>Cork City Partnership · SICAP · Courses report · {formatPeriodLabel(period)}</span>
            <span className="font-medium text-(--rs-ink-2) tabular-nums">Page {page} of {pages}</span>
        </footer>
    );

    const coursesSectionNum = showChart ? '02' : '01';
    const pipelineSectionNum = showChart ? '03' : '02';
    const outcomesSectionNum = showChart ? '04' : '03';
    const peopleSectionNum = showChart ? '05' : '04';

    return (
        <>
            <article className="report-sheet" aria-label="Courses report">
                <BrandStrip />

                <header className="pt-[5mm] pb-[3mm] shrink-0 flex items-center justify-between gap-6 border-b border-(--rs-rule)">
                    <img src="/logos-banner.png" alt="Cork City Partnership · SICAP" className="h-[11.5mm] w-auto" />
                    <div className="text-right">
                        <p className="text-[6.5pt] font-bold uppercase tracking-[0.14em] text-(--rs-brand)">
                            SICAP · Education &amp; Employment
                        </p>
                        <h1 className="mt-[0.3mm] text-[15.5pt] leading-tight font-bold tracking-tight text-(--rs-ink)">
                            Courses report
                        </h1>
                        <p className="mt-[0.5mm] text-[8.25pt] text-(--rs-ink-2)">
                            {subject} · <span className="font-semibold text-(--rs-ink)">{formatPeriodLabel(period)}</span>
                            <span className="text-(--rs-muted)"> · Prepared {formatLocalDate(preparedOn, { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                        </p>
                    </div>
                </header>

                <section className="grid grid-cols-4 gap-[2.8mm] mt-[3.5mm] shrink-0" aria-label="Key figures">
                    <KpiCard
                        accent="var(--rs-registered)"
                        label="People registered"
                        value={count(report.peopleRegistered)}
                        badge={regTrend}
                        hint={plural(report.registrations, 'course registration')}
                    />
                    <KpiCard
                        accent="var(--rs-completed)"
                        label="People completed"
                        value={count(report.peopleCompleted)}
                        badge={compTrend}
                        hint={plural(report.completions, 'course completion')}
                    />
                    <KpiCard
                        accent="var(--rs-runs)"
                        label="Course runs"
                        value={count(report.courseRuns)}
                        badge={runsBadge}
                        hint={`with graduates, across ${plural(report.coursesDelivered, 'course')}`}
                    />
                    <KpiCard
                        accent="var(--rs-working)"
                        label="Working after course"
                        value={outcomes.responded > 0 ? `${percent(outcomes.working, outcomes.asked)}%` : '—'}
                        badge={surveyBadge}
                        hint={
                            outcomes.responded > 0
                                ? `${count(outcomes.working)} of ${count(outcomes.asked)} surveyed (${count(outcomes.responded)} answered)`
                                : 'no survey answers yet'
                        }
                    />
                </section>

                <section
                    className="mt-[3.2mm] shrink-0 rounded-r-[2mm] bg-(--rs-panel) border border-(--rs-rule) border-l-[3px] border-l-(--rs-brand) px-[3.5mm] py-[2.2mm]"
                    aria-label="Key highlights"
                >
                    <p className="text-[6.75pt] font-bold uppercase tracking-[0.12em] text-(--rs-brand-dark) mb-[1mm]">
                        Key highlights
                    </p>
                    <ul className="space-y-[0.7mm] text-[7.9pt] leading-[1.36] text-(--rs-ink)">
                        {highlights.bullets.map(bullet => (
                            <li key={bullet} className="flex items-start gap-[2mm]">
                                <span aria-hidden className="mt-[1.3mm] w-[1.3mm] h-[1.3mm] rounded-full bg-(--rs-brand) shrink-0" />
                                <span>{bullet}</span>
                            </li>
                        ))}
                    </ul>
                </section>

                {showChart && (
                    <section className="mt-[3.8mm] shrink-0" aria-label="By month">
                        <SectionHeader num="01" title="Monthly activity" legend />
                        <div className="rounded-[2mm] border border-(--rs-rule) bg-white px-[3mm] pt-[1.8mm] pb-[1.4mm]">
                            <MonthChart months={report.months} />
                        </div>
                    </section>
                )}

                <section className="mt-[3.8mm] pb-[2mm] shrink-0" aria-label="Courses">
                    <SectionHeader
                        num={coursesSectionNum}
                        title="Courses by demand & delivery"
                        legend={!showChart && !isEmpty}
                        note={!isEmpty && rows.some(r => r.registered > 0 && r.completed === 0 && r.courseId !== 'other') ? 'Amber dot = no runs delivered yet' : undefined}
                    />
                    {isEmpty ? (
                        <p className="py-[10mm] text-center text-(--rs-ink-2) rounded-[2mm] border border-(--rs-rule) bg-(--rs-panel)">
                            No registrations or completions in this period.
                        </p>
                    ) : (
                        <>
                            {highlights.leads.courses && <LeadLine text={highlights.leads.courses} className="mb-[2mm]" />}
                            <div className="rounded-[2mm] border border-(--rs-rule) overflow-hidden">
                                <table className={`w-full table-fixed border-collapse ${tableText}`}>
                                    <colgroup>
                                        <col className="w-[33%]" />
                                        <col className="w-[7%]" />
                                        <col className="w-[24%]" />
                                        <col className="w-[24%]" />
                                        <col className="w-[12%]" />
                                    </colgroup>
                                    <thead>
                                        <tr className="bg-(--rs-panel) text-left text-[6.75pt] uppercase tracking-[0.06em] text-(--rs-muted) border-b border-(--rs-rule)">
                                            <th className="font-semibold py-[1.15mm] pl-[2.6mm] pr-[2.5mm]">Course</th>
                                            <th className="font-semibold py-[1.15mm] pr-[3mm] text-right">Runs</th>
                                            <th className="font-semibold py-[1.15mm] pr-[3mm] text-right">Registered</th>
                                            <th className="font-semibold py-[1.15mm] pr-[3mm] text-right">Completed</th>
                                            <th className="font-semibold py-[1.15mm] pr-[2.6mm] text-right">Waiting now</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map((row, idx) => {
                                            const unmet = row.registered > 0 && row.completed === 0 && row.courseId !== 'other';
                                            return (
                                                <tr
                                                    key={row.courseId}
                                                    className={`border-b border-(--rs-rule-soft) ${idx % 2 === 1 ? 'bg-[#fafcfb]' : 'bg-white'}`}
                                                >
                                                    <td
                                                        className={`${rowPad} pl-[2.6mm] pr-[2.5mm] truncate ${row.courseId === 'other' ? 'text-(--rs-ink-2) italic' : 'font-medium text-(--rs-ink)'}`}
                                                        title={row.name}
                                                    >
                                                        <span className="inline-flex items-center gap-[1.5mm] max-w-full">
                                                            {unmet && (
                                                                <span
                                                                    aria-hidden
                                                                    className="inline-block w-[1.5mm] h-[1.5mm] rounded-full bg-(--rs-waiting) shrink-0"
                                                                />
                                                            )}
                                                            <span className="truncate">{row.name}</span>
                                                        </span>
                                                    </td>
                                                    <td className={`${rowPad} pr-[3mm] text-right tabular-nums ${row.runs === 0 ? 'text-(--rs-muted)' : 'text-(--rs-ink)'}`}>
                                                        {count(row.runs)}
                                                    </td>
                                                    <td className={`${rowPad} pr-[3mm]`}>
                                                        <BarCell value={row.registered} max={scaleMax} color="var(--rs-registered)" />
                                                    </td>
                                                    <td className={`${rowPad} pr-[3mm]`}>
                                                        <BarCell value={row.completed} max={scaleMax} color="var(--rs-completed)" />
                                                    </td>
                                                    <td className={`${rowPad} pr-[2.6mm] text-right tabular-nums`}>
                                                        {row.waiting > 0 ? (
                                                            <span className="inline-block rounded-[1mm] bg-[#fef3c7] text-[#92400e] font-semibold px-[1.5mm] py-[0.15mm] leading-tight">
                                                                {count(row.waiting)}
                                                            </span>
                                                        ) : (
                                                            <span className="text-(--rs-muted)">0</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                    <tfoot>
                                        <tr className="bg-(--rs-panel) font-bold border-t border-(--rs-rule) text-(--rs-ink)">
                                            <td className="py-[1.3mm] pl-[2.6mm] pr-[2.5mm]">Total</td>
                                            <td className="py-[1.3mm] pr-[3mm] text-right tabular-nums">{count(report.courseRuns)}</td>
                                            <td className="py-[1.3mm] pr-[3mm] text-right tabular-nums">{count(report.registrations)}</td>
                                            <td className="py-[1.3mm] pr-[3mm] text-right tabular-nums">{count(report.completions)}</td>
                                            <td className="py-[1.3mm] pr-[2.6mm] text-right tabular-nums">{count(tableWaitingTotal)}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                            {extraWaiting > 0 && (
                                <p className="mt-[1.2mm] text-[6.8pt] text-(--rs-muted)">
                                    Waiting now reflects today's queue for courses active in this period; {count(extraWaiting)} additional waiting{' '}
                                    {extraWaiting === 1 ? 'registration is' : 'registrations are'} in other courses (total waiting today: {count(queue.waiting)}).
                                </p>
                            )}
                        </>
                    )}
                </section>

                <div className="mt-auto">{footer(1)}</div>
            </article>

            {pages === 2 && (
                <article className="report-sheet" aria-label="Courses report, page 2">
                    <BrandStrip />

                    <header className="pt-[4.2mm] pb-[2.2mm] shrink-0 flex items-baseline justify-between gap-6 border-b border-(--rs-rule)">
                        <p className="text-[7.5pt] font-bold uppercase tracking-[0.12em] text-(--rs-brand-dark)">
                            Cork City Partnership · Courses report
                        </p>
                        <p className="text-[8pt] text-(--rs-ink-2)">
                            {subject} · <span className="font-semibold text-(--rs-ink)">{formatPeriodLabel(period)}</span>
                        </p>
                    </header>

                    <section className="mt-[4mm] shrink-0" aria-label="Where registrations stand">
                        <SectionHeader num={pipelineSectionNum} title="Where registrations stand" />
                        <LeadLine text={highlights.leads.pipeline} />
                        <QueueBlock insights={insights} />
                    </section>

                    <section className="mt-[5mm] shrink-0" aria-label="Employment after the course">
                        <SectionHeader num={outcomesSectionNum} title="Employment after the course" />
                        <LeadLine text={highlights.leads.outcomes} />
                        <OutcomesBlock insights={insights} />
                    </section>

                    {insights.people.total > 0 && (
                        <section className="mt-[5mm] shrink-0" aria-label="Who registered">
                            <SectionHeader num={peopleSectionNum} title="Who registered" />
                            {highlights.leads.people && <LeadLine text={highlights.leads.people} />}
                            <div className="grid grid-cols-3 gap-[3.8mm] mt-[2.5mm]">
                                <PanelCard title="Course language" badge={`${count(insights.people.total)} people`}>
                                    <ShareList items={insights.people.languages.slice(0, 6)} total={insights.people.total} color="var(--rs-registered)" />
                                </PanelCard>
                                <PanelCard title="Where they live">
                                    <ShareList items={insights.people.areas.slice(0, 6)} total={insights.people.total} color="var(--rs-working)" />
                                </PanelCard>
                                <PanelCard title="Age profile">
                                    <AgeHistogram ages={insights.people.ages} total={insights.people.total} />
                                </PanelCard>
                            </div>
                        </section>
                    )}

                    <div className="mt-auto pt-[3mm] shrink-0 flex flex-col gap-[2.4mm]">
                        <section
                            className="rounded-r-[1.8mm] bg-(--rs-panel) border border-(--rs-rule) border-l-[2.5px] border-l-(--rs-brand) px-[3.2mm] py-[2mm] text-[6.8pt] leading-[1.4] text-(--rs-ink-2)"
                            aria-label="How the figures are counted"
                        >
                            <span className="font-bold text-(--rs-ink) mr-[1.5mm]">How the figures are counted:</span>
                            A registration is dated by the day the person registered, a completion by the day the course was completed.
                            A person counts once per course, whatever the language. A course run is one course in one language on one date
                            with at least one graduate; runs marked "Ignore in reports" are left out. The queue reflects today's live status
                            across all periods. Employment is the outcome survey among graduates of the period; the working rate is the share
                            of all surveyed graduates confirmed to be in employment. Area is derived from address and Eircode, and age from
                            date of birth as of the report date.
                        </section>
                        {footer(2)}
                    </div>
                </article>
            )}
        </>
    );
}

// ── Shared chrome ──────────────────────────────────────────────────

function BrandStrip() {
    return (
        <div aria-hidden className="-mx-[13mm] h-[2.2mm] shrink-0 flex">
            <span className="w-[74%] bg-(--rs-brand-dark)" />
            <span className="w-[18%] bg-(--rs-brand)" />
            <span className="w-[8%] bg-(--rs-registered)" />
        </div>
    );
}

function LeadLine({ text, className = '' }: { text: string; className?: string }) {
    if (!text) return null;
    return <p className={`text-[8.1pt] leading-[1.4] text-(--rs-ink-2) ${className}`}>{text}</p>;
}

function SectionHeader({ num, title, legend, note }: { num: string; title: string; legend?: boolean; note?: string }) {
    return (
        <div className="flex items-center justify-between gap-4 mb-[1.3mm]">
            <div className="flex items-center gap-[2mm]">
                <span className="inline-flex items-center justify-center rounded-[1mm] bg-(--rs-brand-dark) text-white text-[6.5pt] font-bold tabular-nums px-[1.5mm] py-[0.35mm] leading-none">
                    {num}
                </span>
                <h2 className="text-[10pt] font-bold tracking-tight text-(--rs-ink)">{title}</h2>
            </div>
            <div className="flex items-center gap-[3.5mm] text-[7.2pt] text-(--rs-ink-2)">
                {note && <span className="text-(--rs-muted)">{note}</span>}
                {legend && (
                    <>
                        <LegendKey color="var(--rs-registered)" label="Registered" />
                        <LegendKey color="var(--rs-completed)" label="Completed" />
                    </>
                )}
            </div>
        </div>
    );
}

function LegendKey({ color, label }: { color: string; label: string }) {
    return (
        <span className="flex items-center gap-[1.3mm] font-medium">
            <span className="inline-block w-[2.3mm] h-[2.3mm] rounded-[0.5mm]" style={{ background: color }} />
            {label}
        </span>
    );
}

function KpiCard({
    label, value, hint, accent, badge,
}: {
    label: string;
    value: ReactNode;
    hint: string;
    accent: string;
    badge?: BadgeInfo | null;
}) {
    const badgeCls = badge?.tone === 'up'
        ? 'bg-(--rs-up-bg) text-(--rs-up-ink)'
        : badge?.tone === 'down'
            ? 'bg-(--rs-down-bg) text-(--rs-down-ink)'
            : 'bg-(--rs-panel) text-(--rs-ink-2) border border-(--rs-rule)';
    return (
        <div className="rounded-[2mm] border border-(--rs-rule) bg-white overflow-hidden min-w-0 flex flex-col">
            <span aria-hidden className="block h-[2.5px] w-full shrink-0" style={{ background: accent }} />
            <div className="px-[2.8mm] py-[2.2mm] flex-1 flex flex-col">
                <p className="text-[6.8pt] font-semibold uppercase tracking-[0.04em] text-(--rs-ink-2) whitespace-nowrap">{label}</p>
                <div className="mt-[1.3mm] flex items-baseline justify-between gap-[1.5mm]">
                    <p className="text-[18pt] leading-none font-bold tracking-tight tabular-nums text-(--rs-ink)">{value}</p>
                    {badge && (
                        <span className={`rounded-[1mm] px-[1.3mm] py-[0.25mm] text-[6.3pt] font-semibold tabular-nums whitespace-nowrap shrink-0 ${badgeCls}`}>
                            {badge.label}
                        </span>
                    )}
                </div>
                <p className="mt-[1.4mm] text-[6.9pt] leading-[1.25] text-(--rs-muted)">{hint}</p>
            </div>
        </div>
    );
}

function PanelCard({ title, badge, children, className = '' }: { title: string; badge?: string; children: ReactNode; className?: string }) {
    return (
        <div className={`rounded-[2mm] border border-(--rs-rule) bg-white px-[3mm] py-[2.4mm] min-w-0 flex flex-col ${className}`}>
            <div className="flex items-baseline justify-between gap-2 pb-[1.5mm] mb-[1.6mm] border-b border-(--rs-rule-soft)">
                <p className="text-[6.8pt] uppercase tracking-[0.08em] font-bold text-(--rs-muted)">{title}</p>
                {badge && <span className="text-[6.8pt] font-semibold text-(--rs-ink-2) tabular-nums whitespace-nowrap">{badge}</span>}
            </div>
            {children}
        </div>
    );
}

function BarCell({ value, max, color }: { value: number; max: number; color: string }) {
    const pct = (value / max) * 100;
    return (
        <div className="flex items-center gap-[1.8mm]">
            <div className="flex-1 h-[2.1mm] rounded-[0.7mm] bg-(--rs-track) overflow-hidden">
                {value > 0 && (
                    <div className="h-full rounded-[0.7mm]" style={{ width: `${Math.max(pct, 2)}%`, background: color }} />
                )}
            </div>
            <span className={`w-[9.5mm] text-right tabular-nums ${value === 0 ? 'text-(--rs-muted)' : 'text-(--rs-ink)'}`}>{count(value)}</span>
        </div>
    );
}

// ── Page 2 visual blocks ───────────────────────────────────────────

/** A ranked list: name · bar · count and percent of `total`. */
function ShareList({ items, total, color = 'var(--rs-registered)' }: { items: Share[]; total: number; color?: string }) {
    const max = Math.max(1, ...items.map(i => i.count));
    const isMutedItem = (name: string) => name === NOT_KNOWN || name === 'Not said' || name === 'Other';
    return (
        <ul className="text-[7.8pt] space-y-[0.7mm]">
            {items.map(item => (
                <li key={item.name} className="flex items-center gap-[1.6mm]">
                    <span className={`w-[42%] truncate ${isMutedItem(item.name) ? 'text-(--rs-muted)' : 'text-(--rs-ink) font-medium'}`} title={item.name}>
                        {item.name}
                    </span>
                    <span className="flex-1 h-[2mm] rounded-[0.6mm] bg-(--rs-track) overflow-hidden">
                        <span
                            className="block h-full rounded-[0.6mm]"
                            style={{ width: `${Math.max((item.count / max) * 100, 3)}%`, background: isMutedItem(item.name) ? 'var(--rs-axis)' : color }}
                        />
                    </span>
                    <span className="w-[15.5mm] shrink-0 text-right tabular-nums whitespace-nowrap">
                        <span className="font-semibold text-(--rs-ink)">{count(item.count)}</span>
                        <span className="text-(--rs-muted)"> · {formatPercent(item.count, total)}</span>
                    </span>
                </li>
            ))}
        </ul>
    );
}

function QueueBlock({ insights }: { insights: Insights }) {
    const { fates, queue } = insights;
    const segments = [
        { label: 'Completed', value: fates.completed, color: 'var(--rs-completed)' },
        { label: 'Confirmed', value: fates.confirmed, color: 'var(--rs-working)' },
        { label: 'Invited', value: fates.invited, color: 'var(--rs-registered)' },
        { label: 'Waiting', value: fates.waiting, color: 'var(--rs-waiting)' },
        { label: 'Withdrew / not accepted', value: fates.left, color: 'var(--rs-axis)' },
    ].filter(s => s.value > 0);
    const longest = queue.courses.filter(c => c.waiting > 0).slice(0, 6).map(c => ({ name: c.name, count: c.waiting }));
    const showAllTimeQueue =
        fates.total === 0 ||
        queue.waiting !== fates.waiting ||
        queue.invited !== fates.invited ||
        queue.confirmed !== fates.confirmed;

    return (
        <div className="grid grid-cols-[1.12fr_1fr] gap-[4mm] mt-[2.5mm]">
            <PanelCard title="Period registrations, as of today" badge={fates.total > 0 ? `${count(fates.total)} total` : undefined}>
                {fates.total === 0 ? (
                    <p className="text-[8pt] text-(--rs-muted) py-[2mm]">No registrations in the period.</p>
                ) : (
                    <>
                        <div className="flex h-[4.4mm] gap-[0.4mm] rounded-[1.2mm] overflow-hidden">
                            {segments.map(s => {
                                const pct = percent(s.value, fates.total);
                                return (
                                    <span
                                        key={s.label}
                                        className="flex items-center justify-center text-[6.5pt] font-bold text-white tabular-nums overflow-hidden"
                                        style={{ flexGrow: s.value, flexBasis: 0, minWidth: '1mm', background: s.color }}
                                    >
                                        {pct >= 12 ? `${pct}%` : ''}
                                    </span>
                                );
                            })}
                        </div>
                        <ul className="mt-[2mm] text-[7.9pt] space-y-[0.7mm]">
                            {segments.map(s => (
                                <li key={s.label} className="flex items-center gap-[1.8mm]">
                                    <span className="inline-block w-[2.2mm] h-[2.2mm] rounded-[0.5mm] shrink-0" style={{ background: s.color }} />
                                    <span className="flex-1 text-(--rs-ink)">{s.label}</span>
                                    <span className="tabular-nums font-semibold text-(--rs-ink)">{count(s.value)}</span>
                                    <span className="w-[9mm] text-right tabular-nums text-(--rs-muted)">{formatPercent(s.value, fates.total)}</span>
                                </li>
                            ))}
                        </ul>
                    </>
                )}
                {showAllTimeQueue && (
                    <div className="mt-auto pt-[2.2mm]">
                        <div className="grid grid-cols-3 gap-[1.8mm] rounded-[1.5mm] bg-(--rs-panel) border border-(--rs-rule-soft) px-[2.2mm] py-[1.6mm]">
                            {[
                                { label: 'Waiting today', value: queue.waiting, dot: 'var(--rs-waiting)' },
                                { label: 'Invited', value: queue.invited, dot: 'var(--rs-registered)' },
                                { label: 'Confirmed', value: queue.confirmed, dot: 'var(--rs-working)' },
                            ].map(f => (
                                <div key={f.label} className="min-w-0">
                                    <p className="text-[11pt] leading-none font-bold tabular-nums text-(--rs-ink)">{count(f.value)}</p>
                                    <p className="mt-[0.8mm] flex items-center gap-[1mm] text-[6.5pt] text-(--rs-muted) whitespace-nowrap">
                                        <span className="inline-block w-[1.4mm] h-[1.4mm] rounded-full shrink-0" style={{ background: f.dot }} />
                                        {f.label}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </PanelCard>

            <PanelCard title="Longest waiting lists today" badge={queue.waiting > 0 ? `${count(queue.waiting)} waiting` : undefined}>
                {longest.length > 0 ? (
                    <ShareList items={longest} total={queue.waiting} color="var(--rs-waiting)" />
                ) : (
                    <p className="text-[8pt] text-(--rs-muted) py-[4mm] text-center">No active waiting lists today.</p>
                )}
            </PanelCard>
        </div>
    );
}

/** Keeps the top multi-person sectors and folds singletons/overflow into "Other" so the table sums to 100%. */
function compactFields(fields: Share[], maxRows = 5): Share[] {
    const named = fields.filter(f => f.name !== 'Other' && f.name !== NOT_KNOWN);
    const tailCount = fields.filter(f => f.name === 'Other' || f.name === NOT_KNOWN).reduce((s, f) => s + f.count, 0);
    const hasMulti = named.some(f => f.count >= 2);
    const candidate = hasMulti ? named.filter(f => f.count >= 2) : named;
    const droppedCount = hasMulti ? named.filter(f => f.count < 2).reduce((s, f) => s + f.count, 0) : 0;
    const needOther = tailCount + droppedCount > 0 || candidate.length > maxRows;
    const kept = candidate.slice(0, needOther ? Math.max(1, maxRows - 1) : maxRows);
    const overflow = candidate.slice(kept.length).reduce((s, f) => s + f.count, 0) + droppedCount + tailCount;
    return overflow > 0 ? [...kept, { name: 'Other', count: overflow }] : kept;
}

function OutcomesBlock({ insights }: { insights: Insights }) {
    const o = insights.outcomes;
    if (o.graduates === 0 || o.asked === 0) return null;

    const max = Math.max(1, o.graduates);
    const awaiting = Math.max(0, o.asked - o.responded);
    const steps = [
        { label: 'Completed a course', value: o.graduates, of: 0, color: 'var(--rs-completed)', highlight: false },
        { label: 'Sent the survey', value: o.asked, of: o.graduates, color: 'var(--rs-registered)', highlight: false },
        { label: 'Answered', value: o.responded, of: o.asked, color: 'var(--rs-part-time)', highlight: false },
        { label: 'Working', value: o.working, of: o.asked, color: 'var(--rs-working)', highlight: true },
    ];
    const workTypeSlices = [
        { name: 'Full-time', count: o.fullTime, color: 'var(--rs-completed)' },
        { name: 'Part-time', count: o.partTime, color: 'var(--rs-part-time)' },
        { name: 'Self-employed', count: o.selfEmployed, color: 'var(--rs-waiting)' },
        { name: 'CE / TUS', count: o.ceTus, color: 'var(--rs-ce-tus, #7c3aed)' },
        { name: 'Not said', count: Math.max(0, o.working - o.fullTime - o.partTime - o.selfEmployed - o.ceTus), color: 'var(--rs-axis)' },
    ].filter(s => s.count > 0);
    const fields = compactFields(o.fields, 5);

    return (
        <div className="grid grid-cols-[1.24fr_0.9fr_1.16fr] gap-[3.8mm] mt-[2.5mm]">
            <PanelCard title="From course to work" badge={`${percent(o.working, o.asked)}% of surveyed`}>
                <ul className="space-y-[1.4mm] text-[7.8pt]">
                    {steps.map(s => (
                        <li key={s.label}>
                            <div className="flex items-baseline justify-between gap-2 mb-[0.5mm]">
                                <span className={s.highlight ? 'font-bold text-(--rs-working)' : 'font-medium text-(--rs-ink)'}>{s.label}</span>
                                <span className="tabular-nums whitespace-nowrap">
                                    <span className={`font-bold ${s.highlight ? 'text-(--rs-working)' : 'text-(--rs-ink)'}`}>{count(s.value)}</span>
                                    {s.of > 0 && <span className="text-(--rs-muted)"> · {formatPercent(s.value, s.of)}</span>}
                                </span>
                            </div>
                            <div className="h-[2.2mm] rounded-[0.7mm] bg-(--rs-track) overflow-hidden">
                                {s.value > 0 && (
                                    <span
                                        className="block h-full rounded-[0.7mm]"
                                        style={{ width: `${Math.max((s.value / max) * 100, 2.5)}%`, background: s.color }}
                                    />
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
                <p className="mt-auto pt-[1.8mm] text-[6.5pt] text-(--rs-muted) tabular-nums">
                    Not working: <span className="font-semibold text-(--rs-ink-2)">{count(o.notWorking)}</span>
                    {' · '}Awaiting reply: <span className="font-semibold text-(--rs-ink-2)">{count(awaiting)}</span>
                </p>
            </PanelCard>

            <PanelCard title="Type of work" badge={o.working > 0 ? `${count(o.working)} working` : undefined}>
                {o.working > 0 && workTypeSlices.length > 0 ? (
                    <HoursDonut slices={workTypeSlices} total={o.working} />
                ) : (
                    <p className="text-[7.8pt] text-(--rs-muted) my-auto text-center py-[4mm]">No working responses yet.</p>
                )}
            </PanelCard>

            <PanelCard title="Sector of work">
                {o.working > 0 && fields.length > 0 ? (
                    <ShareList items={fields} total={o.working} color="var(--rs-working)" />
                ) : (
                    <p className="text-[7.8pt] text-(--rs-muted) my-auto text-center py-[4mm]">No sectors reported yet.</p>
                )}
            </PanelCard>
        </div>
    );
}

// ── Type of work SVG Donut Chart ───────────────────────────────────

function HoursDonut({ slices, total }: { slices: { name: string; count: number; color: string }[]; total: number }) {
    const size = 80;
    const cx = size / 2;
    const cy = size / 2;
    const r = 29;
    const strokeW = 10.5;
    const circumference = 2 * Math.PI * r;
    const gap = slices.length > 1 ? 2 : 0;

    const arcs = slices.map((slice, idx) => {
        const rawLen = (slice.count / total) * circumference;
        const dash = Math.max(1, rawLen - gap);
        const prior = slices.slice(0, idx).reduce((sum, s) => sum + (s.count / total) * circumference, 0);
        return { ...slice, dash, offset: prior };
    });

    return (
        <div className="flex flex-col items-center justify-between flex-1">
            <svg
                viewBox={`0 0 ${size} ${size}`}
                className="w-[21mm] h-[21mm] block shrink-0"
                role="img"
                aria-label="Type of work breakdown"
            >
                <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--rs-track)" strokeWidth={strokeW} />
                {arcs.map(arc => (
                    <circle
                        key={arc.name}
                        cx={cx}
                        cy={cy}
                        r={r}
                        fill="none"
                        stroke={arc.color}
                        strokeWidth={strokeW}
                        strokeDasharray={`${arc.dash} ${circumference - arc.dash}`}
                        strokeDashoffset={-arc.offset}
                        transform={`rotate(-90 ${cx} ${cy})`}
                    />
                ))}
                <text x={cx} y={cy - 1} textAnchor="middle" dominantBaseline="central" fontSize={14} fontWeight={700} fill="var(--rs-ink)" className="tabular-nums">
                    {count(total)}
                </text>
                <text x={cx} y={cy + 11} textAnchor="middle" dominantBaseline="central" fontSize={6.8} fill="var(--rs-muted)">
                    working
                </text>
            </svg>
            <ul className="w-full mt-[1.6mm] space-y-[0.55mm] text-[7.6pt]">
                {slices.map(slice => (
                    <li key={slice.name} className="flex items-center gap-[1.5mm]">
                        <span className="inline-block w-[2mm] h-[2mm] rounded-full shrink-0" style={{ background: slice.color }} />
                        <span className={`flex-1 truncate ${slice.name === 'Not said' ? 'text-(--rs-muted)' : 'text-(--rs-ink) font-medium'}`}>
                            {slice.name}
                        </span>
                        <span className="tabular-nums whitespace-nowrap">
                            <span className="font-semibold text-(--rs-ink)">{count(slice.count)}</span>
                            <span className="text-(--rs-muted)"> · {formatPercent(slice.count, total)}</span>
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

// ── Age Vertical SVG Histogram ─────────────────────────────────────

const AGE_SHORT_LABEL: Record<string, string> = {
    'Under 18': '<18',
    '18–24': '18–24',
    '25–34': '25–34',
    '35–44': '35–44',
    '45–54': '45–54',
    '55+': '55+',
};

function AgeHistogram({ ages, total }: { ages: Share[]; total: number }) {
    const map = new Map(ages.map(a => [a.name, a.count]));
    const unknown = map.get(NOT_KNOWN) ?? 0;
    const under18 = map.get('Under 18') ?? 0;
    const brackets = (under18 > 0 ? [...AGE_GROUPS] : AGE_GROUPS.slice(1)).map(name => ({
        name,
        short: AGE_SHORT_LABEL[name] ?? name,
        count: map.get(name) ?? 0,
    }));
    const knownTotal = brackets.reduce((sum, b) => sum + b.count, 0);

    if (knownTotal === 0) {
        return <p className="text-[7.8pt] text-(--rs-muted) my-auto text-center py-[4mm]">Date of birth not recorded.</p>;
    }

    const maxCount = Math.max(1, ...brackets.map(b => b.count));
    const W = 200;
    const H = 96;
    const topPad = 14;
    const labelH = 16;
    const plotH = H - topPad - labelH;
    const baseY = topPad + plotH;
    const colStep = W / brackets.length;
    const barW = Math.min(22, colStep * 0.62);

    return (
        <div className="flex flex-col flex-1 justify-between">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" role="img" aria-label="Age distribution of registrants">
                <line x1={0} x2={W} y1={baseY} y2={baseY} stroke="var(--rs-axis)" strokeWidth={1} />
                {brackets.map((b, i) => {
                    const cx = i * colStep + colStep / 2;
                    const x = cx - barW / 2;
                    const barH = b.count > 0 ? Math.max(3, (b.count / maxCount) * plotH) : 0;
                    const y = baseY - barH;
                    const isPeak = b.count === maxCount;
                    return (
                        <g key={b.name}>
                            {barH > 0 && (
                                <path
                                    d={columnPath(x, y, barW, barH)}
                                    fill={isPeak ? 'var(--rs-completed)' : 'var(--rs-age-soft)'}
                                />
                            )}
                            {b.count > 0 && (
                                <text
                                    x={cx}
                                    y={y - 3.5}
                                    textAnchor="middle"
                                    fontSize={8.5}
                                    fontWeight={isPeak ? 700 : 600}
                                    fill={isPeak ? 'var(--rs-brand-dark)' : 'var(--rs-ink-2)'}
                                    className="tabular-nums"
                                >
                                    {count(b.count)}
                                </text>
                            )}
                            <text
                                x={cx}
                                y={H - 3}
                                textAnchor="middle"
                                fontSize={8}
                                fontWeight={isPeak ? 600 : 400}
                                fill={isPeak ? 'var(--rs-ink)' : 'var(--rs-muted)'}
                            >
                                {b.short}
                            </text>
                        </g>
                    );
                })}
            </svg>
            {unknown > 0 && (
                <p className="mt-[1.2mm] text-[6.6pt] text-(--rs-muted) text-right tabular-nums">
                    DOB missing: {count(unknown)} ({formatPercent(unknown, total)})
                </p>
            )}
        </div>
    );
}

// ── Monthly columns ────────────────────────────────────────────────

const CHART_W = 680; // ≈ the sheet's 184 mm text width at 96 dpi
const CHART_H = 112;
const AXIS_W = 30;
const TOP_PAD = 14;
const LABEL_H = 16;

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Column with a 3-unit rounded top and a square foot on the baseline. */
function columnPath(x: number, y: number, w: number, h: number): string {
    const r = Math.min(3, w / 2, h);
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

function compactNum(n: number): string {
    if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
    return String(n);
}

function MonthChart({ months }: { months: ReportMonth[] }) {
    const top = Math.max(1, ...months.map(m => Math.max(m.registered, m.completed)));
    const step = niceStep(top);
    const yMax = Math.ceil(top / step) * step;
    const ticks = Array.from({ length: yMax / step + 1 }, (_, i) => i * step);

    const plotW = CHART_W - AXIS_W;
    const plotH = CHART_H - LABEL_H - TOP_PAD;
    const y0 = TOP_PAD + plotH;
    const band = plotW / months.length;
    const barGap = months.length <= 12 ? 3.5 : 2;
    const barW = Math.max(1.5, Math.min(17, (band * 0.74 - barGap) / 2));
    const groupW = barW * 2 + barGap;
    const yOf = (v: number) => y0 - (v / yMax) * plotH;

    const multiYear = months[0].month.slice(0, 4) !== months[months.length - 1].month.slice(0, 4);
    const labelEvery = Math.ceil(months.length / (multiYear ? 12 : 14));
    const labelAllBars = months.length <= 12;
    const peakRegMonth = months.reduce((a, b) => (b.registered > a.registered ? b : a)).month;
    const peakCompMonth = months.reduce((a, b) => (b.completed > a.completed ? b : a)).month;

    return (
        <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full h-auto block" role="img" aria-label="Registrations and completions by month">
            {ticks.map(t => (
                <g key={t}>
                    <line
                        x1={AXIS_W}
                        x2={CHART_W}
                        y1={yOf(t)}
                        y2={yOf(t)}
                        stroke="var(--rs-rule)"
                        strokeWidth={0.9}
                        strokeDasharray={t === 0 ? undefined : '2.5 3'}
                    />
                    <text x={AXIS_W - 6} y={yOf(t)} dy="0.32em" textAnchor="end" fontSize={8.8} fill="var(--rs-muted)" className="tabular-nums">
                        {t >= 1000 ? `${t / 1000}K` : t}
                    </text>
                </g>
            ))}
            {months.map((m, i) => {
                const x = AXIS_W + i * band + (band - groupW) / 2;
                const [y, mm] = m.month.split('-');
                const name = MONTH_SHORT[Number(mm) - 1];
                const regH = m.registered > 0 ? Math.max(1.5, y0 - yOf(m.registered)) : 0;
                const compH = m.completed > 0 ? Math.max(1.5, y0 - yOf(m.completed)) : 0;
                const regY = y0 - regH;
                const compY = y0 - compH;
                const showRegLabel = m.registered > 0 && (labelAllBars || m.month === peakRegMonth);
                const showCompLabel = m.completed > 0 && (labelAllBars || m.month === peakCompMonth);
                return (
                    <g key={m.month}>
                        {regH > 0 && (
                            <path d={columnPath(x, regY, barW, regH)} fill="var(--rs-registered)" />
                        )}
                        {compH > 0 && (
                            <path d={columnPath(x + barW + barGap, compY, barW, compH)} fill="var(--rs-completed)" />
                        )}
                        {showRegLabel && (
                            <text
                                x={x + barW / 2}
                                y={regY - 3}
                                textAnchor="middle"
                                fontSize={7.3}
                                fontWeight={600}
                                fill="var(--rs-registered)"
                                className="tabular-nums"
                            >
                                {compactNum(m.registered)}
                            </text>
                        )}
                        {showCompLabel && (
                            <text
                                x={x + barW + barGap + barW / 2}
                                y={compY - 3}
                                textAnchor="middle"
                                fontSize={7.3}
                                fontWeight={600}
                                fill="var(--rs-completed)"
                                className="tabular-nums"
                            >
                                {compactNum(m.completed)}
                            </text>
                        )}
                        {i % labelEvery === 0 && (
                            <text x={AXIS_W + i * band + band / 2} y={CHART_H - 3} textAnchor="middle" fontSize={8.8} fill="var(--rs-ink-2)">
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
