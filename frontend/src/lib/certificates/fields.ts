// ─── Certificates: the fields of a template and the people it is filled in for ───
// A template's tags become the page's fields. Names are different for each person; anything
// else (date, tutor) is the same on every certificate unless it is switched to "each person".

import { safeFileName } from '../documentRender';
import { addMonths, countUp, courseDateTag, formatCertDate, formatCertMonth, isExpiryTag, isMonthTag, isNumberTag, parseCertDate } from './dates';

/** Tags that name the person: different on each certificate from the start */
const NAME_TAGS = ['firstName', 'lastName', 'fullName', 'name'];

const LABELS: Record<string, string> = {
    firstName: 'First name',
    lastName: 'Last name',
    fullName: 'Full name',
    name: 'Name',
    courseDate: 'Course date',
    confirmedDate: 'Course date',
    courseMonth: 'Course month',
    courseTitle: 'Course',
    expire: 'Expiry date',
    expiry: 'Expiry date',
    expiryDate: 'Expiry date',
    certNo: 'Certificate number',
    certNumber: 'Certificate number',
    certificateNumber: 'Certificate number',
    tutor: 'Tutor',
    today: 'Date',
};

/** "courseMonth" → "Course month", "venue_name" → "Venue name" */
export function fieldLabel(tag: string): string {
    if (LABELS[tag]) return LABELS[tag];
    const words = tag
        .replace(/[_-]+/g, ' ')
        .replace(/([a-z\d])([A-Z])/g, '$1 $2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
        .trim()
        .toLowerCase();
    return words ? words.charAt(0).toUpperCase() + words.slice(1) : tag;
}

/** What the page asks for, worked out from the template's tags */
export interface TemplateFields {
    /** Typed in for each person, in the order of the table's columns */
    columns: string[];
    /** The same on every certificate unless switched to each person */
    shared: string[];
    /**
     * Worked out, not typed: {fullName} from the first and last name; the course month from the
     * course date; the expiry date from the course date and how long the certificate is valid
     */
    derived: string[];
    /** Typed once as the first person's, then counted up: the certificate number */
    numbered: string[];
    /** The tag of the course date the month and expiry count from */
    courseDate?: string;
    /** How long the certificate is valid for, when the expiry date is worked out */
    validityMonths: number | null;
}

/**
 * The fields for a template's tags. `perPerson`: the tags switched to "each person" (the name
 * tags are, from the start). {fullName} next to {firstName} / {lastName} is made from them,
 * {courseMonth} from the course date, and the expiry date too once `validityMonths` is set.
 */
export function templateFields(tags: string[], perPerson: ReadonlySet<string>, validityMonths: number | null = null): TemplateFields {
    const hasParts = tags.includes('firstName') || tags.includes('lastName');
    const courseDate = courseDateTag(tags);
    const derived = [
        ...(hasParts && tags.includes('fullName') ? ['fullName'] : []),
        ...(courseDate ? tags.filter(t => isMonthTag(t) && !perPerson.has(t)) : []),
        ...(courseDate && validityMonths ? tags.filter(t => isExpiryTag(t) && !perPerson.has(t)) : []),
    ];
    const asked = tags.filter(t => !derived.includes(t));
    // First and last name side by side, first, when the template has either
    const parts = ['firstName', 'lastName'].filter(t => tags.includes(t));
    const columns = [...parts, ...asked.filter(t => !parts.includes(t) && perPerson.has(t))];
    const shared = asked.filter(t => !columns.includes(t));
    return {
        columns,
        shared,
        derived,
        numbered: shared.filter(isNumberTag),
        courseDate,
        validityMonths: courseDate && derived.some(isExpiryTag) ? validityMonths : null,
    };
}

/** The tags that start out as "each person": the ones naming the person */
export function initialPerPerson(tags: string[]): Set<string> {
    return new Set(tags.filter(t => NAME_TAGS.includes(t)));
}

export interface PersonRow {
    id: string;
    values: Record<string, string>;
}

let rowCount = 0;
export function newRow(values: Record<string, string> = {}): PersonRow {
    return { id: `row-${Date.now().toString(36)}-${++rowCount}`, values };
}

/** A row with nothing typed in it is not a person */
export function isBlankRow(row: PersonRow, columns: string[]): boolean {
    return columns.every(c => !(row.values[c] ?? '').trim());
}

/**
 * People from pasted text, one per line. Cells copied from Excel (tab between them) go into the
 * columns in order; a plain line ("Mary O'Brien") is split at the first space when the first
 * two columns are first and last name.
 */
export function parsePeople(text: string, columns: string[]): Record<string, string>[] {
    const splitName = columns[0] === 'firstName' && columns[1] === 'lastName';
    return text
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map(line => line.replace(/\u00a0/g, ' '))
        .filter(line => line.trim())
        .map(line => {
            let cells = line.includes('\t') ? line.split('\t') : [line];
            if (cells.length === 1 && splitName) {
                const words = cells[0].trim().split(/\s+/);
                cells = [words[0], words.slice(1).join(' ')];
            }
            const values: Record<string, string> = {};
            columns.forEach((c, i) => {
                const v = (cells[i] ?? '').trim().replace(/\s+/g, ' ');
                if (v) values[c] = v;
            });
            return values;
        })
        .filter(values => Object.keys(values).length > 0);
}

/** The rows as they will be, with the pasted people put in from `at` (row, column) on */
export function pasteInto(rows: PersonRow[], columns: string[], text: string, row: number, col: number): PersonRow[] {
    const people = parsePeople(text, columns.slice(col));
    const next = rows.map(r => ({ ...r, values: { ...r.values } }));
    people.forEach((values, i) => {
        const target = next[row + i] ?? (next[row + i] = newRow());
        for (const c of columns.slice(col)) target.values[c] = values[c] ?? '';
    });
    return next;
}

/** The values one certificate is filled with; `index`: the person's place, for the numbers */
export function personData(row: PersonRow | null, fields: TemplateFields, shared: Record<string, string>, index = 0): Record<string, string> {
    const data: Record<string, string> = {};
    for (const tag of fields.shared) data[tag] = (shared[tag] ?? '').trim();
    for (const tag of fields.numbered) data[tag] = data[tag] && countUp(data[tag], index);
    for (const tag of fields.columns) data[tag] = (row?.values[tag] ?? '').trim();
    const course = fields.courseDate ? parseCertDate(data[fields.courseDate]) : null;
    for (const tag of fields.derived) {
        if (tag === 'fullName') data.fullName = [data.firstName, data.lastName].filter(Boolean).join(' ');
        else if (isMonthTag(tag)) data[tag] = course ? formatCertMonth(course) : '';
        else if (isExpiryTag(tag)) data[tag] = course && fields.validityMonths ? formatCertDate(addMonths(course, fields.validityMonths)) : '';
    }
    return data;
}

/** "Mary_O'Brien" from the person's name, or the first value typed for them */
export function personFileBase(data: Record<string, string>, columns: string[], index: number): string {
    const name = data.fullName || [data.firstName, data.lastName].filter(Boolean).join(' ') || data.name || columns.map(c => data[c]).find(Boolean) || '';
    return safeFileName(name, `Certificate_${index + 1}`);
}

/** Adds _2, _3 … so two people with the same name get a file each */
export function uniqueNames(bases: string[]): string[] {
    const seen = new Map<string, number>();
    return bases.map(base => {
        const key = base.toLowerCase();
        const n = (seen.get(key) ?? 0) + 1;
        seen.set(key, n);
        return n === 1 ? base : `${base}_${n}`;
    });
}
