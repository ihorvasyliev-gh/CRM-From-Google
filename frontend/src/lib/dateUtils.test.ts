import { formatDateDMY, formatDateLong, formatShortDate, formatDayDateShort, formatDateSpaces, formatDateChoiceList, formatShortDateList, normalizeDateList } from './dateUtils';

describe('dateUtils', () => {
    describe('formatDateDMY', () => {
        it('formats a valid ISO string correctly in en-IE format', () => {
            // Note: Because of timezones, use a UTC string or standard parsing
            const dateStr = '2024-03-15T12:00:00Z';
            expect(formatDateDMY(dateStr)).toBe('15/03/2024');
        });

        it('returns empty string for null or undefined', () => {
            expect(formatDateDMY(null)).toBe('');
            expect(formatDateDMY(undefined)).toBe('');
        });

        it('returns empty string for invalid date', () => {
            expect(formatDateDMY('invalid-date')).toBe('');
        });
    });

    describe('formatDateLong', () => {
        it('formats a valid ISO string correctly', () => {
            const dateStr = '2024-03-15T12:00:00Z';
            // Note: exact output depends on en-IE locale in JS engine, usually "15 Mar 2024"
            const expectedPatterns = [/15\s+Mar\s+2024/i];
            const result = formatDateLong(dateStr);
            expect(result).toMatch(expectedPatterns[0]);
        });

        it('returns empty string for null or undefined', () => {
            expect(formatDateLong(null)).toBe('');
            expect(formatDateLong(undefined)).toBe('');
        });
    });

    describe('formatShortDate', () => {
        it('formats a valid ISO string correctly', () => {
            const dateStr = '2024-03-15T12:00:00Z';
            // Usually "15 Mar"
            const result = formatShortDate(dateStr);
            expect(result).toMatch(/15\s+Mar/i);
        });

        it('returns empty string for null or undefined', () => {
            expect(formatShortDate(null)).toBe('');
        });
    });

    describe('formatDayDateShort', () => {
        it('formats a valid ISO string with weekday and short date', () => {
            // 2026-08-28 is Friday
            const result = formatDayDateShort('2026-08-28');
            expect(result).toMatch(/Fri,\s+28\s+Aug/i);
        });

        it('returns empty string for null, undefined, or invalid', () => {
            expect(formatDayDateShort(null)).toBe('');
            expect(formatDayDateShort(undefined)).toBe('');
            expect(formatDayDateShort('invalid')).toBe('');
        });
    });

    describe('formatDateSpaces', () => {
        it('formats a valid ISO date string with spaces (DD MM YYYY)', () => {
            expect(formatDateSpaces('2026-08-27')).toBe('27 08 2026');
            expect(formatDateSpaces('2026-08-27T10:00:00Z')).toBe('27 08 2026');
        });

        it('returns empty string for null, undefined, or invalid date', () => {
            expect(formatDateSpaces(null)).toBe('');
            expect(formatDateSpaces(undefined)).toBe('');
            expect(formatDateSpaces('invalid')).toBe('');
        });
    });

    describe('multi-date lists', () => {
        it('normalizes, sorts and de-duplicates', () => {
            expect(normalizeDateList(['2026-10-16', '2026-10-14T00:00:00', null, '2026-10-14'])).toEqual(['2026-10-14', '2026-10-16']);
        });

        it('writes month and year once for the same month', () => {
            expect(formatDateChoiceList(['2026-10-16', '2026-10-14', '2026-10-15'])).toBe('Wed 14, Thu 15 or Fri 16 Oct 2026');
        });

        it('groups dates across months', () => {
            expect(formatDateChoiceList(['2026-09-30', '2026-10-01'])).toBe('Wed 30 Sept or Thu 1 Oct 2026');
        });

        it('falls back to the long format for one date', () => {
            expect(formatDateChoiceList(['2026-10-14'])).toBe(formatDateLong('2026-10-14'));
        });

        it('builds a compact chip label', () => {
            expect(formatShortDateList(['2026-10-14', '2026-10-15', '2026-10-16'])).toBe('14/15/16 Oct');
            expect(formatShortDateList(['2026-09-30', '2026-10-01'])).toBe('30 Sept / 1 Oct');
        });
    });
});
