import { toast } from '../../lib/toast';
import { todayISO } from '../../lib/dateUtils';

/** Enrollment statuses a viewer can still request completion for. */
export const COMPLETABLE_STATUSES = ['requested', 'invited', 'confirmed'] as const;

export function isCompletable(status: string, completionRequestStatus?: string | null): boolean {
    return (COMPLETABLE_STATUSES as readonly string[]).includes(status) && completionRequestStatus !== 'pending';
}

export function fullName(p: { first_name?: string | null; last_name?: string | null }): string {
    return `${p.first_name || ''} ${p.last_name || ''}`.trim();
}

export function initials(p: { first_name?: string | null; last_name?: string | null }): string {
    return `${p.first_name?.[0] || ''}${p.last_name?.[0] || ''}`.toUpperCase() || '?';
}

/** Name key used for "Last, First" alphabetical sorting. */
export function nameSortKey(p: { first_name?: string | null; last_name?: string | null }): string {
    return `${p.last_name || ''} ${p.first_name || ''}`.toLowerCase();
}

function toLocalDate(dateStr: string): Date {
    // Date-only strings are parsed at local noon so a UTC offset never shifts the day
    return new Date(dateStr.length === 10 ? `${dateStr}T12:00:00` : dateStr);
}

/** Whole days from today to the given date (negative = past). */
export function daysFromToday(dateStr: string | null | undefined): number | null {
    if (!dateStr) return null;
    const d = toLocalDate(dateStr);
    if (isNaN(d.getTime())) return null;
    const today = toLocalDate(todayISO());
    const target = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12);
    return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/** "Today", "Tomorrow", "In 3 days", "Yesterday", "5 days ago", "In 3 weeks"… */
export function relativeDay(dateStr: string | null | undefined): string {
    const diff = daysFromToday(dateStr);
    if (diff === null) return '';
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff === -1) return 'Yesterday';
    const abs = Math.abs(diff);
    let span: string;
    if (abs < 14) span = `${abs} days`;
    else if (abs < 60) span = `${Math.round(abs / 7)} weeks`;
    else if (abs < 365) span = `${Math.round(abs / 30)} months`;
    else span = `${Math.round(abs / 365)} year${Math.round(abs / 365) === 1 ? '' : 's'}`;
    return diff > 0 ? `In ${span}` : `${span} ago`;
}

/** "Tue 30 Sep" */
export function weekdayDate(dateStr: string | null | undefined): string {
    if (!dateStr) return '';
    const d = toLocalDate(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-IE', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function addDaysISO(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function copyText(value: string | null | undefined, label: string): Promise<boolean> {
    if (!value) return false;
    try {
        await navigator.clipboard.writeText(value);
        toast.success(`${label} copied`);
        return true;
    } catch {
        toast.error(`Couldn't copy ${label.toLowerCase()}`);
        return false;
    }
}

/** Copies a de-duplicated, comma separated list (ready to paste into BCC / a spreadsheet). */
export async function copyList(values: Array<string | null | undefined>, label: string): Promise<boolean> {
    const unique = Array.from(new Set(values.map(v => v?.trim()).filter((v): v is string => !!v)));
    if (unique.length === 0) {
        toast.error(`No ${label.toLowerCase()} to copy`);
        return false;
    }
    try {
        await navigator.clipboard.writeText(unique.join(', '));
        toast.success(`Copied ${unique.length} ${label.toLowerCase()}`);
        return true;
    } catch {
        toast.error(`Couldn't copy ${label.toLowerCase()}`);
        return false;
    }
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
    return `${count} ${count === 1 ? singular : plural}`;
}

/** The course day a student is booked for (confirmed wins over invited). */
export function sessionDate(item: { status: string; confirmed_date?: string | null; invited_date?: string | null }): string | null {
    if (item.status === 'confirmed') return item.confirmed_date || item.invited_date || null;
    if (item.status === 'invited') return item.invited_date || null;
    return null;
}
