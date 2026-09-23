/**
 * Consolidated date formatting utilities
 */

export function todayISO(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseDate(dateStr: string): Date {
    // If date-only string like YYYY-MM-DD, append T12:00:00 to prevent UTC midnight timezone shift
    const cleanStr = dateStr.length === 10 && !dateStr.includes('T') ? `${dateStr}T12:00:00` : dateStr;
    return new Date(cleanStr);
}

export function formatDateDMY(dateStr: string | null | undefined): string {
    if (!dateStr) return '';
    const d = parseDate(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-IE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateLong(dateStr: string | null | undefined): string {
    if (!dateStr) return '';
    const d = parseDate(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-IE', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatShortDate(dateStr: string | null | undefined): string {
    if (!dateStr) return '';
    const d = parseDate(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-IE', { day: 'numeric', month: 'short' });
}

export function formatDayDateShort(dateStr: string | null | undefined): string {
    if (!dateStr) return '';
    const d = parseDate(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-IE', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function formatDateSpaces(dateStr: string | null | undefined): string {
    if (!dateStr) return '';
    const d = parseDate(dateStr);
    if (isNaN(d.getTime())) return '';
    return `${String(d.getDate()).padStart(2, '0')} ${String(d.getMonth() + 1).padStart(2, '0')} ${d.getFullYear()}`;
}


/** Sorted, de-duplicated YYYY-MM-DD dates (drops empty values). */
export function normalizeDateList(dates: (string | null | undefined)[]): string[] {
    return [...new Set(dates.filter((d): d is string => !!d).map(d => d.split('T')[0]))].sort();
}

/**
 * Human-readable list of alternative course dates, month/year written once per group:
 * ['2026-10-14','2026-10-15','2026-10-16'] → "Wed 14, Thu 15 or Fri 16 Oct 2026".
 * A single date falls back to formatDateLong.
 */
export function formatDateChoiceList(dates: string[]): string {
    const list = normalizeDateList(dates);
    if (list.length <= 1) return formatDateLong(list[0]);

    const parsed = list.map(parseDate);
    const parts = parsed.map((d, i) => {
        const next = parsed[i + 1];
        const weekday = d.toLocaleDateString('en-IE', { weekday: 'short' });
        let text = `${weekday} ${d.getDate()}`;
        const monthChanges = !next || next.getMonth() !== d.getMonth() || next.getFullYear() !== d.getFullYear();
        const yearChanges = !next || next.getFullYear() !== d.getFullYear();
        if (monthChanges) text += ` ${d.toLocaleDateString('en-IE', { month: 'short' })}`;
        if (yearChanges) text += ` ${d.getFullYear()}`;
        return text;
    });
    return `${parts.slice(0, -1).join(', ')} or ${parts[parts.length - 1]}`;
}

/** Compact chip label for several dates: "14/15/16 Oct", or "30 Sep / 1 Oct" across months. */
export function formatShortDateList(dates: string[]): string {
    const list = normalizeDateList(dates);
    if (list.length <= 1) return formatShortDate(list[0]);
    const parsed = list.map(parseDate);
    const sameMonth = parsed.every(d => d.getMonth() === parsed[0].getMonth() && d.getFullYear() === parsed[0].getFullYear());
    if (sameMonth) {
        return `${parsed.map(d => d.getDate()).join('/')} ${parsed[0].toLocaleDateString('en-IE', { month: 'short' })}`;
    }
    return list.map(formatShortDate).join(' / ');
}

/** "Wed, 14 Oct 2026" */
export function formatDateLongWithWeekday(dateStr: string | null | undefined): string {
    if (!dateStr) return '';
    const d = parseDate(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-IE', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}
