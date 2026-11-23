import { formatDisplayDate, todayISO } from './dateUtils';

export type CompletionDateFilter =
    | 'all'
    | 'recent_30d'
    | 'recent_3m'
    | 'recent_6m'
    | 'recent_12m'
    | 'older_30d'
    | 'older_3m'
    | 'older_6m'
    | 'older_1y'
    | 'custom';

export interface CompletionDateOption {
    value: Exclude<CompletionDateFilter, 'all' | 'custom'>;
    label: string;
}

export const RECENT_COMPLETION_OPTIONS: CompletionDateOption[] = [
    { value: 'recent_30d', label: 'Last 30 days' },
    { value: 'recent_3m', label: 'Last 3 months' },
    { value: 'recent_6m', label: 'Last 6 months' },
    { value: 'recent_12m', label: 'Last 12 months' },
];

export const OLDER_COMPLETION_OPTIONS: CompletionDateOption[] = [
    { value: 'older_30d', label: 'Over 30 days ago' },
    { value: 'older_3m', label: 'Over 3 months ago' },
    { value: 'older_6m', label: 'Over 6 months ago' },
    { value: 'older_1y', label: 'Over 1 year ago' },
];

const VALID_COMPLETION_FILTERS = new Set<string>([
    'all',
    ...RECENT_COMPLETION_OPTIONS.map(o => o.value),
    ...OLDER_COMPLETION_OPTIONS.map(o => o.value),
    'custom',
]);

const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export const isCompletionDateFilter = (v: unknown): v is CompletionDateFilter =>
    typeof v === 'string' && VALID_COMPLETION_FILTERS.has(v);

export const isIsoDateOrEmpty = (v: unknown): v is string =>
    typeof v === 'string' && (v === '' || ISO_DAY_RE.test(v));

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Shift a YYYY-MM-DD calendar day by whole days without timezone drift. */
export function shiftDays(dayIso: string, deltaDays: number): string {
    const y = Number(dayIso.slice(0, 4));
    const m = Number(dayIso.slice(5, 7));
    const d = Number(dayIso.slice(8, 10));
    const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
    return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

/** Shift a YYYY-MM-DD calendar day by whole months, clamping to the target month's last day. */
export function shiftMonths(dayIso: string, deltaMonths: number): string {
    const y = Number(dayIso.slice(0, 4));
    const m = Number(dayIso.slice(5, 7)) - 1;
    const d = Number(dayIso.slice(8, 10));
    const totalMonths = y * 12 + m + deltaMonths;
    const targetYear = Math.floor(totalMonths / 12);
    const targetMonth = ((totalMonths % 12) + 12) % 12;
    const maxDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
    return `${targetYear}-${pad2(targetMonth + 1)}-${pad2(Math.min(d, maxDay))}`;
}

/**
 * Computes the inclusive cutoff day (YYYY-MM-DD) for a preset filter:
 * - recent_* matches days >= cutoff
 * - older_*  matches days <  cutoff
 * Together, each matching pair (e.g. recent_3m & older_3m) partitions all dated graduates with no gap or overlap.
 */
export function completionPresetCutoff(
    filter: Exclude<CompletionDateFilter, 'all' | 'custom'>,
    today: string = todayISO(),
): string {
    switch (filter) {
        case 'recent_30d':
        case 'older_30d':
            return shiftDays(today, -30);
        case 'recent_3m':
        case 'older_3m':
            return shiftMonths(today, -3);
        case 'recent_6m':
        case 'older_6m':
            return shiftMonths(today, -6);
        case 'recent_12m':
        case 'older_1y':
            return shiftMonths(today, -12);
    }
}

/**
 * The completion date relevant to the active course filter:
 * when a specific course is selected, uses that course's completion date; otherwise the student's latest completion.
 */
export function effectiveCompletionDate(
    grad: { last_completed_date?: string | null; course_completed_dates?: Record<string, string | null> },
    effectiveCourse: string,
): string | null {
    if (effectiveCourse !== 'all' && grad.course_completed_dates && effectiveCourse in grad.course_completed_dates) {
        return normalizeDay(grad.course_completed_dates[effectiveCourse]);
    }
    return normalizeDay(grad.last_completed_date);
}

/** Normalize a DATE / ISO timestamp string to YYYY-MM-DD (or null). */
export function normalizeDay(value: string | null | undefined): string | null {
    if (!value) return null;
    const prefix = value.slice(0, 10);
    return ISO_DAY_RE.test(prefix) ? prefix : null;
}

/** Returns true if a graduate's completion date satisfies the active completion date filter. */
export function matchesCompletionDate(
    completedDate: string | null,
    filter: CompletionDateFilter,
    from: string,
    to: string,
    today: string = todayISO(),
): boolean {
    if (filter === 'all') return true;
    if (filter === 'custom') {
        if (!from && !to) return true;
        const day = normalizeDay(completedDate);
        if (!day) return false;
        if (from && day < from) return false;
        if (to && day > to) return false;
        return true;
    }

    const day = normalizeDay(completedDate);
    if (!day) return false;

    const cutoff = completionPresetCutoff(filter, today);
    if (filter.startsWith('recent_')) return day >= cutoff;
    return day < cutoff;
}

/** Short human-readable description of the active cutoff or range (e.g. "Since 24 Oct 2026", "Before 23 Aug 2026"). */
export function completionDateRangeHint(
    filter: CompletionDateFilter,
    from: string,
    to: string,
    today: string = todayISO(),
): string | null {
    if (filter === 'all') return null;
    if (filter === 'custom') {
        if (from && to) return `${formatDisplayDate(from)} – ${formatDisplayDate(to)}`;
        if (from) return `From ${formatDisplayDate(from)}`;
        if (to) return `Until ${formatDisplayDate(to)}`;
        return null;
    }
    const cutoff = completionPresetCutoff(filter, today);
    return filter.startsWith('recent_')
        ? `Since ${formatDisplayDate(cutoff)}`
        : `Before ${formatDisplayDate(cutoff)}`;
}

/** Multi-course completion breakdown for a cell tooltip, e.g. "First Aid: 15 Oct 2026 · Safe Pass: 10 May 2025". */
export function formatCourseDatesTooltip(
    courses: string[],
    courseCompletedDates?: Record<string, string | null>,
): string | undefined {
    if (!courseCompletedDates || courses.length <= 1) return undefined;
    const parts = courses
        .map(c => {
            const d = normalizeDay(courseCompletedDates[c]);
            return d ? `${c}: ${formatDisplayDate(d)}` : null;
        })
        .filter((p): p is string => p !== null);
    return parts.length > 0 ? parts.join(' · ') : undefined;
}
