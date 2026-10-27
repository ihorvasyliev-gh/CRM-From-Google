// ─── Cheque requisitions: reading amounts, dates and codes out of invoice text ───
// Pure string helpers, shared by the invoice reader (extract.ts) and the form.

const MONTHS: Record<string, number> = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
    jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
    dec: 12, december: 12,
};
const MONTH = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';
const DAY = '(\\d{1,2})(?:st|nd|rd|th)?';
const YEAR = "('?\\d{2}|\\d{4})";

export function collapseSpaces(s: string): string {
    return s.replace(/\s+/g, ' ').trim();
}

// ─── Amounts ───────────────────────────────────────────────────

const amountFormat = new Intl.NumberFormat('en-IE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 4260 → "4,260.00" */
export function formatAmount(value: number): string {
    return amountFormat.format(value);
}

/**
 * Money in invoice text: "4,260.00", "€ 1 200,50", "EUR 99". A number counts only with two
 * decimals or a currency sign, so quantities, years and phone numbers are left alone.
 */
const AMOUNT_RE = /(€|\beur\b|£|\bgbp\b)?\s?(\(?-?(?<![\d.,])(?:\d{1,3}(?:[,.]\d{3})+|\d+)(?:[.,]\d{2})?\)?)(?!\d|[.,]\d)/gi;

export interface AmountHit {
    value: number;
    index: number;
    raw: string;
}

/** A number as people type it on the form: "4,260.00", "4260", "€4.260,50" → 4260.5 */
export function parseAmount(text: string): number | null {
    const s = text.replace(/[€£]|eur|gbp/gi, '').replace(/\s/g, '').trim();
    if (!s) return null;
    const negative = /^\(.*\)$/.test(s) || s.startsWith('-');
    const digits = s.replace(/[()\-+]/g, '');
    if (!/^\d[\d.,]*$/.test(digits)) return null;
    let normal: string;
    const lastDot = digits.lastIndexOf('.');
    const lastComma = digits.lastIndexOf(',');
    const decimalSep = /[.,]\d{1,2}$/.test(digits) ? (lastDot > lastComma ? '.' : ',') : null;
    if (decimalSep) {
        const thousands = decimalSep === '.' ? ',' : '.';
        normal = digits.split(thousands).join('').replace(decimalSep, '.');
    } else {
        normal = digits.replace(/[.,]/g, '');
    }
    const value = Number(normal);
    if (!Number.isFinite(value)) return null;
    return Math.round((negative ? -value : value) * 100) / 100;
}

/** What follows the days of a month: "28,30 of July", "11,13 August" */
const MONTH_AFTER = new RegExp(`^\\s*(?:st|nd|rd|th)?\\s*(?:of\\s+)?${MONTH}(?![a-z])`, 'i');

export function findAmounts(text: string): AmountHit[] {
    const hits: AmountHit[] = [];
    for (const m of text.matchAll(AMOUNT_RE)) {
        const currency = m[1];
        const raw = m[2];
        const decimals = /[.,]\d{2}\)?$/.test(raw);
        if (!currency && !decimals) continue;
        const after = text.slice((m.index ?? 0) + m[0].length);
        // "12.30pm" is not money
        if (/^\d{1,2}[.,]\d{2}$/.test(raw) && /^\s*(am|pm)\b/i.test(after)) continue;
        // Nor are days: "28,30 of July 2026"
        if (!currency && /^\d{1,2}[.,]\d{2}$/.test(raw) && MONTH_AFTER.test(after)) continue;
        const value = parseAmount(raw);
        if (value === null) continue;
        hits.push({ value, index: (m.index ?? 0) + m[0].indexOf(raw), raw: m[0].trim() });
    }
    return hits;
}

// ─── Dates ─────────────────────────────────────────────────────

