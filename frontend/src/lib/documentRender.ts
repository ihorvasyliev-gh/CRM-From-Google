// Pure .docx rendering: no Supabase, no DOM. Runs inside documentWorker.ts, or on the main
// thread when a worker is not available (tests, very old browsers).
// pizzip / docxtemplater are imported dynamically so they stay out of the main bundle.
import type { Student, Course, Enrollment } from './types';
import { cleanVariant, fullName } from './types';
import { formatDateLong, formatDateDMY, todayISO } from './dateUtils';
import { loadChunk } from './deployRecovery';
import { courseDateKey, sessionDays, type CourseSession } from './courseSessions';

/** Enrollment with joined student and course data (from Supabase select with joins). */
export interface EnrollmentWithRelations extends Enrollment {
    students: Student | null;
    courses: Course | null;
}

export const MAX_TEMPLATE_BYTES = 5 * 1024 * 1024;
/** Numbered slots ({firstName1} … {firstName34}) on one attendance sheet / label page. */
export const ATTENDANCE_SLOTS = 34;
export const LABEL_SLOTS = 28;
/** Participant rows on one page of the SICAP course form (page 2 of the form). */
export const SICAP_SLOTS = 9;
/** In the SICAP form, {#participantPages}…{/participantPages} repeats the participant page for every 9 people. */
export const SICAP_PAGE_LOOP = 'participantPages';
/** Archive folder of the combined per-student files ("Also one combined file per student"). */
export const COMBINED_FOLDER = 'Combined';
/** A table row wrapped in {#students}…{/students} repeats for every participant instead. */
export const SHEET_LOOP = 'students';

// ─── Placeholder catalogue ──────────────────────────────────

export interface PlaceholderCategory { title: string; items: { key: string; desc: string }[] }

export const PLACEHOLDER_CATEGORIES: PlaceholderCategory[] = [
    {
        title: 'Student Information',
        items: [
            { key: 'userId', desc: 'User ID' },
            { key: 'firstName', desc: 'First Name' },
            { key: 'lastName', desc: 'Last Name' },
            { key: 'fullName', desc: 'Full Name' },
            { key: 'email', desc: 'Email' },
            { key: 'phone', desc: 'Phone Number' },
            { key: 'mobileNumber', desc: 'Phone Number (same as {phone})' },
            { key: 'address', desc: 'Address' },
            { key: 'eircode', desc: 'Eircode' },
            { key: 'dateOfBirth', desc: 'Date of Birth (formatted)' },
        ],
    },
    {
        title: 'Course Information',
        items: [
            { key: 'courseId', desc: 'Course ID' },
            { key: 'courseTitle', desc: 'Course Title' },
            { key: 'courseVariant', desc: 'Course Variant (language)' },
            { key: 'courseNameDate', desc: 'Course name and last day, e.g. Manual Handling 12/11/2026' },
            { key: 'startDate', desc: 'First day of the course (DD/MM/YYYY)' },
            { key: 'endDate', desc: 'Last day of the course (DD/MM/YYYY)' },
            { key: 'venue', desc: 'Where the course takes place (course date place)' },
            { key: 'staffName', desc: 'Your name (signed-in staff member, set in Settings)' },
        ],
    },
    {
        title: 'Registration Information',
        items: [
            { key: 'registeredAt', desc: 'Registration Date (DD/MM/YYYY)' },
            { key: 'courseRegistrationDate', desc: 'Registration Date (formatted)' },
            { key: 'isCompleted', desc: 'Completion Status (Yes/No)' },
            { key: 'completedAt', desc: 'Completion Date (formatted)' },
        ],
    },
    {
        title: 'Enrollment & Dates',
        items: [
            { key: 'isInvited', desc: 'Invitation Status (Yes/No)' },
            { key: 'invitedAt', desc: 'Invitation Date (formatted)' },
            { key: 'confirmedDate', desc: 'Confirmed Date (formatted)' },
            { key: 'courseDate', desc: 'Course Date (formatted)' },
            { key: 'enrollmentStatus', desc: 'Current Status' },
            { key: 'enrollmentNotes', desc: 'Admin Notes' },
            { key: 'today', desc: 'Generation date (formatted)' },
        ],
    },
];

export const PLACEHOLDER_KEYS = new Set(PLACEHOLDER_CATEGORIES.flatMap(c => c.items.map(i => i.key)));

/** Per-participant fields of an attendance sheet / label page: {fullName3} or {fullName} inside {#students}. */
const SHEET_ROW_FIELDS = [
    { key: 'firstName', desc: 'First Name' },
    { key: 'lastName', desc: 'Last Name' },
    { key: 'fullName', desc: 'Full Name' },
    { key: 'phone', desc: 'Phone Number' },
    { key: 'mobileNumber', desc: 'Phone Number (same as phone)' },
    { key: 'email', desc: 'Email' },
    { key: 'address', desc: 'Address' },
    { key: 'eircode', desc: 'Eircode' },
    { key: 'dateOfBirth', desc: 'Date of Birth' },
    { key: 'courseVariant', desc: 'Course Variant (language)' },
] as const;
type SheetRowField = typeof SHEET_ROW_FIELDS[number]['key'];

export const SHEET_PLACEHOLDER_CATEGORIES: PlaceholderCategory[] = [
    {
        title: 'Whole sheet',
        items: [
            { key: 'courseTitle', desc: 'Course Title' },
            { key: 'courseVariant', desc: 'Course Variant(s)' },
            { key: 'courseDate', desc: 'Course Date(s)' },
            { key: 'courseNameDate', desc: 'Course name and last day' },
            { key: 'startDate', desc: 'First day (DD/MM/YYYY)' },
            { key: 'endDate', desc: 'Last day (DD/MM/YYYY)' },
            { key: 'venue', desc: 'Where the course takes place' },
            { key: 'staffName', desc: 'Your name (signed-in staff member)' },
            { key: 'participantCount', desc: 'Number of participants' },
            { key: 'page', desc: 'Page number' },
            { key: 'pages', desc: 'Number of pages' },
            { key: 'today', desc: 'Generation date' },
        ],
    },
    {
        title: 'Numbered slots (1, 2, 3 …)',
        items: SHEET_ROW_FIELDS.map(f => ({ key: `${f.key}1`, desc: `${f.desc} of participant 1` })),
    },
    {
        title: `Inside {#${SHEET_LOOP}}…{/${SHEET_LOOP}}`,
        items: [{ key: 'n', desc: 'Row number' }, ...SHEET_ROW_FIELDS],
    },
];

export const SICAP_PLACEHOLDER_CATEGORIES: PlaceholderCategory[] = [
    {
        title: 'Course (page 1)',
        items: [
            { key: 'courseNameDate', desc: 'Course name and last day, e.g. Manual Handling 12/11/2026' },
            { key: 'startDate', desc: 'First day (DD/MM/YYYY)' },
            { key: 'endDate', desc: 'Last day (DD/MM/YYYY; the first day for a one-day course)' },
            { key: 'venue', desc: 'Place of the course date' },
            { key: 'staffName', desc: 'Your name (Settings → Your name)' },
            { key: 'courseTitle', desc: 'Course Title' },
            { key: 'participantCount', desc: 'Number of participants' },
            { key: 'today', desc: 'Generation date' },
        ],
    },
    {
        title: `Inside {#${SICAP_PAGE_LOOP}}…{/${SICAP_PAGE_LOOP}}`,
        items: [
            ...SHEET_ROW_FIELDS.filter(f => ['fullName', 'firstName', 'lastName', 'dateOfBirth'].includes(f.key))
                .map(f => ({ key: `${f.key}1`, desc: `${f.desc}, row 1 of ${SICAP_SLOTS}` })),
            { key: 'page', desc: 'Participant page number' },
            { key: 'pages', desc: 'Number of participant pages' },
        ],
    },
];

const RESERVED_VARIABLE_KEYS = new Set([SHEET_LOOP, SICAP_PAGE_LOOP, '__people', '__last']);

/** Custom variable names must work as a docxtemplater tag: `{Tutor}`, `{venue_name}`. */
export function validateVariableKey(key: string): string | null {
    if (!key) return 'Variable name is required';
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(key)) return 'Use letters, digits and _ only, starting with a letter (e.g. Tutor, venue_name)';
    if (RESERVED_VARIABLE_KEYS.has(key)) return `{${key}} is reserved for document loops — choose another name`;
    return null;
}

// ─── Date variables ─────────────────────────────────────────
// A custom variable can be a date worked out per participant, e.g. {expire} = course date + 2 years.

export type DateBase = 'courseDate' | 'completedAt' | 'today';
export type DateUnit = 'days' | 'months' | 'years';
export type DateFormat = 'long' | 'dmy';

export interface DateRule {
    base: DateBase;
    /** Whole number; negative counts back. */
    amount: number;
    unit: DateUnit;
    format: DateFormat;
}

export interface DateVariable {
    key: string;
    rule: DateRule;
}

export const DATE_BASES: { value: DateBase; label: string }[] = [
    { value: 'courseDate', label: 'Course date' },
    { value: 'completedAt', label: 'Completion date' },
    { value: 'today', label: 'Generation date' },
];
export const DATE_UNITS: { value: DateUnit; label: string }[] = [
    { value: 'years', label: 'years' },
    { value: 'months', label: 'months' },
    { value: 'days', label: 'days' },
];
export const DATE_FORMATS: { value: DateFormat; label: string }[] = [
    { value: 'long', label: '01 Oct 2028' },
    { value: 'dmy', label: '01/10/2028' },
];

/** A stored rule, or null when it is missing or malformed (the variable then prints blank). */
export function parseDateRule(value: unknown): DateRule | null {
    const r = value as Partial<DateRule> | null;
    if (!r || typeof r !== 'object') return null;
    if (!DATE_BASES.some(b => b.value === r.base) || !DATE_UNITS.some(u => u.value === r.unit)) return null;
    if (typeof r.amount !== 'number' || !Number.isInteger(r.amount)) return null;
    return { base: r.base!, amount: r.amount, unit: r.unit!, format: r.format === 'dmy' ? 'dmy' : 'long' };
}

/**
 * Add days, months or years to a YYYY-MM-DD date. Months and years keep the day of the month,
 * or use the month's last day when it has fewer days (29 Feb 2028 + 1 year = 28 Feb 2029).
 */
