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

