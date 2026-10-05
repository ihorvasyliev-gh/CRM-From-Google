/**
 * Single source of truth for invitation deadlines — used by the dashboard's "Expired Invites" card
 * and by the Kanban board (card timer + expired filter) so both always show the same time.
 */

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;
/** An invite counts as "due soon" once this little time is left. */
const DUE_SOON_MS = 48 * HOUR_MS;
export const DEFAULT_RESPONSE_DAYS = 7;

export type InviteFilter = 'all' | 'expired' | 'soon' | 'attention';

export interface InviteDeadline {
    deadlineMs: number;
    remainingMs: number;
    isExpired: boolean;
    isDueSoon: boolean;
}

/** Deadline info for an invitation, or null when it has no valid invite timestamp. */
export function getInviteDeadline(
    invitedAt: string | null | undefined,
    responseDays: number | null | undefined,
    nowMs: number,
): InviteDeadline | null {
    if (!invitedAt) return null;
    const invitedMs = new Date(invitedAt).getTime();
    if (Number.isNaN(invitedMs)) return null;

    const deadlineMs = invitedMs + (responseDays ?? DEFAULT_RESPONSE_DAYS) * DAY_MS;
    const remainingMs = deadlineMs - nowMs;
    const isExpired = remainingMs <= 0;
    return { deadlineMs, remainingMs, isExpired, isDueSoon: !isExpired && remainingMs <= DUE_SOON_MS };
}

/** "3d 4h" / "5h" / "42m" — always rounded down, so it never overstates the time left. */
export function formatTimeLeft(remainingMs: number): string {
    const days = Math.floor(remainingMs / DAY_MS);
    const hours = Math.floor((remainingMs % DAY_MS) / HOUR_MS);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h`;
    return `${Math.max(1, Math.floor(remainingMs / 60000))}m`;
}

export function matchesInviteFilter(deadline: InviteDeadline | null, filter: InviteFilter): boolean {
    if (filter === 'all') return true;
    if (!deadline) return false;
    if (filter === 'expired') return deadline.isExpired;
    if (filter === 'soon') return deadline.isDueSoon;
    return deadline.isExpired || deadline.isDueSoon;
}
