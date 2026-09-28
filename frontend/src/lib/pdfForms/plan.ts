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
        return { value: { kind: 'text', text }, notes: bad.length ? [`Can't read the date ${bad.map(b => `"${b}"`).join(', ')}; left empty`] : [] };
    }

    const result = matchChoice(field, text);
    const notes: string[] = [];
    if (result.unmatched.length > 0) {
        notes.push(`No box matches ${result.unmatched.map(a => `"${a.length > 60 ? `${a.slice(0, 57)}…` : a}"`).join(', ')}`);
    }
    if (result.dropped.length > 0) {
        const first = field.options.find(o => o.id === result.ticked[0])?.label ?? '';
        notes.push(`One option only: ticked "${first}", left out ${result.dropped.map(a => `"${a}"`).join(', ')}`);
    }
    return { value: { kind: 'choice', ticked: result.ticked }, notes };
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
    const withColumn = fields.filter(f => f.kind === 'text' && sourceColumns(f.source).length > 0);
    // Named after the first text field; a person's form after "First Last"
    const firstText = withColumn[0];
    const lastName = withColumn.find(f => /\b(last name|surname)\b/i.test(f.name));
    const defaultName = firstText && lastName && /\bfirst name\b/i.test(firstText.name) ? `${firstText.source} ${lastName.source}` : firstText?.source ?? '';
    const namePattern = settings.fileName.trim() || defaultName;

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

        const title = (defaultName ? evaluateSource(defaultName, ctx) : '') || `Row ${rowNumber}`;
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
