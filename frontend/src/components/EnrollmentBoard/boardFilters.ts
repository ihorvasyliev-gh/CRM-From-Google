import type { EnrollmentRow } from '../../hooks/useEnrollments';
import { cleanVariant, type StudentFlag } from '../../lib/types';
import { courseDatesOf } from '../../lib/courseDates';
import { normalizeEmail } from '../../lib/emailOptOut';
import { formatDayDateShort } from '../../lib/dateUtils';
import type { SortOrder } from './boardSort';

export type FlagFilter = 'all' | 'flagged' | 'unflagged';
export type EmailStatusFilter = 'all' | 'unreachable' | 'emailable';

export interface CourseDateChip {
    date: string;
    count: number;
    confirmed?: number;
    invited?: number;
    /** True when the date is before today and still has confirmed or invited students needing attention */
    isPast?: boolean;
    /** Course capacity per date when all enrollments on this date share a single capped course */
    maxCapacity?: number | null;
}

const ACTIVE_PIPELINE = new Set(['requested', 'invited', 'confirmed']);
const EXCLUDED_FROM_DATES = new Set(['withdrawn', 'rejected']);

/**
 * Computes course date chips for the FilterBar:
 * - Excludes withdrawn & rejected enrollments (withdrawn keeps old dates and previously inflated counts).
 * - Includes today and future dates (any non-withdrawn/non-rejected status).
 * - Includes past dates ONLY when they still have active `confirmed` or `invited` students needing cleanup/completion.
 * - Tracks per-date capacity when scoped to a single course with `max_capacity`.
 */
