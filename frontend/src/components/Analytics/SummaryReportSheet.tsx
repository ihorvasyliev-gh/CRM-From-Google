import { formatLocalDate } from '../../lib/dateUtils';
import { foldCourses, formatPeriodLabel, niceStep, type ReportMonth, type ReportPeriod, type SummaryReport } from './summaryReport';

/**
 * The one-page report as a sheet of A4 paper (index.css, .report-sheet): white in either theme,
 * since it is printed or saved as a PDF. Sized to fit one page: the course table keeps
 * COURSE_ROWS rows (fewer under the monthly chart) and folds the rest into "Other courses".
 */

const COURSE_ROWS_WITH_CHART = 16;
const COURSE_ROWS = 26;

interface SummaryReportSheetProps {
    report: SummaryReport;
    period: ReportPeriod;
    /** Date shown as "Prepared …" */
    preparedOn?: Date;
}

export default function SummaryReportSheet({ report, period, preparedOn = new Date() }: SummaryReportSheetProps) {
    const isEmpty = report.registrations === 0 && report.completions === 0;
    const showChart = report.months.length >= 2 && !isEmpty;
    const rows = foldCourses(report.courses, showChart ? COURSE_ROWS_WITH_CHART : COURSE_ROWS);
    // One scale for both columns: a course's completions read against its registrations
    const scaleMax = Math.max(1, ...rows.map(r => Math.max(r.registered, r.completed)));

    return (
        <article className="report-sheet" aria-label="Courses report">
            <header className="flex items-start justify-between gap-6">
                <img src="/logos-banner.png" alt="Cork City Partnership · SICAP" className="h-[15mm] w-auto" />
                <p className="text-[8pt] text-(--rs-muted) text-right whitespace-nowrap pt-[1mm]">
                    Prepared {formatLocalDate(preparedOn, { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
            </header>

            <div className="mt-[7mm] pb-[4mm] border-b border-(--rs-rule)">
                <h1 className="text-[20pt] leading-tight font-semibold tracking-tight">Courses report</h1>
                <p className="mt-[1mm] text-[10.5pt] text-(--rs-ink-2)">
                    Registrations and course completions · <span className="font-semibold text-(--rs-ink)">{formatPeriodLabel(period)}</span>
                </p>
            </div>

            <section className="grid grid-cols-3 gap-[4mm] mt-[5mm]" aria-label="Key figures">
                <Figure
                    swatch="var(--rs-registered)"
                    label="People registered"
                    value={report.peopleRegistered}
                    hint={`${plural(report.registrations, 'course registration')}`}
                />
                <Figure
                    swatch="var(--rs-completed)"
                    label="People completed a course"
                    value={report.peopleCompleted}
                    hint={`${plural(report.completions, 'course completion')}`}
                />
                <Figure
                    label="Courses delivered"
                    value={report.coursesDelivered}
                    hint="with at least one graduate"
                />
            </section>

            {showChart && (
                <section className="mt-[6mm]" aria-label="By month">
                    <SectionTitle title="By month" legend />
                    <MonthChart months={report.months} />
                </section>
            )}

            <section className="mt-[6mm] min-h-0 flex-1" aria-label="Courses">
                <SectionTitle title="Courses by demand" legend={!showChart && !isEmpty} />
                {isEmpty ? (
                    <p className="py-[10mm] text-center text-(--rs-ink-2)">No registrations or completions in this period.</p>
                ) : (
                    <table className="w-full table-fixed border-collapse text-[8.5pt]">
                        <colgroup>
                            <col className="w-[44%]" />
                            <col className="w-[28%]" />
                            <col className="w-[28%]" />
                        </colgroup>
                        <thead>
                            <tr className="text-left text-[7.5pt] uppercase tracking-wider text-(--rs-muted) border-b border-(--rs-rule)">
                                <th className="font-semibold py-[1.2mm] pr-[3mm]">Course</th>
                                <th className="font-semibold py-[1.2mm] pr-[3mm]">Registered</th>
                                <th className="font-semibold py-[1.2mm]">Completed</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(row => (
                                <tr key={row.courseId} className="border-b border-(--rs-rule-soft)">
                                    <td className={`py-[1.15mm] pr-[3mm] truncate ${row.courseId === 'other' ? 'text-(--rs-ink-2) italic' : 'font-medium'}`} title={row.name}>
                                        {row.name}
                                    </td>
                                    <td className="py-[1.15mm] pr-[3mm]">
                                        <BarCell value={row.registered} max={scaleMax} color="var(--rs-registered)" />
                                    </td>
                                    <td className="py-[1.15mm]">
                                        <BarCell value={row.completed} max={scaleMax} color="var(--rs-completed)" />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr className="font-semibold">
                                <td className="pt-[1.6mm] pr-[3mm]">Total</td>
                                <td className="pt-[1.6mm] pr-[3mm] tabular-nums">{formatCount(report.registrations)}</td>
                                <td className="pt-[1.6mm] tabular-nums">{formatCount(report.completions)}</td>
                            </tr>
                        </tfoot>
                    </table>
                )}
            </section>

            <footer className="mt-[4mm] pt-[2.5mm] border-t border-(--rs-rule) flex items-end justify-between gap-6 text-[7pt] leading-snug text-(--rs-muted)">
                <p className="max-w-[135mm]">
                    Registrations are counted by the date a person registered, completions by the date of the course.
                    Each person counts once per course, and all language groups of a course count as one course.
                </p>
                <p className="whitespace-nowrap">Cork City Partnership · SICAP</p>
            </footer>
        </article>
    );
}

const formatCount = (n: number) => n.toLocaleString('en-IE');

function plural(n: number, word: string): string {
    return `${formatCount(n)} ${word}${n === 1 ? '' : 's'}`;
}

function Figure({ label, value, hint, swatch }: { label: string; value: number; hint: string; swatch?: string }) {
    return (
        <div className="rounded-[2.5mm] bg-(--rs-panel) px-[4mm] py-[3.2mm]">
            <p className="flex items-center gap-[1.6mm] text-[8.5pt] font-medium text-(--rs-ink-2)">
                {swatch && <span className="inline-block w-[2.4mm] h-[2.4mm] rounded-full shrink-0" style={{ background: swatch }} />}
                {label}
            </p>
            <p className="mt-[1mm] text-[26pt] leading-none font-semibold tracking-tight">{formatCount(value)}</p>
            <p className="mt-[1.6mm] text-[7.5pt] text-(--rs-muted)">{hint}</p>
        </div>
    );
}

function SectionTitle({ title, legend }: { title: string; legend?: boolean }) {
    return (
        <div className="flex items-baseline justify-between gap-4 mb-[2mm]">
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
            <span className="w-[10mm] text-right tabular-nums">{formatCount(value)}</span>
        </div>
    );
}

// ── Monthly columns ────────────────────────────────────────────────

const CHART_W = 680; // ≈ the sheet's 180 mm text width at 96 dpi, so 1 unit ≈ 1 px
const CHART_H = 150;
const AXIS_W = 30;
const LABEL_H = 16;

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

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
    const barW = Math.max(2, Math.min(14, (band * 0.72 - 2) / 2));
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
                        <title>{`${MONTH_LONG[Number(mm) - 1]} ${y}: ${m.registered} registered, ${m.completed} completed`}</title>
                        <rect x={AXIS_W + i * band} y={6} width={band} height={plotH} fill="transparent" />
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
