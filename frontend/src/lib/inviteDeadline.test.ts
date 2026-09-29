import { describe, it, expect } from 'vitest';
import { getInviteDeadline, formatTimeLeft, matchesInviteFilter, HOUR_MS, DAY_MS } from './inviteDeadline';

describe('inviteDeadline', () => {
    const invitedAt = '2026-09-01T00:00:00Z';
    const at = (offsetMs: number) => new Date(invitedAt).getTime() + 7 * DAY_MS + offsetMs;

    it('returns null without a valid invite timestamp', () => {
        expect(getInviteDeadline(null, 7, 0)).toBeNull();
        expect(getInviteDeadline('nope', 7, 0)).toBeNull();
    });

    it('defaults to a 7-day deadline', () => {
        expect(getInviteDeadline(invitedAt, null, at(-DAY_MS))?.remainingMs).toBe(DAY_MS);
    });

    it('classifies expired / due soon / ok', () => {
        expect(getInviteDeadline(invitedAt, 7, at(0))?.isExpired).toBe(true);
        expect(getInviteDeadline(invitedAt, 7, at(-30 * 60000))).toMatchObject({ isExpired: false, isDueSoon: true });
        expect(getInviteDeadline(invitedAt, 7, at(-3 * DAY_MS))).toMatchObject({ isExpired: false, isDueSoon: false });
    });

    it('rounds the time left down, never up', () => {
        expect(formatTimeLeft(30 * 60000)).toBe('30m');
        expect(formatTimeLeft(HOUR_MS + 59 * 60000)).toBe('1h');
        expect(formatTimeLeft(2 * DAY_MS + 5 * HOUR_MS)).toBe('2d 5h');
    });

    it('filters by state', () => {
        const expired = getInviteDeadline(invitedAt, 7, at(HOUR_MS));
        const soon = getInviteDeadline(invitedAt, 7, at(-HOUR_MS));
        expect(matchesInviteFilter(expired, 'expired')).toBe(true);
        expect(matchesInviteFilter(soon, 'expired')).toBe(false);
        expect(matchesInviteFilter(soon, 'soon')).toBe(true);
        expect(matchesInviteFilter(soon, 'attention')).toBe(true);
        expect(matchesInviteFilter(null, 'expired')).toBe(false);
        expect(matchesInviteFilter(null, 'all')).toBe(true);
    });
});
