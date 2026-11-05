// ─── Certificates: dates, expiry and numbering ───
// Dates are typed (or picked) as they will be printed, "21/09/2026". Anything typed is kept as
// it is; these helpers read a date out of it when one is needed: to show it on the calendar,
// to work out the expiry date and the course month.

const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const pad = (n: number) => String(n).padStart(2, '0');

/** Tags that hold the date the course ran: the expiry and the course month count from it */
export const COURSE_DATE_TAGS = ['courseDate', 'confirmedDate', 'completionDate', 'completedDate', 'date'];
/** Tags of the expiry date */
const EXPIRY_TAG = /expir|validuntil|validto/i;
/** Tags of the course month, "September 2026" */
export const MONTH_TAGS = ['courseMonth', 'month'];
/** Tags of the certificate number: counted up for each person */
const NUMBER_TAG = /^(cert(ificate)?_?(no|num|number|id)|serial(no|number)?|number)$/i;

export function isExpiryTag(tag: string): boolean {
    return EXPIRY_TAG.test(tag);
}

export function isMonthTag(tag: string): boolean {
    return MONTH_TAGS.includes(tag) || /month$/i.test(tag);
}

/** A date to pick on a calendar: course date, today, expiry, anything named …Date */
export function isDateTag(tag: string): boolean {
    return !isMonthTag(tag) && (COURSE_DATE_TAGS.includes(tag) || tag === 'today' || isExpiryTag(tag) || /date$/i.test(tag) || /^date/i.test(tag));
}

export function isNumberTag(tag: string): boolean {
    return NUMBER_TAG.test(tag);
}

/** The template's course date tag, if it has one */
export function courseDateTag(tags: string[]): string | undefined {
    return COURSE_DATE_TAGS.find(t => tags.includes(t));
}

function validISO(y: number, m: number, d: number): string | null {
    if (y < 100) y += 2000;
    if (m < 1 || m > 12 || d < 1 || y < 1900 || y > 2200) return null;
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    if (d > last) return null;
    return `${y}-${pad(m)}-${pad(d)}`;
}

function monthIndex(word: string): number {
    const w = word.toLowerCase().slice(0, 3);
    return MONTHS_LONG.findIndex(m => m.toLowerCase().startsWith(w));
}

/**
 * The date in what was typed, as "YYYY-MM-DD", or null. Reads 21/09/2026, 21.9.26, 21-09-2026,
 * 2026-09-21, "21 September 2026", "21st Sept 2026". For a span ("21–23/09/2026") the last date.
 */
export function parseCertDate(text: string | null | undefined): string | null {
    const s = (text ?? '').trim();
    if (!s) return null;
    let found: string | null = null;
    for (const m of s.matchAll(/(\d{4})-(\d{1,2})-(\d{1,2})/g)) found = validISO(+m[1], +m[2], +m[3]) ?? found;
    if (found) return found;
    for (const m of s.matchAll(/(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{4}|\d{2})(?!\d)/g)) found = validISO(+m[3], +m[2], +m[1]) ?? found;
    if (found) return found;
    for (const m of s.matchAll(/(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([A-Za-z]{3,})\.?,?\s+(\d{4})/g)) {
        const mi = monthIndex(m[2]);
        if (mi >= 0) found = validISO(+m[3], mi + 1, +m[1]) ?? found;
    }
    return found;
}

/** The month in what was typed ("September 2026", "09/2026", a full date), as "YYYY-MM", or null */
export function parseCertMonth(text: string | null | undefined): string | null {
    const s = (text ?? '').trim();
    if (!s) return null;
    const date = parseCertDate(s);
    if (date) return date.slice(0, 7);
    const word = s.match(/([A-Za-z]{3,})\.?,?\s+(\d{4})/);
    if (word && monthIndex(word[1]) >= 0) return `${word[2]}-${pad(monthIndex(word[1]) + 1)}`;
    const num = s.match(/^(\d{1,2})\s*[/.-]\s*(\d{4})$/);
    if (num && +num[1] >= 1 && +num[1] <= 12) return `${num[2]}-${pad(+num[1])}`;
    return null;
}

/** "21/09/2026" from "2026-09-21" */
export function formatCertDate(iso: string): string {
    return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/** "September 2026" from "2026-09" or "2026-09-21" */
export function formatCertMonth(iso: string): string {
    return `${MONTHS_LONG[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
}

/** The same day `months` later; the 31st (or 29 February) falls back to the month's last day */
export function addMonths(iso: string, months: number): string {
    const y = Number(iso.slice(0, 4));
    const m = Number(iso.slice(5, 7)) - 1 + months;
    const d = Number(iso.slice(8, 10));
    const year = y + Math.floor(m / 12);
    const month = ((m % 12) + 12) % 12;
    const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return `${year}-${pad(month + 1)}-${pad(Math.min(d, last))}`;
}

/** "3 years", "1 year", "18 months" */
export function validityLabel(months: number): string {
    if (months % 12 === 0) {
        const years = months / 12;
        return `${years} year${years === 1 ? '' : 's'}`;
    }
    return `${months} month${months === 1 ? '' : 's'}`;
}

/** The lengths offered as buttons next to the expiry date */
export const VALIDITY_PRESETS = [12, 24, 36, 48, 60];

/**
 * The certificate number of the person at `index` (0 for the first), counting up from the
 * first one typed: "ASC-2026-007" → "ASC-2026-008", keeping the zeros. Without a number in it,
 * the text is the same for everyone.
 */
export function countUp(first: string, index: number): string {
    const m = first.match(/^(.*?)(\d+)(\D*)$/);
    if (!m || index === 0) return first;
    const next = String(Number(m[2]) + index).padStart(m[2].length, '0');
    return `${m[1]}${next}${m[3]}`;
}
