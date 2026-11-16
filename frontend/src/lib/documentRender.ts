// Pure .docx rendering: no Supabase, no DOM. Runs inside documentWorker.ts, or on the main
// thread when a worker is not available (tests, very old browsers).
// pizzip / docxtemplater are imported dynamically so they stay out of the main bundle.
import type { Student, Course, Enrollment } from './types';
import { cleanVariant, fullName } from './types';
import { formatDateLong, formatDateDMY, todayISO } from './dateUtils';
import { loadChunk } from './deployRecovery';

/** Enrollment with joined student and course data (from Supabase select with joins). */
export interface EnrollmentWithRelations extends Enrollment {
    students: Student | null;
    courses: Course | null;
}

export const MAX_TEMPLATE_BYTES = 5 * 1024 * 1024;
/** Numbered slots ({firstName1} … {firstName34}) on one attendance sheet / label page. */
export const ATTENDANCE_SLOTS = 34;
export const LABEL_SLOTS = 28;
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

/** Custom variable names must work as a docxtemplater tag: `{Tutor}`, `{venue_name}`. */
export function validateVariableKey(key: string): string | null {
    if (!key) return 'Variable name is required';
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return 'Use letters, digits and _ only, starting with a letter (e.g. Tutor, venue_name)';
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


export function buildPlaceholderData(enrollment: EnrollmentWithRelations, today: string = todayISO()): Record<string, string> {
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
function courseFields(people: EnrollmentWithRelations[], today: string) {
    const dates = [...new Set(people.map(courseDateOf).filter((d): d is string => !!d))].sort();
    return {
        courseTitle: distinct(people.map(e => e.courses?.name || '')),
        courseVariant: distinct(people.map(e => cleanVariant(e.courses?.name || '', e.course_variant))),
        courseDate: dates.map(d => formatDateLong(d)).join(', '),
        today: formatDateLong(today),
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
): Record<string, unknown>[] {
    const people = sortBySurname(enrollments.filter(e => e.students));
    const pageSize = slots ?? Math.max(people.length, 1);
    const pageCount = Math.max(1, Math.ceil(people.length / pageSize));
    const common = {
        ...courseFields(people, today),
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

export type TemplateKind = 'document' | 'attendance' | 'labels';

export interface TemplateCheck {
    /** Syntax errors: the template cannot be rendered at all. */
    error?: string;
    /** Tags with no matching placeholder or custom variable — they would print blank. */
    unknownTags: string[];
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

/** Dry-run a template against sample data, so problems surface at upload rather than at generation. */
export async function checkTemplateBuffer(template: ArrayBuffer, kind: TemplateKind, customVariables: Record<string, string> = {}): Promise<TemplateCheck> {
    const libs = await loadDocxLibs();
    const missing = new Set<string>();
    try {
        const sample: Record<string, unknown> = kind === 'document'
            ? Object.fromEntries([...PLACEHOLDER_KEYS].map(k => [k, 'x']))
            : buildSheetPages([sampleParticipant()], kind === 'attendance' ? ATTENDANCE_SLOTS : LABEL_SLOTS)[0];
        renderDoc(createDoc(libs, template, missing), { ...sample, ...customVariables });
    } catch (err) {
        return { error: describeDocxError(err), unknownTags: [] };
    }
    return { unknownTags: [...missing].sort() };
}

// ─── Archive ────────────────────────────────────────────────

/** Keeps letters of any alphabet (Seán, Олена), drops characters that are unsafe in file names. */
export function safeFileName(name: string, fallback = 'Unknown'): string {
    const cleaned = name
        .normalize('NFC')
        .replace(/[^\p{L}\p{M}\p{N}_.\-\s']/gu, '')
        .trim()
        .replace(/\s+/g, '_');
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

/** Ensure a section-break `<w:sectPr>` starts on a new page rather than continuing inline. */
function toNextPageSectPr(sectPr: string): string {
    if (/^<w:sectPr\s*\/>$/.test(sectPr)) return sectPr;
    if (/<w:type\b[^>]*\/>/.test(sectPr)) {
        return sectPr.replace(/<w:type\b[^>]*\/>/g, '<w:type w:val="nextPage"/>');
    }
    return sectPr;
}

/** Normalize a zip path like `word/../media/img.png` to `media/img.png`. */
function resolveWordTarget(target: string): string {
    if (target.startsWith('/')) return target.slice(1);
    const parts = `word/${target}`.split('/');
    const out: string[] = [];
    for (const p of parts) {
        if (!p || p === '.') continue;
        if (p === '..') out.pop();
        else out.push(p);
    }
    return out.join('/');
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

/**
 * Merge multiple rendered `.docx` files for one student into a single `.docx`, one template after
 * another on new pages. Preserves images/relationships, styles, and per-template page setup.
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

        // 1. Merge any missing xmlns declarations onto <w:document>
        for (const m of part.docOpen.matchAll(/\s(xmlns(?::[A-Za-z0-9_-]+)?)=("[^"]*"|'[^']*')/g)) {
            const [, attrName, attrVal] = m;
            if (!new RegExp(`\\s${attrName}=`).test(docOpen)) {
                docOpen = docOpen.replace(/>$/, ` ${attrName}=${attrVal}>`);
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
                        const sTarget = /\bTarget="([^"]+)"/.exec(sAttrs)?.[1];
                        const sMode = /\bTargetMode="([^"]+)"/.exec(sAttrs)?.[1];
                        if (!sTarget || sMode === 'External') continue;
                        const oldSubTargetPath = resolveWordTarget(sTarget);
                        const subTargetEntry = otherZip.file(oldSubTargetPath);
                        if (subTargetEntry) {
                            const newSubTargetPath = prefixPathFile(oldSubTargetPath, prefix);
                            baseZip.file(newSubTargetPath, subTargetEntry.asArrayBuffer());
                            subRelsText = subRelsText.replace(`Target="${sTarget}"`, `Target="${toWordTarget(newSubTargetPath)}"`);
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

        // 3. Merge missing styles from word/styles.xml
        const otherStylesXml = otherZip.file('word/styles.xml')?.asText();
        if (otherStylesXml) {
            if (!baseStylesXml) {
                baseStylesXml = otherStylesXml;
            } else {
                const existingIds = new Set([...baseStylesXml.matchAll(/\bw:styleId="([^"]+)"/g)].map(m => m[1]));
                const toAdd: string[] = [];
                for (const sm of otherStylesXml.matchAll(/<w:style\b[^>]*\bw:styleId="([^"]+)"[\s\S]*?<\/w:style>/g)) {
                    if (!existingIds.has(sm[1])) {
                        existingIds.add(sm[1]);
                        toAdd.push(sm[0].replace(/\s+w:default="(?:1|true)"/g, ''));
                    }
                }
                if (toAdd.length > 0) {
                    baseStylesXml = baseStylesXml.replace(/<\/w:styles>\s*$/, `${toAdd.join('')}</w:styles>`);
                }
            }
        }

        parsed.push(part);
    }

    // 4. Join sections: use simple page breaks when all templates share the same page setup,
    // or per-template section breaks when page setup (size, orientation, margins, headers/footers) differs.
    const normSect = (s: string | null) => (!s || /^<w:sectPr\s*\/>$/.test(s) ? '' : s);
    const sameSectSetup = new Set(parsed.map(p => normSect(p.sectPr))).size <= 1;
    const pageBreakPara = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';

    let mergedBody: string;
    if (sameSectSetup) {
        mergedBody = parsed.map(p => p.content).join(pageBreakPara) + (parsed[parsed.length - 1].sectPr ?? '');
    } else {
        // Prevent headers/footers from an earlier template leaking into a later template that has none
        let seenHdrTypes = new Set<string>();
        let seenFtrTypes = new Set<string>();
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

        const isolateHeadersFooters = (sect: string | null): string => {
            let s = sect && !/^<w:sectPr\s*\/>$/.test(sect) ? sect : '<w:sectPr></w:sectPr>';
            const curHdrs = new Set([...s.matchAll(/<w:headerReference\b[^>]*\bw:type="([^"]+)"/g)].map(m => m[1]));
            const curFtrs = new Set([...s.matchAll(/<w:footerReference\b[^>]*\bw:type="([^"]+)"/g)].map(m => m[1]));
            const inject: string[] = [];
            for (const t of seenHdrTypes) {
                if (!curHdrs.has(t)) inject.push(`<w:headerReference w:type="${t}" r:id="${getBlankHdrRId()}"/>`);
            }
            for (const t of seenFtrTypes) {
                if (!curFtrs.has(t)) inject.push(`<w:footerReference w:type="${t}" r:id="${getBlankFtrRId()}"/>`);
            }
            seenHdrTypes = new Set([...seenHdrTypes, ...curHdrs]);
            seenFtrTypes = new Set([...seenFtrTypes, ...curFtrs]);
            if (inject.length > 0) {
                if (!/\sxmlns:r=/.test(docOpen)) {
                    docOpen = docOpen.replace(/>$/, ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">');
                }
                s = s.replace(/^<w:sectPr(\b[^>]*)>/, `<w:sectPr$1>${inject.join('')}`);
            }
            return s;
        };

        const chunks: string[] = [];
        for (let i = 0; i < parsed.length; i++) {
            const p = parsed[i];
            const sect = isolateHeadersFooters(p.sectPr);
            if (i < parsed.length - 1) {
                chunks.push(`${p.content}<w:p><w:pPr>${toNextPageSectPr(sect)}</w:pPr></w:p>`);
            } else {
                chunks.push(`${p.content}${sect}`);
            }
        }
        mergedBody = chunks.join('');
    }

    // 5. Ensure every drawing object has a unique id across the merged document
    let nextDocPrId = 1;
    mergedBody = mergedBody.replace(/<(wp:docPr|pic:cNvPr)\b([^>]*?)\bid="\d+"/g, (_m, tag: string, before: string) => `<${tag}${before}id="${nextDocPrId++}"`);

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
    extraFiles?: ExtraFile[];
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
    const { templates, attendance, labels, extraFiles = [], customVariables = {}, dateVariables = [], combined = false, today = todayISO() } = input;
    const personData = (e: EnrollmentWithRelations) => ({ ...buildPlaceholderData(e, today), ...customVariables, ...dateVariableValues(dateVariables, e, today) });
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
        { label: 'Attendance sheet', file: 'Attendance_Sheet', template: hasPeople ? attendance : null, slots: ATTENDANCE_SLOTS },
        { label: 'Address labels', file: 'Address_Labels', template: hasPeople ? labels : null, slots: LABEL_SLOTS },
    ].filter(s => s.template);
    const extras = hasPeople ? extraFiles : [];
    const combinedCount = combined && hasPeople && templates.length > 0 ? people.length : 0;
    const total = templates.length * people.length + combinedCount + sheets.length + extras.length;
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

        const base = safeFileName(tpl.name.replace(/\.docx$/i, ''), 'Template');
        // Archive layout: one folder per template with a file per person; combined per-student
        // files and group files (attendance sheet, labels, Participants.xlsx) sit at the top
        const folder = `${base}/`;
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
                    zip.file(uniquePath(usedPaths, name), merged);
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
                const pages = buildSheetPages(people, usesLoop ? null : sheet.slots, today, personDates);
                const sheetDates = sheetDateValues(dateVariables, people, today);
                const missing = new Set<string>();
                pages.forEach((page, i) => {
                    const file = renderDoc(createDoc(libs, buffer, missing), { ...page, ...customVariables, ...sheetDates });
                    const suffix = pages.length > 1 ? `_${i + 1}_of_${pages.length}` : '';
                    zip.file(uniquePath(usedPaths, `${sheet.file}${suffix}.docx`), file);
                });
                result.extras.push({ label: sheet.label, ok: true, files: pages.length });
                if (missing.size) result.unknownTags.push({ template: sheet.label, tags: [...missing].sort() });
            } catch (err) {
                result.extras.push({ label: sheet.label, ok: false, files: 0, error: describeDocxError(err) });
            }
        }
        await tick();
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