export function addToDate(iso: string, amount: number, unit: DateUnit): string {
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    let date: Date;
    if (unit === 'days') {
        date = new Date(Date.UTC(y, m - 1, d + amount));
    } else {
        const months = (m - 1) + amount * (unit === 'years' ? 12 : 1);
        const year = y + Math.floor(months / 12);
        const month = ((months % 12) + 12) % 12;
        const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
        date = new Date(Date.UTC(year, month, Math.min(d, lastDay)));
    }
    return date.toISOString().slice(0, 10);
}

/** The rule's date (YYYY-MM-DD) for one participant, or null when its base date is not set. */
export function dateRuleIso(rule: DateRule, enrollment: EnrollmentWithRelations | null, today: string): string | null {
    const base = rule.base === 'today'
        ? today
        : !enrollment ? null
            : rule.base === 'courseDate' ? courseDateOf(enrollment)
                : enrollment.completed_date || (enrollment.status === 'completed' ? enrollment.confirmed_date : null);
    if (!base || !/^\d{4}-\d{2}-\d{2}/.test(base)) return null;
    return addToDate(base, rule.amount, rule.unit);
}

export function formatRuleDate(rule: DateRule, iso: string | null): string {
    if (!iso) return '';
    return rule.format === 'dmy' ? formatDateDMY(iso) : formatDateLong(iso);
}

/** "Course date + 2 years" */
export function describeDateRule(rule: DateRule): string {
    const base = DATE_BASES.find(b => b.value === rule.base)?.label ?? rule.base;
    if (rule.amount === 0) return base;
    const n = Math.abs(rule.amount);
    const unit = n === 1 ? rule.unit.replace(/s$/, '') : rule.unit;
    return `${base} ${rule.amount > 0 ? '+' : '−'} ${n} ${unit}`;
}

/** Values of the date variables for one participant. */
export function dateVariableValues(vars: DateVariable[], enrollment: EnrollmentWithRelations | null, today: string): Record<string, string> {
    return Object.fromEntries(vars.map(v => [v.key, formatRuleDate(v.rule, dateRuleIso(v.rule, enrollment, today))]));
}

/** Values for a whole sheet (attendance, labels): each rule from the earliest date among the people. */
function sheetDateValues(vars: DateVariable[], people: EnrollmentWithRelations[], today: string): Record<string, string> {
    return Object.fromEntries(vars.map(v => {
        const dates = people.map(e => dateRuleIso(v.rule, e, today)).filter((d): d is string => !!d).sort();
        return [v.key, formatRuleDate(v.rule, dates[0] ?? (v.rule.base === 'today' ? dateRuleIso(v.rule, null, today) : null))];
    }));
}

// ─── Data ───────────────────────────────────────────────────

/** The day a participant attends — the same order the {courseDate} placeholder uses. */
export function courseDateOf(e: Pick<Enrollment, 'confirmed_date' | 'invited_date' | 'completed_date'>): string | null {
    return e.confirmed_date || e.invited_date || e.completed_date || null;
}


/** Course dates with their time, place and days (migration 79), keyed by courseDateKey(course id, first day). */
export type SessionMap = Record<string, CourseSession>;

/** What documents know beyond the enrollments themselves. */
export interface DocContext {
    /** Schedules of the course dates: days and place. */
    sessions?: SessionMap;
    /** The signed-in staff member, for {staffName}. */
    staffName?: string;
}

/** First and last day (YYYY-MM-DD) and the place of the course dates these people attend. */
export function courseRun(people: EnrollmentWithRelations[], sessions: SessionMap = {}): { first: string | null; last: string | null; venue: string } {
    const days: string[] = [];
    const venues: string[] = [];
    for (const e of people) {
        const date = courseDateOf(e)?.slice(0, 10);
        if (!date) continue;
        const session = e.course_id ? sessions[courseDateKey(e.course_id, date)] : undefined;
        if (session) {
            days.push(...sessionDays(session).map(d => d.date));
            if (session.location) venues.push(session.location);
        } else {
            days.push(date);
        }
    }
    days.sort();
    return { first: days[0] ?? null, last: days[days.length - 1] ?? null, venue: distinct(venues) };
}

/** {courseNameDate}, {startDate}, {endDate}, {venue} and {staffName} for one person or a whole group. */
function runFields(people: EnrollmentWithRelations[], ctx: DocContext) {
    const run = courseRun(people, ctx.sessions);
    const endDate = formatDateDMY(run.last);
    const name = distinct(people.map(e => e.courses?.name || ''));
    return {
        courseNameDate: [name, endDate].filter(Boolean).join(' '),
        startDate: formatDateDMY(run.first),
        endDate,
        venue: run.venue,
        staffName: ctx.staffName ?? '',
    };
}

export function buildPlaceholderData(enrollment: EnrollmentWithRelations, today: string = todayISO(), ctx: DocContext = {}): Record<string, string> {
    const s = enrollment.students;
    const c = enrollment.courses;
    const status = enrollment.status || '';

    return {
        userId: s?.id || '',
        firstName: s?.first_name || '',
        lastName: s?.last_name || '',
        fullName: fullName(s),
        email: s?.email || '',
        phone: s?.phone || '',
        mobileNumber: s?.phone || '',
        address: s?.address || '',
        eircode: s?.eircode || '',
        dateOfBirth: formatDateLong(s?.dob),
        courseId: c?.id || '',
        courseTitle: c?.name || '',
        courseVariant: cleanVariant(c?.name || '', enrollment.course_variant),
        registeredAt: formatDateDMY(enrollment.created_at),
        courseRegistrationDate: formatDateLong(enrollment.created_at),
        isCompleted: status === 'completed' ? 'Yes' : 'No',
        completedAt: enrollment.completed_date ? formatDateLong(enrollment.completed_date) : (status === 'completed' ? formatDateLong(enrollment.confirmed_date) : ''),
        isInvited: enrollment.invited_date ? 'Yes' : 'No',
        invitedAt: formatDateLong(enrollment.invited_date),
        confirmedDate: formatDateLong(enrollment.confirmed_date),
        courseDate: formatDateLong(courseDateOf(enrollment)),
        enrollmentStatus: status.charAt(0).toUpperCase() + status.slice(1),
        enrollmentNotes: enrollment.notes || '',
        today: formatDateLong(today),
        ...runFields([enrollment], ctx),
    };
}

/** Alphabetical by surname, then first name — the order people expect on a sign-in sheet. */
export function sortBySurname<T extends { students: Pick<Student, 'first_name' | 'last_name'> | null }>(rows: T[]): T[] {
    const key = (r: T) => `${r.students?.last_name || ''} ${r.students?.first_name || ''}`.trim();
    return [...rows].sort((a, b) => key(a).localeCompare(key(b), 'en', { sensitivity: 'base' }));
}

/** Distinct non-empty values in first-seen order, joined for display. */
const distinct = (values: string[]) => [...new Set(values.filter(Boolean))].join(', ');

/** Course-level fields shared by every participant: sheet headers, combined documents. */
function courseFields(people: EnrollmentWithRelations[], today: string, ctx: DocContext = {}) {
    const dates = [...new Set(people.map(courseDateOf).filter((d): d is string => !!d))].sort();
    return {
        courseTitle: distinct(people.map(e => e.courses?.name || '')),
        courseVariant: distinct(people.map(e => cleanVariant(e.courses?.name || '', e.course_variant))),
        courseDate: dates.map(d => formatDateLong(d)).join(', '),
        today: formatDateLong(today),
        ...runFields(people, ctx),
    };
}

/**
 * Data for an attendance sheet or label page. Each page carries numbered slots
 * ({firstName1}…{firstNameN}) for fixed-grid templates, plus a `students` list for
 * templates that repeat a table row with {#students}…{/students}.
 * With `slots` set, participants are split into pages of that size; otherwise one page holds everyone.
 */
export function buildSheetPages(
    enrollments: EnrollmentWithRelations[],
    slots: number | null,
    today: string = todayISO(),
    /** Extra per-participant fields for rows inside {#students} (date variables). */
    rowExtra?: (enrollment: EnrollmentWithRelations) => Record<string, string>,
    ctx: DocContext = {},
): Record<string, unknown>[] {
    const people = sortBySurname(enrollments.filter(e => e.students));
    const pageSize = slots ?? Math.max(people.length, 1);
    const pageCount = Math.max(1, Math.ceil(people.length / pageSize));
    const common = {
        ...courseFields(people, today, ctx),
        participantCount: String(people.length),
        pages: String(pageCount),
    };

    return Array.from({ length: pageCount }, (_, p) => {
        const rows = people.slice(p * pageSize, (p + 1) * pageSize).map((e, i) => {
            const s = e.students!;
            const row: Record<SheetRowField, string> & { n: string } = {
                ...rowExtra?.(e),
                n: String(p * pageSize + i + 1),
                firstName: s.first_name || '',
                lastName: s.last_name || '',
                fullName: fullName(s),
                phone: s.phone || '',
                mobileNumber: s.phone || '',
                email: s.email || '',
                address: s.address || '',
                eircode: s.eircode || '',
                dateOfBirth: formatDateLong(s.dob),
                courseVariant: cleanVariant(e.courses?.name || '', e.course_variant),
            };
            return row;
        });
        const page: Record<string, unknown> = { ...common, page: String(p + 1), [SHEET_LOOP]: rows };
        // Empty slots render blank rather than leaving the tag in the document
        for (let i = 0; i < (slots ?? rows.length); i++) {
            for (const { key } of SHEET_ROW_FIELDS) page[`${key}${i + 1}`] = rows[i]?.[key] ?? '';
        }
        return page;
    });
}

/**
 * Data for the SICAP course form: the course details (page 1) and, under {#participantPages},
 * one entry per 9 participants with {fullName1}…{fullName9} (page 2, repeated as needed).
 * The top level also carries the first page's slots, for a form without the page loop.
 */
export function buildSicapData(
    enrollments: EnrollmentWithRelations[],
    today: string = todayISO(),
    ctx: DocContext = {},
    rowExtra?: (enrollment: EnrollmentWithRelations) => Record<string, string>,
): Record<string, unknown> {
    const pages = buildSheetPages(enrollments, SICAP_SLOTS, today, rowExtra, ctx);
    return { ...pages[0], [SICAP_PAGE_LOOP]: pages };
}

