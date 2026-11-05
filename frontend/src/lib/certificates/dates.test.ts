import { describe, expect, it } from 'vitest';
import { addMonths, countUp, formatCertDate, formatCertMonth, isDateTag, isExpiryTag, isMonthTag, isNumberTag, parseCertDate, parseCertMonth, validityLabel } from './dates';

describe('parseCertDate', () => {
    it.each([
        ['21/09/2026', '2026-09-21'],
        ['1.9.26', '2026-09-01'],
        ['21-09-2026', '2026-09-21'],
        ['2026-09-21', '2026-09-21'],
        ['21 September 2026', '2026-09-21'],
        ['21st Sept 2026', '2026-09-21'],
        ['21–23/09/2026', '2026-09-23'],
        ['21/09/2026 - 23/09/2026', '2026-09-23'],
    ])('reads %s', (text, iso) => expect(parseCertDate(text)).toBe(iso));

    it.each(['', 'next week', '31/02/2026', '13/13/2026'])('finds no date in "%s"', text => expect(parseCertDate(text)).toBeNull());
});

describe('parseCertMonth', () => {
    it.each([
        ['September 2026', '2026-09'],
        ['Sep 2026', '2026-09'],
        ['09/2026', '2026-09'],
        ['21/09/2026', '2026-09'],
    ])('reads %s', (text, key) => expect(parseCertMonth(text)).toBe(key));
});

describe('dates', () => {
    it('prints a date and a month as on the certificates', () => {
        expect(formatCertDate('2026-09-01')).toBe('01/09/2026');
        expect(formatCertMonth('2026-09-21')).toBe('September 2026');
    });

    it('counts whole years to the same day, and 29 February to the 28th', () => {
        expect(addMonths('2026-09-21', 36)).toBe('2029-09-21');
        expect(addMonths('2028-02-29', 12)).toBe('2029-02-28');
        expect(addMonths('2026-08-31', 6)).toBe('2027-02-28');
    });

    it('names a length', () => {
        expect(validityLabel(12)).toBe('1 year');
        expect(validityLabel(36)).toBe('3 years');
        expect(validityLabel(18)).toBe('18 months');
    });

    it('knows the kinds of tags', () => {
        expect(['expire', 'expiryDate', 'validUntil'].every(isExpiryTag)).toBe(true);
        expect(['courseDate', 'today', 'expire', 'startDate'].every(isDateTag)).toBe(true);
        expect(isDateTag('courseMonth') || isDateTag('tutor')).toBe(false);
        expect(isMonthTag('courseMonth')).toBe(true);
        expect(['certNo', 'certificateNumber', 'cert_no'].every(isNumberTag)).toBe(true);
        expect(isNumberTag('tutor')).toBe(false);
    });

    it('counts a certificate number up, keeping its zeros', () => {
        expect(countUp('ASC-2026-009', 0)).toBe('ASC-2026-009');
        expect(countUp('ASC-2026-009', 1)).toBe('ASC-2026-010');
        expect(countUp('99', 2)).toBe('101');
        expect(countUp('No. 7A', 1)).toBe('No. 8A');
        expect(countUp('ASC', 3)).toBe('ASC');
    });
});
