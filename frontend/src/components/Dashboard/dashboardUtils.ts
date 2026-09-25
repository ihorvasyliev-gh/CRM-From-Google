import { cleanVariant } from '../../lib/types';
import { todayISO } from '../../lib/dateUtils';

export interface ExpiredInviteItem {
    id: string;
    studentId: string;
    studentName: string;
    courseId: string;
    courseName: string;
    invitedAt: string;
    deadlineMs: number;
    hoursRemaining: number;
    isExpired: boolean;
    timeLabel: string;
}

export interface UpcomingCohortItem {
    date: string;
    courseId: string;
    courseName: string;
    confirmedCount: number;
}

export function calculateExpiredInvites(enrollments: any[], nowMs: number = Date.now()): ExpiredInviteItem[] {
    const items: ExpiredInviteItem[] = [];

    for (const en of enrollments) {
        if (en.status !== 'invited' || !en.invited_at) continue;

        const invitedTime = new Date(en.invited_at).getTime();
        if (isNaN(invitedTime)) continue;

        const days = en.response_days ?? 7;
        const deadlineMs = invitedTime + days * 24 * 60 * 60 * 1000;
        const diffMs = deadlineMs - nowMs;
        const hoursRemaining = diffMs / (1000 * 60 * 60);

        // Include if already expired (hoursRemaining <= 0) or <= 48h remaining
        if (hoursRemaining <= 48) {
            const isExpired = hoursRemaining <= 0;
            let timeLabel = '';
            if (isExpired) {
                const daysOverdue = Math.floor(Math.abs(hoursRemaining) / 24);
                timeLabel = daysOverdue === 0 ? 'Expired today' : `Expired ${daysOverdue}d ago`;
            } else {
                const hrs = Math.ceil(hoursRemaining);
                timeLabel = hrs <= 24 ? `${hrs}h left` : `${Math.ceil(hrs / 24)}d left`;
            }

            const studentName = [en.students?.first_name, en.students?.last_name].filter(Boolean).join(' ') || 'Unknown Student';

            items.push({
                id: en.id,
                studentId: en.student_id || en.id,
                studentName,
                courseId: en.course_id,
                courseName: en.courses?.name || 'Unknown Course',
                invitedAt: en.invited_at,
                deadlineMs,
                hoursRemaining,
                isExpired,
                timeLabel,
            });
        }
    }

    return items.sort((a, b) => a.deadlineMs - b.deadlineMs);
}

/** Confirmed course dates from today on, one item per course + date, soonest first. */
export function groupConfirmedSessions(enrollments: any[], todayIso: string = todayISO()): UpcomingCohortItem[] {
    const cohortMap = new Map<string, UpcomingCohortItem>();

    for (const en of enrollments) {
        if (en.status !== 'confirmed' || !en.confirmed_date) continue;
        const dateKey = en.confirmed_date.split('T')[0];
        if (dateKey < todayIso) continue;

        const key = `${dateKey}:::${en.course_id}`;
        const existing = cohortMap.get(key);
        if (existing) {
            existing.confirmedCount++;
        } else {
            cohortMap.set(key, {
                date: dateKey,
                courseId: en.course_id,
                courseName: en.courses?.name || 'Unknown Course',
                confirmedCount: 1,
            });
        }
    }

    return Array.from(cohortMap.values())
        .sort((a, b) => a.date.localeCompare(b.date) || a.courseName.localeCompare(b.courseName));
}

export function groupUpcomingCohorts(enrollments: any[], todayIso: string = todayISO()): UpcomingCohortItem[] {
    const sorted = groupConfirmedSessions(enrollments, todayIso);
    if (sorted.length <= 12) return sorted;
    // Cap at 12, but never split a day: the dashboard groups same-day courses into one card.
    const lastDate = sorted[11].date;
    return sorted.filter(c => c.date <= lastDate);
}

// ---------------------------------------------------------------------------
// Activity feed grouping
// ---------------------------------------------------------------------------

