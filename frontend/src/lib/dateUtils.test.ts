import { describe, it, expect } from 'vitest';
import { formatDateDMY, formatDateLong, formatShortDate } from './dateUtils';

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
});
