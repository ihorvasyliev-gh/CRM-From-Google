import { describe, it, expect } from 'vitest';
import { isPhoneMatch, matchesSearch } from './searchUtils';

describe('isPhoneMatch', () => {
    it('matches phone digits when query looks like a phone number', () => {
        expect(isPhoneMatch('+353872890084', '087')).toBe(true);
        expect(isPhoneMatch('+353872890084', '0872890084')).toBe(true);
        expect(isPhoneMatch('+353872890084', '353')).toBe(true);
    });

    it('does NOT match when query has too few digits (e.g. "b1ack" → "1")', () => {
        expect(isPhoneMatch('+353872890084', 'b1ack')).toBe(false);
        expect(isPhoneMatch('+353872890084', 'a1b')).toBe(false);
    });

    it('returns false for null/undefined phone', () => {
        expect(isPhoneMatch(null, '087')).toBe(false);
        expect(isPhoneMatch(undefined, '087')).toBe(false);
    });

    it('handles raw substring match on phone string', () => {
        expect(isPhoneMatch('+353 087 289 0084', '087')).toBe(true);
    });

    it('handles leading zero stripping for international format', () => {
        // "087" → digits "087" → strip leading 0 → "87" → matches "+353872890084"
        expect(isPhoneMatch('+353872890084', '087')).toBe(true);
    });
});

describe('matchesSearch', () => {
    const student = {
        firstName: 'John',
        lastName: 'Smith',
        email: 'b1ackporff@gmail.com',
        phone: '+353872890084',
        notes: 'Paid deposit',
    };

    it('matches by first name', () => {
        expect(matchesSearch(student, 'john')).toBe(true);
        expect(matchesSearch(student, 'John')).toBe(true);
    });

    it('matches by last name', () => {
        expect(matchesSearch(student, 'smith')).toBe(true);
    });

    it('matches by full name (multi-word)', () => {
        expect(matchesSearch(student, 'John Smith')).toBe(true);
        expect(matchesSearch(student, 'smith john')).toBe(true);
    });

    it('matches by email substring', () => {
        expect(matchesSearch(student, 'b1ack')).toBe(true);
        expect(matchesSearch(student, 'b1ackporff')).toBe(true);
        expect(matchesSearch(student, 'gmail')).toBe(true);
    });

    it('matches by phone number', () => {
        expect(matchesSearch(student, '087')).toBe(true);
        expect(matchesSearch(student, '0872890084')).toBe(true);
    });

    it('matches by notes', () => {
        expect(matchesSearch(student, 'deposit')).toBe(true);
        expect(matchesSearch(student, 'paid')).toBe(true);
    });

    it('does NOT match random text', () => {
        expect(matchesSearch(student, 'xyz123')).toBe(false);
        expect(matchesSearch(student, 'unknown person')).toBe(false);
    });

    it('does NOT false-positive on phone when query is mostly letters', () => {
        // "b1ack" extracts digit "1", but isPhoneMatch guard rejects it
        const other = {
            firstName: 'Alice',
            lastName: 'Wonder',
            email: 'alice@example.com',
            phone: '+353871234567',
            notes: '',
        };
        expect(matchesSearch(other, 'b1ack')).toBe(false);
    });

    it('returns true for empty query', () => {
        expect(matchesSearch(student, '')).toBe(true);
        expect(matchesSearch(student, '   ')).toBe(true);
    });

    it('handles null/undefined fields gracefully', () => {
        const sparse = { firstName: null, lastName: undefined, email: null, phone: null, notes: null };
        expect(matchesSearch(sparse, 'anything')).toBe(false);
        expect(matchesSearch(sparse, '')).toBe(true);
    });

    it('multi-word: ALL words must match', () => {
        expect(matchesSearch(student, 'john deposit')).toBe(true);  // john in name, deposit in notes
        expect(matchesSearch(student, 'john xyz')).toBe(false);     // xyz matches nothing
    });
});
