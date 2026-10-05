import { cleanVariant, fullName, type Enrollment } from '../../lib/types';
import { todayISO, daysBetween } from '../../lib/dateUtils';
import { getInviteDeadline, formatTimeLeft } from '../../lib/inviteDeadline';

/** The enrollment fields the dashboard reads; board rows and lighter fixtures both fit. */
export type DashboardEnrollment = Pick<Enrollment, 'id' | 'course_id' | 'status'>
    & Partial<Pick<Enrollment, 'student_id' | 'course_variant' | 'invited_at' | 'response_days'
        | 'confirmed_date' | 'invited_date' | 'invited_dates' | 'created_at'>>
    & {
        students?: { first_name?: string | null; last_name?: string | null } | null;
        courses?: { name?: string | null } | null;
    };

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
    /** Open invitations (not yet answered, deadline not passed) offering this date */
    pendingCount: number;
}

export function calculateExpiredInvites(enrollments: DashboardEnrollment[], nowMs: number = Date.now()): ExpiredInviteItem[] {
    const items: ExpiredInviteItem[] = [];

    for (const en of enrollments) {
        if (en.status !== 'invited' || !en.invited_at) continue;

        const deadline = getInviteDeadline(en.invited_at, en.response_days, nowMs);
        if (!deadline) continue;

        // Include if already expired or due within 48h
        if (deadline.isExpired || deadline.isDueSoon) {
            const { deadlineMs, remainingMs, isExpired } = deadline;
            const hoursRemaining = remainingMs / (1000 * 60 * 60);
            let timeLabel: string;
            if (isExpired) {
                const daysOverdue = Math.floor(Math.abs(remainingMs) / DAY_MS);
                timeLabel = daysOverdue === 0 ? 'Expired today' : `Expired ${daysOverdue}d ago`;
            } else {
                timeLabel = `${formatTimeLeft(remainingMs)} left`;
            }

            const studentName = fullName(en.students) || 'Unknown Student';

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

/**
 * Course dates from today on, one item per course + date, soonest first. A date carries the students
 * confirmed for it and the still-open invitations offering it ("pending" — same rule as the invite
 * dialog: status invited, date offered, deadline not passed). Multi-date invites count on every date.
 */
function buildSessions(enrollments: DashboardEnrollment[], todayIso: string, nowMs: number): UpcomingCohortItem[] {
    const cohortMap = new Map<string, UpcomingCohortItem>();
    const bump = (dateKey: string, en: DashboardEnrollment, field: 'confirmedCount' | 'pendingCount') => {
        if (dateKey < todayIso) return;
        const key = `${dateKey}:::${en.course_id}`;
        let item = cohortMap.get(key);
        if (!item) {
            item = { date: dateKey, courseId: en.course_id, courseName: en.courses?.name || 'Unknown Course', confirmedCount: 0, pendingCount: 0 };
            cohortMap.set(key, item);
        }
        item[field]++;
    };

    for (const en of enrollments) {
        if (en.status === 'confirmed' && en.confirmed_date) {
            bump(en.confirmed_date.split('T')[0], en, 'confirmedCount');
        } else if (en.status === 'invited') {
            if (getInviteDeadline(en.invited_at, en.response_days, nowMs)?.isExpired) continue;
            const offered: string[] = en.invited_dates?.length ? en.invited_dates : (en.invited_date ? [en.invited_date] : []);
            for (const d of new Set(offered.map(x => x.split('T')[0]))) bump(d, en, 'pendingCount');
        }
    }

    return Array.from(cohortMap.values())
        .sort((a, b) => a.date.localeCompare(b.date) || a.courseName.localeCompare(b.courseName));
}

/** Confirmed course dates from today on (dates with only pending invites are left out). */
function groupConfirmedSessions(enrollments: DashboardEnrollment[], todayIso: string = todayISO(), nowMs: number = Date.now()): UpcomingCohortItem[] {
    return buildSessions(enrollments, todayIso, nowMs).filter(c => c.confirmedCount > 0);
}

export function groupUpcomingCohorts(enrollments: DashboardEnrollment[], todayIso: string = todayISO(), nowMs: number = Date.now()): UpcomingCohortItem[] {
    const sorted = buildSessions(enrollments, todayIso, nowMs);
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

function toActivityEnrollment(en: DashboardEnrollment): ActivityEnrollment {
    return {
        id: en.id,
        courseId: en.course_id,
        courseName: en.courses?.name || 'Unknown Course',
        courseVariant: en.course_variant ?? null,
        status: en.status,
    };
}

function studentNameOf(en: DashboardEnrollment): string {
    return fullName(en.students) || 'Unknown';
}

/**
 * Groups enrollments into "student + day" activity entries (newest first), each carrying the
 * student's enrollment history from other days. `search` matches student or course names.
 */
export function buildActivityGroups(
    enrollments: DashboardEnrollment[],
    { filter = 'all', search = '', limit = 50 }: { filter?: ActivityStatusFilter; search?: string; limit?: number } = {},
): { groups: ActivityGroup[]; total: number } {
    const byStudent = new Map<string, DashboardEnrollment[]>();
    for (const en of enrollments) {
        if (!en.student_id) continue;
        const list = byStudent.get(en.student_id);
        if (list) list.push(en);
        else byStudent.set(en.student_id, [en]);
    }

    const time = (en: DashboardEnrollment) => {
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

export { daysBetween };

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
export function countStaleRequests(enrollments: DashboardEnrollment[], days = 7, nowMs: number = Date.now()): number {
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

export interface ReminderItem extends UpcomingCohortItem {
    /** The course is tomorrow, so this is the day-before reminder (tracked apart from the 7-day one) */
    dayBefore: boolean;
}

/**
 * Course dates within `days` whose attendance reminder hasn't been marked as sent.
 * A course that is tomorrow waits on its own day-before mark (`sentDayBefore`): sending
 * that reminder covers the earlier one, and the 7-day mark doesn't hide it.
 */
export function dueReminders(
    enrollments: DashboardEnrollment[],
    sent: Set<string>,
    days = 7,
    todayIso: string = todayISO(),
    sentDayBefore: Set<string> = new Set(),
): ReminderItem[] {
    return groupConfirmedSessions(enrollments, todayIso).flatMap(c => {
        const away = daysBetween(todayIso, c.date);
        if (away > days) return [];
        const dayBefore = away === 1;
        const done = (dayBefore ? sentDayBefore : sent).has(sessionKey(c.courseId, c.date));
        return done ? [] : [{ ...c, dayBefore }];
    });
}