export type ActivityStatusFilter = 'all' | 'requested' | 'invited' | 'confirmed' | 'completed';

export interface ActivityEnrollment {
    id: string;
    courseId?: string;
    courseName: string;
    courseVariant: string | null;
    status: string;
}

export interface ActivityGroup {
    key: string;
    studentName: string;
    studentId: string;
    /** Local calendar day, YYYY-MM-DD */
    date: string;
    dateLabel: string;
    isNew?: boolean;
    enrollments: ActivityEnrollment[];
    previousEnrollments: (ActivityEnrollment & { dateLabel: string })[];
}

const STATUS_PRIORITY: Record<string, number> = {
    confirmed: 1,
    invited: 2,
    completed: 3,
    requested: 4,
    withdrawn: 5,
    rejected: 6,
};

export function localDateKey(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseSafeDate(dateStr: string | null | undefined): { dateKey: string; dateLabel: string } {
    const dateOpts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' };
    let d = dateStr ? new Date(dateStr) : new Date();
    if (isNaN(d.getTime())) d = new Date();
    // Group by the user's local calendar day (not UTC) so late-evening activity lands on the right day
    return { dateKey: localDateKey(d), dateLabel: d.toLocaleDateString('en-IE', dateOpts) };
}

/**
 * Merges enrollments of the same course + status into a single pill (joining their variants)
 * and sorts them by status priority, then course name.
 */
export function mergeCoursePills<T extends ActivityEnrollment>(enrollments: T[]): T[] {
    const groups = new Map<string, T[]>();
    for (const en of enrollments) {
        const key = `${en.courseName}:::${en.status}`;
        const list = groups.get(key);
        if (list) list.push(en);
        else groups.set(key, [en]);
    }

    return Array.from(groups.values())
        .map(ens => {
            const first = ens[0];
            const variants = ens
                .map(en => cleanVariant(first.courseName, en.courseVariant))
                .filter((v, idx, self) => v && self.indexOf(v) === idx);
            return { ...first, courseVariant: variants.length > 0 ? variants.join(', ') : null };
        })
        .sort((a, b) => {
            const pA = STATUS_PRIORITY[a.status] || 99;
            const pB = STATUS_PRIORITY[b.status] || 99;
            if (pA !== pB) return pA - pB;
            return a.courseName.localeCompare(b.courseName);
        });
}

function toActivityEnrollment(en: any): ActivityEnrollment {
    return {
        id: en.id,
        courseId: en.course_id,
        courseName: en.courses?.name || 'Unknown Course',
        courseVariant: en.course_variant ?? null,
        status: en.status,
    };
}

function studentNameOf(en: any): string {
    return [en.students?.first_name, en.students?.last_name].filter(Boolean).join(' ') || 'Unknown';
}

/**
 * Groups enrollments into "student + day" activity entries (newest first), each carrying the
 * student's enrollment history from other days. `search` matches student or course names.
 */
export function buildActivityGroups(
    enrollments: any[],
    { filter = 'all', search = '', limit = 50 }: { filter?: ActivityStatusFilter; search?: string; limit?: number } = {},
): { groups: ActivityGroup[]; total: number } {
    const byStudent = new Map<string, any[]>();
    for (const en of enrollments) {
        if (!en.student_id) continue;
        const list = byStudent.get(en.student_id);
        if (list) list.push(en);
        else byStudent.set(en.student_id, [en]);
    }

    const time = (en: any) => {
        const t = en.created_at ? new Date(en.created_at).getTime() : 0;
        return isNaN(t) ? 0 : t;
    };
    const source = (filter === 'all' ? enrollments : enrollments.filter(en => en.status === filter))
        .slice()
        .sort((a, b) => time(b) - time(a));

    const groupMap = new Map<string, ActivityGroup>();
    for (const en of source) {
        const studentId = en.student_id || en.id;
        const { dateKey, dateLabel } = parseSafeDate(en.created_at);
        const key = `${studentId}__${dateKey}`;
        let group = groupMap.get(key);
        if (!group) {
            group = {
                key,
                studentName: studentNameOf(en),
                studentId,
                date: dateKey,
                dateLabel,
                enrollments: [],
                previousEnrollments: [],
            };
            groupMap.set(key, group);
        }
        group.enrollments.push(toActivityEnrollment(en));
    }

    let groups = Array.from(groupMap.values()).sort((a, b) => b.date.localeCompare(a.date));

    const q = search.trim().toLowerCase();
    if (q) {
        groups = groups.filter(g =>
            g.studentName.toLowerCase().includes(q) ||
            g.enrollments.some(en => en.courseName.toLowerCase().includes(q)),
        );
    }

    const total = groups.length;
    const visible = groups.slice(0, limit);

    for (const group of visible) {
        const history = byStudent.get(group.studentId) || [];
        group.isNew = !history.some(en => parseSafeDate(en.created_at).dateKey < group.date);

        const otherDays = new Map<string, { dateLabel: string; enrollments: ActivityEnrollment[] }>();
        for (const en of history) {
            const { dateKey, dateLabel } = parseSafeDate(en.created_at);
            if (dateKey === group.date) continue;
            let day = otherDays.get(dateKey);
            if (!day) {
                day = { dateLabel, enrollments: [] };
                otherDays.set(dateKey, day);
            }
            day.enrollments.push(toActivityEnrollment(en));
        }

        group.previousEnrollments = Array.from(otherDays.keys())
            .sort((a, b) => b.localeCompare(a))
            .flatMap(dKey => {
                const day = otherDays.get(dKey)!;
                return mergeCoursePills(day.enrollments).map(en => ({ ...en, dateLabel: day.dateLabel }));
            });
        group.enrollments = mergeCoursePills(group.enrollments);
    }

    return { groups: visible, total };
}

// ---------------------------------------------------------------------------
// Small derived metrics & labels
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole calendar days from `fromKey` to `toKey` (both YYYY-MM-DD). */
export function daysBetween(fromKey: string, toKey: string): number {
    const a = Date.UTC(+fromKey.slice(0, 4), +fromKey.slice(5, 7) - 1, +fromKey.slice(8, 10));
    const b = Date.UTC(+toKey.slice(0, 4), +toKey.slice(5, 7) - 1, +toKey.slice(8, 10));
    return Math.round((b - a) / DAY_MS);
}

/** "Today", "Yesterday", "3d ago", or the fallback label for older days. */
export function relativeDayLabel(dateKey: string, fallback: string, todayKey: string = localDateKey(new Date())): string {
    const diff = daysBetween(dateKey, todayKey);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    if (diff > 1 && diff < 7) return `${diff}d ago`;
    return fallback;
}

/** "Today", "Tomorrow", "In 5 days" for an upcoming date. */
export function untilLabel(dateKey: string, todayKey: string = localDateKey(new Date())): string {
    const diff = daysBetween(todayKey, dateKey);
    if (diff <= 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    return `In ${diff} days`;
}

/** Requests that have been waiting longer than `days`. */
export function countStaleRequests(enrollments: any[], days = 7, nowMs: number = Date.now()): number {
    let count = 0;
    for (const en of enrollments) {
        if (en.status !== 'requested' || !en.created_at) continue;
        const t = new Date(en.created_at).getTime();
        if (!isNaN(t) && nowMs - t > days * DAY_MS) count++;
    }
    return count;
}

/** Key of a course date, as stored in invite_dates (course_id + invite_date). */
export const sessionKey = (courseId: string, date: string) => `${courseId}|${date}`;

/** Course dates within `days` whose attendance reminder hasn't been marked as sent. */
export function dueReminders(enrollments: any[], sent: Set<string>, days = 7, todayIso: string = todayISO()): UpcomingCohortItem[] {
    return groupConfirmedSessions(enrollments, todayIso)
        .filter(c => daysBetween(todayIso, c.date) <= days && !sent.has(sessionKey(c.courseId, c.date)));
}
