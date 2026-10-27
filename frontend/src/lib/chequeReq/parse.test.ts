import { describe, expect, it } from 'vitest';
import { domainWord, dottedDate, findAmounts, findDateRange, findDates, formatAmount, parseAmount, referenceToken, slashDate } from './parse';

describe('amounts', () => {
    it('reads amounts as invoices print them', () => {
        expect(parseAmount('4,260.00')).toBe(4260);
        expect(parseAmount('€ 1,234.5')).toBe(1234.5);
        expect(parseAmount('EUR 4.260,00')).toBe(4260);
        expect(parseAmount('355')).toBe(355);
        expect(parseAmount('(120.00)')).toBe(-120);
        expect(parseAmount('abc')).toBeNull();
        expect(parseAmount('')).toBeNull();
    });

    it('formats with thousands and two decimals', () => {
        expect(formatAmount(4260)).toBe('4,260.00');
        expect(formatAmount(0.5)).toBe('0.50');
    });

    it('finds money but not quantities, years, dates or phone numbers', () => {
        expect(findAmounts('12.00 355.00 Tax on 4,260.00').map(a => a.value)).toEqual([12, 355, 4260]);
        expect(findAmounts('Total €980')).toHaveLength(1);
        expect(findAmounts('Qty 3 in 2026')).toEqual([]);
        expect(findAmounts('Dates 21.10.2026')).toEqual([]);
        expect(findAmounts('call 0871448706')).toEqual([]);
        expect(findAmounts('starts 10.30 am')).toEqual([]);
        expect(findAmounts('following dates 28,30 of July 2026, 4,6,11,13 of August 2026, 1,3 of September 2026')).toEqual([]);
        expect(findAmounts('Sessions 11,13 Aug')).toEqual([]);
        expect(findAmounts('€28,30 of July')).toHaveLength(1);
    });
});

describe('dates', () => {
    it('reads the usual invoice date formats, day first', () => {
        expect(findDates('Invoice Date 21 Oct 2026').map(d => d.iso)).toEqual(['2026-10-21']);
        expect(findDates('1st October 2026').map(d => d.iso)).toEqual(['2026-10-01']);
        expect(findDates('October 3, 2026').map(d => d.iso)).toEqual(['2026-10-03']);
        expect(findDates('05/11/2026 and 2026-12-01').map(d => d.iso)).toEqual(['2026-11-05', '2026-12-01']);
        expect(findDates('21-Oct-26').map(d => d.iso)).toEqual(['2026-10-21']);
        expect(findDates('31/02/2026')).toEqual([]);
    });

    it('reads every day of a list sharing its month', () => {
        expect(findDates('28,30 of July 2026, 4,6,11 of August 2026, 1,3 of September 2026').map(d => d.iso)).toEqual([
            '2026-07-28',
            '2026-07-30',
            '2026-08-04',
            '2026-08-06',
            '2026-08-11',
            '2026-09-01',
            '2026-09-03',
        ]);
        expect(findDates('4, 6 and 11 August 2026').map(d => d.iso)).toEqual(['2026-08-04', '2026-08-06', '2026-08-11']);
        expect(findDates('1st & 3rd Sept 2026').map(d => d.iso)).toEqual(['2026-09-01', '2026-09-03']);
        // Not a list of days: the date alone
        expect(findDates('Room 12, 3 Oct 2026').map(d => d.iso)).toEqual(['2026-10-03']);
    });

    it('finds the dates a course ran', () => {
        expect(findDateRange('Dates 1st October 2026-15th October 2026')).toEqual({ start: '2026-10-01', end: '2026-10-15' });
        expect(findDateRange('Course 6th - 10th Nov 2026')).toEqual({ start: '2026-11-06', end: '2026-11-10' });
        expect(findDateRange('01/12/2026 to 05/12/2026')).toEqual({ start: '2026-12-01', end: '2026-12-05' });
        expect(findDateRange('Held on 14 Sept 2026')).toEqual({ start: '2026-09-14' });
        expect(findDateRange('Level 4 award')).toBeNull();
    });

    it('prints dates the way the requisition does', () => {
        expect(dottedDate('2026-10-01')).toBe('01.10.2026');
        expect(slashDate('2026-10-01')).toBe('01/10/2026');
    });
});

describe('references and contacts', () => {
    it('takes one token with a digit as a reference', () => {
        expect(referenceToken('INV-0064')).toBe('INV-0064');
        expect(referenceToken(': 9001 (please quote)')).toBe('9001');
        expect(referenceToken('on this invoice')).toBeNull();
        expect(referenceToken('21/10/2026')).toBeNull();
        expect(referenceToken('4,260.00')).toBeNull();
    });

    it('names a supplier by its email domain, but not by a free mail provider', () => {
        expect(domainWord('info@secure-training.ie')).toBe('secure-training');
        expect(domainWord('www.acmetraining.com')).toBe('acmetraining');
        expect(domainWord('someone@gmail.com')).toBeNull();
    });
});