export function computeAvailableCourseDates(
    enrollments: readonly EnrollmentRow[],
    selectedCourse: string,
    selectedVariant: string,
    today: string,
): { availableCourseDates: CourseDateChip[]; courseDatesTotal: number } {
    const dateMap = new Map<string, { count: number; confirmed: number; invited: number; isPast: boolean; maxCapacity: number | null; courseIds: Set<string> }>();
    let total = 0;

    for (const item of enrollments) {
        if (EXCLUDED_FROM_DATES.has(item.status)) continue;
        if (selectedCourse !== 'all' && item.course_id !== selectedCourse) continue;
        if (selectedVariant !== 'all') {
            const cleaned = cleanVariant(item.courses?.name || '', item.course_variant);
            if (cleaned.toLowerCase() !== selectedVariant.toLowerCase()) continue;
        }

        const isActiveDated = item.status === 'confirmed' || item.status === 'invited';
        const matchingDates = courseDatesOf(item).filter(date => date >= today || isActiveDated);
        if (matchingDates.length === 0) continue;

        total++;
        for (const date of matchingDates) {
            const existing = dateMap.get(date);
            const entry = existing ?? {
                count: 0,
                confirmed: 0,
                invited: 0,
                isPast: date < today,
                maxCapacity: item.courses?.max_capacity ?? null,
                courseIds: new Set<string>(),
            };
            entry.count++;
            if (item.status === 'confirmed') entry.confirmed++;
            if (item.status === 'invited') entry.invited++;
            if (item.course_id) entry.courseIds.add(item.course_id);
            if (entry.courseIds.size > 1) {
                entry.maxCapacity = null;
            } else if (entry.maxCapacity == null && item.courses?.max_capacity != null) {
                entry.maxCapacity = item.courses.max_capacity;
            }
            dateMap.set(date, entry);
        }
    }

    const availableCourseDates: CourseDateChip[] = Array.from(dateMap.entries())
        .map(([date, c]) => ({
            date,
            count: c.count,
            confirmed: c.confirmed,
            invited: c.invited,
            isPast: c.isPast,
            maxCapacity: c.maxCapacity,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

    return { availableCourseDates, courseDatesTotal: total };
}

/** Active pipeline enrollment counts (requested + invited + confirmed) per course_id. */
export function computeCourseActiveCounts(enrollments: readonly EnrollmentRow[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const e of enrollments) {
        if (!e.course_id || !ACTIVE_PIPELINE.has(e.status)) continue;
        counts.set(e.course_id, (counts.get(e.course_id) ?? 0) + 1);
    }
    return counts;
}

/** True when the student cannot be emailed (missing email or present in email_opt_outs). */
export function isEmailUnreachable(
    email: string | null | undefined,
    optedOutEmails: ReadonlySet<string>,
): boolean {
    const normalized = normalizeEmail(email);
    return !normalized || optedOutEmails.has(normalized);
}

/** Checks the extra board attribute filters (priority, flags, pending approval, note, email reachability). */
export function matchesAttributeFilters(
    enrollment: EnrollmentRow,
    filters: {
        priorityOnly: boolean;
        flagFilter: FlagFilter;
        pendingApprovalOnly: boolean;
        hasNoteOnly: boolean;
        emailFilter: EmailStatusFilter;
    },
    flagsByStudentId: ReadonlyMap<string, StudentFlag[]>,
    optedOutEmails: ReadonlySet<string>,
): boolean {
    if (filters.priorityOnly && !enrollment.is_priority) return false;
    if (filters.pendingApprovalOnly && enrollment.completion_request_status !== 'pending') return false;
    if (filters.hasNoteOnly && !enrollment.notes?.trim()) return false;
    if (filters.flagFilter !== 'all') {
        const flagged = (flagsByStudentId.get(enrollment.student_id)?.length ?? 0) > 0;
        if (filters.flagFilter === 'flagged' && !flagged) return false;
        if (filters.flagFilter === 'unflagged' && flagged) return false;
    }
    if (filters.emailFilter !== 'all') {
        const unreachable = isEmailUnreachable(enrollment.students?.email, optedOutEmails);
        if (filters.emailFilter === 'unreachable' && !unreachable) return false;
        if (filters.emailFilter === 'emailable' && unreachable) return false;
    }
    return true;
}

export interface ColumnGroup {
    key: string;
    label: string;
    kind: 'priority' | 'date' | 'undated';
    date?: string;
    isPast?: boolean;
    /** Capacity of the cohort if all items in the group belong to the same capped course */
    maxCapacity?: number | null;
    items: EnrollmentRow[];
}

function groupDateKey(e: EnrollmentRow, status: string): string | null {
    if (status === 'invited') {
        const first = e.invited_dates?.length ? [...e.invited_dates].sort()[0] : e.invited_date;
        return first ? first.slice(0, 10) : null;
    }
    if (status === 'confirmed') {
        return e.confirmed_date ? e.confirmed_date.slice(0, 10) : null;
    }
    return null;
}

/**
 * Splits a sorted `invited` or `confirmed` column into visual date groups (plus a leading
 * `Priority` group when starred cards sit above regular ones).
 * Returns null when grouping adds no value (other statuses, name sort, or a single upcoming group).
 */
export function computeColumnGroups(
    items: readonly EnrollmentRow[],
    status: string,
    sortOrder: SortOrder,
    today: string,
): ColumnGroup[] | null {
    if (items.length === 0) return null;
    if (status !== 'invited' && status !== 'confirmed') return null;
    if (sortOrder === 'name') return null;

    const groups: ColumnGroup[] = [];
    for (const item of items) {
        let key: string;
        let kind: ColumnGroup['kind'];
        let date: string | undefined;

        if (item.is_priority) {
            key = 'priority';
            kind = 'priority';
        } else {
            const d = groupDateKey(item, status);
            if (d) {
                key = `date:${d}`;
                kind = 'date';
                date = d;
            } else {
                key = 'undated';
                kind = 'undated';
            }
        }

        const prev = groups[groups.length - 1];
        if (prev && prev.key === key) {
            prev.items.push(item);
        } else {
            groups.push({
                key,
                kind,
                date,
                isPast: date ? date < today : false,
                label: kind === 'priority'
                    ? 'Priority'
                    : date
                        ? formatDayDateShort(date)
                        : 'No date set',
                items: [item],
            });
        }
    }

    // Attach capacity per date group when every card in the group shares one capped course
    for (const group of groups) {
        if (group.kind !== 'date') continue;
        const courseIds = new Set(group.items.map(e => e.course_id).filter(Boolean));
        if (courseIds.size === 1) {
            group.maxCapacity = group.items[0].courses?.max_capacity ?? null;
        }
    }

    // Show dividers when there are multiple groups, OR a single past-date group needing attention
    if (groups.length <= 1 && !groups[0]?.isPast) return null;
    return groups;
}

/** Picks the first `count` enrollment IDs from a queue, optionally skipping unsubscribed / email-less people. */
export function pickTopN(
    items: readonly EnrollmentRow[],
    count: number,
    optedOutEmails: ReadonlySet<string>,
    skipUnreachable: boolean,
): string[] {
    if (count <= 0) return [];
    const picked: string[] = [];
    for (const item of items) {
        if (skipUnreachable && isEmailUnreachable(item.students?.email, optedOutEmails)) continue;
        picked.push(item.id);
        if (picked.length >= count) break;
    }
    return picked;
}
