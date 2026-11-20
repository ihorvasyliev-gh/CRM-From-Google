import type { EnrollmentWithRelations } from '../../lib/documentUtils';
import { hasOutcomeAnswer } from '../../lib/employmentTypes';
import { cleanVariant, type EmploymentStatusRow, type EnrollmentStatus } from '../../lib/types';
import { daysBetween } from '../../lib/dateUtils';
import { normalizeCorkAddress } from './analyticsUtils';
import { isReportable } from './courseRuns';
import {
    buildSummaryReport, completionDay, registrationDay, toDayKey,
    type ReportPeriod, type SummaryReport,
} from './summaryReport';

/**
 * Everything the Analytics page and the PDF report show for a period, worked out once so the
 * two always agree. The period figures follow the report's rules (summaryReport.ts): a
 * registration is dated by the day the student registered, a completion by the day the course
 * was completed, and a person counts once per course. "Now" figures (the queue) are today's
 * statuses and do not depend on the period.
 */

export interface Share {
    name: string;
    count: number;
}

export interface QueueCourse {
    courseId: string;
    name: string;
    waiting: number;
    invited: number;
    confirmed: number;
}

export interface PeriodTotals {
    period: ReportPeriod;
    peopleRegistered: number;
    registrations: number;
    peopleCompleted: number;
    completions: number;
}

export interface Insights {
    period: ReportPeriod;
    summary: SummaryReport;
    /** The period before, to compare with; null when it holds nothing (or was not asked for) */
    previous: PeriodTotals | null;
    /** What became of the period's registrations (one per person per course), as of today */
    fates: { total: number; completed: number; confirmed: number; invited: number; waiting: number; left: number };
    /** Enrollments by today's status, whatever the period */
    queue: { waiting: number; invited: number; confirmed: number; courses: QueueCourse[] };
    /** The employment survey among people who completed a course in the period */
    outcomes: {
        graduates: number;
        /** Sent the survey (answered or not) */
        asked: number;
        responded: number;
        working: number;
        notWorking: number;
        fullTime: number;
        partTime: number;
        selfEmployed: number;
        ceTus: number;
        /** Fields of work of those working, most common first */
        fields: Share[];
    };
    /** The people who registered in the period */
    people: { total: number; languages: Share[]; areas: Share[]; ages: Share[] };
    /** People who completed two or more different courses in the period */
    multiCourse: number;
}

const dayDate = (key: string) => new Date(`${key}T12:00:00`);

/**
 * The period to compare with: the same number of whole months before a period of whole months
 * (October → September, 2025 → 2024), the same dates a year earlier for a year to date, and
 * otherwise the same number of days just before.
 */
export function previousPeriod(period: ReportPeriod): ReportPeriod {
    const s = dayDate(period.start);
    const e = dayDate(period.end);
    const day = (y: number, m: number, d: number) => toDayKey(new Date(y, m, d));
    const startsMonth = s.getDate() === 1;
    const endsMonth = new Date(e.getFullYear(), e.getMonth() + 1, 0).getDate() === e.getDate();
    if (startsMonth && endsMonth) {
        const months = (e.getFullYear() - s.getFullYear()) * 12 + e.getMonth() - s.getMonth() + 1;
        return { start: day(s.getFullYear(), s.getMonth() - months, 1), end: day(s.getFullYear(), s.getMonth(), 0) };
    }
    if (startsMonth && s.getMonth() === 0 && s.getFullYear() === e.getFullYear()) {
        return { start: day(s.getFullYear() - 1, 0, 1), end: day(e.getFullYear() - 1, e.getMonth(), e.getDate()) };
    }
    const days = daysBetween(period.start, period.end) + 1;
    return {
        start: day(s.getFullYear(), s.getMonth(), s.getDate() - days),
        end: day(s.getFullYear(), s.getMonth(), s.getDate() - 1),
    };
}

export const inPeriod = (day: string | null, period: ReportPeriod): day is string =>
    !!day && day >= period.start && day <= period.end;

