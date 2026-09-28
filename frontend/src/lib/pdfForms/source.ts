// ─── Field values: `{Column}` placeholders, filters and column matching ─────
// A field's source is text with placeholders: "{Email Address}", "{Contact Name|first}",
// "{Date of Birth|dd}", "{today}", "{user}". Headers are matched loosely, so a spreadsheet with
// slightly different column names (or a new form export) still fills the same fields.

import { splitFullName } from '../contactImport';
import { HEADER_THRESHOLD, normalizeText, similarity } from './text';

const PLACEHOLDER_RE = /\{([^{}|]+)((?:\|[^{}|]*)*)\}/g;

export const SPECIAL_COLUMNS = ['today', 'row', 'user'] as const;

export const FILTERS: { key: string; label: string }[] = [
    { key: 'first', label: 'First name (from a full name)' },
    { key: 'last', label: 'Last name (from a full name)' },
    { key: 'phone', label: 'Phone: restore the leading 0 Excel drops' },
    { key: 'date', label: 'Date as dd/mm/yyyy' },
    { key: 'dd', label: 'Day (dd)' },
    { key: 'mm', label: 'Month (mm)' },
    { key: 'yyyy', label: 'Year (yyyy)' },
    { key: 'yy', label: 'Year (yy)' },
    { key: 'upper', label: 'UPPER CASE' },
    { key: 'lower', label: 'lower case' },
    { key: 'oneline', label: 'Join lines with commas' },
    { key: 'new', label: 'Only if not already in the text before it' },
];

const DATE_FILTERS = new Set(['date', 'dd', 'mm', 'yyyy', 'yy']);

export interface Placeholder {
    column: string;
    filters: string[];
}

export function parsePlaceholders(source: string): Placeholder[] {
    const out: Placeholder[] = [];
    for (const m of source.matchAll(PLACEHOLDER_RE)) {
        out.push({ column: m[1].trim(), filters: m[2].split('|').map(f => f.trim().toLowerCase()).filter(Boolean) });
    }
    return out;
}

function isSpecial(column: string): boolean {
    return (SPECIAL_COLUMNS as readonly string[]).includes(column.toLowerCase());
}

/** Spreadsheet columns a source refers to (without {today} / {row}) */
export function sourceColumns(source: string): string[] {
    return [...new Set(parsePlaceholders(source).map(p => p.column).filter(c => !isSpecial(c)))];
}

export function placeholderFor(column: string, filters: string[] = []): string {
    return `{${[column.replace(/[{}|]/g, ' ').replace(/\s+/g, ' ').trim(), ...filters].join('|')}}`;
}

// ─── Column matching ────────────────────────────────────────────

export interface ColumnMatch {
    /** Header as saved in the template */
    wanted: string;
    /** Index into the spreadsheet's headers, or null when not found */
    index: number | null;
    how: 'exact' | 'saved' | 'similar' | 'chosen' | 'missing';
    score: number;
}

/**
 * Match every header a template uses against a spreadsheet's headers:
 * exact (ignoring case/punctuation) → saved aliases → the most similar unused header.
 * `chosen` holds manual picks from this session (wanted → header index, -1 = leave empty).
 */
export function matchColumns(
    wanted: string[],
    headers: string[],
    aliases: Record<string, string[]> = {},
    chosen: Record<string, number> = {},
): Map<string, ColumnMatch> {
    const result = new Map<string, ColumnMatch>();
    const norm = headers.map(normalizeText);
    const used = new Set<number>();
    const pending: string[] = [];

    for (const w of [...new Set(wanted)]) {
        if (w in chosen) {
            const index = chosen[w] >= 0 && chosen[w] < headers.length ? chosen[w] : null;
            result.set(w, { wanted: w, index, how: index === null ? 'missing' : 'chosen', score: 1 });
            if (index !== null) used.add(index);
            continue;
        }
        const exact = norm.indexOf(normalizeText(w));
        if (exact >= 0) {
            result.set(w, { wanted: w, index: exact, how: 'exact', score: 1 });
            used.add(exact);
            continue;
        }
        const saved = (aliases[w] ?? []).map(a => norm.indexOf(normalizeText(a))).find(i => i >= 0);
        if (saved !== undefined) {
            result.set(w, { wanted: w, index: saved, how: 'saved', score: 1 });
            used.add(saved);
            continue;
        }
        pending.push(w);
    }

    // Best pairs first, so two similar wanted headers don't both grab the same column
    const pairs: { w: string; i: number; score: number }[] = [];
    for (const w of pending) {
        headers.forEach((h, i) => {
            const score = similarity(w, h);
            if (score >= HEADER_THRESHOLD) pairs.push({ w, i, score });
        });
    }
    pairs.sort((a, b) => b.score - a.score);
    for (const { w, i, score } of pairs) {
        if (result.has(w) || used.has(i)) continue;
        result.set(w, { wanted: w, index: i, how: 'similar', score });
        used.add(i);
    }
    for (const w of pending) {
        if (!result.has(w)) result.set(w, { wanted: w, index: null, how: 'missing', score: 0 });
    }
    return result;
}

// ─── Filters ────────────────────────────────────────────────────

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function pad2(n: number): string {
    return String(n).padStart(2, '0');
}