/** People grouped by course date (course + first day), in date order: one SICAP form per group. */
export function groupByCourseRun(people: EnrollmentWithRelations[]): EnrollmentWithRelations[][] {
    const groups = new Map<string, EnrollmentWithRelations[]>();
    for (const e of people) {
        const key = `${courseDateOf(e)?.slice(0, 10) ?? ''}|${e.courses?.name ?? ''}|${e.course_id}`;
        const list = groups.get(key);
        if (list) list.push(e);
        else groups.set(key, [e]);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, list]) => list);
}

// ─── Rendering ──────────────────────────────────────────────

type PizZipCtor = typeof import('pizzip');
type PizZipInstance = InstanceType<PizZipCtor>;
type DocxtemplaterCtor = typeof import('docxtemplater');
interface DocxLibs { PizZip: PizZipCtor; Docxtemplater: DocxtemplaterCtor; fixDocPrCorruption: object }

let libsPromise: Promise<DocxLibs> | null = null;

export function loadDocxLibs(): Promise<DocxLibs> {
    libsPromise ??= loadChunk(() => Promise.all([
        import('pizzip'),
        import('docxtemplater'),
        import('docxtemplater/js/modules/fix-doc-pr-corruption.js'),
    ])).then(([pz, dt, fix]) => ({
        PizZip: (pz.default || pz) as PizZipCtor,
        Docxtemplater: (dt.default || dt) as DocxtemplaterCtor,
        fixDocPrCorruption: (fix.default || fix) as object,
    })).catch(err => {
        libsPromise = null; // let the next attempt retry a failed chunk download
        throw err;
    });
    return libsPromise;
}

/**
 * A readable message for docxtemplater errors. Template problems arrive as a
 * "Multi error" whose real causes ("The tag 'firstName' is unclosed") sit in properties.errors.
 */
export function describeDocxError(err: unknown): string {
    const e = err as { message?: string; properties?: { explanation?: string; errors?: { message?: string; properties?: { explanation?: string } }[] } };
    const errors = e?.properties?.errors;
    if (Array.isArray(errors) && errors.length > 0) {
        const lines = [...new Set(errors.map(x => x.properties?.explanation || x.message || 'Unknown error'))];
        return lines.slice(0, 3).join('; ') + (lines.length > 3 ? ` (+${lines.length - 3} more)` : '');
    }
    return e?.properties?.explanation || e?.message || String(err);
}

/** Parse and compile a template. Throws on template syntax errors. */
function createDoc(libs: DocxLibs, template: ArrayBuffer | PizZipInstance, missing?: Set<string>, modules: object[] = []) {
    const zip = template instanceof ArrayBuffer ? new libs.PizZip(template) : template;
    return new libs.Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        delimiters: { start: '{', end: '}' },
        errorLogging: false, // errors are reported through describeDocxError
        modules: modules as never[],
        // An unknown tag renders blank (instead of the word "undefined") and is reported back
        nullGetter(part) {
            if (!part.module && part.value) missing?.add(part.value);
            return '';
        },
    });
}

type Doc = ReturnType<typeof createDoc>;

/** Render a compiled template to .docx bytes. */
function renderDoc(doc: Doc, data: Record<string, unknown>): ArrayBuffer {
    doc.render(data);
    return doc.getZip().generate({ type: 'arraybuffer', compression: 'DEFLATE' });
}

/**
 * Turn a per-student template into one that repeats its whole body for every entry of
 * `__people`, with a page break between them — one printable file for the whole group.
 * The body's own section properties (page size, margins, headers) stay outside the loop.
 */
function toCombinedTemplate(libs: DocxLibs, template: ArrayBuffer): PizZipInstance {
    const zip = new libs.PizZip(template);
    const xml = zip.file('word/document.xml')?.asText();
    const open = xml?.match(/<w:body(?:\s[^>]*)?>/);
    const bodyEnd = xml?.lastIndexOf('</w:body>') ?? -1;
    if (!xml || !open || open.index === undefined || bodyEnd < 0) throw new Error('word/document.xml has no body');

    let insertAt = bodyEnd;
    const lastSect = xml.lastIndexOf('<w:sectPr', bodyEnd);
    if (lastSect > open.index && /^<w:sectPr\b(?:[^>]*\/>|[\s\S]*<\/w:sectPr>)\s*$/.test(xml.slice(lastSect, bodyEnd))) insertAt = lastSect;

    const para = (inner: string) => `<w:p>${inner}</w:p>`;
    const tag = (t: string) => `<w:r><w:t>{${t}}</w:t></w:r>`;
    const start = para(tag('#__people'));
    // No page break after the last person, so the file does not end on a blank page
    const end = para(tag('^__last') + '<w:r><w:br w:type="page"/></w:r>' + tag('/__last')) + para(tag('/__people'));
    const bodyStart = open.index + open[0].length;
    zip.file('word/document.xml', xml.slice(0, bodyStart) + start + xml.slice(bodyStart, insertAt) + end + xml.slice(insertAt));
    return zip;
}

// ─── Any template, filled with what was typed (the public certificates page) ───

/**
 * The tags a template uses ({firstName}, {tutor}), in the order they first appear. The inside of
 * a loop or condition is left out. Throws on a template that cannot be filled (an unclosed tag).
 */
export async function templateTags(template: ArrayBuffer): Promise<string[]> {
    const libs = await loadDocxLibs();
    const tags = new Set<string>();
    createDoc(libs, template, tags).render({});
    return [...tags];
}

/** One filled copy of a template. A tag with no value prints blank. */
export async function fillTemplate(template: ArrayBuffer, data: Record<string, string>): Promise<ArrayBuffer> {
    const libs = await loadDocxLibs();
    return renderDoc(createDoc(libs, template), data);
}

/** Every person's copy in one file, a page break between them. */
export async function fillTemplateForAll(template: ArrayBuffer, people: Record<string, string>[]): Promise<ArrayBuffer> {
    const libs = await loadDocxLibs();
    // Loops copy pictures, so give every copy its own drawing id (Word rejects duplicates)
    const doc = createDoc(libs, toCombinedTemplate(libs, template), undefined, [libs.fixDocPrCorruption]);
    return renderDoc(doc, { __people: people.map((p, i) => ({ ...p, __last: i === people.length - 1 })) });
}

/** Pages of a sheet (attendance) rendered into one file, a page break between them. */
function renderPagesInOneFile(libs: DocxLibs, template: ArrayBuffer, pages: Record<string, unknown>[], missing: Set<string>): ArrayBuffer {
    const doc = createDoc(libs, toCombinedTemplate(libs, template), missing, [libs.fixDocPrCorruption]);
    // Word headers and footers live outside {#__people} and resolve against the root object;
    // providing pages[0] at the root keeps {courseTitle}, {courseDate}, {venue}, {staffName},
    // {pages} and custom variables working on multi-page sheets instead of printing blank.
    return renderDoc(doc, {
        ...(pages[0] ?? {}),
        __people: pages.map((page, i) => ({ ...page, __last: i === pages.length - 1 })),
    });
}

export type TemplateKind = 'document' | 'attendance' | 'labels' | 'sicap';

export interface TemplateCheck {
    /** Syntax errors: the template cannot be rendered at all. */
    error?: string;
    /** Tags with no matching placeholder or custom variable — they would print blank. */
    unknownTags: string[];
}

export interface TemplateInspection extends TemplateCheck {
    /** True when the file itself is not a valid .docx/ZIP archive (vs placeholder syntax error). */
    corrupt?: boolean;
    /** All {placeholder} names found in the template (including inside loops and headers/footers). */
    tags: string[];
}

const SHEET_COMMON_KEYS = new Set(SHEET_PLACEHOLDER_CATEGORIES[0].items.map(i => i.key));
const SHEET_ROW_KEY_SET = new Set<string>(['n', ...SHEET_ROW_FIELDS.map(f => f.key)]);
const SICAP_COMMON_KEYS = new Set(SICAP_PLACEHOLDER_CATEGORIES[0].items.map(i => i.key));

/**
 * Compute which extracted `{tags}` from a template are unknown for `kind`, given the current
 * custom variable keys. Pure & synchronous so the UI can show live tag health without downloading `.docx` files.
 */
export function unknownTagsForKind(
    tags: readonly string[],
    kind: TemplateKind,
    customVarKeys: Iterable<string> = [],
): string[] {
    const custom = new Set(customVarKeys);
    const maxSlots = kind === 'attendance' ? ATTENDANCE_SLOTS : kind === 'labels' ? LABEL_SLOTS : kind === 'sicap' ? SICAP_SLOTS : 0;
    const isNumberedSlot = (tag: string): boolean => {
        if (!maxSlots) return false;
        const m = /^([A-Za-z]+)(\d+)$/.exec(tag);
        if (!m) return false;
        const num = Number(m[2]);
        if (num < 1 || num > maxSlots) return false;
        return SHEET_ROW_FIELDS.some(f => f.key === m[1]);
    };

    const unknown: string[] = [];
    for (const tag of tags) {
        if (!tag || RESERVED_VARIABLE_KEYS.has(tag)) continue;
        if (custom.has(tag)) continue;
        if (kind === 'document') {
            if (PLACEHOLDER_KEYS.has(tag)) continue;
        } else if (kind === 'sicap') {
            if (SICAP_COMMON_KEYS.has(tag) || SHEET_COMMON_KEYS.has(tag) || SHEET_ROW_KEY_SET.has(tag) || isNumberedSlot(tag)) continue;
        } else {
            if (SHEET_COMMON_KEYS.has(tag) || SHEET_ROW_KEY_SET.has(tag) || isNumberedSlot(tag)) continue;
        }
        unknown.push(tag);
    }
    return [...new Set(unknown)].sort();
}

/** A made-up participant, so a dry run also renders the inside of {#students} loops. */
function sampleParticipant(): EnrollmentWithRelations {
    return {
        id: 'sample', student_id: 'sample', course_id: 'sample', status: 'confirmed', course_variant: null, notes: null,
        confirmed_date: todayISO(), confirmed_at: null, invited_date: null, invited_at: null, completed_date: null, completed_at: null,
        is_priority: false, response_days: null, created_at: todayISO(), updated_at: todayISO(),
        students: { id: 'sample', first_name: 'Sample', last_name: 'Person', email: 'x', phone: 'x', address: 'x', eircode: 'x', dob: todayISO() } as Student,
        courses: { id: 'sample', name: 'Sample course', created_at: todayISO() },
    };
}

