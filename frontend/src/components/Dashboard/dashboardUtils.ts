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

export function groupUpcomingCohorts(enrollments: any[], todayIso: string = new Date().toISOString().split('T')[0]): UpcomingCohortItem[] {
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
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 12);
}