/** "99" → 1999, "07" → 2007; four-digit years stay as they are ("0079" is year 79, not 1979) */
function fullYear(text: string): number {
    const y = Number(text);
    if (text.length !== 2) return y;
    const now = new Date().getFullYear() % 100;
    return y > now ? 1900 + y : 2000 + y;
}

function valid(d: { d: number; m: number; y: number }, today: Date): { d: number; m: number; y: number } | null {
    if (d.m < 1 || d.m > 12 || d.d < 1 || d.d > new Date(d.y, d.m, 0).getDate()) return null;
    // Typos such as 0001 or 1887 aren't real dates of birth or foundation
    if (d.y < 1850 || d.y > today.getFullYear() + 1) return null;
    return d;
}

/**
 * Read a date from free text. Unknown day/month become 01 (as the forms ask:
 * "Use 01/01 if exact date is not known"). "25 years" counts back from today.
 */
export function parseLooseDate(value: string, today = new Date()): { d: number; m: number; y: number } | null {
    const v = value.trim().toLowerCase();
    if (!v) return null;
    let m = v.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return valid({ y: +m[1], m: +m[2], d: +m[3] }, today);
    m = v.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\b/);
    if (m) return valid({ d: +m[1], m: +m[2], y: fullYear(m[3]) }, today);
    m = v.match(/\b(\d{1,2})?\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s+(\d{4})\b/);
    if (m) return valid({ d: m[1] ? +m[1] : 1, m: MONTHS.indexOf(m[2]) + 1, y: +m[3] }, today);
    m = v.match(/\b(1[89]\d{2}|20\d{2})\b/);
    if (m) return valid({ d: 1, m: 1, y: +m[1] }, today);
    m = v.match(/\b(\d{1,3})\s*(?:years?|yrs?)\b/);
    if (m) return valid({ d: 1, m: 1, y: today.getFullYear() - +m[1] }, today);
    return null;
}

function applyFilter(value: string, filter: string, today: Date): string {
    switch (filter) {
        case 'first':
            return splitFullName(value).first_name;
        case 'last':
            return splitFullName(value).last_name;
        case 'upper':
            return value.toUpperCase();
        case 'lower':
            return value.toLowerCase();
        case 'oneline':
            return value.split(/\s*[\r\n]+\s*/).filter(Boolean).join(', ').replace(/,\s*,/g, ',');
        case 'phone': {
            const digits = value.replace(/\D/g, '');
            // Excel stores 087 123 4567 as the number 871234567
            if (/^\d+$/.test(value.trim()) && digits.length === 9 && /^[1-9]/.test(digits)) return `0${digits}`;
            return value;
        }
        case 'date':
        case 'dd':
        case 'mm':
        case 'yyyy':
        case 'yy': {
            const d = parseLooseDate(value, today);
            if (!d) return filter === 'date' ? value : '';
            if (filter === 'dd') return pad2(d.d);
            if (filter === 'mm') return pad2(d.m);
            if (filter === 'yyyy') return String(d.y);
            if (filter === 'yy') return pad2(d.y % 100);
            return `${pad2(d.d)}/${pad2(d.m)}/${d.y}`;
        }
        default:
            return value;
    }
}

export function formatDate(d: Date): string {
    return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export interface EvalContext {
    row: string[];
    columns: Map<string, ColumnMatch>;
    rowNumber: number;
    today?: Date;
    /** Name of the person filling the forms, for {user} */
    user?: string;
}

function rawValue(column: string, ctx: EvalContext, today: Date): string {
    const key = column.toLowerCase();
    if (key === 'today') return formatDate(today);
    if (key === 'row') return String(ctx.rowNumber);
    if (key === 'user') return ctx.user ?? '';
    const index = ctx.columns.get(column)?.index;
    return index === null || index === undefined ? '' : (ctx.row[index] ?? '');
}

/** "a"-ish comparison for the `new` filter: letters and digits only */
const squash = (s: string) => normalizeText(s).replace(/ /g, '');

/** Fill a source's placeholders from one spreadsheet row. */
export function evaluateSource(source: string, ctx: EvalContext): string {
    const today = ctx.today ?? new Date();
    let out = '';
    let last = 0;
    for (const m of source.matchAll(PLACEHOLDER_RE)) {
        out += source.slice(last, m.index);
        last = m.index + m[0].length;
        const filters = m[2].split('|').map(f => f.trim().toLowerCase()).filter(Boolean);
        let value = rawValue(m[1].trim(), ctx, today).trim();
        for (const f of filters) {
            if (f === 'new') {
                // "{Address}, {Eircode|new}": skip the Eircode when the address already has it
                if (value && squash(out).includes(squash(value))) value = '';
            } else value = applyFilter(value, f, today);
        }
        out += value;
    }
    out += source.slice(last);
    // Separators left dangling by empty values: "Cork, " / ", , " / " - "
    return out
        .replace(/(?:\s*,\s*){2,}/g, ', ')
        .replace(/^[\s,;]+|[\s,;]+$/g, '')
        .trim();
}

/** Values a date filter couldn't read ("11/19/0001"), to warn about */
export function unreadableDates(source: string, ctx: EvalContext): string[] {
    const today = ctx.today ?? new Date();
    const bad = new Set<string>();
    for (const p of parsePlaceholders(source)) {
        if (!p.filters.some(f => DATE_FILTERS.has(f))) continue;
        const value = rawValue(p.column, ctx, today).trim();
        if (value && !parseLooseDate(value, today)) bad.add(value);
    }
    return [...bad];
}
