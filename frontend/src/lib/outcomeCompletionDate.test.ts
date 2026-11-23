import { describe, it, expect } from 'vitest';
import {
    shiftDays,
    shiftMonths,
    completionPresetCutoff,
    effectiveCompletionDate,
    matchesCompletionDate,
    completionDateRangeHint,
    formatCourseDatesTooltip,
    isCompletionDateFilter,
    isIsoDateOrEmpty,
} from './outcomeCompletionDate';

describe('outcomeCompletionDate', () => {
    it('shifts calendar days cleanly across month and year boundaries', () => {
        expect(shiftDays('2026-11-23', -30)).toBe('2026-10-24');
        expect(shiftDays('2026-01-10', -30)).toBe('2025-12-11');
        expect(shiftDays('2024-03-01', -1)).toBe('2024-02-29');
    });

    it('shifts calendar months with month-end clamping', () => {
        expect(shiftMonths('2026-11-23', -3)).toBe('2026-08-23');
        expect(shiftMonths('2026-05-31', -3)).toBe('2026-02-28');
        expect(shiftMonths('2024-05-31', -3)).toBe('2024-02-29');
        expect(shiftMonths('2026-02-15', -6)).toBe('2025-08-15');
        expect(shiftMonths('2026-11-23', -12)).toBe('2025-11-23');
    });

    it('partitions recent and older presets cleanly with zero overlap or gap on the cutoff day', () => {
        const today = '2026-11-23';
        const pairs = [
            ['recent_30d', 'older_30d'],
            ['recent_3m', 'older_3m'],
            ['recent_6m', 'older_6m'],
            ['recent_12m', 'older_1y'],
        ] as const;

        for (const [recent, older] of pairs) {
            const cutoff = completionPresetCutoff(recent, today);
            expect(completionPresetCutoff(older, today)).toBe(cutoff);

            const dayBefore = shiftDays(cutoff, -1);
            // Cutoff day belongs to recent, day before belongs to older
            expect(matchesCompletionDate(cutoff, recent, '', '', today)).toBe(true);
            expect(matchesCompletionDate(cutoff, older, '', '', today)).toBe(false);
            expect(matchesCompletionDate(dayBefore, recent, '', '', today)).toBe(false);
            expect(matchesCompletionDate(dayBefore, older, '', '', today)).toBe(true);
            // Null completion dates are excluded by any active preset
            expect(matchesCompletionDate(null, recent, '', '', today)).toBe(false);
            expect(matchesCompletionDate(null, older, '', '', today)).toBe(false);
        }
    });

    it('handles custom ranges with from only, to only, both, and neither', () => {
        const today = '2026-11-23';
        // Empty custom range matches everything including null
        expect(matchesCompletionDate('2025-01-01', 'custom', '', '', today)).toBe(true);
        expect(matchesCompletionDate(null, 'custom', '', '', today)).toBe(true);

        // From only (inclusive)
        expect(matchesCompletionDate('2026-06-01', 'custom', '2026-06-01', '', today)).toBe(true);
        expect(matchesCompletionDate('2026-05-31', 'custom', '2026-06-01', '', today)).toBe(false);
        expect(matchesCompletionDate(null, 'custom', '2026-06-01', '', today)).toBe(false);

        // To only (inclusive)
        expect(matchesCompletionDate('2026-06-01', 'custom', '', '2026-06-01', today)).toBe(true);
        expect(matchesCompletionDate('2026-06-02', 'custom', '', '2026-06-01', today)).toBe(false);

        // Both bounds (inclusive)
        expect(matchesCompletionDate('2026-03-15', 'custom', '2026-03-01', '2026-03-31', today)).toBe(true);
        expect(matchesCompletionDate('2026-02-28', 'custom', '2026-03-01', '2026-03-31', today)).toBe(false);
        expect(matchesCompletionDate('2026-04-01', 'custom', '2026-03-01', '2026-03-31', today)).toBe(false);
    });

    it('uses per-course completion date when a specific course is selected, and latest date otherwise', () => {
        const grad = {
            last_completed_date: '2026-11-10',
            course_completed_dates: {
                'Safe Pass': '2025-05-10',
                'Manual Handling': '2026-11-10',
            },
        };
        expect(effectiveCompletionDate(grad, 'all')).toBe('2026-11-10');
        expect(effectiveCompletionDate(grad, 'Safe Pass')).toBe('2025-05-10');
        expect(effectiveCompletionDate(grad, 'Manual Handling')).toBe('2026-11-10');
        expect(effectiveCompletionDate(grad, 'Unknown Course')).toBe('2026-11-10');
    });

    it('formats readable hints and multi-course tooltips', () => {
        const today = '2026-11-23';
        expect(completionDateRangeHint('all', '', '', today)).toBeNull();
        expect(completionDateRangeHint('recent_30d', '', '', today)).toMatch(/^Since 24 Oct 2026$/);
        expect(completionDateRangeHint('older_3m', '', '', today)).toMatch(/^Before 23 Aug 2026$/);
        expect(completionDateRangeHint('custom', '2026-01-01', '2026-03-31', today)).toBe('1 Jan 2026 – 31 Mar 2026');
        expect(completionDateRangeHint('custom', '2026-01-01', '', today)).toBe('From 1 Jan 2026');
        expect(completionDateRangeHint('custom', '', '2026-03-31', today)).toBe('Until 31 Mar 2026');
        expect(completionDateRangeHint('custom', '', '', today)).toBeNull();

        expect(formatCourseDatesTooltip(['Safe Pass'], { 'Safe Pass': '2026-05-10' })).toBeUndefined();
        expect(formatCourseDatesTooltip(
            ['Manual Handling', 'Safe Pass'],
            { 'Manual Handling': '2026-11-10', 'Safe Pass': '2025-05-10' },
        )).toBe('Manual Handling: 10 Nov 2026 · Safe Pass: 10 May 2025');
    });

    it('validates persisted completion filter values and ISO date strings', () => {
        expect(isCompletionDateFilter('all')).toBe(true);
        expect(isCompletionDateFilter('recent_30d')).toBe(true);
        expect(isCompletionDateFilter('older_1y')).toBe(true);
        expect(isCompletionDateFilter('custom')).toBe(true);
        expect(isCompletionDateFilter('invalid')).toBe(false);
        expect(isCompletionDateFilter(42)).toBe(false);

        expect(isIsoDateOrEmpty('')).toBe(true);
        expect(isIsoDateOrEmpty('2026-11-23')).toBe(true);
        expect(isIsoDateOrEmpty('23/11/2026')).toBe(false);
        expect(isIsoDateOrEmpty(null)).toBe(false);
    });
});