/** Registered within the period. */
export const registeredIn = (e: EnrollmentWithRelations, period: ReportPeriod) => inPeriod(registrationDay(e), period);
/** Completed the course within the period. */
export const completedIn = (e: EnrollmentWithRelations, period: ReportPeriod) => inPeriod(completionDay(e), period);

const personOf = (e: EnrollmentWithRelations) => e.student_id || e.students?.id || e.id;
const courseOf = (e: EnrollmentWithRelations) => e.course_id || e.courses?.id || '';

/** How far an enrollment got; of a person's languages of one course, the furthest counts. */
const FATE_RANK: Record<EnrollmentStatus, number> = { withdrawn: 0, rejected: 0, requested: 1, invited: 2, confirmed: 3, completed: 4 };

const AREA_NAMES: Record<string, string> = {
    'Cork City (North)': 'Cork City North',
    'Cork City (South)': 'Cork City South',
    'Cork City (Centre)': 'Cork City Centre',
    'North Cork': 'County Cork',
    'East Cork': 'County Cork',
    'West Cork': 'County Cork',
    'Other Cork Area': 'Cork, area unclear',
    'Other / Unknown': 'Not known',
};

export const AGE_GROUPS = ['Under 18', '18–24', '25–34', '35–44', '45–54', '55+'] as const;
export const NOT_KNOWN = 'Not known';

/** Age in whole years on `today`; null for a missing or impossible date of birth. */
export function ageOn(dob: string | null | undefined, today: Date): number | null {
    if (!dob) return null;
    const born = dayDate(dob.slice(0, 10));
    if (isNaN(born.getTime())) return null;
    let age = today.getFullYear() - born.getFullYear();
    if (today.getMonth() < born.getMonth() || (today.getMonth() === born.getMonth() && today.getDate() < born.getDate())) age--;
    return age >= 0 && age < 120 ? age : null;
}

export function ageGroup(age: number | null): string {
    if (age === null) return NOT_KNOWN;
    if (age < 18) return 'Under 18';
    if (age < 25) return '18–24';
    if (age < 35) return '25–34';
    if (age < 45) return '35–44';
    if (age < 55) return '45–54';
    return '55+';
}

function tally(names: Iterable<string>): Map<string, number> {
    const counts = new Map<string, number>();
    for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
    return counts;
}

/** Most common first; "Other" and "Not known" always last. */
function ranked(counts: Map<string, number>): Share[] {
    const tailRank = (name: string) => (name === NOT_KNOWN ? 2 : name === 'Other' ? 1 : 0);
    return [...counts]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => tailRank(a.name) - tailRank(b.name) || b.count - a.count || a.name.localeCompare(b.name));
}

const capitalised = (text: string) => text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();

const FIELD_PATTERNS: [RegExp, string][] = [
    [/^(other|anything|any|any\s*job|agency|recruitment(?:\s*agency)?|temp(?:\s*agency)?|general(?:\s*operative)?|n\/?a|none|no|yes|not\s*sure|unknown|various|different|-|\.+)$/i, 'Other'],
    [/\b(construct\w*|build(?:er|ing)\w*|labour\w*|labor\w*|carpentr?\w*|plumb\w*|electric\w*|scaffold\w*|groundwork\w*|bricklay\w*|tiler|tiling|roof\w*)\b/i, 'Construction'],
    [/\b(hospitality|hotel\w*|restaurant\w*|cafe|café|barista|kitchen|chef|cook\w*|catering|waiter|waitress|bartend\w*|food\s*service|deli|bakery)\b/i, 'Hospitality'],
    [/\b(health\s*care|healthcare|carer|care\s*assistant|care\s*worker|home\s*care|elder\s*care|nursing|nurse|hospital|medical|pharmacy|dental|sna|special\s*needs|child\s*care|childcare|creche|crèche|early\s*years)\b/i, 'Healthcare & care'],
    [/\b(warehous\w*|logistic\w*|forklift|packing|packer|picker|order\s*pick\w*|dispatch|shipping|supply\s*chain|amazon|recycling|forge\s*hill|waste)\b/i, 'Warehouse & logistics'],
    [/\b(manufactur\w*|factory|production|assembly|operator|industrial|pharma\w*|medtech|engineering|welder|welding|cnc|machin\w*)\b/i, 'Manufacturing'],
    [/\b(clean(?:er|ing)|housekeep\w*|janitor\w*|hygiene|sanitation)\b/i, 'Cleaning'],
    [/\b(retail\w*|shop\b|store\b|supermarket|cashier|sales\s*assistant|customer\s*assistant|grocery|merchandis\w*)\b/i, 'Retail'],
    [/\b(security|guard\w*|door\s*supervisor)\b/i, 'Security'],
    [/\b(transport\w*|driver|driving|delivery|courier|taxi|bus\b|truck|hgv|haulage)\b/i, 'Transport & delivery'],
    [/\b(beauty|beautician|hair\w*|barber\w*|nail\w*|salon|spa\b|cosmet\w*|therap(?:ist|y))\b/i, 'Beauty & personal care'],
    [/\b(office|admin\w*|reception\w*|clerical|secretary|customer\s*service|call\s*cent(?:re|er)|finance|account\w*|hr\b|it\b|software|tech\b)\b/i, 'Office & admin'],
    [/\b(educat\w*|school|teach\w*|tutor\w*|training)\b/i, 'Education'],
];