/** Full template inspection: checks syntax, detects corrupt files, extracts all tags and unknown tags. */
export async function inspectTemplateBuffer(template: ArrayBuffer, kind: TemplateKind, customVariables: Record<string, string> = {}): Promise<TemplateInspection> {
    const libs = await loadDocxLibs();
    const missing = new Set<string>();
    const allTags = new Set<string>();
    try {
        // Pass 1: discover every tag used in body, loops, headers and footers
        createDoc(libs, template, allTags).render({ [SHEET_LOOP]: [{}], [SICAP_PAGE_LOOP]: [{}] });
        // Pass 2: render against realistic sample data for this template kind to detect unknown tags
        const sample: Record<string, unknown> = kind === 'document'
            ? Object.fromEntries([...PLACEHOLDER_KEYS].map(k => [k, 'x']))
            : kind === 'sicap'
                ? buildSicapData([sampleParticipant()])
                : buildSheetPages([sampleParticipant()], kind === 'attendance' ? ATTENDANCE_SLOTS : LABEL_SLOTS)[0];
        renderDoc(createDoc(libs, template, missing), { ...sample, ...customVariables });
    } catch (err) {
        const message = describeDocxError(err);
        const corrupt = /end of central directory|corrupted zip|not a zip|no body/i.test(message);
        return {
            error: corrupt ? 'This file is not a valid Word (.docx) document' : message,
            corrupt,
            tags: [],
            unknownTags: [],
        };
    }
    const tags = [...allTags].filter(t => t && !RESERVED_VARIABLE_KEYS.has(t));
    return { tags, unknownTags: [...missing].sort() };
}

/** Dry-run a template against sample data, so problems surface at upload rather than at generation. */
export async function checkTemplateBuffer(template: ArrayBuffer, kind: TemplateKind, customVariables: Record<string, string> = {}): Promise<TemplateCheck> {
    const { error, unknownTags } = await inspectTemplateBuffer(template, kind, customVariables);
    return error !== undefined ? { error, unknownTags } : { unknownTags };
}

// ─── Archive ────────────────────────────────────────────────

