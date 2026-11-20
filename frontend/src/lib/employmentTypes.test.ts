import { describe, it, expect } from 'vitest';
import {
    EMPLOYMENT_TYPES,
    computeOutcomeStats,
    employmentTypeLabel,
    employmentTypeRank,
    formatAllSkippedMessage,
    formatSkippedSummary,
    hasOutcomeAnswer,
    isNotWorkingOutcome,
    isResentNotWorking,
    isWorkingOutcome,
    partitionForSurvey,
    type OutcomeRowLike,
} from './employmentTypes';

describe('employmentTypeLabel', () => {
    it('returns the display label for each known employment type', () => {
        expect(employmentTypeLabel('full_time')).toBe('Full-time');
        expect(employmentTypeLabel('part_time')).toBe('Part-time');
        expect(employmentTypeLabel('self_employed')).toBe('Self-employed');
        expect(employmentTypeLabel('ce_tus')).toBe('CE / TUS');
    });

    it('returns an empty string for null, undefined, empty, or unknown values', () => {
        expect(employmentTypeLabel(null)).toBe('');
        expect(employmentTypeLabel(undefined)).toBe('');
        expect(employmentTypeLabel('')).toBe('');
        expect(employmentTypeLabel('contractor')).toBe('');
    });
});

describe('employmentTypeRank', () => {
    it('orders Full-time, Part-time, Self-employed, CE / TUS, then unspecified', () => {
        expect(employmentTypeRank('full_time')).toBe(0);
        expect(employmentTypeRank('part_time')).toBe(1);
        expect(employmentTypeRank('self_employed')).toBe(2);
        expect(employmentTypeRank('ce_tus')).toBe(3);
        expect(employmentTypeRank(null)).toBe(EMPLOYMENT_TYPES.length);
        expect(employmentTypeRank(undefined)).toBe(EMPLOYMENT_TYPES.length);
        expect(employmentTypeRank('other')).toBe(EMPLOYMENT_TYPES.length);
    });
});

describe('outcome row predicates', () => {
    it('detects answered, working, not working, and resent-not-working states', () => {
        const notContacted: OutcomeRowLike = { tracking_status: 'not_contacted', is_working: null };
        const pendingFresh: OutcomeRowLike = { tracking_status: 'pending', is_working: null };
        const resentNotWorking: OutcomeRowLike = { tracking_status: 'pending', is_working: false };
        const respondedWorking: OutcomeRowLike = { tracking_status: 'responded', is_working: true };
        const respondedNotWorking: OutcomeRowLike = { tracking_status: 'responded', is_working: false };

        expect(hasOutcomeAnswer(notContacted)).toBe(false);
        expect(hasOutcomeAnswer(pendingFresh)).toBe(false);
        expect(hasOutcomeAnswer(resentNotWorking)).toBe(true);
        expect(hasOutcomeAnswer(respondedWorking)).toBe(true);
        expect(hasOutcomeAnswer(respondedNotWorking)).toBe(true);

        expect(isWorkingOutcome(respondedWorking)).toBe(true);
        expect(isWorkingOutcome(respondedNotWorking)).toBe(false);
        expect(isWorkingOutcome(pendingFresh)).toBe(false);

        expect(isNotWorkingOutcome(respondedNotWorking)).toBe(true);
        expect(isNotWorkingOutcome(resentNotWorking)).toBe(true);
        expect(isNotWorkingOutcome(respondedWorking)).toBe(false);

        expect(isResentNotWorking(resentNotWorking)).toBe(true);
        expect(isResentNotWorking(respondedNotWorking)).toBe(false);
        expect(isResentNotWorking(pendingFresh)).toBe(false);
    });
});

describe('computeOutcomeStats', () => {
    it('returns null rates when nobody has been contacted yet', () => {
        expect(computeOutcomeStats([])).toEqual({
            total: 0,
            notContacted: 0,
            pending: 0,
            responded: 0,
            asked: 0,
            answered: 0,
            working: 0,
            notWorking: 0,
            resentNotWorking: 0,
            responseRate: null,
            employmentRate: null,
        });

        expect(computeOutcomeStats([
            { tracking_status: 'not_contacted', is_working: null },
            { tracking_status: 'not_contacted', is_working: null },
        ])).toEqual({
            total: 2,
            notContacted: 2,
            pending: 0,
            responded: 0,
            asked: 0,
            answered: 0,
            working: 0,
            notWorking: 0,
            resentNotWorking: 0,
            responseRate: null,
            employmentRate: null,
        });
    });

    it('returns 0% responseRate and null employmentRate when contacted people have not answered', () => {
        const stats = computeOutcomeStats([
            { tracking_status: 'pending', is_working: null },
            { tracking_status: 'pending', is_working: null },
        ]);
        expect(stats.asked).toBe(2);
        expect(stats.answered).toBe(0);
        expect(stats.responseRate).toBe(0);
        expect(stats.employmentRate).toBeNull();
    });

    it('preserves prior answers on resent-not-working rows and computes rounded percentages', () => {
        const stats = computeOutcomeStats([
            { tracking_status: 'not_contacted', is_working: null },
            { tracking_status: 'pending', is_working: null },
            { tracking_status: 'pending', is_working: false }, // resent follow-up
            { tracking_status: 'responded', is_working: true },
            { tracking_status: 'responded', is_working: true },
            { tracking_status: 'responded', is_working: false },
        ]);

        // asked = 5 (2 pending + 3 responded), answered = 4 (3 responded + 1 resentNotWorking)
        // responseRate = Math.round(4 / 5 * 100) = 80
        // employmentRate = Math.round(2 / 4 * 100) = 50
        expect(stats).toEqual({
            total: 6,
            notContacted: 1,
            pending: 2,
            responded: 3,
            asked: 5,
            answered: 4,
            working: 2,
            notWorking: 2,
            resentNotWorking: 1,
            responseRate: 80,
            employmentRate: 50,
        });
    });

    it('rounds responseRate and employmentRate to nearest whole percent', () => {
        const stats = computeOutcomeStats([
            { tracking_status: 'responded', is_working: true },
            { tracking_status: 'responded', is_working: true },
            { tracking_status: 'responded', is_working: false },
            { tracking_status: 'pending', is_working: null },
            { tracking_status: 'pending', is_working: null },
            { tracking_status: 'pending', is_working: null },
        ]);
        // asked = 6, answered = 3 -> 50%; working = 2 of 3 -> 67%
        expect(stats.responseRate).toBe(50);
        expect(stats.employmentRate).toBe(67);
    });
});