function iso(y: number, m: number, d: number): string | null {
    if (y < 100) y += 2000;
    if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
    const date = new Date(Date.UTC(y, m - 1, d));
    if (date.getUTCMonth() !== m - 1) return null;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function year(s: string): number {
    return Number(s.replace("'", ''));
}

export interface DateHit {
    iso: string;
    index: number;
    end: number;
}

const DATE_PATTERNS: { re: RegExp; read: (m: RegExpMatchArray) => string | null }[] = [
    // 21 Oct 2026, 1st October 2026, 21-Oct-26
    { re: new RegExp(`\\b${DAY}[\\s\\-/.]*(?:of\\s+)?${MONTH}[\\s\\-/.,]*${YEAR}\\b`, 'gi'), read: m => iso(year(m[3]), MONTHS[m[2].toLowerCase().replace('.', '')], Number(m[1])) },
    // October 21, 2026
    { re: new RegExp(`\\b${MONTH}\\s+${DAY},?\\s+${YEAR}\\b`, 'gi'), read: m => iso(year(m[3]), MONTHS[m[1].toLowerCase().replace('.', '')], Number(m[2])) },
    // 2026-10-21
    { re: /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g, read: m => iso(Number(m[1]), Number(m[2]), Number(m[3])) },
    // 21/10/2026, 21.10.26 (day first, as in Ireland)
    { re: /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/g, read: m => iso(Number(m[3]), Number(m[2]), Number(m[1])) },
];

/** Several days of one month: "28,30 of July 2026", "4, 6 and 11 August 2026", "1st & 3rd Sept 2026" */
const DAY_LIST = new RegExp(`\\b(\\d{1,2}(?:st|nd|rd|th)?(?:\\s*(?:,|&|and)\\s*\\d{1,2}(?:st|nd|rd|th)?)+)\\s*(?:of\\s+)?${MONTH}[\\s,]*${YEAR}\\b`, 'gi');

/** Every date in the text, in reading order; each day of a list is a date of its own */
export function findDates(text: string): DateHit[] {
    const hits: DateHit[] = [];
    for (const m of text.matchAll(DAY_LIST)) {
        const days = (m[1].match(/\d{1,2}/g) ?? []).map(Number);
        const month = MONTHS[m[2].toLowerCase().replace('.', '')];
        const values = days.map(d => iso(year(m[3]), month, d));
        // A list of days runs forward ("Room 12, 3 Oct 2026" is not one)
        if (values.some(v => !v) || days.some((d, i) => i > 0 && d <= days[i - 1])) continue;
        const index = m.index ?? 0;
        for (const value of values) hits.push({ iso: value!, index, end: index + m[0].length });
    }
    for (const { re, read } of DATE_PATTERNS) {
        for (const m of text.matchAll(re)) {
            const value = read(m);
            const index = m.index ?? 0;
            const end = index + m[0].length;
            if (value && !hits.some(h => index < h.end && end > h.index)) hits.push({ iso: value, index, end });
        }
    }
    return hits.sort((a, b) => a.index - b.index);
}

export function parseDate(text: string): string | null {
    return findDates(text)[0]?.iso ?? null;
}

/**
 * The dates a course (or any service) ran: "1st October 2026 - 15th October 2026",
 * "1st - 15th October 2026", "6-10 Oct 2026", "01/10/2026 to 15/10/2026", or a single date.
 */
export function findDateRange(text: string): { start: string; end?: string } | null {
    // A shared month: "1st - 15th October 2026"
    const shared = new RegExp(`\\b${DAY}\\s*(?:-|–|—|to|until|till)\\s*${DAY}\\s+(?:of\\s+)?${MONTH}[\\s,]*${YEAR}\\b`, 'i').exec(text);
    if (shared) {
        const month = MONTHS[shared[3].toLowerCase().replace('.', '')];
        const y = year(shared[4]);
        const start = iso(y, month, Number(shared[1]));
        const end = iso(y, month, Number(shared[2]));
        if (start && end) return { start, end };
    }
    const dates = findDates(text);
    if (dates.length === 0) return null;
    const [first, second] = dates;
    if (second) {
        const between = text.slice(first.end, second.index);
        if (/^\s*(?:-|–|—|to|until|till|and)\s*$/i.test(between)) return { start: first.iso, end: second.iso };
    }
    return { start: first.iso };
}

/** "2026-10-01" → "01.10.2026" (how course dates read in a requisition's description) */
export function dottedDate(isoDate: string): string {
    const [y, m, d] = isoDate.split('-');
    return y && m && d ? `${d}.${m}.${y}` : isoDate;
}

/** "2026-10-01" → "01/10/2026" */
export function slashDate(isoDate: string): string {
    const [y, m, d] = isoDate.split('-');
    return y && m && d ? `${d}/${m}/${y}` : isoDate;
}

// ─── Codes and contacts ────────────────────────────────────────

/** A reference such as an invoice or PO number: one token with at least one digit. */
export function referenceToken(text: string): string | null {
    const token = text.trim().replace(/^[:#.\s-]+/, '').split(/\s+/)[0]?.replace(/[.,;:]+$/, '') ?? '';
    if (!token || token.length > 30 || !/\d/.test(token) || !/^[A-Z0-9][A-Z0-9\-/._]*$/i.test(token)) return null;
    // A date or an amount is not a reference ("2025-08-1-1" only starts like a date)
    if (findDates(token).some(d => d.index === 0 && !/[A-Z0-9]/i.test(token.slice(d.end))) || /^\d{1,3}(,\d{3})*\.\d{2}$/.test(token)) return null;
    return token;
}

export const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+/gi;
export const WEBSITE_RE = /\b(?:https?:\/\/)?(?:www\.)[A-Z0-9-]+(?:\.[A-Z0-9-]+)+\b/gi;
/** Irish and international phone numbers: 087 144 8706, (021) 430 2310, +353 87 144 8706 */
export const PHONE_RE = /(?:\+|00)\d{2,3}[\s-]?(?:\(0\))?\s?\d{1,3}(?:[\s-]?\d){5,9}\b|\(?\b0\d{1,3}\)?[\s-]?\d{3}[\s-]?\d{3,4}\b/g;
export const IBAN_RE = /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}(?:\s?[A-Z0-9]{1,4})?\b/g;

const FREE_MAIL = /^(gmail|googlemail|hotmail|outlook|live|yahoo|icloud|me|eircom|aol|protonmail|msn)\./i;

/** "info@acme.ie" → "acme"; free mail providers give nothing */
export function domainWord(emailOrSite: string): string | null {
    const host = emailOrSite.includes('@') ? emailOrSite.split('@')[1] : emailOrSite.replace(/^(?:https?:\/\/)?(?:www\.)?/i, '');
    if (!host || FREE_MAIL.test(host)) return null;
    const word = host.split('.')[0].toLowerCase();
    return word.length >= 3 ? word : null;
}

/** Letters and digits only, lowercase: for comparing names and codes */
export function squash(text: string): string {
    return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