/** Maps free-text survey answers ("Forge hill recycling", "Amazon", "Anything") to clean sectors. */
export function normalizeFieldOfWork(raw: string | null | undefined): string {
    const cleaned = raw?.trim().replace(/\s+/g, ' ') || '';
    if (!cleaned) return 'Other';
    for (const [pattern, sector] of FIELD_PATTERNS) {
        if (pattern.test(cleaned)) return sector;
    }
    return capitalised(cleaned);
}

export interface InsightOptions {
    /** Compare with the period before (off for "All time") */
    compare?: boolean;
    today?: Date;
}

export function buildInsights(
    allEnrollments: EnrollmentWithRelations[],
    employmentStatuses: EmploymentStatusRow[],
    period: ReportPeriod,
    { compare = true, today = new Date() }: InsightOptions = {},
): Insights {
    const enrollments = allEnrollments.filter(e => isReportable(e) && courseOf(e));
    const summary = buildSummaryReport(enrollments, period);

    let previous: PeriodTotals | null = null;
    if (compare) {
        const before = previousPeriod(period);
        const s = buildSummaryReport(enrollments, before);
        if (s.registrations > 0 || s.completions > 0) {
            previous = {
                period: before,
                peopleRegistered: s.peopleRegistered,
                registrations: s.registrations,
                peopleCompleted: s.peopleCompleted,
                completions: s.completions,
            };
        }
    }

    // What became of the period's registrations, and today's queue (one per person per course)
    const furthest = new Map<string, number>();
    const furthestAll = new Map<string, { courseId: string; courseName: string; rank: number }>();
    const registrants = new Map<string, EnrollmentWithRelations>();
    const languagePeople = new Map<string, Set<string>>();
    const graduateCourses = new Map<string, Set<string>>();
    const queueByCourse = new Map<string, QueueCourse>();
    const queue = { waiting: 0, invited: 0, confirmed: 0 };

    for (const e of enrollments) {
        const person = personOf(e);
        const courseId = courseOf(e);
        const pair = `${person}|${courseId}`;
        const rank = FATE_RANK[e.status] ?? 0;

        const prevAll = furthestAll.get(pair);
        if (!prevAll || rank > prevAll.rank) {
            furthestAll.set(pair, {
                courseId,
                courseName: e.courses?.name?.trim() || prevAll?.courseName || 'Unnamed course',
                rank,
            });
        }

        if (registeredIn(e, period)) {
            furthest.set(pair, Math.max(furthest.get(pair) ?? 0, rank));
            if (!registrants.has(person)) registrants.set(person, e);
            const language = cleanVariant(e.courses?.name || '', e.course_variant);
            let people = languagePeople.get(language);
            if (!people) languagePeople.set(language, (people = new Set()));
            people.add(person);
        }

        if (completedIn(e, period)) {
            let courses = graduateCourses.get(person);
            if (!courses) graduateCourses.set(person, (courses = new Set()));
            courses.add(courseId);
        }
    }

    for (const { courseId, courseName, rank } of furthestAll.values()) {
        if (rank !== 1 && rank !== 2 && rank !== 3) continue;
        let row = queueByCourse.get(courseId);
        if (!row) {
            row = { courseId, name: courseName, waiting: 0, invited: 0, confirmed: 0 };
            queueByCourse.set(courseId, row);
        }
        const key = rank === 1 ? 'waiting' : rank === 2 ? 'invited' : 'confirmed';
        row[key]++;
        queue[key]++;
    }

    const fates = { total: furthest.size, completed: 0, confirmed: 0, invited: 0, waiting: 0, left: 0 };
    const FATE_KEYS = ['left', 'waiting', 'invited', 'confirmed', 'completed'] as const;
    for (const rank of furthest.values()) fates[FATE_KEYS[rank]]++;

    // The employment survey among the period's graduates
    const statusByStudent = new Map<string, EmploymentStatusRow>();
    for (const es of employmentStatuses) {
        if (!statusByStudent.has(es.student_id)) statusByStudent.set(es.student_id, es);
    }
    const outcomes = {
        graduates: graduateCourses.size,
        asked: 0,
        responded: 0,
        working: 0,
        notWorking: 0,
        fullTime: 0,
        partTime: 0,
        selfEmployed: 0,
        ceTus: 0,
    };
    const fields: string[] = [];
    for (const person of graduateCourses.keys()) {
        const row = statusByStudent.get(person);
        if (!row || (row.status !== 'pending' && row.status !== 'responded')) continue;
        outcomes.asked++;
        if (!hasOutcomeAnswer({ tracking_status: row.status, is_working: row.is_working })) continue;
        outcomes.responded++;
        if (row.is_working) {
            outcomes.working++;
            if (row.employment_type === 'full_time') outcomes.fullTime++;
            else if (row.employment_type === 'part_time') outcomes.partTime++;
            else if (row.employment_type === 'self_employed') outcomes.selfEmployed++;
            else if (row.employment_type === 'ce_tus') outcomes.ceTus++;
            fields.push(normalizeFieldOfWork(row.field_of_work));
        } else {
            outcomes.notWorking++;
        }
    }

    // Who registered
    const areas: string[] = [];
    const ages: string[] = [];
    for (const e of registrants.values()) {
        const region = normalizeCorkAddress(e.students?.address || null, e.students?.eircode || null).macroRegion;
        areas.push(AREA_NAMES[region] ?? region);
        ages.push(ageGroup(ageOn(e.students?.dob, today)));
    }
    const ageCounts = tally(ages);
    const ageShares = [...AGE_GROUPS, NOT_KNOWN]
        .map(name => ({ name, count: ageCounts.get(name) ?? 0 }))
        .filter(share => share.count > 0);

    return {
        period,
        summary,
        previous,
        fates,
        queue: {
            ...queue,
            courses: [...queueByCourse.values()].sort((a, b) => b.waiting - a.waiting || b.invited + b.confirmed - (a.invited + a.confirmed) || a.name.localeCompare(b.name)),
        },
        outcomes: { ...outcomes, fields: ranked(tally(fields)) },
        people: {
            total: registrants.size,
            languages: ranked(new Map([...languagePeople].map(([name, people]) => [name, people.size]))),
            areas: ranked(tally(areas)),
            ages: ageShares,
        },
        multiCourse: [...graduateCourses.values()].filter(courses => courses.size > 1).length,
    };
}

/** The first and last day anything was registered or completed; null with no data. */
export function dataSpan(enrollments: EnrollmentWithRelations[], today: Date = new Date()): ReportPeriod | null {
    let start: string | null = null;
    for (const e of enrollments) {
        if (!isReportable(e)) continue;
        for (const day of [registrationDay(e), completionDay(e)]) {
            if (day && (!start || day < start)) start = day;
        }
    }
    const end = toDayKey(today);
    return start ? { start: start > end ? end : start, end } : null;
}