/** Keeps letters of any alphabet (Seán, Олена), drops characters that are unsafe in file names. */
export function safeFileName(name: string, fallback = 'Unknown'): string {
    const cleaned = name
        .normalize('NFC')
        .replace(/[^\p{L}\p{M}\p{N}_.\-\s']/gu, '')
        .trim()
        .replace(/\s+/g, '_')
        .replace(/^\.+|\.+$/g, '');
    return cleaned || fallback;
}

/** Adds _2, _3 … so two students with the same name do not overwrite each other in the ZIP. */
function uniquePath(used: Set<string>, path: string): string {
    const dot = path.lastIndexOf('.');
    const [base, ext] = dot > 0 ? [path.slice(0, dot), path.slice(dot)] : [path, ''];
    let candidate = path;
    for (let i = 2; used.has(candidate.toLowerCase()); i++) candidate = `${base}_${i}${ext}`;
    used.add(candidate.toLowerCase());
    return candidate;
}

/** A downloaded template, or the reason it could not be downloaded. */
export interface TemplateFile {
    name: string;
    buffer: ArrayBuffer | null;
    error?: string;
}

/** A ready-made file (Participants.xlsx) that goes into the archive as it is. */
export interface ExtraFile {
    label: string;
    path: string;
    buffer: ArrayBuffer | null;
    error?: string;
}

/**
 * Split `word/document.xml` into its outer tags, the inner `<w:body>` content, and the trailing
 * `<w:sectPr>` (page setup, margins, headers/footers) if one sits at the end of the body.
 */
interface ParsedDocXml {
    beforeDocOpen: string;
    docOpen: string;
    beforeBody: string;
    bodyOpen: string;
    content: string;
    sectPr: string | null;
    afterBody: string;
}

function splitDocumentXml(xml: string): ParsedDocXml {
    const docMatch = xml.match(/<w:document(?:\s[^>]*)?>/);
    const open = xml.match(/<w:body(?:\s[^>]*)?>/);
    const bodyEnd = xml.lastIndexOf('</w:body>');
    if (!docMatch || docMatch.index === undefined || !open || open.index === undefined || bodyEnd < 0) {
        throw new Error('word/document.xml has no body');
    }

    const docStart = docMatch.index;
    const docOpenEnd = docStart + docMatch[0].length;
    const bodyStart = open.index + open[0].length;

    let insertAt = bodyEnd;
    const lastSect = xml.lastIndexOf('<w:sectPr', bodyEnd);
    if (lastSect >= bodyStart && /^<w:sectPr\b(?:[^>]*\/>|[\s\S]*<\/w:sectPr>)\s*$/.test(xml.slice(lastSect, bodyEnd))) {
        insertAt = lastSect;
    }

    return {
        beforeDocOpen: xml.slice(0, docStart),
        docOpen: docMatch[0],
        beforeBody: xml.slice(docOpenEnd, open.index),
        bodyOpen: open[0],
        content: xml.slice(bodyStart, insertAt),
        sectPr: insertAt < bodyEnd ? xml.slice(insertAt, bodyEnd).trim() : null,
        afterBody: xml.slice(bodyEnd),
    };
}

/** Ensure a section-break `<w:sectPr>` starts on a new page rather than continuing inline, respecting CT_SectPr order. */
function toNextPageSectPr(sectPr: string): string {
    if (/^<w:sectPr\s*\/>$/.test(sectPr)) return '<w:sectPr><w:type w:val="nextPage"/></w:sectPr>';
    if (/<w:type\b[^>]*\/>/.test(sectPr)) {
        return sectPr.replace(/<w:type\b[^>]*\/>/g, '<w:type w:val="nextPage"/>');
    }
    // ECMA-376 CT_SectPr requires headerReference/footerReference to precede <w:type>
    const refRe = /<w:(?:headerReference|footerReference)\b[^>]*(?:\/>|>[\s\S]*?<\/w:(?:headerReference|footerReference)>)/g;
    let insertAfter = -1;
    for (const m of sectPr.matchAll(refRe)) {
        if (m.index !== undefined) insertAfter = m.index + m[0].length;
    }
    if (insertAfter > 0) {
        return `${sectPr.slice(0, insertAfter)}<w:type w:val="nextPage"/>${sectPr.slice(insertAfter)}`;
    }
    return sectPr.replace(/^<w:sectPr(\b[^>]*)>/, '<w:sectPr$1><w:type w:val="nextPage"/>');
}

/** Normalize a target relative to `baseDir` (e.g. `word/` or `word/charts/`) into a zip path. */
function resolveTargetFrom(baseDir: string, target: string): string {
    if (target.startsWith('/')) return target.slice(1);
    const parts = `${baseDir}${target}`.split('/');
    const out: string[] = [];
    for (const p of parts) {
        if (!p || p === '.') continue;
        if (p === '..') out.pop();
        else out.push(p);
    }
    return out.join('/');
}

/** Normalize a zip path like `word/../media/img.png` to `media/img.png`. */
function resolveWordTarget(target: string): string {
    return resolveTargetFrom('word/', target);
}

/** Relative target from `baseDir` (trailing slash or empty) to a zip path. */
function toRelativeTarget(baseDir: string, zipPath: string): string {
    const fromParts = baseDir.split('/').filter(Boolean);
    const toParts = zipPath.split('/').filter(Boolean);
    let common = 0;
    while (common < fromParts.length && common < toParts.length && fromParts[common] === toParts[common]) common++;
    return [...Array(fromParts.length - common).fill('..'), ...toParts.slice(common)].join('/');
}

/** Add prefix to the filename part of a path: `word/media/image1.png` -> `word/media/d1_image1.png`. */
function prefixPathFile(path: string, prefix: string): string {
    const slash = path.lastIndexOf('/');
    return slash >= 0 ? `${path.slice(0, slash + 1)}${prefix}${path.slice(slash + 1)}` : `${prefix}${path}`;
}

/** Relative target from `word/` to a zip path. */
function toWordTarget(zipPath: string): string {
    return zipPath.startsWith('word/') ? zipPath.slice('word/'.length) : `../${zipPath}`;
}

/** Merge `<w:style>` definitions from `sourceStylesXml` that are missing in `targetStylesXml`. */
function mergeMissingStyles(targetStylesXml: string, sourceStylesXml: string): string {
    const existingIds = new Set([...targetStylesXml.matchAll(/\bw:styleId="([^"]+)"/g)].map(m => m[1]));
    const toAdd: string[] = [];
    for (const sm of sourceStylesXml.matchAll(/<w:style\b[^>]*\bw:styleId="([^"]+)"[\s\S]*?<\/w:style>/g)) {
        if (!existingIds.has(sm[1])) {
            existingIds.add(sm[1]);
            toAdd.push(sm[0].replace(/\s+w:default="(?:1|true)"/g, ''));
        }
    }
    return toAdd.length > 0 ? targetStylesXml.replace(/<\/w:styles>\s*$/, `${toAdd.join('')}</w:styles>`) : targetStylesXml;
}

const SINGLETON_REL_TYPES = new Set([
    'http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme',
    'http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering',
    'http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes',
    'http://schemas.openxmlformats.org/officeDocument/2006/relationships/endnotes',
]);

/**
 * Merge multiple rendered `.docx` files for one student into a single `.docx`, one template after
 * another on new pages. Preserves images/relationships, styles, and per-template page setup
 * (including isolating headers/footers across all internal and trailing section breaks).
 */
export function mergeStudentDocs(libs: DocxLibs, buffers: ArrayBuffer[]): ArrayBuffer {
    if (buffers.length === 0) throw new Error('No documents to merge');
    if (buffers.length === 1) return buffers[0];

    const baseZip = new libs.PizZip(buffers[0]);
    const baseXml = baseZip.file('word/document.xml')?.asText();
    if (!baseXml) throw new Error('word/document.xml has no body');

    const parsed: ParsedDocXml[] = [splitDocumentXml(baseXml)];
    let docOpen = parsed[0].docOpen;
    let baseRelsXml = baseZip.file('word/_rels/document.xml.rels')?.asText() ?? null;
    let baseTypesXml = baseZip.file('[Content_Types].xml')?.asText() ?? null;
    let baseStylesXml = baseZip.file('word/styles.xml')?.asText() ?? null;
    let nextRelSeq = 1;

    const allocRelId = () => {
        while (baseRelsXml && baseRelsXml.includes(`"rId_m${nextRelSeq}"`)) nextRelSeq++;
        return `rId_m${nextRelSeq++}`;
    };

    const ensureBaseRels = () => {
        if (!baseRelsXml) {
            baseRelsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
        }
    };

    const appendRel = (relTag: string) => {
        ensureBaseRels();
        baseRelsXml = baseRelsXml!.replace(/<\/Relationships>\s*$/, `${relTag}</Relationships>`);
    };

    const addContentTypeDefault = (ext: string, contentType: string) => {
        if (!baseTypesXml) return;
        const re = new RegExp(`<Default\\b[^>]*\\bExtension=["']${ext}["']`, 'i');
        if (!re.test(baseTypesXml)) {
            baseTypesXml = baseTypesXml.replace(/<\/Types>\s*$/, `<Default Extension="${ext}" ContentType="${contentType}"/></Types>`);
        }
    };

    const addContentTypeOverride = (partName: string, contentType: string) => {
        if (!baseTypesXml) return;
        const normalized = partName.startsWith('/') ? partName : `/${partName}`;
        if (!baseTypesXml.includes(`PartName="${normalized}"`)) {
            baseTypesXml = baseTypesXml.replace(/<\/Types>\s*$/, `<Override PartName="${normalized}" ContentType="${contentType}"/></Types>`);
        }
    };

    for (let i = 1; i < buffers.length; i++) {
        const otherZip = new libs.PizZip(buffers[i]);
        const otherXml = otherZip.file('word/document.xml')?.asText();
        if (!otherXml) throw new Error('word/document.xml has no body');
        const part = splitDocumentXml(otherXml);

        // 1. Merge any missing xmlns declarations and mc:Ignorable tokens onto <w:document>
        for (const m of part.docOpen.matchAll(/\s(xmlns(?::[A-Za-z0-9_-]+)?)=("[^"]*"|'[^']*')/g)) {
            const [, attrName, attrVal] = m;
            if (!new RegExp(`\\s${attrName}=`).test(docOpen)) {
                docOpen = docOpen.replace(/>$/, ` ${attrName}=${attrVal}>`);
            }
        }
        const otherIgnorable = /\bmc:Ignorable="([^"]*)"/.exec(part.docOpen)?.[1];
        if (otherIgnorable) {
            const baseIgnorable = /\bmc:Ignorable="([^"]*)"/.exec(docOpen)?.[1];
            if (baseIgnorable) {
                const mergedTokens = [...new Set([...baseIgnorable.split(/\s+/), ...otherIgnorable.split(/\s+/)].filter(Boolean))].join(' ');
                docOpen = docOpen.replace(/\bmc:Ignorable="[^"]*"/, `mc:Ignorable="${mergedTokens}"`);
            } else {
                docOpen = docOpen.replace(/>$/, ` mc:Ignorable="${otherIgnorable}">`);
            }
        }

        // 2. Copy referenced relationships (images, headers, footers, links, etc.) and remap rIds
        const otherRelsXml = otherZip.file('word/_rels/document.xml.rels')?.asText();
        const otherTypesXml = otherZip.file('[Content_Types].xml')?.asText();
        if (otherTypesXml && baseTypesXml) {
            for (const dm of otherTypesXml.matchAll(/<Default\b[^>]*\bExtension="([^"]+)"[^>]*\bContentType="([^"]+)"[^>]*\/?>/g)) {
                addContentTypeDefault(dm[1], dm[2]);
            }
        }

        const chunkXml = part.content + (part.sectPr ?? '');
        if (otherRelsXml) {
            const rIdMap = new Map<string, string>();
            for (const rm of otherRelsXml.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
                const attrs = rm[1];
                const id = /\bId="([^"]+)"/.exec(attrs)?.[1];
                const target = /\bTarget="([^"]+)"/.exec(attrs)?.[1];
                const type = /\bType="([^"]+)"/.exec(attrs)?.[1];
                const targetMode = /\bTargetMode="([^"]+)"/.exec(attrs)?.[1];
                if (!id || !target || !type) continue;

                // Copy missing singleton document parts (e.g. theme1.xml, numbering.xml) when baseZip is a minimal pdfToDocx file
                if (SINGLETON_REL_TYPES.has(type) && targetMode !== 'External') {
                    if (!baseRelsXml || !baseRelsXml.includes(`Type="${type}"`)) {
                        const partZipPath = resolveWordTarget(target);
                        const entry = otherZip.file(partZipPath);
                        if (entry && !baseZip.file(partZipPath)) {
                            baseZip.file(partZipPath, entry.asArrayBuffer());
                            appendRel(`<Relationship Id="${allocRelId()}" Type="${type}" Target="${toWordTarget(partZipPath)}"/>`);
                            if (otherTypesXml && baseTypesXml) {
                                const ovRe = new RegExp(`<Override\\b[^>]*\\bPartName="/?${partZipPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*\\bContentType="([^"]+)"`, 'i');
                                const ovMatch = ovRe.exec(otherTypesXml);
                                if (ovMatch) addContentTypeOverride(partZipPath, ovMatch[1]);
                            }
                        }
                    }
                    continue;
                }

                if (!chunkXml.includes(`"${id}"`) && !chunkXml.includes(`'${id}'`)) continue;

                const newId = allocRelId();
                rIdMap.set(id, newId);

                if (targetMode === 'External') {
                    appendRel(`<Relationship Id="${newId}" Type="${type}" Target="${target}" TargetMode="External"/>`);
                    continue;
                }

                const oldZipPath = resolveWordTarget(target);
                const fileInOther = otherZip.file(oldZipPath);
                if (!fileInOther) continue;

                const prefix = `d${i}_`;
                const newZipPath = prefixPathFile(oldZipPath, prefix);
                baseZip.file(newZipPath, fileInOther.asArrayBuffer());

                // If the copied part has its own .rels (e.g. a header with an embedded logo), copy it and its media too
                const slash = oldZipPath.lastIndexOf('/');
                const oldDir = slash >= 0 ? oldZipPath.slice(0, slash + 1) : '';
                const oldFile = slash >= 0 ? oldZipPath.slice(slash + 1) : oldZipPath;
                const oldSubRelsPath = `${oldDir}_rels/${oldFile}.rels`;
                const subRelsFile = otherZip.file(oldSubRelsPath);
                if (subRelsFile) {
                    let subRelsText = subRelsFile.asText();
                    for (const srm of subRelsText.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
                        const sAttrs = srm[1];
                        const sTarget = /\bTarget=(?:"([^"]+)"|'([^']+)')/.exec(sAttrs);
                        const sTargetVal = sTarget?.[1] ?? sTarget?.[2];
                        const sMode = /\bTargetMode=(?:"([^"]+)"|'([^']+)')/.exec(sAttrs);
                        const sModeVal = sMode?.[1] ?? sMode?.[2];
                        if (!sTargetVal || sModeVal === 'External') continue;
                        const oldSubTargetPath = resolveTargetFrom(oldDir, sTargetVal);
                        const subTargetEntry = otherZip.file(oldSubTargetPath);
                        if (subTargetEntry) {
                            const newSubTargetPath = prefixPathFile(oldSubTargetPath, prefix);
                            baseZip.file(newSubTargetPath, subTargetEntry.asArrayBuffer());
                            const escaped = sTargetVal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                            subRelsText = subRelsText.replace(
                                new RegExp(`(\\bTarget=)(["'])${escaped}\\2`, 'g'),
                                `$1$2${toRelativeTarget(oldDir, newSubTargetPath)}$2`,
                            );
                            if (otherTypesXml && baseTypesXml) {
                                const subOvRe = new RegExp(`<Override\\b[^>]*\\bPartName="/?${oldSubTargetPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*\\bContentType="([^"]+)"`, 'i');
                                const subOvMatch = subOvRe.exec(otherTypesXml);
                                if (subOvMatch) addContentTypeOverride(newSubTargetPath, subOvMatch[1]);
                            }
                        }
                    }
                    baseZip.file(`${oldDir}_rels/${prefix}${oldFile}.rels`, subRelsText);
                }

                if (otherTypesXml && baseTypesXml) {
                    const ovRe = new RegExp(`<Override\\b[^>]*\\bPartName="/?${oldZipPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*\\bContentType="([^"]+)"`, 'i');
                    const ovMatch = ovRe.exec(otherTypesXml);
                    if (ovMatch) addContentTypeOverride(newZipPath, ovMatch[1]);
                }

                appendRel(`<Relationship Id="${newId}" Type="${type}" Target="${toWordTarget(newZipPath)}"/>`);
            }

            if (rIdMap.size > 0) {
                const remap = (s: string) => s.replace(/(["'])([^"']+)\1/g, (full, q: string, val: string) => (rIdMap.has(val) ? `${q}${rIdMap.get(val)}${q}` : full));
                part.content = remap(part.content);
                if (part.sectPr) part.sectPr = remap(part.sectPr);
            }
        }

        // 3. Merge word/styles.xml (preferring a full Word stylesheet with latentStyles/docDefaults over a minimal pdfToDocx one)
        const otherStylesXml = otherZip.file('word/styles.xml')?.asText();
        if (otherStylesXml) {
            if (!baseStylesXml) {
                baseStylesXml = otherStylesXml;
            } else if (!baseStylesXml.includes('<w:latentStyles') && otherStylesXml.includes('<w:latentStyles')) {
                baseStylesXml = mergeMissingStyles(otherStylesXml, baseStylesXml);
            } else {
                baseStylesXml = mergeMissingStyles(baseStylesXml, otherStylesXml);
            }
        }

        parsed.push(part);
    }

    // 4. Join sections: use simple page breaks when all templates share the same page setup and have no internal section breaks,
    // or per-template section breaks when page setup (size, orientation, margins, headers/footers) differs.
    const normSect = (s: string | null) => (!s || /^<w:sectPr\s*\/>$/.test(s) ? '' : s);
    const hasInternalSects = parsed.some(p => p.content.includes('<w:sectPr'));
    const sameSectSetup = !hasInternalSects && new Set(parsed.map(p => normSect(p.sectPr))).size <= 1;
    const pageBreakPara = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';

    let mergedBody: string;
    if (sameSectSetup) {
        mergedBody = parsed.map(p => p.content).join(pageBreakPara) + (parsed[parsed.length - 1].sectPr ?? '');
    } else {
        // Prevent headers/footers from an earlier template leaking into a later template (including its internal section breaks!)
        const seenHdrTypes = new Set<string>();
        const seenFtrTypes = new Set<string>();
        let blankHdrRId: string | null = null;
        let blankFtrRId: string | null = null;

        const getBlankHdrRId = () => {
            if (!blankHdrRId) {
                blankHdrRId = allocRelId();
                baseZip.file('word/blank_hdr.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p/></w:hdr>');
                appendRel(`<Relationship Id="${blankHdrRId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="blank_hdr.xml"/>`);
                addContentTypeOverride('/word/blank_hdr.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml');
            }
            return blankHdrRId;
        };

        const getBlankFtrRId = () => {
            if (!blankFtrRId) {
                blankFtrRId = allocRelId();
                baseZip.file('word/blank_ftr.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p/></w:ftr>');
                appendRel(`<Relationship Id="${blankFtrRId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="blank_ftr.xml"/>`);
                addContentTypeOverride('/word/blank_ftr.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml');
            }
            return blankFtrRId;
        };

        const chunks: string[] = [];
        for (let i = 0; i < parsed.length; i++) {
            const p = parsed[i];
            // Within standalone template `p`, track which header/footer types exist from the start of `p`
            const tplHdrs = new Set<string>();
            const tplFtrs = new Set<string>();

            const isolateSect = (sect: string | null): string => {
                let s = sect && !/^<w:sectPr\s*\/>$/.test(sect) ? sect : '<w:sectPr></w:sectPr>';
                const curHdrs = new Set([...s.matchAll(/<w:headerReference\b[^>]*\bw:type="([^"]+)"/g)].map(m => m[1]));
                const curFtrs = new Set([...s.matchAll(/<w:footerReference\b[^>]*\bw:type="([^"]+)"/g)].map(m => m[1]));
                for (const t of curHdrs) tplHdrs.add(t);
                for (const t of curFtrs) tplFtrs.add(t);

                const inject: string[] = [];
                for (const t of seenHdrTypes) {
                    if (!curHdrs.has(t) && !tplHdrs.has(t)) inject.push(`<w:headerReference w:type="${t}" r:id="${getBlankHdrRId()}"/>`);
                }
                for (const t of seenFtrTypes) {
                    if (!curFtrs.has(t) && !tplFtrs.has(t)) inject.push(`<w:footerReference w:type="${t}" r:id="${getBlankFtrRId()}"/>`);
                }
                for (const t of curHdrs) seenHdrTypes.add(t);
                for (const t of curFtrs) seenFtrTypes.add(t);

                if (inject.length > 0) {
                    if (!/\sxmlns:r=/.test(docOpen)) {
                        docOpen = docOpen.replace(/>$/, ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">');
                    }
                    s = s.replace(/^<w:sectPr(\b[^>]*)>/, `<w:sectPr$1>${inject.join('')}`);
                }
                return s;
            };

            // Isolate every internal <w:sectPr> inside p.content as well as the trailing p.sectPr.
            // In OOXML, <w:type w:val="nextPage"/> governs how THAT section begins relative to the preceding section,
            // so templates after the first get `nextPage` on their own starting section (first internal sectPr or trailing sectPr).
            let markedFirstSection = false;
            const content = p.content.replace(/<w:sectPr\b(?:[^>]*\/>|[\s\S]*?<\/w:sectPr>)/g, m => {
                const isolated = isolateSect(m);
                if (i > 0 && !markedFirstSection) {
                    markedFirstSection = true;
                    return toNextPageSectPr(isolated);
                }
                return isolated;
            });
            let sect = isolateSect(p.sectPr);
            if (i > 0 && !markedFirstSection) {
                sect = toNextPageSectPr(sect);
            }

            if (i < parsed.length - 1) {
                // Minimal zero-height section-break paragraph so it never overflows a full page onto an extra blank page
                chunks.push(`${content}<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/><w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr>${sect}</w:pPr></w:p>`);
            } else {
                chunks.push(`${content}${sect}`);
            }
        }
        mergedBody = chunks.join('');
    }

    // 5. Ensure every drawing object and content control has a unique id across the merged document (body + headers/footers)
    let nextDocPrId = 1;
    const dedupDocPr = (xml: string) =>
        xml.replace(/<(wp:docPr|pic:cNvPr)\b([^>]*?)\bid="\d+"/g, (_m, tag: string, before: string) => `<${tag}${before}id="${nextDocPrId++}"`);
    mergedBody = dedupDocPr(mergedBody);
    for (const part of baseZip.file(/^word\/(?:d\d+_)?(?:header|footer)\d*\.xml$/)) {
        const xml = part.asText();
        const deduped = dedupDocPr(xml);
        if (deduped !== xml) baseZip.file(part.name, deduped);
    }
    let nextSdtId = 1000;
    mergedBody = mergedBody.replace(/<w:sdtPr>([\s\S]*?)<\/w:sdtPr>/g, (_m, inner: string) => `<w:sdtPr>${inner.replace(/<w:id\b[^>]*\bw:val="\d+"/g, () => `<w:id w:val="${nextSdtId++}"`)}</w:sdtPr>`);

    const finalXml = `${parsed[0].beforeDocOpen}${docOpen}${parsed[0].beforeBody}${parsed[0].bodyOpen}${mergedBody}${parsed[0].afterBody}`;
    baseZip.file('word/document.xml', finalXml);
    if (baseRelsXml) baseZip.file('word/_rels/document.xml.rels', baseRelsXml);
    if (baseTypesXml) baseZip.file('[Content_Types].xml', baseTypesXml);
    if (baseStylesXml) baseZip.file('word/styles.xml', baseStylesXml);

    return baseZip.generate({ type: 'arraybuffer', compression: 'DEFLATE' });
}

export interface RenderInput {
    enrollments: EnrollmentWithRelations[];
    templates: TemplateFile[];
    attendance?: TemplateFile | null;
    labels?: TemplateFile | null;
    /** The SICAP course form: one file per course date. */
    sicap?: TemplateFile | null;
    extraFiles?: ExtraFile[];
    /** Course date schedules ({startDate}, {endDate}, {venue}) and the signed-in staff member. */
    context?: DocContext;
    customVariables?: Record<string, string>;
    /** Custom variables worked out per participant, e.g. {expire} = course date + 2 years. */
    dateVariables?: DateVariable[];
    /** Also add one combined file per participant with all their templates, page after page, for printing. */
    combined?: boolean;
    today?: string;
}

export interface RenderHooks {
    /** Called after every generated file. */
    onProgress?: (done: number, total: number) => void;
    signal?: AbortSignal;
}

/** Outcome of an extra file in the archive: attendance sheet, labels, combined files or the Excel list. */
export interface ExtraFileResult {
    label: string;
    ok: boolean;
    files: number;
    error?: string;
}

/** Result of a document generation run. */
export interface GenerationResult {
    totalTemplates: number;
    successTemplates: string[];
    failedTemplates: { name: string; error: string }[];
    totalDocs: number;
    failedDocs: { student: string; template: string; error: string }[];
    extras: ExtraFileResult[];
    /** Tags a template uses that nothing fills in, per template. */
    unknownTags: { template: string; tags: string[] }[];
    /** Participants left out because their enrollment changed since the list was loaded. */
    skipped: string[];
}

export function abortError(): Error {
    return new DOMException('Generation cancelled', 'AbortError');
}

export function isAbortError(err: unknown): boolean {
    return (err as { name?: string } | null)?.name === 'AbortError';
}

/**
 * Let other work run. Unlike setTimeout(0), neither scheduler.yield() nor a MessageChannel
 * is throttled to once a second when the tab is in the background.
 */
function yieldToEventLoop(): Promise<void> {
    const scheduler = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
    if (scheduler?.yield) return scheduler.yield();
    return new Promise(resolve => {
        const channel = new MessageChannel();
        channel.port1.onmessage = () => { channel.port1.close(); resolve(); };
        channel.port2.postMessage(null);
    });
}

const YIELD_EVERY_MS = 40;

export async function renderArchive(input: RenderInput, hooks: RenderHooks = {}): Promise<{ zip: ArrayBuffer; result: GenerationResult }> {
    const { templates, attendance, labels, sicap, extraFiles = [], customVariables = {}, dateVariables = [], combined = false, today = todayISO(), context = {} } = input;
    const personData = (e: EnrollmentWithRelations) => ({ ...buildPlaceholderData(e, today, context), ...customVariables, ...dateVariableValues(dateVariables, e, today) });
    const personDates = (e: EnrollmentWithRelations) => dateVariableValues(dateVariables, e, today);
    const { onProgress, signal } = hooks;
    const people = sortBySurname(input.enrollments.filter(e => e.students));
    const libs = await loadDocxLibs();
    const zip = new libs.PizZip();
    const usedPaths = new Set<string>();

    const result: GenerationResult = {
        totalTemplates: templates.length,
        successTemplates: [],
        failedTemplates: [],
        totalDocs: 0,
        failedDocs: [],
        extras: [],
        unknownTags: [],
        skipped: [],
    };

    const hasPeople = people.length > 0;
    const sheets = [
        // The attendance sheet keeps all its pages in one file, ready to print
        { label: 'Attendance sheet', file: 'Attendance_Sheet', template: hasPeople ? attendance : null, slots: ATTENDANCE_SLOTS, oneFile: true },
        { label: 'Address labels', file: 'Address_Labels', template: hasPeople ? labels : null, slots: LABEL_SLOTS, oneFile: false },
    ].filter(s => s.template);
    const sicapGroups = hasPeople && sicap ? groupByCourseRun(people) : [];
    const extras = hasPeople ? extraFiles : [];
    const combinedCount = combined && hasPeople && templates.length > 0 ? people.length : 0;
    const total = templates.length * people.length + combinedCount + sheets.length + sicapGroups.length + extras.length;
    const studentDocs: ArrayBuffer[][] = people.map(() => []);

    let done = 0;
    let lastYield = performance.now();
    const tick = async () => {
        onProgress?.(++done, total);
        if (performance.now() - lastYield > YIELD_EVERY_MS) {
            // Keep the page (or the worker's message queue) responsive during long runs
            await yieldToEventLoop();
            lastYield = performance.now();
        }
        if (signal?.aborted) throw abortError();
    };
    if (signal?.aborted) throw abortError();

    const usedFolders = new Set<string>(combinedCount > 0 ? [COMBINED_FOLDER.toLowerCase()] : []);
    const uniqueFolder = (rawName: string): string => {
        const base = safeFileName(rawName.replace(/\.docx$/i, ''), 'Template');
        let candidate = base;
        for (let n = 2; usedFolders.has(candidate.toLowerCase()); n++) candidate = `${base}_${n}`;
        usedFolders.add(candidate.toLowerCase());
        return `${candidate}/`;
    };

    // ── One document per student per template ──
    for (const tpl of templates) {
        const skip = async (message: string) => {
            result.failedTemplates.push({ name: tpl.name, error: message });
            for (let i = 0; i < people.length; i++) await tick();
        };
        if (!tpl.buffer) { await skip(tpl.error || 'Download failed'); continue; }

        // Check the template up front: a broken one fails as a whole, not once per student.
        // docxtemplater renders a compiled document only once, so each student still gets a fresh compile.
        try {
            createDoc(libs, tpl.buffer);
        } catch (err) {
            await skip(describeDocxError(err));
            continue;
        }

        // Archive layout: one folder per template with a file per person, the combined per-student
        // files in Combined/; group files (attendance sheet, labels, SICAP form, Participants.xlsx) sit at the top
        const folder = uniqueFolder(tpl.name);
        const missing = new Set<string>();
        let templateOk = true;

        for (let i = 0; i < people.length; i++) {
            const enrollment = people[i];
            const s = enrollment.students!;
            try {
                const data = personData(enrollment);
                const file = renderDoc(createDoc(libs, tpl.buffer, missing), data);
                const name = `${safeFileName(s.first_name || '')}_${safeFileName(s.last_name || '')}.docx`;
                zip.file(uniquePath(usedPaths, folder + name), file);
                if (combined) studentDocs[i].push(file);
                result.totalDocs++;
            } catch (err) {
                templateOk = false;
                result.failedDocs.push({ student: fullName(s) || 'Unknown', template: tpl.name, error: describeDocxError(err) });
            }
            await tick();
        }

        if (templateOk) result.successTemplates.push(tpl.name);
        if (missing.size) result.unknownTags.push({ template: tpl.name, tags: [...missing].sort() });
    }

    // ── One combined document per student with all their rendered templates ──
    if (combinedCount > 0) {
        let made = 0;
        const errors: string[] = [];
        for (let i = 0; i < people.length; i++) {
            const s = people[i].students!;
            const docs = studentDocs[i];
            if (docs.length > 0) {
                try {
                    const merged = mergeStudentDocs(libs, docs);
                    const name = `${safeFileName(s.first_name || '')}_${safeFileName(s.last_name || '')}.docx`;
                    zip.file(uniquePath(usedPaths, `${COMBINED_FOLDER}/${name}`), merged);
                    made++;
                } catch (err) {
                    errors.push(`${fullName(s) || 'Unknown'}: ${describeDocxError(err)}`);
                }
            }
            await tick();
        }
        if (made > 0) {
            result.extras.push({
                label: `${made} combined student file${made !== 1 ? 's' : ''} — all templates per person`,
                ok: true,
                files: 1,
            });
        }
        if (errors.length > 0) {
            result.extras.push({
                label: 'Combined student files',
                ok: false,
                files: 0,
                error: errors.slice(0, 3).join('; ') + (errors.length > 3 ? ` (+${errors.length - 3} more)` : ''),
            });
        }
    }

    // ── Attendance sheet / address labels: one file per page of numbered slots ──
    for (const sheet of sheets) {
        const { buffer, error } = sheet.template!;
        if (!buffer) {
            result.extras.push({ label: sheet.label, ok: false, files: 0, error: error || 'Download failed' });
        } else {
            try {
                const usesLoop = createDoc(libs, buffer).getFullText().includes(`{#${SHEET_LOOP}}`);
                const pages = buildSheetPages(people, usesLoop ? null : sheet.slots, today, personDates, context);
                const sheetDates = sheetDateValues(dateVariables, people, today);
                const missing = new Set<string>();
                if (sheet.oneFile && pages.length > 1) {
                    const file = renderPagesInOneFile(libs, buffer, pages.map(page => ({ ...page, ...customVariables, ...sheetDates })), missing);
                    zip.file(uniquePath(usedPaths, `${sheet.file}.docx`), file);
                } else {
                    pages.forEach((page, i) => {
                        const file = renderDoc(createDoc(libs, buffer, missing), { ...page, ...customVariables, ...sheetDates });
                        const suffix = pages.length > 1 ? `_${i + 1}_of_${pages.length}` : '';
                        zip.file(uniquePath(usedPaths, `${sheet.file}${suffix}.docx`), file);
                    });
                }
                result.extras.push({ label: sheet.label, ok: true, files: pages.length });
                if (missing.size) result.unknownTags.push({ template: sheet.label, tags: [...missing].sort() });
            } catch (err) {
                result.extras.push({ label: sheet.label, ok: false, files: 0, error: describeDocxError(err) });
            }
        }
        await tick();
    }

    // ── SICAP course form: one file per course date, with every participant page in it ──
    if (sicapGroups.length > 0) {
        const label = 'SICAP course form';
        const { buffer, error } = sicap!;
        let setupError = buffer ? null : error || 'Download failed';
        let usesPageLoop = false;
        let usesRowLoop = false;
        if (buffer) {
            try {
                const text = createDoc(libs, buffer).getFullText();
                usesPageLoop = text.includes(`{#${SICAP_PAGE_LOOP}}`);
                usesRowLoop = text.includes(`{#${SHEET_LOOP}}`);
            } catch (err) {
                setupError = describeDocxError(err);
            }
        }
        const missing = new Set<string>();
        const errors: string[] = [];
        let made = 0;
        for (const group of sicapGroups) {
            if (buffer && !setupError) {
                const run = courseRun(group, context.sessions);
                const course = group[0].courses?.name || 'Course';
                const fileName = sicapGroups.length === 1
                    ? 'SICAP_Course_Form.docx'
                    : `SICAP_${safeFileName(course, 'Course')}_${run.last ? formatDateDMY(run.last).replace(/\//g, '-') : 'no_date'}.docx`;
                try {
                    const extra = { ...customVariables, ...sheetDateValues(dateVariables, group, today) };
                    let file: ArrayBuffer;
                    if (usesPageLoop) {
                        // The page loop copies the form's pictures: give every copy its own id
                        const doc = createDoc(libs, buffer, missing, [libs.fixDocPrCorruption]);
                        file = renderDoc(doc, { ...buildSicapData(group, today, context, personDates), ...extra });
                    } else if (usesRowLoop) {
                        file = renderDoc(createDoc(libs, buffer, missing), { ...buildSheetPages(group, null, today, personDates, context)[0], ...extra });
                    } else {
                        // No loop: the whole form repeats for every 9 people, in one file
                        const pages = buildSheetPages(group, SICAP_SLOTS, today, personDates, context).map(page => ({ ...page, ...extra }));
                        file = pages.length > 1 ? renderPagesInOneFile(libs, buffer, pages, missing) : renderDoc(createDoc(libs, buffer, missing), pages[0]);
                    }
                    zip.file(uniquePath(usedPaths, fileName), file);
                    made++;
                } catch (err) {
                    errors.push(`${course}${run.last ? ` ${formatDateDMY(run.last)}` : ''}: ${describeDocxError(err)}`);
                }
            }
            await tick();
        }
        if (setupError) result.extras.push({ label, ok: false, files: 0, error: setupError });
        if (made > 0) result.extras.push({ label: made > 1 ? `${made} SICAP course forms — one per course date` : label, ok: true, files: 1 });
        if (errors.length > 0) result.extras.push({ label, ok: false, files: 0, error: errors.slice(0, 3).join('; ') + (errors.length > 3 ? ` (+${errors.length - 3} more)` : '') });
        if (missing.size) result.unknownTags.push({ template: label, tags: [...missing].sort() });
    }

    // ── Ready-made files (Participants.xlsx) ──
    for (const extra of extras) {
        if (extra.buffer) {
            zip.file(uniquePath(usedPaths, extra.path), extra.buffer);
            result.extras.push({ label: extra.label, ok: true, files: 1 });
        } else {
            result.extras.push({ label: extra.label, ok: false, files: 0, error: extra.error || 'Not created' });
        }
        await tick();
    }

    // Entries (.docx/.xlsx) are already deflated, so the outer archive just stores them
    // (PizZip's default) — no point compressing twice.
    return { zip: zip.generate({ type: 'arraybuffer' }), result };
}

// ─── Archive tree planning & single-file Live Preview ───────

export interface PlannedFolder {
    name: string;
    kind: 'template' | 'combined';
    files: string[];
}

export interface PlannedTopFile {
    name: string;
    kind: 'attendance' | 'labels' | 'sicap' | 'excel';
    note?: string;
}

export interface PlannedArchiveTree {
    folders: PlannedFolder[];
    topFiles: PlannedTopFile[];
    totalFiles: number;
}

/** Predict the exact folders and files a ZIP generation run will produce (pure & synchronous). */
export function planArchivePaths(options: {
    enrollments: EnrollmentWithRelations[];
    templateNames: string[];
    combined: boolean;
    includeAttendance: boolean;
    includeLabels: boolean;
    includeSicap: boolean;
    includeExcel: boolean;
    excelColumnCount?: number;
    context?: DocContext;
}): PlannedArchiveTree {
    const people = sortBySurname(options.enrollments.filter(e => e.students));
    const hasPeople = people.length > 0;
    const combinedOn = options.combined && hasPeople && options.templateNames.length > 0;
    const usedFolders = new Set<string>(combinedOn ? [COMBINED_FOLDER.toLowerCase()] : []);
    const usedPaths = new Set<string>();

    const folders: PlannedFolder[] = [];
    for (const rawName of options.templateNames) {
        const base = safeFileName(rawName.replace(/\.docx$/i, ''), 'Template');
        let folderName = base;
        for (let n = 2; usedFolders.has(folderName.toLowerCase()); n++) folderName = `${base}_${n}`;
        usedFolders.add(folderName.toLowerCase());
        const files: string[] = [];
        for (const e of people) {
            const s = e.students!;
            const file = `${safeFileName(s.first_name || '')}_${safeFileName(s.last_name || '')}.docx`;
            const full = uniquePath(usedPaths, `${folderName}/${file}`);
            files.push(full.slice(folderName.length + 1));
        }
        folders.push({ name: folderName, kind: 'template', files });
    }

    if (combinedOn) {
        const files: string[] = [];
        for (const e of people) {
            const s = e.students!;
            const file = `${safeFileName(s.first_name || '')}_${safeFileName(s.last_name || '')}.docx`;
            const full = uniquePath(usedPaths, `${COMBINED_FOLDER}/${file}`);
            files.push(full.slice(COMBINED_FOLDER.length + 1));
        }
        folders.push({ name: COMBINED_FOLDER, kind: 'combined', files });
    }

    const topFiles: PlannedTopFile[] = [];
    if (hasPeople && options.includeAttendance) {
        const pages = Math.max(1, Math.ceil(people.length / ATTENDANCE_SLOTS));
        topFiles.push({
            name: uniquePath(usedPaths, 'Attendance_Sheet.docx'),
            kind: 'attendance',
            note: pages > 1 ? `${pages} pages in 1 file` : undefined,
        });
    }
    if (hasPeople && options.includeLabels) {
        const pages = Math.max(1, Math.ceil(people.length / LABEL_SLOTS));
        for (let i = 0; i < pages; i++) {
            const suffix = pages > 1 ? `_${i + 1}_of_${pages}` : '';
            topFiles.push({
                name: uniquePath(usedPaths, `Address_Labels${suffix}.docx`),
                kind: 'labels',
            });
        }
    }
    if (hasPeople && options.includeSicap) {
        const groups = groupByCourseRun(people);
        for (const group of groups) {
            const run = courseRun(group, options.context?.sessions);
            const course = group[0].courses?.name || 'Course';
            const name = groups.length === 1
                ? 'SICAP_Course_Form.docx'
                : `SICAP_${safeFileName(course, 'Course')}_${run.last ? formatDateDMY(run.last).replace(/\//g, '-') : 'no_date'}.docx`;
            const pages = Math.max(1, Math.ceil(group.length / SICAP_SLOTS));
            topFiles.push({
                name: uniquePath(usedPaths, name),
                kind: 'sicap',
                note: pages > 1 ? `${pages} participant pages` : undefined,
            });
        }
    }
    if (hasPeople && options.includeExcel) {
        topFiles.push({
            name: uniquePath(usedPaths, 'Participants.xlsx'),
            kind: 'excel',
            note: options.excelColumnCount ? `${options.excelColumnCount} column${options.excelColumnCount !== 1 ? 's' : ''}` : undefined,
        });
    }

    const totalFiles = folders.reduce((sum, f) => sum + f.files.length, 0) + topFiles.length;
    return { folders, topFiles, totalFiles };
}

/** Realistic sample participant for previewing templates when no real student is selected. */
export function makeSampleEnrollment(courseName = 'Manual Handling'): EnrollmentWithRelations {
    const today = todayISO();
    return {
        id: 'preview-sample',
        student_id: 'preview-sample-student',
        course_id: 'preview-sample-course',
        status: 'confirmed',
        course_variant: 'English',
        notes: null,
        confirmed_date: today,
        confirmed_at: today,
        invited_date: today,
        invited_at: today,
        completed_date: null,
        completed_at: null,
        is_priority: false,
        response_days: null,
        created_at: today,
        updated_at: today,
        students: {
            id: 'preview-sample-student',
            first_name: 'Olena',
            last_name: 'Kovalenko',
            email: 'olena.kovalenko@example.com',
            phone: '087 123 4567',
            address: '12 Patrick Street, Cork',
            eircode: 'T12 AB34',
            dob: '1992-05-14',
        } as Student,
        courses: {
            id: 'preview-sample-course',
            name: courseName,
            created_at: today,
        },
    };
}

export interface SinglePreviewResult {
    buffer: ArrayBuffer;
    fileName: string;
    unknownTags: string[];
    blankFields: string[];
    tagCount: number;
}

export type SinglePreviewInput =
    | {
        kind: 'word';
        templateName: string;
        buffer: ArrayBuffer;
        enrollment: EnrollmentWithRelations;
        context?: DocContext;
        customVariables?: Record<string, string>;
        dateVariables?: DateVariable[];
        today?: string;
    }
    | {
        kind: 'combined';
        templates: { name: string; buffer: ArrayBuffer }[];
        enrollment: EnrollmentWithRelations;
        context?: DocContext;
        customVariables?: Record<string, string>;
        dateVariables?: DateVariable[];
        today?: string;
    }
    | {
        kind: 'attendance' | 'labels' | 'sicap';
        buffer: ArrayBuffer;
        enrollments: EnrollmentWithRelations[];
        context?: DocContext;
        customVariables?: Record<string, string>;
        dateVariables?: DateVariable[];
        today?: string;
    };

/**
 * Render one `.docx` on the fly for in-browser Live Preview and single-file download,
 * returning both the bytes and tag diagnostics (unknown tags vs known fields currently blank).
 */
export async function renderSinglePreview(input: SinglePreviewInput): Promise<SinglePreviewResult> {
    const libs = await loadDocxLibs();
    const today = input.today ?? todayISO();
    const context = input.context ?? {};
    const customVariables = input.customVariables ?? {};
    const dateVariables = input.dateVariables ?? [];

    const collectTags = (buf: ArrayBuffer): string[] => {
        const discovered = new Set<string>();
        try {
            createDoc(libs, buf, discovered).render({ [SHEET_LOOP]: [{}], [SICAP_PAGE_LOOP]: [{}] });
        } catch {
            // rendering below will surface any syntax error
        }
        return [...discovered].filter(t => t && !RESERVED_VARIABLE_KEYS.has(t));
    };

    const blankKeysFor = (tags: string[], data: Record<string, unknown>, missing: Set<string>): string[] => {
        const blanks: string[] = [];
        for (const tag of tags) {
            if (missing.has(tag)) continue;
            // Skip numbered participant slots (e.g. fullName12) which are expected to be blank for small groups
            if (/^[A-Za-z]+\d+$/.test(tag)) continue;
            const val = data[tag];
            if (typeof val === 'string' && val.trim() === '') blanks.push(tag);
        }
        return [...new Set(blanks)].sort();
    };

    if (input.kind === 'word') {
        const s = input.enrollment.students;
        const data = {
            ...buildPlaceholderData(input.enrollment, today, context),
            ...customVariables,
            ...dateVariableValues(dateVariables, input.enrollment, today),
        };
        const tags = collectTags(input.buffer);
        const missing = new Set<string>();
        const buffer = renderDoc(createDoc(libs, input.buffer, missing), data);
        const base = safeFileName(input.templateName.replace(/\.docx$/i, ''), 'Document');
        const person = `${safeFileName(s?.first_name || '')}_${safeFileName(s?.last_name || '')}`;
        return {
            buffer,
            fileName: `${base}_${person}.docx`,
            unknownTags: [...missing].sort(),
            blankFields: blankKeysFor(tags, data, missing),
            tagCount: tags.length,
        };
    }

    if (input.kind === 'combined') {
        const s = input.enrollment.students;
        const data = {
            ...buildPlaceholderData(input.enrollment, today, context),
            ...customVariables,
            ...dateVariableValues(dateVariables, input.enrollment, today),
        };
        const missing = new Set<string>();
        const allTags = new Set<string>();
        const rendered: ArrayBuffer[] = [];
        for (const tpl of input.templates) {
            for (const t of collectTags(tpl.buffer)) allTags.add(t);
            rendered.push(renderDoc(createDoc(libs, tpl.buffer, missing), data));
        }
        const buffer = mergeStudentDocs(libs, rendered);
        const person = `${safeFileName(s?.first_name || '')}_${safeFileName(s?.last_name || '')}`;
        const tagList = [...allTags];
        return {
            buffer,
            fileName: `Combined_${person}.docx`,
            unknownTags: [...missing].sort(),
            blankFields: blankKeysFor(tagList, data, missing),
            tagCount: tagList.length,
        };
    }

    // Attendance / Labels / SICAP
    const people = sortBySurname(input.enrollments.filter(e => e.students));
    const personDates = (e: EnrollmentWithRelations) => dateVariableValues(dateVariables, e, today);
    const sheetDates = sheetDateValues(dateVariables, people, today);
    const tags = collectTags(input.buffer);
    const missing = new Set<string>();

    if (input.kind === 'sicap') {
        const text = createDoc(libs, input.buffer).getFullText();
        const usesPageLoop = text.includes(`{#${SICAP_PAGE_LOOP}}`);
        const usesRowLoop = text.includes(`{#${SHEET_LOOP}}`);
        const extra = { ...customVariables, ...sheetDates };
        let buffer: ArrayBuffer;
        let sampleData: Record<string, unknown>;
        if (usesPageLoop) {
            sampleData = { ...buildSicapData(people, today, context, personDates), ...extra };
            buffer = renderDoc(createDoc(libs, input.buffer, missing, [libs.fixDocPrCorruption]), sampleData);
        } else if (usesRowLoop) {
            sampleData = { ...buildSheetPages(people, null, today, personDates, context)[0], ...extra };
            buffer = renderDoc(createDoc(libs, input.buffer, missing), sampleData);
        } else {
            const pages = buildSheetPages(people, SICAP_SLOTS, today, personDates, context).map(p => ({ ...p, ...extra }));
            sampleData = pages[0] ?? extra;
            buffer = pages.length > 1 ? renderPagesInOneFile(libs, input.buffer, pages, missing) : renderDoc(createDoc(libs, input.buffer, missing), sampleData);
        }
        return {
            buffer,
            fileName: 'SICAP_Course_Form.docx',
            unknownTags: [...missing].sort(),
            blankFields: blankKeysFor(tags, sampleData, missing),
            tagCount: tags.length,
        };
    }

    const slots = input.kind === 'attendance' ? ATTENDANCE_SLOTS : LABEL_SLOTS;
    const usesLoop = createDoc(libs, input.buffer).getFullText().includes(`{#${SHEET_LOOP}}`);
    const pages = buildSheetPages(people, usesLoop ? null : slots, today, personDates, context).map(p => ({
        ...p,
        ...customVariables,
        ...sheetDates,
    }));
    const buffer = pages.length > 1
        ? renderPagesInOneFile(libs, input.buffer, pages, missing)
        : renderDoc(createDoc(libs, input.buffer, missing), pages[0]);
    return {
        buffer,
        fileName: input.kind === 'attendance' ? 'Attendance_Sheet.docx' : 'Address_Labels.docx',
        unknownTags: [...missing].sort(),
        blankFields: blankKeysFor(tags, pages[0] ?? {}, missing),
        tagCount: tags.length,
    };
}

