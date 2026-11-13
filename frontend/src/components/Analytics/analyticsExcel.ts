import type { EnrollmentWithRelations } from '../../lib/documentUtils';
import { cleanVariant, fullName, type EmploymentStatusRow } from '../../lib/types';
import { formatDateDMY } from '../../lib/dateUtils';
import { darkHeader, downloadXlsx, valueCells, type Row, type XlsxSheet } from '../../lib/excelExport';
import { normalizeCorkAddress } from './analyticsUtils';
import { completedIn, registeredIn, type Insights } from './insights';
import { percent, type Narrative } from './narrative';
import { completionDay, formatPeriodLabel, registrationDay } from './summaryReport';

/**
 * The Analytics page as a workbook: the figures and their summary in words, then the people
 * behind them (who registered, who completed and what they answered in the outcome survey).
 */
export async function exportAnalyticsExcel({ insights, narrative, enrollments, employmentStatuses, courseName }: {
    insights: Insights;
    narrative: Narrative;
    /** Counted enrollments registered or completed in the period */
    enrollments: EnrollmentWithRelations[];
    employmentStatuses: EmploymentStatusRow[];
    courseName: string | null;
}): Promise<void> {
    const { summary, period, queue, outcomes, fates, people } = insights;

    const heading = (title: string): Row => [
        { value: title, fontWeight: 'bold', fontSize: 12, textColor: '#FFFFFF', backgroundColor: '#1E293B', height: 22, columnSpan: 3 },
        null, null,
    ];
    const figure = (label: string, value: string | number, note = ''): Row => valueCells([label, value, note]);
    const text = (sentences: string[]): Row[] => sentences.map(s => [{ value: s, wrap: true, columnSpan: 3 }, null, null]);
    const shares = (items: { name: string; count: number }[], total: number): Row[] =>
        items.map(i => figure(i.name, i.count, `${percent(i.count, total)}%`));

    const summaryRows: Row[] = [
        [{ value: 'Courses report', fontWeight: 'bold', fontSize: 16 }],
        [{ value: `${courseName ?? 'All courses'} · ${formatPeriodLabel(period)} · prepared ${formatDateDMY(new Date().toISOString())}`, textColor: '#64748B' }],
        [],
        heading('Summary'),
        ...text([...narrative.summary, ...narrative.courses]),
        [],
        heading('Key figures'),
        figure('People registered', summary.peopleRegistered, `${summary.registrations} course registrations`),
        figure('People completed a course', summary.peopleCompleted, `${summary.completions} completions`),
        figure('Course runs with graduates', summary.courseRuns, `across ${summary.coursesDelivered} courses`),
        [],
        heading('Where registrations stand'),
        ...text(narrative.pipeline),
        figure('Period registrations: completed', fates.completed, `${percent(fates.completed, fates.total)}%`),
        figure('Period registrations: confirmed', fates.confirmed, `${percent(fates.confirmed, fates.total)}%`),
        figure('Period registrations: invited', fates.invited, `${percent(fates.invited, fates.total)}%`),
        figure('Period registrations: waiting', fates.waiting, `${percent(fates.waiting, fates.total)}%`),
        figure('Period registrations: withdrew / not accepted', fates.left, `${percent(fates.left, fates.total)}%`),
        figure('Waiting for an invitation today', queue.waiting),
        figure('Invited today', queue.invited),
        figure('Confirmed today', queue.confirmed),
        [],
        heading('Employment after the course'),
        ...text(narrative.outcomes),
        figure('Completed a course in the period (people)', outcomes.graduates),
        figure('Sent the survey', outcomes.asked, `${percent(outcomes.asked, outcomes.graduates)}%`),
        figure('Answered', outcomes.responded, `${percent(outcomes.responded, outcomes.asked)}% of those asked`),
        figure('Working', outcomes.working, `${percent(outcomes.working, outcomes.responded)}% of answers`),
        figure('Full-time', outcomes.fullTime),
        figure('Part-time', outcomes.partTime),
        ...shares(outcomes.fields.map(f => ({ ...f, name: `Field: ${f.name}` })), outcomes.working),
        [],
        heading('Who registered'),
        ...text(narrative.people),
        ...shares(people.languages.map(s => ({ ...s, name: `Language: ${s.name}` })), people.total),
        ...shares(people.areas.map(s => ({ ...s, name: `Area: ${s.name}` })), people.total),
        ...shares(people.ages.map(s => ({ ...s, name: `Age: ${s.name}` })), people.total),
    ];

    const waitingBy = new Map(queue.courses.map(c => [c.courseId, c.waiting]));
    const table = (name: string, columns: [header: string, width: number][], rows: Row[]): XlsxSheet => ({
        name,
        rows: [darkHeader(columns.map(([header]) => header)), ...rows],
        widths: columns.map(([, width]) => width),
        stickyRows: 1,
        filterRow: 0,
    });

    const statusByStudent = new Map<string, EmploymentStatusRow>();
    for (const es of employmentStatuses) {
        if (!statusByStudent.has(es.student_id)) statusByStudent.set(es.student_id, es);
    }
    const person = (e: EnrollmentWithRelations) => {
        const s = e.students;
        const place = normalizeCorkAddress(s?.address || null, s?.eircode || null);
        return [fullName(s), s?.email || '', s?.phone || '', place.microDistrict, e.courses?.name || '', cleanVariant(e.courses?.name || '', e.course_variant)];
    };
    const PERSON_COLUMNS: [string, number][] = [['Name', 26], ['Email', 30], ['Phone', 16], ['Area', 22], ['Course', 30], ['Language', 14]];

    const registeredRows = enrollments
        .filter(e => registeredIn(e, period))
        .map(e => valueCells([...person(e), formatDateDMY(registrationDay(e)), e.status]));
    const completedRows = enrollments
        .filter(e => completedIn(e, period))
        .map(e => {
            const es = statusByStudent.get(e.student_id);
            const answered = es?.status === 'responded';
            return valueCells([
                ...person(e),
                formatDateDMY(completionDay(e)),
                answered ? 'Answered' : es?.status === 'pending' ? 'Sent, no answer' : 'Not sent',
                answered ? (es.is_working ? 'Yes' : 'No') : '',
                answered && es.is_working ? (es.employment_type === 'full_time' ? 'Full-time' : es.employment_type === 'part_time' ? 'Part-time' : '') : '',
                answered && es.is_working ? es.field_of_work || '' : '',
                answered && es.is_working ? es.started_month || '' : '',
            ]);
        });

    await downloadXlsx([
        { name: 'Summary', rows: summaryRows, widths: [46, 16, 60] },
        table('Courses', [['Course', 36], ['Registered', 14], ['Completed', 14], ['Course runs', 14], ['Waiting now', 14]],
            summary.courses.map(c => valueCells([c.name, c.registered, c.completed, c.runs, waitingBy.get(c.courseId) ?? 0]))),
        table('By month', [['Month', 14], ['Registered', 14], ['Completed', 14]],
            summary.months.map(m => valueCells([m.month, m.registered, m.completed]))),
        table('Registered', [...PERSON_COLUMNS, ['Registered on', 16], ['Status today', 14]], registeredRows),
        table('Completed', [...PERSON_COLUMNS, ['Completed on', 16], ['Survey', 16], ['Working', 10], ['Hours', 12], ['Field of work', 24], ['Started work', 14]], completedRows),
    ], `Courses report ${period.start} to ${period.end}.xlsx`);
}
