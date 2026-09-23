import { describe, it, expect } from 'vitest';
import { normalizePhone } from './contactUtils';
import { sanitizeFilterTerm, buildStudentSearchFilters } from './searchUtils';
import { toStudentPayload } from './types';

describe('normalizePhone', () => {
    it('returns empty string for empty input', () => {
        expect(normalizePhone('')).toBe('');
        expect(normalizePhone(null)).toBe('');
        expect(normalizePhone('  - ')).toBe('');
    });

    it('normalizes Irish numbers', () => {
        expect(normalizePhone('087 123 4567')).toBe('+353871234567');
        expect(normalizePhone('871234567')).toBe('+353871234567');
        expect(normalizePhone('353871234567')).toBe('+353871234567');
        expect(normalizePhone('0214567890')).toBe('+353214567890');
    });

    it('normalizes UK, Ukrainian and 00-prefixed numbers', () => {
        expect(normalizePhone('07123 456789')).toBe('+447123456789');
        expect(normalizePhone('050 123 4567')).toBe('+380501234567');
        expect(normalizePhone('00353871234567')).toBe('+353871234567');
    });

    it('keeps numbers that are already international', () => {
        expect(normalizePhone('+48 600 123 456')).toBe('+48600123456');
    });
});

describe('sanitizeFilterTerm', () => {
    it('strips PostgREST reserved characters and wildcards', () => {
        expect(sanitizeFilterTerm("O'Brien, John")).toBe("O'Brien  John");
        expect(sanitizeFilterTerm('(087) 123')).toBe('087  123');
        expect(sanitizeFilterTerm('50%*')).toBe('50');
        expect(sanitizeFilterTerm('"quoted"\\')).toBe('quoted');
    });
});

describe('buildStudentSearchFilters', () => {
    it('builds one or-filter per word', () => {
        const filters = buildStudentSearchFilters('john smith');
        expect(filters).toHaveLength(2);
        expect(filters[0]).toContain('first_name.ilike.%john%');
        expect(filters[1]).toContain('last_name.ilike.%smith%');
    });

    it('never produces commas or parentheses from user input inside values', () => {
        const filters = buildStudentSearchFilters('Smith, (John)');
        expect(filters).toHaveLength(2);
        filters.forEach(f => {
            f.split(',').forEach(cond => expect(cond).toMatch(/^[a-z_]+\.ilike\.%[^,()]*%$/));
        });
    });

    it('also matches local phone numbers without the leading zero', () => {
        const [filter] = buildStudentSearchFilters('0871234');
        expect(filter).toContain('phone.ilike.%0871234%');
        expect(filter).toContain('phone.ilike.%871234%');
    });

    it('returns no filters for blank input', () => {
        expect(buildStudentSearchFilters('   ')).toEqual([]);
        expect(buildStudentSearchFilters(',,,')).toEqual([]);
    });
});

describe('toStudentPayload', () => {
    it('converts empty optional fields to null (DATE columns reject empty strings)', () => {
        const payload = toStudentPayload({
            first_name: ' Anna ', last_name: 'Kova ', email: '', phone: '', address: ' ', eircode: '', dob: '',
        });
        expect(payload).toEqual({
            first_name: 'Anna', last_name: 'Kova', email: null, phone: null, address: null, eircode: null, dob: null,
        });
        expect('id' in payload).toBe(false);
    });

    it('normalizes email, phone and eircode', () => {
        const payload = toStudentPayload({
            id: 'abc', first_name: 'A', last_name: 'B', email: ' Test@Mail.COM ', phone: '087 123 4567',
            address: '1 Main St', eircode: 't12 ab34', dob: '1990-05-01',
        });
        expect(payload).toMatchObject({
            id: 'abc', email: 'test@mail.com', phone: '+353871234567', eircode: 'T12 AB34', dob: '1990-05-01',
        });
    });
});
