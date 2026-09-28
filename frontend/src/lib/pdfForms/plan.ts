// ─── From spreadsheet rows to what each filled form will contain ─────

import { matchChoice } from './choice';
import type { FieldValue, RowValues } from './fill';
import { evaluateSource, sourceColumns, unreadableDates, type ColumnMatch, type EvalContext } from './source';
import type { FormField, SheetData, TemplateSettings } from './types';

export interface RowNote {
    fieldId: string;
    field: string;
    message: string;
}

export interface RowPlan {
    /** Index into sheet.rows */
    index: number;
    /** Row number in the spreadsheet (header row included), for people to find it */
    rowNumber: number;
    title: string;
    fileName: string;
    values: RowValues;
    notes: RowNote[];
}

/** Every column header a template reads (fields and the file-name pattern) */
export function templateColumns(fields: FormField[], settings: TemplateSettings): string[] {
    const all = [...fields.map(f => f.source), settings.fileName].flatMap(sourceColumns);
    return [...new Set(all)];
}

const UNSAFE_FILE_CHARS = /[\\/:*?"<>|]+/g;

export function safeFileName(value: string, max = 80): string {
    const printable = [...value].map(ch => (ch.charCodeAt(0) < 0x20 ? ' ' : ch)).join('');
    return printable.replace(UNSAFE_FILE_CHARS, ' ').replace(/\s+/g, ' ').trim().slice(0, max).trim();
}

export function computeValue(field: FormField, ctx: EvalContext): { value: FieldValue; notes: string[] } {
    const text = evaluateSource(field.source, ctx);
    if (field.kind === 'text') {
        const bad = unreadableDates(field.source, ctx);
        return { value: { kind: 'text', text }, notes: bad.length ? [`The date ${bad.map(b => `“${b}”`).join(', ')} doesn’t look right, so it's left blank to fill in by hand`] : [] };
    }

    const result = matchChoice(field, text);
    const notes: string[] = [];
    if (result.unmatched.length > 0) {
        notes.push(`No box on the form for ${result.unmatched.map(a => `“${a.length > 60 ? `${a.slice(0, 57)}…` : a}”`).join(', ')}, so none is ticked`);
    }
    if (result.dropped.length > 0) {
        const first = field.options.find(o => o.id === result.ticked[0])?.label ?? '';
        notes.push(`The form allows one answer: “${first}” is ticked, not ${result.dropped.map(a => `“${a}”`).join(', ')}`);
    }
    return { value: { kind: 'choice', ticked: result.ticked }, notes };
}

const DATE_PART = / \((day|month|year)\)$/;
const DATE_FILTER = /\|(dd|mm|yy|yyyy|date)\b/;
const ORG_NAME = /\b(co|org|organisation|organization|group|company|club)\b.*\bname\b|\bname of\b/i;

/**
 * What forms are named after when the form doesn't say ("Each form is named after"):
 * a group's name, else "First Last", else another name field, else the first text field.
 * Dates and parts of dates never name a form.
 */
export function defaultNamePattern(fields: FormField[]): string {
    const candidates = fields.filter(
        f => f.kind === 'text' && sourceColumns(f.source).length > 0 && !DATE_PART.test(f.name) && !DATE_FILTER.test(f.source),
    );
    const org = candidates.find(f => ORG_NAME.test(f.name));
    if (org) return org.source;
    const first = candidates.find(f => /\bfirst name\b|\bforename\b/i.test(f.name));
    const last = candidates.find(f => /\b(last name|surname)\b/i.test(f.name));
    if (first && last) return `${first.source} ${last.source}`;
    return (candidates.find(f => /\bname\b/i.test(f.name)) ?? first ?? candidates[0])?.source ?? '';
}

export function planRows(
    fields: FormField[],
    settings: TemplateSettings,
    sheet: SheetData,
    columns: Map<string, ColumnMatch>,
    templateName: string,
    opts: { today?: Date; user?: string } = {},
): RowPlan[] {
    const usedNames = new Map<string, number>();
    const namePattern = settings.fileName.trim() || defaultNamePattern(fields);

    return sheet.rows.map((row, index) => {
        const rowNumber = sheet.rowNumbers?.[index] ?? index + 2;
        const ctx: EvalContext = { row, columns, rowNumber, today: opts.today, user: opts.user };
        const values: RowValues = {};
        const notes: RowNote[] = [];
        for (const field of fields) {
            const { value, notes: fieldNotes } = computeValue(field, ctx);
            values[field.id] = value;
            // Day / month / year boxes of one date share their warning
            fieldNotes.forEach(message => {
                if (!notes.some(n => n.message === message)) notes.push({ fieldId: field.id, field: field.name.replace(/ \((day|month|year)\)$/, ''), message });
            });
        }

        const title = (namePattern ? evaluateSource(namePattern, ctx) : '') || `Row ${rowNumber}`;
        let base = safeFileName(namePattern ? evaluateSource(namePattern, ctx) : '') || safeFileName(`${templateName} ${rowNumber}`) || `form ${rowNumber}`;
        const seen = usedNames.get(base.toLowerCase()) ?? 0;
        usedNames.set(base.toLowerCase(), seen + 1);
        if (seen > 0) base = `${base} (${seen + 1})`;

        return { index, rowNumber, title, fileName: `${base}.pdf`, values, notes };
    });
}

/** Apply manual edits from the review screen; an edited field's notes no longer apply */
export function applyOverrides(plan: RowPlan, overrides: RowValues | undefined): RowPlan {
    if (!overrides || Object.keys(overrides).length === 0) return plan;
    return {
        ...plan,
        values: { ...plan.values, ...overrides },
        notes: plan.notes.filter(n => !(n.fieldId in overrides)),
    };
}