describe('partitionForSurvey', () => {
    interface Row {
        id: string;
        email: string | null | undefined;
        tracking_status: 'not_contacted' | 'pending' | 'responded';
        is_working: boolean | null;
    }

    const rows: Row[] = [
        { id: 'working', email: 'work@example.com', tracking_status: 'responded', is_working: true },
        { id: 'working-no-email', email: null, tracking_status: 'responded', is_working: true },
        { id: 'opted-out', email: '  OptOut@Example.com ', tracking_status: 'not_contacted', is_working: null },
        { id: 'no-email', email: '   ', tracking_status: 'pending', is_working: null },
        { id: 'not-contacted', email: 'new@example.com', tracking_status: 'not_contacted', is_working: null },
        { id: 'not-working', email: 'notwork@example.com', tracking_status: 'responded', is_working: false },
        { id: 'resent-not-working', email: 'resent@example.com', tracking_status: 'pending', is_working: false },
    ];
    const optedOut = new Set(['optout@example.com']);

    it('skips working, missing email, and opted-out recipients by default', () => {
        const result = partitionForSurvey(rows, r => r, optedOut);

        expect(result.allowed.map(r => r.id)).toEqual(['not-contacted', 'not-working', 'resent-not-working']);
        expect(result.skippedWorking.map(r => r.id)).toEqual(['working', 'working-no-email']);
        expect(result.skippedOptedOut.map(r => r.id)).toEqual(['opted-out']);
        expect(result.skippedNoEmail.map(r => r.id)).toEqual(['no-email']);
    });

    it('allows working recipients when skipWorking is false, while still skipping no-email and opted-out', () => {
        const result = partitionForSurvey(rows, r => r, optedOut, { skipWorking: false });

        expect(result.skippedWorking).toEqual([]);
        expect(result.allowed.map(r => r.id)).toEqual(['working', 'not-contacted', 'not-working', 'resent-not-working']);
        expect(result.skippedNoEmail.map(r => r.id)).toEqual(['working-no-email', 'no-email']);
        expect(result.skippedOptedOut.map(r => r.id)).toEqual(['opted-out']);
    });
});

describe('formatSkippedSummary', () => {
    it('returns empty string when nothing was skipped', () => {
        expect(formatSkippedSummary({})).toBe('');
        expect(formatSkippedSummary({ working: 0, optedOut: 0, noEmail: 0 })).toBe('');
    });

    it('formats individual and combined skip reasons in order', () => {
        expect(formatSkippedSummary({ working: 4 })).toBe(' · 4 already working skipped');
        expect(formatSkippedSummary({ optedOut: 1 })).toBe(' · 1 unsubscribed skipped');
        expect(formatSkippedSummary({ noEmail: 2 })).toBe(' · 2 without email skipped');
        expect(formatSkippedSummary({ working: 4, optedOut: 1 })).toBe(' · 4 already working, 1 unsubscribed skipped');
        expect(formatSkippedSummary({ working: 3, optedOut: 2, noEmail: 1 })).toBe(
            ' · 3 already working, 2 unsubscribed, 1 without email skipped',
        );
    });
});

describe('formatAllSkippedMessage', () => {
    it('handles zero, single, and multiple skip reasons', () => {
        expect(formatAllSkippedMessage({})).toBe('No eligible recipients selected.');
        expect(formatAllSkippedMessage({ working: 2 })).toBe('Everyone selected is already working — nothing was sent.');
        expect(formatAllSkippedMessage({ optedOut: 1 })).toBe('Everyone selected is unsubscribed — nothing was sent.');
        expect(formatAllSkippedMessage({ noEmail: 3 })).toBe('Everyone selected is missing an email — nothing was sent.');
        expect(formatAllSkippedMessage({ working: 2, optedOut: 1 })).toBe(
            'Everyone selected was skipped (already working, unsubscribed) — nothing was sent.',
        );
        expect(formatAllSkippedMessage({ working: 1, optedOut: 1, noEmail: 1 })).toBe(
            'Everyone selected was skipped (already working, unsubscribed, missing an email) — nothing was sent.',
        );
        expect(formatAllSkippedMessage({ optedOut: 2 }, 'copied')).toBe(
            'Everyone selected is unsubscribed — nothing was copied.',
        );
        expect(formatAllSkippedMessage({ working: 1, noEmail: 1 }, 'updated')).toBe(
            'Everyone selected was skipped (already working, missing an email) — nothing was updated.',
        );
    });
});
